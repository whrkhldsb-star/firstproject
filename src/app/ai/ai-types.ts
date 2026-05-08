/* ── AI Chat Types ──────────────────────────────────────────── */

export interface Provider {
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

export interface ConvItem {
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

export interface Message {
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

export interface ModelInfo {
  id: string;
  name: string;
  owned_by?: string;
  vision?: boolean;
  context_length?: number;
  capabilities?: ModelCapabilities;
}

export interface ModelCapabilities {
  vision: boolean;
  document: boolean;
  video: boolean;
  audio: boolean;
}

export interface FileAttachment {
  name: string;
  content: string;
  type: "text" | "image";
  mimeType: string;
  base64Data?: string;
  preview?: string;
}

export type FileCategory = "image" | "video" | "audio" | "document" | "text" | "unsupported";

export const PROVIDER_TYPES: Record<string, string> = {
  OPENAI: "OpenAI",
  OPENAI_COMPATIBLE: "OpenAI 兼容",
  ANTHROPIC: "Anthropic",
  GOOGLE: "Google AI",
  CUSTOM: "自定义",
};

export const COMMON_BASE_URLS: Record<string, string> = {
  OPENAI: "https://api.openai.com/v1",
  ANTHROPIC: "https://api.anthropic.com/v1",
  GOOGLE: "https://generativelanguage.googleapis.com/v1beta",
};

export const DEFAULT_PROV_FORM = {
  name: "",
  type: "OPENAI_COMPATIBLE",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  defaultModel: "gpt-4o",
  availableModels: "",
  isDefault: true,
};

export const DEFAULT_SETTINGS_FORM = {
  model: "",
  systemPrompt: "",
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1.0,
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
  enableVision: false,
};
