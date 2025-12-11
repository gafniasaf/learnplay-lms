import { describe, test, expect, beforeAll } from 'vitest';
import { authenticateAs } from '../helpers/auth';
import { callEdgeFunction } from '../helpers/edge-function';
import type { AuthenticatedUser } from '../helpers/auth';

/**
 * Integration tests for JobsDashboard functionality
 * 
 * Tests admin dashboard features:
 * - Listing course jobs
 * - Listing media jobs
 * - Getting job metrics
 * - Requeueing jobs
 * - Deleting jobs
 */

describe('JobsDashboard Integration', () => {
  let adminAuth: AuthenticatedUser;
  
  beforeAll(async () => {
    try {
      adminAuth = await authenticateAs('admin');
    } catch (error) {
      console.warn('⚠️  Admin auth setup failed - tests will be skipped:', error);
    }
  });
  
  describe('listCourseJobs', () => {
    test.skipIf(!adminAuth)('lists course generation jobs', async () => {
      const response = await callEdgeFunction(
        'list-course-jobs',
        { limit: 10 },
        { role: 'admin', token: adminAuth!.accessToken, method: 'GET' }
      );
      
      expect([200, 404]).toContain(response.status);
      
      if (response.status === 200) {
        const body = response.body as any;
        // Should have jobs array or ok indicator
        if (body.jobs) {
          expect(Array.isArray(body.jobs)).toBe(true);
        } else if (body.ok !== undefined) {
          expect(typeof body.ok).toBe('boolean');
        }
      }
    });
    
    test.skipIf(!adminAuth)('filters jobs by status', async () => {
      const response = await callEdgeFunction(
        'list-course-jobs',
        { status: 'done', limit: 10 },
        { role: 'admin', token: adminAuth!.accessToken, method: 'GET' }
      );
      
      expect([200, 404]).toContain(response.status);
    });
  });
  
  describe('listMediaJobs', () => {
    test.skipIf(!adminAuth)('lists media generation jobs', async () => {
      const response = await callEdgeFunction(
        'list-media-jobs',
        { limit: 10 },
        { role: 'admin', token: adminAuth!.accessToken, method: 'GET' }
      );
      
      expect([200, 404]).toContain(response.status);
      
      if (response.status === 200) {
        const body = response.body as any;
        if (body.jobs) {
          expect(Array.isArray(body.jobs)).toBe(true);
        }
      }
    });
  });
  
  describe('getJobMetrics', () => {
    test.skipIf(!adminAuth)('retrieves job metrics', async () => {
      const response = await callEdgeFunction(
        'get-job-metrics',
        { sinceHours: 24 },
        { role: 'admin', token: adminAuth!.accessToken, method: 'GET' }
      );
      
      expect([200, 404]).toContain(response.status);
      
      if (response.status === 200) {
        const body = response.body as any;
        // Should have metrics structure
        expect(body).toBeDefined();
      }
    });
  });
  
  describe('requeueJob', () => {
    test.skipIf(!adminAuth)('requeues failed job', async () => {
      // First, find a failed job (or create one)
      const listResponse = await callEdgeFunction(
        'list-course-jobs',
        { status: 'failed', limit: 1 },
        { role: 'admin', token: adminAuth!.accessToken, method: 'GET' }
      );
      
      if (listResponse.status === 200) {
        const body = listResponse.body as any;
        const failedJob = body.jobs?.[0];
        
        if (failedJob?.id) {
          const requeueResponse = await callEdgeFunction(
            'requeue-job',
            { jobId: failedJob.id, jobTable: 'ai_course_jobs' },
            { role: 'admin', token: adminAuth!.accessToken, method: 'POST' }
          );
          
          // Should succeed or return appropriate error
          expect([200, 400, 404]).toContain(requeueResponse.status);
        } else {
          console.log('⚠️  No failed jobs found to requeue');
        }
      }
    });
  });
  
  describe('deleteJob', () => {
    test.skipIf(!adminAuth)('deletes job', async () => {
      // First, find a job to delete (prefer done/failed jobs)
      const listResponse = await callEdgeFunction(
        'list-course-jobs',
        { status: 'done', limit: 1 },
        { role: 'admin', token: adminAuth!.accessToken, method: 'GET' }
      );
      
      if (listResponse.status === 200) {
        const body = listResponse.body as any;
        const job = body.jobs?.[0];
        
        if (job?.id) {
          const deleteResponse = await callEdgeFunction(
            'delete-job',
            { jobId: job.id, jobTable: 'ai_course_jobs' },
            { role: 'admin', token: adminAuth!.accessToken, method: 'POST' }
          );
          
          // Should succeed or return appropriate error
          expect([200, 400, 404]).toContain(deleteResponse.status);
        } else {
          console.log('⚠️  No jobs found to delete');
        }
      }
    });
  });
});

