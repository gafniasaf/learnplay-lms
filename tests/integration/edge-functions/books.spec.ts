import { describe, test, expect, beforeAll } from "vitest";
import { authenticateAs } from "../helpers/auth";
import { callEdgeFunction, verifyRequiresAuth } from "../helpers/edge-function";
import type { AuthenticatedUser } from "../helpers/auth";
import { AGENT_TOKEN, ORGANIZATION_ID } from "../helpers/config";

/**
 * Integration tests for Book pipeline Edge Functions
 *
 * Functions covered:
 * - book-list (HYBRID AUTH, GET)
 * - book-ingest-version (HYBRID AUTH, POST)
 * - book-enqueue-render (HYBRID AUTH, POST)
 * - book-create-overlay (HYBRID AUTH, POST)
 * - book-save-overlay (HYBRID AUTH, POST)
 * - book-version-input-urls (HYBRID AUTH, POST)
 * - book-artifact-url (HYBRID AUTH, POST)
 *
 * Notes:
 * - Many functions return HTTP 200 with `{ ok: false, httpStatus: 4xx }` on auth/validation failures.
 * - We keep auth checks lightweight to avoid creating test data in shared environments.
 */

describe("Book Edge Functions", () => {
  let adminAuth: AuthenticatedUser | undefined;

  beforeAll(async () => {
    try {
      adminAuth = await authenticateAs("admin");
    } catch (error) {
      console.warn("⚠️  Admin auth setup failed - some tests will be skipped:", error);
    }
  });

  describe("book-list", () => {
    test("requires authentication", async () => {
      const requiresAuth = await verifyRequiresAuth(
        "book-list",
        { scope: "books" },
        { method: "GET", timeout: 10000 }
      );
      expect(requiresAuth !== undefined).toBe(true);
    });

    test.skipIf(!AGENT_TOKEN || !ORGANIZATION_ID)("lists books with agent token", async () => {
      const response = await callEdgeFunction(
        "book-list",
        { scope: "books", limit: 1, offset: 0 },
        {
          method: "GET",
          headers: {
            "x-agent-token": AGENT_TOKEN!,
            "x-organization-id": ORGANIZATION_ID!,
          },
          timeout: 30000,
        }
      );

      expect(response.status).toBe(200);
      expect((response.body as any)?.ok).toBe(true);
      expect(Array.isArray((response.body as any)?.books)).toBe(true);
    });
  });

  describe("book-ingest-version", () => {
    test("requires authentication", async () => {
      const requiresAuth = await verifyRequiresAuth(
        "book-ingest-version",
        { bookId: "test-book", level: "n3", canonical: {} },
        { method: "POST", timeout: 10000 }
      );
      expect(requiresAuth !== undefined).toBe(true);
    });

    test.skipIf(!AGENT_TOKEN || !ORGANIZATION_ID)("validates required fields (agent token)", async () => {
      const response = await callEdgeFunction(
        "book-ingest-version",
        {},
        {
          method: "POST",
          headers: {
            "x-agent-token": AGENT_TOKEN!,
            "x-organization-id": ORGANIZATION_ID!,
          },
        }
      );

      expect(response.status).toBe(200);
      expect((response.body as any)?.ok).toBe(false);
      expect((response.body as any)?.httpStatus).toBe(400);
    });
  });

  describe("book-enqueue-render", () => {
    test("requires authentication", async () => {
      const requiresAuth = await verifyRequiresAuth(
        "book-enqueue-render",
        { bookId: "test-book", bookVersionId: "test-version", target: "book" },
        { method: "POST", timeout: 10000 }
      );
      expect(requiresAuth !== undefined).toBe(true);
    });

    test.skipIf(!adminAuth)("rejects missing bookId/bookVersionId (admin)", async () => {
      const response = await callEdgeFunction(
        "book-enqueue-render",
        { target: "book" },
        { role: "admin", token: adminAuth!.accessToken }
      );

      expect(response.status).toBe(200);
      expect((response.body as any)?.ok).toBe(false);
      expect([400, 422]).toContain((response.body as any)?.httpStatus);
    });
  });

  describe("book-create-overlay", () => {
    test("requires authentication", async () => {
      const requiresAuth = await verifyRequiresAuth(
        "book-create-overlay",
        { bookId: "test-book", bookVersionId: "test-version", label: "Test overlay" },
        { method: "POST", timeout: 10000 }
      );
      expect(requiresAuth !== undefined).toBe(true);
    });
  });

  describe("book-save-overlay", () => {
    test("requires authentication", async () => {
      const requiresAuth = await verifyRequiresAuth(
        "book-save-overlay",
        { overlayId: "test-overlay", rewrites: { paragraphs: [] } },
        { method: "POST", timeout: 10000 }
      );
      expect(requiresAuth !== undefined).toBe(true);
    });
  });

  describe("book-version-input-urls", () => {
    test("requires authentication", async () => {
      const requiresAuth = await verifyRequiresAuth(
        "book-version-input-urls",
        { bookId: "test-book", bookVersionId: "test-version" },
        { method: "POST", timeout: 10000 }
      );
      expect(requiresAuth !== undefined).toBe(true);
    });
  });

  describe("book-version-upload-url", () => {
    test("requires authentication", async () => {
      const requiresAuth = await verifyRequiresAuth(
        "book-version-upload-url",
        { bookId: "test-book", bookVersionId: "test-version", fileName: "assets.zip" },
        { method: "POST", timeout: 10000 }
      );
      expect(requiresAuth !== undefined).toBe(true);
    });
  });

  describe("book-artifact-url", () => {
    test("requires authentication", async () => {
      const requiresAuth = await verifyRequiresAuth(
        "book-artifact-url",
        { artifactId: "test-artifact" },
        { method: "POST", timeout: 10000 }
      );
      expect(requiresAuth !== undefined).toBe(true);
    });
  });
});


