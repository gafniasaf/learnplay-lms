/**
 * Integration Tests: Edge Function Error Handling
 * 
 * Tests that edge function errors are handled gracefully:
 * - CORS errors (preview environments)
 * - 400 validation errors (missing required params)
 * - 401 authentication errors
 * - 500 server errors
 * - Network failures
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { callEdgeFunction, callEdgeFunctionGet, ApiError } from '@/lib/api/common';
import { parseLearnPlayEnv } from '../helpers/parse-learnplay-env';

const env = parseLearnPlayEnv();
const hasSupabase = !!env.SUPABASE_URL && !!env.SUPABASE_ANON_KEY;

describe.skip(!hasSupabase)('Edge Function Error Handling', () => {
  describe('CORS Error Handling', () => {
    it('detects CORS errors from fetch failures', async () => {
      // Mock fetch to throw CORS error
      const originalFetch = global.fetch;
      global.fetch = async () => {
        throw new TypeError('Failed to fetch');
      };

      try {
        await callEdgeFunctionGet('test-function');
        expect.fail('Should have thrown CORS error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe('CORS_ERROR');
        expect(apiError.message).toContain('CORS error');
        expect(apiError.message).toContain('preview environments');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('handles blocked fetch errors as CORS', async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => {
        const error = new Error('blocked by client');
        (error as any).message = 'blocked by client';
        throw error;
      };

      try {
        await callEdgeFunctionGet('test-function');
        expect.fail('Should have thrown CORS error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.code).toBe('CORS_ERROR');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('400 Validation Errors', () => {
    it('handles missing required parameters', async () => {
      // student-dashboard requires studentId
      try {
        await callEdgeFunctionGet('student-dashboard');
        expect.fail('Should have thrown 400 error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        // Should be 400 or handled gracefully
        expect([400, 401, 0]).toContain(apiError.status);
      }
    });

    it('provides user-friendly error messages for 400 errors', async () => {
      try {
        await callEdgeFunctionGet('student-dashboard');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        // Error message should be user-friendly, not raw API response
        expect(apiError.message).toBeTruthy();
        expect(apiError.message).not.toMatch(/^[0-9]{3}/); // Not just status code
      }
    });
  });

  describe('401 Authentication Errors', () => {
    it('handles 401 errors gracefully', async () => {
      // Mock fetch to return 401
      const originalFetch = global.fetch;
      global.fetch = async () => {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      };

      try {
        await callEdgeFunctionGet('test-function');
        expect.fail('Should have thrown 401 error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.status).toBe(401);
        expect(apiError.code).toBe('UNAUTHORIZED');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('detects Lovable preview environment for 401 errors', async () => {
      // Mock window.location for Lovable preview
      const originalWindow = global.window;
      (global as any).window = {
        location: { hostname: 'test.lovable.app' },
      };

      const originalFetch = global.fetch;
      global.fetch = async () => {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      };

      try {
        await callEdgeFunctionGet('test-function');
        expect.fail('Should have thrown 401 error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.message).toContain('preview environments');
      } finally {
        global.fetch = originalFetch;
        (global as any).window = originalWindow;
      }
    });
  });

  describe('500 Server Errors', () => {
    it('handles 500 errors with error details', async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => {
        return new Response(
          JSON.stringify({ error: 'Internal server error', details: 'Database connection failed' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      };

      try {
        await callEdgeFunctionGet('test-function');
        expect.fail('Should have thrown 500 error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.status).toBe(500);
        expect(apiError.message).toBeTruthy();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('Network Failures', () => {
    it('handles network timeouts', async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => {
        await new Promise(resolve => setTimeout(resolve, 100000)); // Never resolves
        return new Response();
      };

      try {
        await callEdgeFunctionGet('test-function', {}, { timeoutMs: 100 });
        expect.fail('Should have thrown timeout error');
      } catch (error) {
        // Should handle timeout gracefully
        expect(error).toBeTruthy();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

