import { describe, expect, it } from "vitest";

import { validateDownloadSourceUrl } from "@/lib/downloads/source-url";

describe("validateDownloadSourceUrl", () => {
  it("accepts public http, https and magnet links", () => {
    expect(validateDownloadSourceUrl("https://example.com/file.iso")).toEqual({ ok: true });
    expect(validateDownloadSourceUrl("http://downloads.example.org/a.torrent")).toEqual({ ok: true });
    expect(validateDownloadSourceUrl("magnet:?xt=urn:btih:abcdef")).toEqual({ ok: true });
  });

  it("rejects non-download schemes and malformed URLs", () => {
    expect(validateDownloadSourceUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateDownloadSourceUrl("ftp://example.com/file").ok).toBe(false);
    expect(validateDownloadSourceUrl("not a url").ok).toBe(false);
  });

  it("rejects URLs with userinfo, explicit ports or excessive length", () => {
    expect(validateDownloadSourceUrl("https://user:pass@example.com/file").ok).toBe(false);
    expect(validateDownloadSourceUrl("https://example.com:8443/file").ok).toBe(false);
    expect(validateDownloadSourceUrl(`https://example.com/${"a".repeat(4097)}`).ok).toBe(false);
  });

  it("rejects loopback, private, link-local, multicast and metadata endpoints", () => {
    const blocked = [
      "http://localhost/admin",
      "http://127.0.0.1:8080/",
      "http://10.0.0.5/file",
      "http://172.16.2.3/file",
      "http://192.168.1.8/file",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[fc00::1]/",
      "http://[fe80::1]/",
      "http://224.0.0.1/file",
    ];

    for (const url of blocked) {
      expect(validateDownloadSourceUrl(url), url).toMatchObject({ ok: false });
    }
  });

  it("rejects hostnames that are explicitly configured as internal suffixes", () => {
    expect(
      validateDownloadSourceUrl("https://files.internal.example/file", {
        blockedHostnameSuffixes: [".internal.example"],
      }),
    ).toMatchObject({ ok: false });
  });
});
