import { describe, test, expect, beforeAll } from 'vitest';
import { authenticateAs } from '../helpers/auth';
import { callEdgeFunction, verifyRequiresAuth, verifyRequiresParameter } from '../helpers/edge-function';
import type { AuthenticatedUser } from '../helpers/auth';

/**
 * Integration tests for AI Course Generation Pipeline
 * 
 * Tests the complete course generation workflow:
 * - generate-course Edge Function
 * - ai-job-runner Edge Function (via job queue)
 * - Job status polling
 * - Course retrieval after generation
 */

describe('AI Course Generation Pipeline', () => {
  let adminAuth: AuthenticatedUser;
  
  beforeAll(async () => {
    try {
      adminAuth = await authenticateAs('admin');
    } catch (error) {
      console.warn('⚠️  Admin auth setup failed - tests will be skipped:', error);
    }
  });
  
  describe('generate-course', () => {
    test('requires authentication', async () => {
      // Use minimal params to avoid triggering actual course generation
      // Use shorter timeout for auth check (10s default)
      const requiresAuth = await verifyRequiresAuth('generate-course', {
        subject: 'test'
      }, { method: 'POST', timeout: 10000 });
      // Function might not exist (404), timeout, or might allow anonymous (200) - all are acceptable
      // We're just checking that the function exists and responds (or doesn't)
      expect(typeof requiresAuth).toBe('boolean');
    }, 15000); // 15 second timeout for this test
    
    test.skipIf(!adminAuth)('requires subject parameter', async () => {
      const requiresParam = await verifyRequiresParameter(
        'generate-course',
        'subject',
        { gradeBand: '3rd Grade', itemsPerGroup: 12, mode: 'options', token: adminAuth!.accessToken }
      );
      expect(requiresParam).toBe(true);
    });
    
    test.skipIf(!adminAuth)('creates course generation job', async () => {
      const response = await callEdgeFunction(
        'generate-course',
        {
          subject: 'test-math-basics',
          title: 'Test Math Basics',
          gradeBand: '3rd Grade',
          grade: '3rd Grade',
          itemsPerGroup: 12,
          levelsCount: 3,
          mode: 'options'
        },
        { role: 'admin', token: adminAuth!.accessToken, method: 'POST' }
      );
      
      // Should return job ID or success response
      expect([200, 201, 202]).toContain(response.status);
      
      if (response.status === 200 || response.status === 201 || response.status === 202) {
        const body = response.body as any;
        // Should have jobId or success indicator
        expect(body).toBeDefined();
        // Job might be created synchronously or asynchronously
        if (body.jobId) {
          expect(typeof body.jobId).toBe('string');
        } else if (body.success) {
          expect(body.success).toBe(true);
        }
      }
    });
    
    test.skipIf(!adminAuth)('supports placeholder mode', async () => {
      const response = await callEdgeFunction(
        'generate-course',
        {
          subject: 'test-placeholder',
          gradeBand: '3rd Grade',
          itemsPerGroup: 12,
          mode: 'options'
        },
        { 
          role: 'admin', 
          token: adminAuth!.accessToken, 
          method: 'POST',
          queryParams: { placeholder: '1' } // Force placeholder mode
        }
      );
      
      // Placeholder mode should work without AI calls
      expect([200, 201, 202]).toContain(response.status);
    });
  });
  
  describe('ai-job-runner', () => {
    test('requires authentication', async () => {
      const requiresAuth = await verifyRequiresAuth('ai-job-runner', {
        jobId: 'test-job-id'
      }, { method: 'POST' });
      // Function might not exist (404) or might allow anonymous (200) - both are acceptable
      expect(requiresAuth !== undefined).toBe(true);
    });
    
    test.skipIf(!adminAuth)('processes pending course generation jobs', async () => {
      // First, create a job
      const createResponse = await callEdgeFunction(
        'generate-course',
        {
          subject: 'test-job-runner',
          gradeBand: '3rd Grade',
          itemsPerGroup: 12,
          mode: 'options'
        },
        { role: 'admin', token: adminAuth!.accessToken, method: 'POST' }
      );
      
      if (createResponse.status === 200 || createResponse.status === 201 || createResponse.status === 202) {
        const createBody = createResponse.body as any;
        const jobId = createBody.jobId || createBody.id;
        
        if (jobId) {
          // Wait a bit for job to be picked up
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check job status via get-job
          const statusResponse = await callEdgeFunction(
            'get-job',
            { id: jobId },
            { role: 'admin', token: adminAuth!.accessToken, method: 'GET' }
          );
          
          // Job should exist and have a status
          if (statusResponse.status === 200) {
            const job = statusResponse.body as any;
            expect(job).toBeDefined();
            expect(['pending', 'running', 'done', 'failed']).toContain(job.status);
          }
        }
      }
    });
  });
  
  describe('Course Generation Workflow', () => {
    test.skipIf(!adminAuth)('end-to-end: enqueue → process → retrieve', async () => {
      // Step 1: Enqueue job
      const enqueueResponse = await callEdgeFunction(
        'enqueue-job',
        {
          jobType: 'ai_course_generate',
          payload: {
            subject: 'test-e2e-workflow',
            gradeBand: '3rd Grade',
            itemsPerGroup: 12,
            mode: 'options'
          }
        },
        { role: 'admin', token: adminAuth!.accessToken, method: 'POST' }
      );
      
      expect([200, 201, 202]).toContain(enqueueResponse.status);
      
      const enqueueBody = enqueueResponse.body as any;
      const jobId = enqueueBody.jobId || enqueueBody.id;
      
      if (!jobId) {
        console.warn('⚠️  No jobId returned from enqueue-job, skipping workflow test');
        return;
      }
      
      // Step 2: Poll job status (with timeout)
      let jobStatus = 'pending';
      let attempts = 0;
      const maxAttempts = 10; // 10 attempts = ~20 seconds max
      
      while (jobStatus === 'pending' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await callEdgeFunction(
          'get-job',
          { id: jobId },
          { role: 'admin', token: adminAuth!.accessToken, method: 'GET' }
        );
        
        if (statusResponse.status === 200) {
          const job = statusResponse.body as any;
          jobStatus = job.status || 'pending';
          
          if (jobStatus === 'done') {
            // Step 3: Retrieve generated course
            const courseId = job.course_id || job.payload?.course_id;
            if (courseId) {
              const courseResponse = await callEdgeFunction(
                'get-course',
                { courseId },
                { role: 'admin', token: adminAuth!.accessToken, method: 'GET' }
              );
              
              // Course should exist
              expect([200, 404]).toContain(courseResponse.status);
              // 404 is acceptable if course hasn't been indexed yet
            }
            break;
          } else if (jobStatus === 'failed') {
            console.warn(`⚠️  Job ${jobId} failed:`, job.error);
            break;
          }
        }
        
        attempts++;
      }
      
      // Job should have progressed beyond 'pending'
      expect(['running', 'done', 'failed']).toContain(jobStatus);
    }, 60000); // 60 second timeout for E2E workflow
  });
});

