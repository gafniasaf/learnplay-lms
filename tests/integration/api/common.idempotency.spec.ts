import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "test-access-token",
              user: { id: "user-1", email: "user@example.com" },
            },
          },
          error: null,
        }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        refreshSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: "test-access-token",
              user: { id: "user-1", email: "user@example.com" },
            },
          },
          error: null,
        }),
      },
    },
  };
});

describe("api/common callEdgeFunction idempotency", () => {
  beforeEach(() => {
    // Provide required config without hardcoded fallbacks.
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("VITE_DEV_AGENT_MODE", "false");
    vi.stubEnv("VITE_FORCE_LIVE", "false");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      headers: new Map(),
      text: async () => "",
    } as any);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends Idempotency-Key header when provided", async () => {
    const { callEdgeFunction } = await import("@/lib/api/common");

    await callEdgeFunction(
      "enqueue-job",
      { jobType: "ai_course_generate", payload: {} },
      { idempotencyKey: "k1" }
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [_url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe("k1");
    expect(String(init.headers.Authorization)).toContain("Bearer test-access-token");
    expect(typeof init.headers.apikey).toBe("string");
    expect(String(init.headers.apikey).length).toBeGreaterThan(10);
  });
});


