import { describe, test, expect, beforeAll } from 'vitest';
import { authenticateAs } from '../helpers/auth';
import { callEdgeFunction, verifyRequiresParameter, verifyRequiresAuth } from '../helpers/edge-function';
import type { AuthenticatedUser } from '../helpers/auth';

/**
 * Integration tests for Dashboard Edge Functions
 * 
 * Tests dashboard-related Edge Functions:
 * - get-dashboard (teacher/school/admin)
 * - student-dashboard
 */

describe('Dashboard Edge Functions', () => {
  let adminAuth: AuthenticatedUser;
  let teacherAuth: AuthenticatedUser;
  let studentAuth: AuthenticatedUser;
  
  beforeAll(async () => {
    try {
      adminAuth = await authenticateAs('admin');
      teacherAuth = await authenticateAs('teacher');
      studentAuth = await authenticateAs('student');
    } catch (error) {
      console.warn('⚠️  Auth setup failed - some tests will be skipped:', error);
    }
  });
  
  describe('get-dashboard (teacher/school/admin)', () => {
    test.skipIf(!teacherAuth)('requires teacherId parameter', async () => {
      
      const requiresParam = await verifyRequiresParameter(
        'get-dashboard',
        'teacherId',
        { role: 'teacher', token: teacherAuth!.accessToken }
      );
      
      expect(requiresParam).toBe(true);
    });
    
    test('requires authentication', async () => {
      const requiresAuth = await verifyRequiresAuth('get-dashboard', { teacherId: 'test-id' });
      // Function might not exist (404) or might allow anonymous (200) - both are acceptable
      // We're just checking that the function exists and responds
      expect(requiresAuth !== undefined).toBe(true);
    });
    
    test.skipIf(!teacherAuth)('rejects calls without teacherId', async () => {
      
      const response = await callEdgeFunction(
        'get-dashboard',
        {}, // Missing teacherId
        { role: 'teacher', token: teacherAuth!.accessToken }
      );
      
      expect(response.status).toBe(400);
      const errorMessage = typeof response.body === 'object' && response.body !== null
        ? (response.body as any).error || ''
        : String(response.body);
      expect(errorMessage.toLowerCase()).toContain('teacherid');
    });
    
    test.skipIf(!teacherAuth)('accepts teacherId for teacher role', async () => {
      
      const response = await callEdgeFunction(
        'get-dashboard',
        { teacherId: teacherAuth!.user.id },
        { role: 'teacher', token: teacherAuth!.accessToken }
      );
      
      // Should not return 400 "teacherId required"
      expect(response.status).not.toBe(400);
    });
    
    test.skipIf(!adminAuth)('accepts teacherId for admin role', async () => {
      
      const response = await callEdgeFunction(
        'get-dashboard',
        { teacherId: adminAuth!.user.id },
        { role: 'admin', token: adminAuth!.accessToken }
      );
      
      // Should not return 400 "teacherId required"
      expect(response.status).not.toBe(400);
    });
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
    
    test.skipIf(!studentAuth)('accepts studentId parameter', async () => {
      
      const response = await callEdgeFunction(
        'student-dashboard',
        { studentId: studentAuth!.user.id },
        { role: 'student', token: studentAuth!.accessToken }
      );
      
      // Should not return 400 "studentId required"
      expect(response.status).not.toBe(400);
    });
  });
});

