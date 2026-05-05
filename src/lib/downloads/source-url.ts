const DEFAULT_BLOCKED_HOSTNAME_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".lan",
  ".home",
  ".test",
  ".invalid",
];

type ValidateDownloadSourceUrlOptions = {
  blockedHostnameSuffixes?: string[];
};

export type DownloadSourceUrlValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

function isMagnetLink(value: string): boolean {
  return value.startsWith("magnet:?");
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    const value = Number(part);
    return value >= 0 && value <= 255 ? value : Number.NaN;
  });
  return bytes.every(Number.isInteger) ? bytes : null;
}

function isBlockedIpv4(bytes: number[]): boolean {
  const [a, b] = bytes;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function normalizeIpv6(hostname: string): string {
  return hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

function isBlockedIpv6(hostname: string): boolean {
  const value = normalizeIpv6(hostname);
  return (
    value === "::1" ||
    value === "::" ||
    value.startsWith("fe80:") ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("ff") ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.") ||
    value.startsWith("::ffff:169.254.")
  );
}

function hostnameMatchesBlockedSuffix(hostname: string, suffixes: string[]): boolean {
  const lower = hostname.toLowerCase();
  return suffixes.some((suffix) => {
    const normalized = suffix.toLowerCase().startsWith(".") ? suffix.toLowerCase() : `.${suffix.toLowerCase()}`;
    return lower === normalized.slice(1) || lower.endsWith(normalized);
  });
}

export function validateDownloadSourceUrl(
  rawUrl: string,
  options: ValidateDownloadSourceUrlOptions = {},
): DownloadSourceUrlValidationResult {
  const value = (rawUrl ?? "").trim();
  if (!value) return { ok: false, reason: "下载链接不能为空" };
  if (value.length > 4096) return { ok: false, reason: "下载链接过长" };
  if (isMagnetLink(value)) return { ok: true };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "下载链接格式无效" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "仅支持 HTTP、HTTPS 或 magnet 链接" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "下载链接不允许包含用户名或密码" };
  }

  if (parsed.port) {
    return { ok: false, reason: "下载链接不允许指定端口" };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) return { ok: false, reason: "下载链接缺少主机名" };

  const blockedSuffixes = options.blockedHostnameSuffixes ?? DEFAULT_BLOCKED_HOSTNAME_SUFFIXES;
  if (hostnameMatchesBlockedSuffix(hostname, blockedSuffixes)) {
    return { ok: false, reason: "不允许下载内网或本地域名资源" };
  }

  const ipv4 = parseIpv4(hostname);
  if (ipv4 && isBlockedIpv4(ipv4)) {
    return { ok: false, reason: "不允许下载内网、回环或链路本地地址资源" };
  }

  if (hostname.includes(":") && isBlockedIpv6(hostname)) {
    return { ok: false, reason: "不允许下载内网、回环或链路本地 IPv6 地址资源" };
  }

  return { ok: true };
}
