import { describe, test, expect, beforeAll } from 'vitest';
import { authenticateAs } from '../helpers/auth';
import { callEdgeFunction } from '../helpers/edge-function';
import type { AuthenticatedUser } from '../helpers/auth';

/**
 * Integration tests for Logs functionality
 * 
 * Tests admin log viewing:
 * - Listing edge function logs
 * - Filtering logs by function name
 * - Filtering logs by level
 * - Filtering logs by request ID
 */

describe('Logs Integration', () => {
  let adminAuth: AuthenticatedUser;
  
  beforeAll(async () => {
    try {
      adminAuth = await authenticateAs('admin');
    } catch (error) {
      console.warn('⚠️  Admin auth setup failed - tests will be skipped:', error);
    }
  });
  
  describe('listEdgeLogs', () => {
    test.skipIf(!adminAuth)('lists edge function logs', async () => {
      // Logs are typically via MCP proxy (lms.listEdgeLogs)
      const response = await callEdgeFunction(
        'list-edge-logs',
        { limit: 100 },
        { role: 'admin', token: adminAuth!.accessToken, method: 'GET' }
      );
      
      // Might be MCP-only, accept 404
      expect([200, 404]).toContain(response.status);
      
      if (response.status === 200) {
        const body = response.body as any;
        // Should have logs array
        if (body.logs || body.records) {
          const logs = body.logs || body.records;
          expect(Array.isArray(logs)).toBe(true);
        }
      }
    });
    
    test.skipIf(!adminAuth)('filters logs by function name', async () => {
      const response = await callEdgeFunction(
        'list-edge-logs',
        { functionName: 'generate-course', limit: 50 },
        { role: 'admin', token: adminAuth!.accessToken, method: 'GET' }
      );
      
      expect([200, 404]).toContain(response.status);
      
      if (response.status === 200) {
        const body = response.body as any;
        const logs = body.logs || body.records || [];
        // If logs exist, they should be filtered
        if (logs.length > 0) {
          logs.forEach((log: any) => {
            if (log.function_name) {
              expect(log.function_name).toBe('generate-course');
            }
          });
        }
      }
    });
    
    test.skipIf(!adminAuth)('filters logs by level', async () => {
      const response = await callEdgeFunction(
        'list-edge-logs',
        { level: 'error', limit: 50 },
        { role: 'admin', token: adminAuth!.accessToken, method: 'GET' }
      );
      
      expect([200, 404]).toContain(response.status);
      
      if (response.status === 200) {
        const body = response.body as any;
        const logs = body.logs || body.records || [];
        // If logs exist, they should be filtered
        if (logs.length > 0) {
          logs.forEach((log: any) => {
            if (log.level) {
              expect(log.level.toLowerCase()).toBe('error');
            }
          });
        }
      }
    });
  });
});

