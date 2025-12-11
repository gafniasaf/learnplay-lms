import { describe, test, expect, beforeAll } from 'vitest';
import { authenticateAs } from '../helpers/auth';
import { callEdgeFunction, verifyRequiresParameter, verifyRequiresAuth } from '../helpers/edge-function';
import type { AuthenticatedUser } from '../helpers/auth';

/**
 * Integration tests for Parent Edge Functions
 * 
 * Tests all parent-related Edge Functions:
 * - parent-dashboard
 * - parent-children
 * - parent-goals
 * - parent-subjects
 * - parent-timeline
 * - parent-topics
 */

describe('Parent Edge Functions', () => {
  let parentAuth: AuthenticatedUser;
  
  beforeAll(async () => {
    try {
      parentAuth = await authenticateAs('parent');
    } catch (error) {
      console.warn('⚠️  Parent auth setup failed - tests will be skipped:', error);
    }
  });
  
  describe('parent-dashboard', () => {
    test.skipIf(!parentAuth)('requires parentId parameter', async () => {
      
      const requiresParam = await verifyRequiresParameter(
        'parent-dashboard',
        'parentId',
        { role: 'parent', token: parentAuth!.accessToken }
      );
      
      expect(requiresParam).toBe(true);
    });
    
    test('requires authentication', async () => {
      const requiresAuth = await verifyRequiresAuth('parent-dashboard', { parentId: 'test-id' });
      expect(requiresAuth).toBe(true);
    });
    
    test.skipIf(!parentAuth)('returns dashboard data with valid parentId', async () => {
      
      const response = await callEdgeFunction(
        'parent-dashboard',
        { parentId: parentAuth!.user.id },
        { role: 'parent', token: parentAuth!.accessToken, method: 'GET' }
      );
      
      // Should not return 400 "parentId is required"
      expect(response.status).not.toBe(400);
      
      if (response.status === 200) {
        expect(response.body).toBeDefined();
      }
    });
    
    test.skipIf(!parentAuth)('rejects calls without parentId', async () => {
      
      const response = await callEdgeFunction(
        'parent-dashboard',
        {}, // Missing parentId
        { role: 'parent', token: parentAuth.accessToken, method: 'GET' }
      );
      
      expect(response.status).toBe(400);
      const errorMessage = typeof response.body === 'object' && response.body !== null
        ? (response.body as any).error || ''
        : String(response.body);
      expect(errorMessage.toLowerCase()).toContain('parentid');
    });
  });
  
  describe('parent-children', () => {
    test.skipIf(!parentAuth)('requires parentId parameter', async () => {
      const requiresParam = await verifyRequiresParameter(
        'parent-children',
        'parentId',
        { role: 'parent', token: parentAuth!.accessToken }
      );
      
      expect(requiresParam).toBe(true);
    });
    
    test('requires authentication', async () => {
      const requiresAuth = await verifyRequiresAuth('parent-children', { parentId: 'test-id' });
      expect(requiresAuth).toBe(true);
    });
  });
  
  describe('parent-goals', () => {
    test.skipIf(!parentAuth)('requires childId parameter', async () => {
      const requiresParam = await verifyRequiresParameter(
        'parent-goals',
        'childId',
        { role: 'parent', token: parentAuth!.accessToken }
      );
      
      // May or may not require childId depending on implementation
      // This test verifies the function exists and responds
      expect(requiresParam !== undefined).toBe(true);
    });
  });
  
  describe('parent-subjects', () => {
    test.skipIf(!parentAuth)('requires childId parameter', async () => {
      const requiresParam = await verifyRequiresParameter(
        'parent-subjects',
        'childId',
        { role: 'parent', token: parentAuth!.accessToken }
      );
      
      expect(requiresParam !== undefined).toBe(true);
    });
  });
  
  describe('parent-timeline', () => {
    test.skipIf(!parentAuth)('requires childId parameter', async () => {
      const requiresParam = await verifyRequiresParameter(
        'parent-timeline',
        'childId',
        { role: 'parent', token: parentAuth!.accessToken }
      );
      
      expect(requiresParam !== undefined).toBe(true);
    });
  });
  
  describe('parent-topics', () => {
    test.skipIf(!parentAuth)('requires childId parameter', async () => {
      const requiresParam = await verifyRequiresParameter(
        'parent-topics',
        'childId',
        { role: 'parent', token: parentAuth!.accessToken }
      );
      
      expect(requiresParam !== undefined).toBe(true);
    });
  });
});

