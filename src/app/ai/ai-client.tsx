"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/* ── Types ──────────────────────────────────────────────────── */
interface Provider {
  id: string;
  name: string;
  type: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  availableModels: string;
  isDefault: boolean;
  enabled: boolean;
  settings: string;
  createdAt: string;
  updatedAt: string;
}

interface ConvItem {
  id: string;
  title: string;
  providerId: string;
  model: string;
  systemPrompt: string | null;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  enableVision: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  provider: { id: string; name: string; type: string } | null;
}

interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  reasoningContent: string | null;
  imageUrls: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  createdAt: string;
}

interface ModelInfo {
  id: string;
  name: string;
  owned_by?: string;
  vision?: boolean;
  context_length?: number;
  capabilities?: ModelCapabilities;
}

interface ModelCapabilities {
  vision: boolean;
  document: boolean;
  video: boolean;
  audio: boolean;
}

interface FileAttachment {
  name: string;
  content: string;
  type: "text" | "image";
  mimeType: string;
  base64Data?: string; // for images
  preview?: string; // for display
}

/** Client-side model capability detection (mirrors server logic) */
function detectCapabilities(modelId: string): ModelCapabilities {
  const v = modelId.toLowerCase();
  const vision =
    v.includes("vision") || v.includes("gpt-4o") || v.includes("gpt-4-turbo") ||
    v.includes("gpt4-turbo") || v.includes("gpt-4e") || v.includes("claude-3") ||
    v.includes("claude-3.5") || v.includes("claude-4") || v.includes("gemini") ||
    v.includes("qwen-vl") || v.includes("qwen2-vl") || v.includes("qwen2.5-vl") ||
    v.includes("glm-4v") || v.includes("llava") || v.includes("internvl") ||
    v.includes("cogvlm") || v.includes("minicpm-v") || v.includes("pixtral") ||
    v.includes("o1") || v.includes("o3") || v.includes("o4") ||
    v.includes("deepseek-vl") || v.includes("yi-vision");
  const document =
    v.includes("gemini-1.5") || v.includes("gemini-2") || v.includes("gemini-pro") ||
    v.includes("claude-3.5-sonnet") || v.includes("claude-3.5-haiku") ||
    v.includes("claude-4") || v.includes("gpt-4o") || v.includes("o1") ||
    v.includes("o3") || v.includes("o4");
  const video =
    v.includes("gemini-1.5") || v.includes("gemini-2") || v.includes("gemini-pro") ||
    v.includes("qwen2-vl") || v.includes("qwen2.5-vl") || v.includes("gpt-4o") ||
    v.includes("claude-4");
  const audio =
    v.includes("gemini-2") || v.includes("gpt-4o-audio") || v.includes("gpt-4o-realtime") ||
    v.includes("o1") || v.includes("o3") || v.includes("o4");
  return { vision, document, video, audio };
}

/* ── Helper: read file as text ──────────────────────────────── */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── Helper: check if file is a text file ───────────────────── */
function isTextFile(file: File): boolean {
  const textTypes = [
    "text/", "application/json", "application/xml", "application/javascript",
    "application/typescript", "application/x-yaml", "application/yaml",
    "application/x-sh", "application/x-shellscript",
  ];
  if (textTypes.some((t) => file.type.startsWith(t))) return true;
  const textExts = [
    ".txt", ".md", ".csv", ".log", ".json", ".xml", ".yaml", ".yml",
    ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".go", ".rs", ".java",
    ".c", ".cpp", ".h", ".hpp", ".cs", ".php", ".sh", ".bash", ".zsh",
    ".sql", ".html", ".css", ".scss", ".less", ".toml", ".ini", ".cfg",
    ".env", ".gitignore", ".dockerfile", ".makefile", ".cmake",
    ".rs", ".swift", ".kt", ".scala", ".r", ".m",
  ];
  return textExts.some((ext) => file.name.toLowerCase().endsWith(ext));
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name);
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v|3gp)$/i.test(file.name);
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || /\.(mp3|wav|ogg|flac|aac|m4a|wma|opus)$/i.test(file.name);
}

function isDocumentFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name) ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(file.name) ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || /\.xlsx$/i.test(file.name) ||
    file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || /\.pptx$/i.test(file.name) ||
    file.type === "application/msword" || /\.doc$/i.test(file.name);
}

type FileCategory = "image" | "video" | "audio" | "document" | "text" | "unsupported";

function categorizeFile(file: File): FileCategory {
  if (isImageFile(file)) return "image";
  if (isVideoFile(file)) return "video";
  if (isAudioFile(file)) return "audio";
  if (isDocumentFile(file)) return "document";
  if (isTextFile(file)) return "text";
  return "unsupported";
}

/** Format allowed types for the current model (for error messages) */
function formatAllowedTypes(caps: ModelCapabilities): string {
  const parts: string[] = ["文本文件"];
  if (caps.vision) parts.push("图片");
  if (caps.video) parts.push("视频");
  if (caps.audio) parts.push("音频");
  if (caps.document) parts.push("PDF/文档");
  return parts.join("、");
}

/** Build the accept string for the file input based on capabilities */
function buildAcceptString(caps: ModelCapabilities): string {
  const parts: string[] = [".txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.ts,.jsx,.tsx,.py,.go,.rs,.java,.c,.cpp,.h,.cs,.php,.sh,.sql,.html,.css,.toml,.ini,.env,.log"];
  if (caps.vision) parts.push("image/*");
  if (caps.video) parts.push("video/*");
  if (caps.audio) parts.push("audio/*");
  if (caps.document) parts.push(".pdf,.docx,.xlsx,.pptx,.doc");
  return parts.join(",");
}

/* ── Main Component ─────────────────────────────────────────── */
export function AiClient({
  userId,
  initialProviders,
  initialConversations,
}: {
  userId: string;
  initialProviders: Provider[];
  initialConversations: ConvItem[];
}) {
  const [providers, setProviders] = useState(initialProviders);
  const [conversations, setConversations] = useState(initialConversations);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [streamReasoning, setStreamReasoning] = useState("");
  const [showProviders, setShowProviders] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [modelList, setModelList] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [fileRejectionMsg, setFileRejectionMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const activeProvider = activeConv
    ? providers.find((p) => p.id === activeConv.providerId)
    : null;

  // Resolve current model capabilities (from API list first, fallback to client detection)
  const currentModelCaps: ModelCapabilities = (() => {
    const modelId = activeConv?.model;
    if (!modelId) return { vision: false, document: false, video: false, audio: false };
    // Prefer server-reported capabilities
    const serverModel = modelList.find((m) => m.id === modelId);
    if (serverModel?.capabilities) return serverModel.capabilities;
    // Fallback to client-side detection
    return detectCapabilities(modelId);
  })();

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent, streamReasoning]);

  // Fetch messages when conversation changes
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    fetch(`/api/ai/conversations/${activeConvId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.conversation?.messages) setMessages(data.conversation.messages);
      })
      .catch(() => {});
  }, [activeConvId]);

  // Fetch models when provider changes
  const fetchModels = useCallback(async (providerId: string) => {
    setModelsLoading(true);
    try {
      const r = await fetch(`/api/ai/models?providerId=${providerId}`);
      const data = await r.json();
      if (data.models) setModelList(data.models);
    } catch {
      setModelList([]);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeConv?.providerId) {
      fetchModels(activeConv.providerId);
    } else {
      setModelList([]);
    }
  }, [activeConv?.providerId, fetchModels]);

  // Refresh conversation list
  const refreshConversations = useCallback(async () => {
    const r = await fetch("/api/ai/conversations");
    const data = await r.json();
    if (data.conversations) setConversations(data.conversations);
  }, []);

  const refreshProviders = useCallback(async () => {
    const r = await fetch("/api/ai/providers");
    const data = await r.json();
    if (data.providers) setProviders(data.providers);
  }, []);

  /* ── File Handling (capability-aware) ─────────────────────── */
  const showRejection = useCallback((msg: string) => {
    setFileRejectionMsg(msg);
    setTimeout(() => setFileRejectionMsg(null), 4000);
  }, []);

  const handleFileSelect = async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    for (const file of fileArr) {
      // Size limit: 20MB
      if (file.size > 20 * 1024 * 1024) {
        showRejection(`📄 ${file.name} 超过 20MB 限制`);
        continue;
      }

      const category = categorizeFile(file);

      // Check model capabilities vs file category
      switch (category) {
        case "image": {
          if (!currentModelCaps.vision && !activeConv?.enableVision) {
            showRejection(`🖼 当前模型 ${activeConv?.model} 不支持图片输入。请在设置中切换为多模态模型（如 GPT-4o、Claude 3.5 等）`);
            continue;
          }
          const dataUrl = await readFileAsDataURL(file);
          const base64Data = dataUrl.split(",")[1];
          setFileAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              content: "",
              type: "image",
              mimeType: file.type || "image/png",
              base64Data,
              preview: dataUrl,
            },
          ]);
          break;
        }
        case "video": {
          if (!currentModelCaps.video) {
            showRejection(`🎬 当前模型 ${activeConv?.model} 不支持视频输入。支持视频的模型：Gemini 1.5/2、Qwen2-VL、GPT-4o 等`);
            continue;
          }
          // Video: read as base64 for models that support it
          const dataUrl = await readFileAsDataURL(file);
          const base64Data = dataUrl.split(",")[1];
          setFileAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              content: "",
              type: "image", // sent as image_url with video mime type
              mimeType: file.type || "video/mp4",
              base64Data,
              preview: undefined, // no image preview for video
            },
          ]);
          break;
        }
        case "audio": {
          if (!currentModelCaps.audio) {
            showRejection(`🎵 当前模型 ${activeConv?.model} 不支持音频输入。支持音频的模型：Gemini 2、GPT-4o-audio 等`);
            continue;
          }
          const dataUrl = await readFileAsDataURL(file);
          const base64Data = dataUrl.split(",")[1];
          setFileAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              content: "",
              type: "image", // sent as image_url with audio mime type
              mimeType: file.type || "audio/mp3",
              base64Data,
              preview: undefined,
            },
          ]);
          break;
        }
        case "document": {
          if (!currentModelCaps.document) {
            // Fallback: try to read as text for some doc types, or reject
            if (file.name.toLowerCase().endsWith(".pdf")) {
              showRejection(`📑 当前模型 ${activeConv?.model} 不支持 PDF 文件。支持文档的模型：Gemini 1.5/2、Claude 3.5 Sonnet、GPT-4o 等`);
              continue;
            }
            // .docx/.xlsx etc — not text-readable, reject
            showRejection(`📑 当前模型 ${activeConv?.model} 不支持 Office 文档。支持文档的模型：Gemini 1.5/2、Claude 3.5 Sonnet、GPT-4o 等`);
            continue;
          }
          // Document: send as base64
          const dataUrl = await readFileAsDataURL(file);
          const base64Data = dataUrl.split(",")[1];
          setFileAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              content: "",
              type: "image", // sent as image_url with doc mime type
              mimeType: file.type || "application/pdf",
              base64Data,
              preview: undefined,
            },
          ]);
          break;
        }
        case "text": {
          // Text files are always OK (they get injected into the message text)
          const text = await readFileAsText(file);
          const truncated = text.length > 100000 ? text.slice(0, 100000) + "\n...(文件过长，已截断)" : text;
          setFileAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              content: truncated,
              type: "text",
              mimeType: file.type || "text/plain",
            },
          ]);
          break;
        }
        default: {
          showRejection(`❌ 不支持的文件类型: ${file.name}。当前模型可接受：${formatAllowedTypes(currentModelCaps)}`);
        }
      }
    }
  };

  // Paste handler — only images for now (browsers don't paste other types)
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        if (!currentModelCaps.vision && !activeConv?.enableVision) {
          showRejection(`🖼 当前模型不支持图片输入，请在设置中切换为多模态模型`);
          e.preventDefault();
          return;
        }
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await handleFileSelect([file]);
      }
    }
  }, [currentModelCaps, activeConv?.enableVision, showRejection, handleFileSelect]);

  // Drag & drop handler
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      await handleFileSelect(e.dataTransfer.files);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /* ── Send Message ──────────────────────────────────────────── */
  const handleSend = async () => {
    if (!input.trim() || !activeConvId || streaming) return;
    // Allow sending with just files (no text required if files present)
    if (!input.trim() && fileAttachments.length === 0) return;
    const userMsg = input.trim() || "(附件)";
    const userImages = [...imageUrls];
    const userImageBase64 = fileAttachments
      .filter((f) => f.type === "image" && f.base64Data)
      .map((f) => ({ mimeType: f.mimeType, data: f.base64Data! }));
    const userFiles = fileAttachments
      .filter((f) => f.type === "text")
      .map((f) => ({ name: f.name, content: f.content }));
    const userImagePreviews = fileAttachments
      .filter((f) => f.type === "image" && f.preview)
      .map((f) => f.preview!);

    setInput("");
    setImageUrls([]);
    setFileAttachments([]);

    // Add optimistic user message
    const optimisticUser: Message = {
      id: `temp-${Date.now()}`,
      conversationId: activeConvId,
      role: "user",
      content: userMsg,
      reasoningContent: null,
      imageUrls: JSON.stringify([...userImages, ...userImagePreviews]),
      model: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setStreaming(true);
    setStreamContent("");
    setStreamReasoning("");

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          content: userMsg,
          imageUrls: userImages,
          imageBase64: userImageBase64,
          fileAttachments: userFiles,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "请求失败" }));
        setStreamContent(`❌ ${err.error || "请求失败"}`);
        setStreaming(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let finalContent = "";
      let finalReasoning = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content") {
              finalContent += parsed.content;
              setStreamContent(finalContent);
            } else if (parsed.type === "reasoning") {
              finalReasoning += parsed.content;
              setStreamReasoning(finalReasoning);
            } else if (parsed.type === "done") {
              const assistantMsg: Message = {
                id: `stream-${Date.now()}`,
                conversationId: activeConvId,
                role: "assistant",
                content: finalContent || "(无响应)",
                reasoningContent: finalReasoning || null,
                imageUrls: "[]",
                model: activeConv?.model || null,
                inputTokens: parsed.inputTokens ?? null,
                outputTokens: parsed.outputTokens ?? null,
                latencyMs: parsed.latencyMs ?? null,
                createdAt: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, assistantMsg]);
            } else if (parsed.type === "error") {
              setStreamContent(`❌ ${parsed.error}`);
            }
          } catch {
            // Skip
          }
        }
      }
    } catch {
      setStreamContent("❌ 网络错误");
    } finally {
      setStreaming(false);
      setStreamContent("");
      setStreamReasoning("");
      if (activeConvId) {
        fetch(`/api/ai/conversations/${activeConvId}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.conversation?.messages) setMessages(data.conversation.messages);
          })
          .catch(() => {});
      }
      refreshConversations();
    }
  };

  /* ── Create New Conversation ──────────────────────────────── */
  const handleNewConv = async () => {
    const defaultProvider = providers.find((p) => p.isDefault && p.enabled) || providers.find((p) => p.enabled);
    if (!defaultProvider) {
      alert("请先添加一个 AI 提供商");
      setShowProviders(true);
      return;
    }
    try {
      const r = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: defaultProvider.id,
          model: defaultProvider.defaultModel,
        }),
      });
      const data = await r.json();
      if (data.conversation) {
        await refreshConversations();
        setActiveConvId(data.conversation.id);
      }
    } catch {
      alert("创建对话失败");
    }
  };

  /* ── Delete Conversation ──────────────────────────────────── */
  const handleDeleteConv = async (id: string) => {
    if (!confirm("确定删除此对话？")) return;
    await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
    if (activeConvId === id) setActiveConvId(null);
    refreshConversations();
  };

  /* ── Render Message Content ────────────────────────────────── */
  const renderContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const lines = part.slice(3, -3).split("\n");
        const lang = lines[0]?.trim() || "";
        const code = lang ? lines.slice(1).join("\n") : lines.join("\n");
        return (
          <pre key={i} className="bg-black/40 rounded-lg p-3 my-2 overflow-x-auto text-xs leading-relaxed">
            {lang && <div className="text-cyan-400/60 text-[10px] mb-1">{lang}</div>}
            <code>{code}</code>
          </pre>
        );
      }
      const inlineParts = part.split(/(`[^`]+`)/g);
      return (
        <span key={i}>
          {inlineParts.map((ip, j) => {
            if (ip.startsWith("`") && ip.endsWith("`")) {
              return (
                <code key={j} className="bg-black/30 px-1.5 py-0.5 rounded text-cyan-300 text-xs">
                  {ip.slice(1, -1)}
                </code>
              );
            }
            return <span key={j}>{ip}</span>;
          })}
        </span>
      );
    });
  };

  /* ── Provider Form State ────────────────────────────────────── */
  const [provForm, setProvForm] = useState({
    name: "",
    type: "OPENAI_COMPATIBLE",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    availableModels: "",
    isDefault: true,
  });

  const handleCreateProvider = async () => {
    if (!provForm.name.trim() || !provForm.apiKey.trim()) {
      alert("名称和 API Key 不能为空");
      return;
    }
    const models = provForm.availableModels
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    try {
      await fetch("/api/ai/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...provForm,
          availableModels: models,
        }),
      });
      await refreshProviders();
      setProvForm({
        name: "",
        type: "OPENAI_COMPATIBLE",
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        defaultModel: "gpt-4o",
        availableModels: "",
        isDefault: true,
      });
    } catch {
      alert("添加失败");
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm("确定删除此提供商？关联的对话也会被删除。")) return;
    await fetch(`/api/ai/providers/${id}`, { method: "DELETE" });
    if (activeConv?.providerId === id) setActiveConvId(null);
    refreshProviders();
    refreshConversations();
  };

  /* ── Settings Update ───────────────────────────────────────── */
  const [settingsForm, setSettingsForm] = useState({
    model: "",
    systemPrompt: "",
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1.0,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
    enableVision: false,
  });

  useEffect(() => {
    if (activeConv) {
      setSettingsForm({
        model: activeConv.model,
        systemPrompt: activeConv.systemPrompt || "",
        temperature: activeConv.temperature,
        maxTokens: activeConv.maxTokens,
        topP: activeConv.topP,
        frequencyPenalty: activeConv.frequencyPenalty,
        presencePenalty: activeConv.presencePenalty,
        enableVision: activeConv.enableVision,
      });
    }
  }, [activeConv]);

  const handleSaveSettings = async () => {
    if (!activeConvId) return;
    try {
      await fetch(`/api/ai/conversations/${activeConvId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      await refreshConversations();
      setShowSettings(false);
    } catch {
      alert("保存失败");
    }
  };

  // Auto-detect vision from selected model
  const selectedModelInfo = modelList.find((m) => m.id === settingsForm.model);
  const currentModelSupportsVision = selectedModelInfo?.vision || false;

  const providerTypes: Record<string, string> = {
    OPENAI: "OpenAI",
    OPENAI_COMPATIBLE: "OpenAI 兼容",
    ANTHROPIC: "Anthropic",
    GOOGLE: "Google AI",
    CUSTOM: "自定义",
  };

  const commonBaseUrls: Record<string, string> = {
    OPENAI: "https://api.openai.com/v1",
    OPENAI_COMPATIBLE: "",
    ANTHROPIC: "https://api.anthropic.com/v1",
    GOOGLE: "https://generativelanguage.googleapis.com/v1beta",
    CUSTOM: "",
  };

  // Filter models by search
  const filteredModels = modelList.filter((m) =>
    m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* ── Left Sidebar: Conversation List ───────────────────── */}
      {showSidebar && (
        <div className="w-64 flex-shrink-0 border-r border-white/[0.06] bg-slate-950/50 flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">AI 助手</h2>
            <button
              onClick={handleNewConv}
              className="h-7 px-2.5 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-medium hover:bg-cyan-500/30 transition"
            >
              + 新对话
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
            {conversations.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-8">暂无对话，点击新建开始</p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition ${
                  activeConvId === conv.id
                    ? "bg-cyan-400/[0.08] text-cyan-100"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                }`}
                onClick={() => setActiveConvId(conv.id)}
              >
                <svg className="w-4 h-4 flex-shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-xs truncate flex-1">{conv.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConv(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Bottom actions */}
          <div className="border-t border-white/[0.06] p-2 space-y-1">
            <button
              onClick={() => setShowProviders(!showProviders)}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.857L8 16H6v2H4v2H2v-2.586l7.44-7.44A6 6 0 0121 9z" />
              </svg>
              提供商管理
            </button>
            <button
              onClick={() => setShowSidebar(false)}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 transition lg:hidden"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
              收起侧栏
            </button>
          </div>
        </div>
      )}

      {!showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="absolute top-4 left-4 z-50 lg:hidden rounded-xl border border-white/10 bg-slate-950/90 p-2.5 text-slate-200 backdrop-blur hover:bg-white/10 transition"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {/* ── Main Chat Area ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeConv ? (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3 bg-slate-950/30">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white truncate">{activeConv.title}</h3>
                <p className="text-[10px] text-slate-500">
                  {activeProvider?.name || "未知"} · {activeConv.model}
                  {activeConv.enableVision && " · 👁 多模态"}
                  {currentModelCaps.video && " · 🎬 视频"}
                  {currentModelCaps.audio && " · 🎵 音频"}
                  {currentModelCaps.document && " · 📑 文档"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="h-7 px-2.5 rounded-lg text-xs text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 transition"
                >
                  ⚙ 设置
                </button>
                <button
                  onClick={() => {
                    const title = prompt("修改对话标题", activeConv.title);
                    if (title?.trim()) {
                      fetch(`/api/ai/conversations/${activeConvId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title: title.trim() }),
                      }).then(() => refreshConversations());
                    }
                  }}
                  className="h-7 px-2.5 rounded-lg text-xs text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 transition"
                >
                  ✏ 重命名
                </button>
              </div>
            </div>

            {/* Settings panel */}
            {showSettings && (
              <div className="border-b border-white/[0.06] bg-slate-950/50 p-4 max-h-[50vh] overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Model selector — dropdown from API */}
                  <div className="col-span-2 md:col-span-2 relative">
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                      模型
                      {modelsLoading && <span className="ml-2 text-cyan-400 animate-pulse">加载中...</span>}
                    </label>
                    <div className="relative mt-1">
                      <button
                        onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                        className="w-full flex items-center justify-between bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white hover:border-cyan-400/30 transition"
                      >
                        <span className="truncate flex items-center gap-1.5">
                          {settingsForm.model}
                          {currentModelSupportsVision && (
                            <span className="text-[9px] text-cyan-400 bg-cyan-400/10 px-1 py-0.5 rounded">👁</span>
                          )}
                        </span>
                        <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${modelDropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {modelDropdownOpen && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-900 border border-white/10 rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col">
                          <div className="p-2 border-b border-white/5">
                            <input
                              value={modelSearch}
                              onChange={(e) => setModelSearch(e.target.value)}
                              placeholder="搜索模型..."
                              className="w-full bg-black/30 border border-white/5 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400/30"
                              autoFocus
                            />
                          </div>
                          <div className="overflow-y-auto max-h-48">
                            {filteredModels.length === 0 && !modelsLoading && (
                              <div className="px-3 py-4 text-xs text-slate-500 text-center">
                                无可用模型
                                <button
                                  onClick={() => activeConv?.providerId && fetchModels(activeConv.providerId)}
                                  className="ml-2 text-cyan-400 hover:text-cyan-300"
                                >
                                  刷新
                                </button>
                              </div>
                            )}
                            {filteredModels.map((m) => (
                              <button
                                key={m.id}
                                onClick={() => {
                                  setSettingsForm((f) => ({
                                    ...f,
                                    model: m.id,
                                    // Auto-enable vision if model supports it
                                    enableVision: m.vision ? true : f.enableVision,
                                  }));
                                  setModelDropdownOpen(false);
                                  setModelSearch("");
                                }}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-white/[0.04] transition flex items-center gap-2 ${
                                  settingsForm.model === m.id ? "text-cyan-300 bg-cyan-400/[0.06]" : "text-white"
                                }`}
                              >
                                <span className="truncate flex-1">{m.id}</span>
                                {/* Capability badges */}
                                <span className="flex items-center gap-0.5 flex-shrink-0">
                                  {(m.capabilities?.vision || m.vision) && (
                                    <span className="text-[9px] text-cyan-400/60" title="支持图片">👁</span>
                                  )}
                                  {m.capabilities?.video && (
                                    <span className="text-[9px] text-blue-400/60" title="支持视频">🎬</span>
                                  )}
                                  {m.capabilities?.audio && (
                                    <span className="text-[9px] text-purple-400/60" title="支持音频">🎵</span>
                                  )}
                                  {m.capabilities?.document && (
                                    <span className="text-[9px] text-green-400/60" title="支持文档">📑</span>
                                  )}
                                </span>
                                {m.context_length && (
                                  <span className="text-[9px] text-slate-600 flex-shrink-0">
                                    {(m.context_length / 1000).toFixed(0)}k
                                  </span>
                                )}
                                {m.owned_by && (
                                  <span className="text-[9px] text-slate-600 flex-shrink-0 truncate max-w-[60px]">
                                    {m.owned_by}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                          {/* Manual model input fallback */}
                          <div className="border-t border-white/5 p-2">
                            <div className="flex gap-1.5">
                              <input
                                value={modelSearch || settingsForm.model}
                                onChange={(e) => setModelSearch(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && modelSearch.trim()) {
                                    setSettingsForm((f) => ({ ...f, model: modelSearch.trim() }));
                                    setModelDropdownOpen(false);
                                    setModelSearch("");
                                  }
                                }}
                                placeholder="手动输入模型 ID..."
                                className="flex-1 bg-black/30 border border-white/5 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none"
                              />
                              <button
                                onClick={() => {
                                  if (modelSearch.trim()) {
                                    setSettingsForm((f) => ({ ...f, model: modelSearch.trim() }));
                                    setModelDropdownOpen(false);
                                    setModelSearch("");
                                  }
                                }}
                                className="px-2 py-1 text-[10px] bg-cyan-500/20 text-cyan-300 rounded hover:bg-cyan-500/30"
                              >
                                应用
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Temperature slider */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                      Temperature <span className="text-cyan-400/70">{settingsForm.temperature.toFixed(2)}</span>
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.01}
                        value={settingsForm.temperature}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
                        className="flex-1 h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-cyan-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                      />
                    </div>
                  </div>

                  {/* Max Tokens */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                      Max Tokens
                    </label>
                    <select
                      value={settingsForm.maxTokens}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, maxTokens: parseInt(e.target.value) }))}
                      className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      {[512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 128000].map((v) => (
                        <option key={v} value={v}>{v.toLocaleString()}</option>
                      ))}
                    </select>
                  </div>

                  {/* Top P slider */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                      Top P <span className="text-cyan-400/70">{settingsForm.topP.toFixed(2)}</span>
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={settingsForm.topP}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, topP: parseFloat(e.target.value) }))}
                        className="flex-1 h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-cyan-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                      />
                    </div>
                  </div>

                  {/* Frequency Penalty slider */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                      频率惩罚 <span className="text-cyan-400/70">{settingsForm.frequencyPenalty.toFixed(2)}</span>
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="range"
                        min={-2}
                        max={2}
                        step={0.01}
                        value={settingsForm.frequencyPenalty}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, frequencyPenalty: parseFloat(e.target.value) }))}
                        className="flex-1 h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-cyan-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                      />
                    </div>
                  </div>

                  {/* Presence Penalty slider */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                      存在惩罚 <span className="text-cyan-400/70">{settingsForm.presencePenalty.toFixed(2)}</span>
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="range"
                        min={-2}
                        max={2}
                        step={0.01}
                        value={settingsForm.presencePenalty}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, presencePenalty: parseFloat(e.target.value) }))}
                        className="flex-1 h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-cyan-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                      />
                    </div>
                  </div>

                  {/* Vision toggle */}
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settingsForm.enableVision}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, enableVision: e.target.checked }))}
                        className="rounded border-white/20 bg-black/30 text-cyan-400 focus:ring-cyan-400/30"
                      />
                      <span className="text-xs text-slate-300">
                        👁 多模态 (视觉)
                        {currentModelSupportsVision && (
                          <span className="text-[9px] text-cyan-400/60 ml-1">推荐</span>
                        )}
                      </span>
                    </label>
                  </div>

                  {/* Save button */}
                  <div className="flex items-end gap-2">
                    <button
                      onClick={handleSaveSettings}
                      className="h-7 px-3 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-medium hover:bg-cyan-500/30 transition"
                    >
                      保存设置
                    </button>
                  </div>
                </div>

                {/* System prompt */}
                <div className="mt-3">
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider">系统提示词 (System Prompt)</label>
                  <textarea
                    value={settingsForm.systemPrompt}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                    rows={2}
                    placeholder="设定 AI 的角色和行为方式..."
                    className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 resize-none focus:outline-none focus:border-cyan-400/30"
                  />
                </div>
              </div>
            )}

            {/* Messages area */}
            <div
              className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              {messages.length === 0 && !streaming && (
                <div className="flex flex-col items-center justify-center h-full text-slate-600">
                  <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-sm">发送消息开始对话</p>
                  <p className="text-xs mt-1 text-slate-700">
                    支持: {formatAllowedTypes(currentModelCaps)} · 拖拽/粘贴上传
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role !== "user" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.09-.75.202-.25.112-.499.268-.75.468M9.75 3.104c.251.023.501.09.75.202.25.112.499.268.75.468M5 14.5l-1.43 1.43a2.25 2.25 0 01-3.182 0l-.03-.03a2.25 2.25 0 010-3.182L5 14.5zm0 0l6.25-6.25" />
                      </svg>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-cyan-500/15 text-cyan-50"
                        : "bg-white/[0.04] text-slate-200"
                    }`}
                  >
                    {/* Reasoning content */}
                    {msg.reasoningContent && (
                      <details className="mb-2">
                        <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-400">
                          💭 思考过程
                        </summary>
                        <div className="mt-1 p-2 bg-black/20 rounded-lg text-xs text-slate-500 whitespace-pre-wrap">
                          {msg.reasoningContent}
                        </div>
                      </details>
                    )}
                    {/* Main content */}
                    <div className="whitespace-pre-wrap break-words">{renderContent(msg.content)}</div>
                    {/* Image URLs */}
                    {(() => {
                      try {
                        const urls: string[] = JSON.parse(msg.imageUrls || "[]");
                        if (urls.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {urls.map((url, i) => (
                              <img
                                key={i}
                                src={url}
                                alt={`附件 ${i + 1}`}
                                className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-white/10"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ))}
                          </div>
                        );
                      } catch {
                        return null;
                      }
                    })()}
                    {/* Meta info */}
                    {msg.role === "assistant" && (msg.inputTokens || msg.outputTokens || msg.latencyMs) && (
                      <div className="mt-2 flex gap-3 text-[10px] text-slate-600">
                        {msg.model && <span>{msg.model}</span>}
                        {msg.inputTokens != null && <span>↑{msg.inputTokens}</span>}
                        {msg.outputTokens != null && <span>↓{msg.outputTokens}</span>}
                        {msg.latencyMs != null && <span>{(msg.latencyMs / 1000).toFixed(1)}s</span>}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-[11px] font-semibold text-cyan-400 uppercase">
                      U
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming content */}
              {streaming && streamContent && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" />
                    </svg>
                  </div>
                  <div className="max-w-[80%] rounded-2xl px-4 py-2.5 bg-white/[0.04] text-slate-200 text-sm leading-relaxed">
                    {streamReasoning && (
                      <details open className="mb-2">
                        <summary className="text-[10px] text-cyan-400/60 cursor-pointer">💭 正在思考...</summary>
                        <div className="mt-1 p-2 bg-black/20 rounded-lg text-xs text-slate-500 whitespace-pre-wrap">
                          {streamReasoning}
                        </div>
                      </details>
                    )}
                    <div className="whitespace-pre-wrap break-words">{renderContent(streamContent)}</div>
                  </div>
                </div>
              )}
              {streaming && !streamContent && !streamReasoning && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                    <div className="flex gap-0.5">
                      <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                  <div className="rounded-2xl px-4 py-2.5 bg-white/[0.04] text-slate-500 text-sm">
                    正在思考...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* File/Attachment preview area */}
            {(fileAttachments.length > 0 || (activeConv.enableVision && imageUrls.length > 0)) && (
              <div className="px-4 pb-1.5 border-t border-white/[0.03] bg-slate-950/20">
                <div className="flex flex-wrap gap-2 py-2">
                  {/* URL-based images */}
                  {imageUrls.map((url, i) => (
                    <div key={`url-${i}`} className="relative group">
                      <img src={url} alt="" className="w-12 h-12 rounded object-cover border border-white/10" />
                      <button
                        onClick={() => setImageUrls((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                {/* File attachments */}
                {fileAttachments.map((file, i) => (
                  <div key={`file-${i}`} className="relative group">
                    {file.type === "image" && file.preview ? (
                      <img src={file.preview} alt={file.name} className="w-12 h-12 rounded object-cover border border-white/10" />
                    ) : (
                      <div className="w-12 h-12 rounded border border-white/10 bg-black/30 flex flex-col items-center justify-center">
                        {file.mimeType.startsWith("video/") ? (
                          <span className="text-base" title="视频文件">🎬</span>
                        ) : file.mimeType.startsWith("audio/") ? (
                          <span className="text-base" title="音频文件">🎵</span>
                        ) : file.mimeType === "application/pdf" || file.mimeType.includes("officedocument") ? (
                          <span className="text-base" title="文档文件">📑</span>
                        ) : (
                          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        )}
                        <span className="text-[7px] text-slate-500 truncate max-w-[44px] mt-0.5">{file.name}</span>
                      </div>
                    )}
                      <button
                        onClick={() => setFileAttachments((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Image URL input (when vision enabled) */}
            {activeConv.enableVision && (
              <div className="px-4 pb-1">
                <div className="flex gap-2">
                  <input
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="输入图片 URL（回车添加）"
                    className="flex-1 bg-black/20 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && imageUrlInput.trim()) {
                        setImageUrls((prev) => [...prev, imageUrlInput.trim()]);
                        setImageUrlInput("");
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Input area */}
            <div className="px-4 py-3 border-t border-white/[0.06] bg-slate-950/30">
              {/* File rejection toast */}
              {fileRejectionMsg && (
                <div className="mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{fileRejectionMsg}</span>
                  <button onClick={() => setFileRejectionMsg(null)} className="ml-auto text-red-400/60 hover:text-red-300 flex-shrink-0">×</button>
                </div>
              )}
              <div className="flex gap-2 items-end">
                {/* File upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={streaming}
                  className="h-10 w-10 rounded-xl bg-white/[0.04] text-slate-400 flex items-center justify-center hover:bg-white/[0.08] hover:text-slate-200 transition disabled:opacity-30"
                  title={`上传文件 (支持: ${formatAllowedTypes(currentModelCaps)})`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 11-12.728 0M12 3v12" />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={buildAcceptString(currentModelCaps)}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleFileSelect(e.target.files);
                    e.target.value = "";
                  }}
                />
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  onPaste={handlePaste}
                  placeholder={
                    activeConv.enableVision
                      ? `输入消息... (Shift+Enter 换行，支持: ${formatAllowedTypes(currentModelCaps)})`
                      : `输入消息... (Shift+Enter 换行，📎 可上传 ${formatAllowedTypes(currentModelCaps)})`
                  }
                  rows={1}
                  disabled={streaming}
                  className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:border-cyan-400/30 transition disabled:opacity-50"
                  style={{ maxHeight: "120px" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 120) + "px";
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={streaming || (!input.trim() && fileAttachments.length === 0)}
                  className="h-10 w-10 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center hover:bg-cyan-500/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
            <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.09-.75.202-.25.112-.499.268-.75.468M9.75 3.104c.251.023.501.09.75.202.25.112.499.268.75.468M5 14.5l-1.43 1.43a2.25 2.25 0 01-3.182 0l-.03-.03a2.25 2.25 0 010-3.182L5 14.5zm0 0l6.25-6.25" />
            </svg>
            <p className="text-sm mb-3">选择一个对话或创建新对话</p>
            <button
              onClick={handleNewConv}
              className="h-9 px-4 rounded-xl bg-cyan-500/20 text-cyan-300 text-sm font-medium hover:bg-cyan-500/30 transition"
            >
              + 新对话
            </button>
            {providers.length === 0 && (
              <p className="mt-4 text-xs text-amber-400/60">
                ⚠ 还未配置 AI 提供商，请先在下方添加
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Provider Management Panel (overlay) ─────────────────── */}
      {showProviders && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">AI 提供商管理</h3>
              <button
                onClick={() => setShowProviders(false)}
                className="text-slate-500 hover:text-slate-300 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Existing providers */}
              {providers.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs text-slate-500 uppercase tracking-wider">已添加的提供商</h4>
                  {providers.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-medium">{p.name}</span>
                          <span className="text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">
                            {providerTypes[p.type] || p.type}
                          </span>
                          {p.isDefault && (
                            <span className="text-[10px] text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded">默认</span>
                          )}
                          {!p.enabled && (
                            <span className="text-[10px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">已禁用</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {p.baseUrl} · {p.defaultModel} · Key: {p.apiKey}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteProvider(p.id)}
                        className="text-xs text-red-400/60 hover:text-red-400 transition"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new provider form */}
              <div className="space-y-3">
                <h4 className="text-xs text-slate-500 uppercase tracking-wider">添加新提供商</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500">名称</label>
                    <input
                      value={provForm.name}
                      onChange={(e) => setProvForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="如: OpenAI"
                      className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">类型</label>
                    <select
                      value={provForm.type}
                      onChange={(e) => {
                        const t = e.target.value;
                        setProvForm((f) => ({
                          ...f,
                          type: t,
                          baseUrl: commonBaseUrls[t] || f.baseUrl,
                        }));
                      }}
                      className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      {Object.entries(providerTypes).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-500">API Key</label>
                    <input
                      type="password"
                      value={provForm.apiKey}
                      onChange={(e) => setProvForm((f) => ({ ...f, apiKey: e.target.value }))}
                      placeholder="sk-..."
                      className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">Base URL</label>
                    <input
                      value={provForm.baseUrl}
                      onChange={(e) => setProvForm((f) => ({ ...f, baseUrl: e.target.value }))}
                      placeholder="https://api.openai.com/v1"
                      className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500">默认模型</label>
                    <input
                      value={provForm.defaultModel}
                      onChange={(e) => setProvForm((f) => ({ ...f, defaultModel: e.target.value }))}
                      placeholder="gpt-4o"
                      className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-500">
                      可用模型 (逗号分隔，留空则从 API 自动获取)
                    </label>
                    <input
                      value={provForm.availableModels}
                      onChange={(e) => setProvForm((f) => ({ ...f, availableModels: e.target.value }))}
                      placeholder="gpt-4o, gpt-4o-mini, o1-preview"
                      className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <label className="flex items-center gap-2 col-span-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={provForm.isDefault}
                      onChange={(e) => setProvForm((f) => ({ ...f, isDefault: e.target.checked }))}
                      className="rounded border-white/20 bg-black/30 text-cyan-400 focus:ring-cyan-400/30"
                    />
                    <span className="text-xs text-slate-300">设为默认提供商</span>
                  </label>
                </div>
                <button
                  onClick={handleCreateProvider}
                  className="w-full h-9 rounded-xl bg-cyan-500/20 text-cyan-300 text-sm font-medium hover:bg-cyan-500/30 transition"
                >
                  添加提供商
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
