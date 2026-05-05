import { describe, expect, it, vi } from "vitest";

// The /storage page now simply redirects to /files
// We test that it doesn't throw during server-side rendering

vi.mock("@/lib/auth/require-session", () => ({
 requireSession: vi.fn().mockResolvedValue({
 userId: "u_1",
 username: "admin",
 roles: ["admin"],
 mustChangePassword: false,
 }),
}));

vi.mock("next/navigation", () => ({
 redirect: vi.fn(),
}));

import { redirect } from "next/navigation";
import StoragePage from "../page";

describe("StoragePage", () => {
 it("redirects to /files", async () => {
 try {
 await StoragePage();
 } catch {
 // redirect() throws NEXT_REDIRECT in Next.js, which is expected
 }
 expect(redirect).toHaveBeenCalledWith("/files");
 });
});
