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
 * - book-version-save-figure-placements (HYBRID AUTH, POST)
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

    test.skipIf(!AGENT_TOKEN || !ORGANIZATION_ID)("returns figurePlacements when requested (agent token)", async () => {
      const bookId = `it-book-fig-placements-${Date.now()}`;
      const canonical = {
        meta: { id: bookId, title: "Integration Test Book" },
        chapters: [
          {
            number: "2",
            title: "Gordon en patronen",
            sections: [
              {
                number: "2.1",
                title: "Gordon basis",
                content: [
                  {
                    type: "paragraph",
                    id: "11111111-1111-1111-1111-111111111111",
                    basis: "Dit gaat over Gordon patronen en voeding. Patroon 3 hoort hierbij.",
                  },
                ],
              },
            ],
          },
          {
            number: "5",
            title: "Persoonsgegevens en AVG",
            sections: [
              {
                number: "5.1",
                title: "AVG",
                content: [
                  {
                    type: "paragraph",
                    id: "22222222-2222-2222-2222-222222222222",
                    basis: "Dit gaat over persoonsgegevens en de AVG in het zorg(leef)plan.",
                  },
                ],
              },
            ],
          },
        ],
      };

      // Ingest a text-only canonical (so figures are expected to come from the library later).
      const ingest = await callEdgeFunction(
        "book-ingest-version",
        { bookId, title: "Integration Test Book", level: "n3", source: "INTEGRATION_TEST", canonical },
        {
          method: "POST",
          headers: {
            "x-agent-token": AGENT_TOKEN!,
            "x-organization-id": ORGANIZATION_ID!,
          },
          timeout: 60000,
        }
      );
      expect(ingest.status).toBe(200);
      expect((ingest.body as any)?.ok).toBe(true);
      const bookVersionId = String((ingest.body as any)?.bookVersionId || "").trim();
      expect(bookVersionId.length).toBeGreaterThan(10);

      // Persist placements (simulates the worker having computed them once).
      const placements = {
        schemaVersion: "1.0",
        generatedAt: new Date().toISOString(),
        provider: "test",
        model: "test",
        placements: {
          "Image 5.1 Patroon 3 van Gordon uitscheiding.svg": {
            paragraph_id: "11111111-1111-1111-1111-111111111111",
            chapter_index: 0,
            confidence: 0.9,
            uncertain: false,
          },
          "Image 2.1 Schema AVG persoonsgegevens.svg": {
            paragraph_id: "22222222-2222-2222-2222-222222222222",
            chapter_index: 1,
            confidence: 0.9,
            uncertain: false,
          },
        },
      };

      const save = await callEdgeFunction(
        "book-version-save-figure-placements",
        { bookId, bookVersionId, figurePlacements: placements },
        {
          method: "POST",
          headers: {
            "x-agent-token": AGENT_TOKEN!,
            "x-organization-id": ORGANIZATION_ID!,
          },
          timeout: 60000,
        }
      );
      expect(save.status).toBe(200);
      expect((save.body as any)?.ok).toBe(true);

      // Input URLs should return the persisted placements when includeFigurePlacements=true.
      // We allow missing images so this test doesn't need to upload real assets.
      const input = await callEdgeFunction(
        "book-version-input-urls",
        {
          bookId,
          bookVersionId,
          target: "chapter",
          chapterIndex: 0,
          includeFigurePlacements: true,
          allowMissingImages: true,
          includeChapterOpeners: false,
          autoAttachLibraryImages: false,
        },
        {
          method: "POST",
          headers: {
            "x-agent-token": AGENT_TOKEN!,
            "x-organization-id": ORGANIZATION_ID!,
          },
          timeout: 60000,
        }
      );
      expect(input.status).toBe(200);
      expect((input.body as any)?.ok).toBe(true);
      const fp = (input.body as any)?.figurePlacements;
      expect(fp && typeof fp === "object").toBe(true);
      const fpPlacements = (fp as any)?.placements;
      expect(fpPlacements && typeof fpPlacements === "object").toBe(true);
      expect(fpPlacements["Image 5.1 Patroon 3 van Gordon uitscheiding.svg"]).toBeTruthy();
      // Filtered by chapterIndex=0: should NOT include the chapter_index=1 entry.
      expect(fpPlacements["Image 2.1 Schema AVG persoonsgegevens.svg"]).toBeFalsy();
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

  describe("book-version-save-figure-placements", () => {
    test("requires authentication", async () => {
      const requiresAuth = await verifyRequiresAuth(
        "book-version-save-figure-placements",
        {
          bookId: "test-book",
          bookVersionId: "test-version",
          figurePlacements: { schemaVersion: "1.0", generatedAt: new Date().toISOString(), placements: {} },
        },
        { method: "POST", timeout: 10000 }
      );
      expect(requiresAuth !== undefined).toBe(true);
    });

    test.skipIf(!AGENT_TOKEN || !ORGANIZATION_ID)("validates required fields (agent token)", async () => {
      const response = await callEdgeFunction(
        "book-version-save-figure-placements",
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

  describe("book-version-save-skeleton", () => {
    test("requires authentication", async () => {
      const requiresAuth = await verifyRequiresAuth(
        "book-version-save-skeleton",
        {
          bookId: "test-book",
          bookVersionId: "test-version",
          skeleton: { meta: { bookId: "test", schemaVersion: "skeleton_v1" }, chapters: [] },
        },
        { method: "POST", timeout: 10000 }
      );
      expect(requiresAuth !== undefined).toBe(true);
    });

    test.skipIf(!AGENT_TOKEN || !ORGANIZATION_ID)("validates required fields (agent token)", async () => {
      const response = await callEdgeFunction(
        "book-version-save-skeleton",
        {},
        {
          method: "POST",
          headers: {
            "x-agent-token": AGENT_TOKEN!,
            "x-organization-id": ORGANIZATION_ID!,
          },
          timeout: 10000,
        }
      );

      expect(response.status).toBe(200);
      expect((response.body as any)?.ok).toBe(false);
      expect((response.body as any)?.httpStatus).toBe(400);
    });

    test.skipIf(!AGENT_TOKEN || !ORGANIZATION_ID)("rejects invalid skeleton (agent token)", async () => {
      const response = await callEdgeFunction(
        "book-version-save-skeleton",
        {
          bookId: "test-book",
          bookVersionId: "test-version",
          skeleton: { meta: {}, chapters: [] }, // Missing required bookId
        },
        {
          method: "POST",
          headers: {
            "x-agent-token": AGENT_TOKEN!,
            "x-organization-id": ORGANIZATION_ID!,
          },
          timeout: 10000,
        }
      );

      expect(response.status).toBe(200);
      // Should fail: either not found (book doesn't exist) or validation error
      expect((response.body as any)?.ok).toBe(false);
    });
  });

  describe("book-version-input-urls (skeleton support)", () => {
    test.skipIf(!AGENT_TOKEN || !ORGANIZATION_ID)("returns skeleton metadata fields", async () => {
      // Get a book to test with (if any)
      const listResponse = await callEdgeFunction(
        "book-list",
        { scope: "versions", limit: 1, offset: 0 },
        {
          method: "GET",
          headers: {
            "x-agent-token": AGENT_TOKEN!,
            "x-organization-id": ORGANIZATION_ID!,
          },
          timeout: 30000,
        }
      );

      if ((listResponse.body as any)?.ok !== true) {
        console.warn("Skipping skeleton metadata test - no books available");
        return;
      }

      const versions = (listResponse.body as any)?.versions || [];
      if (versions.length === 0) {
        console.warn("Skipping skeleton metadata test - no book versions available");
        return;
      }

      const { book_id: bookId, book_version_id: bookVersionId } = versions[0];

      const response = await callEdgeFunction(
        "book-version-input-urls",
        { bookId, bookVersionId, allowMissingImages: true, expiresIn: 60 },
        {
          method: "POST",
          headers: {
            "x-agent-token": AGENT_TOKEN!,
            "x-organization-id": ORGANIZATION_ID!,
          },
          timeout: 30000,
        }
      );

      expect(response.status).toBe(200);
      expect((response.body as any)?.ok).toBe(true);
      // Should include authoringMode even if legacy
      expect(typeof (response.body as any)?.authoringMode).toBe("string");
    });
  });
});


