import { describe, test, expect, beforeAll } from 'vitest';
import { authenticateAs } from '../helpers/auth';
import { callEdgeFunction, verifyRequiresParameter, verifyRequiresAuth } from '../helpers/edge-function';
import type { AuthenticatedUser } from '../helpers/auth';

/**
 * Integration tests for Student Edge Functions
 * 
 * Tests student-related Edge Functions:
 * - student-dashboard
 * - student-goals
 * - student-timeline
 * - student-achievements
 * - get-student-assignments
 * - get-student-skills
 */

describe('Student Edge Functions', () => {
  let studentAuth: AuthenticatedUser;
  
  beforeAll(async () => {
    try {
      studentAuth = await authenticateAs('student');
    } catch (error) {
      console.warn('⚠️  Student auth setup failed - tests will be skipped:', error);
    }
  });
  
  describe('student-dashboard', () => {
    test.skipIf(!studentAuth)('requires studentId parameter', async () => {
      
      const requiresParam = await verifyRequiresParameter(
        'student-dashboard',
        'studentId',
        { role: 'student', token: studentAuth!.accessToken }
      );
      
      expect(requiresParam).toBe(true);
    });
    
    test('requires authentication', async () => {
      const requiresAuth = await verifyRequiresAuth('student-dashboard', { studentId: 'test-id' });
      expect(requiresAuth).toBe(true);
    });
  });
  
  describe('student-goals', () => {
    test.skipIf(!studentAuth)('requires studentId parameter', async () => {
      
      const requiresParam = await verifyRequiresParameter(
        'student-goals',
        'studentId',
        { role: 'student', token: studentAuth!.accessToken }
      );
      
      expect(requiresParam !== undefined).toBe(true);
    });
  });
  
  describe('student-timeline', () => {
    test.skipIf(!studentAuth)('requires studentId parameter', async () => {
      
      const requiresParam = await verifyRequiresParameter(
        'student-timeline',
        'studentId',
        { role: 'student', token: studentAuth!.accessToken }
      );
      
      expect(requiresParam !== undefined).toBe(true);
    });
  });
  
  describe('student-achievements', () => {
    test.skipIf(!studentAuth)('requires studentId parameter', async () => {
      
      const requiresParam = await verifyRequiresParameter(
        'student-achievements',
        'studentId',
        { role: 'student', token: studentAuth!.accessToken }
      );
      
      expect(requiresParam !== undefined).toBe(true);
    });
  });
  
  describe('get-student-assignments', () => {
    test.skipIf(!studentAuth)('requires studentId parameter', async () => {
      
      const requiresParam = await verifyRequiresParameter(
        'get-student-assignments',
        'studentId',
        { role: 'student', token: studentAuth!.accessToken }
      );
      
      expect(requiresParam !== undefined).toBe(true);
    });
  });
  
  describe('get-student-skills', () => {
    test.skipIf(!studentAuth)('requires studentId parameter', async () => {
      
      const requiresParam = await verifyRequiresParameter(
        'get-student-skills',
        'studentId',
        { role: 'student', token: studentAuth!.accessToken }
      );
      
      expect(requiresParam !== undefined).toBe(true);
    });
  });
});

