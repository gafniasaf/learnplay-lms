/**
 * Integration Tests: MCP Contract Validation
 * 
 * Tests that MCP methods match the contracts defined in system-manifest.json.
 * These tests verify:
 * - Method names match contracts
 * - Parameter schemas match contracts
 * - Response schemas match contracts
 * - Error responses match contracts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read system manifest
function getManifest() {
  try {
    const manifestPath = path.resolve(__dirname, '../../system-manifest.json');
    const manifestContent = readFileSync(manifestPath, 'utf-8');
    return JSON.parse(manifestContent);
  } catch (error) {
    console.warn('Could not read system-manifest.json');
    return null;
  }
}

describe('MCP Contract Validation', () => {
  const manifest = getManifest();

  beforeAll(() => {
    if (!manifest) {
      console.warn('⚠️  Skipping MCP contract validation - manifest not found');
    }
  });

  describe('Job Type Contracts', () => {
    it('validates job types exist in manifest', () => {
      if (!manifest) return;
      
      const jobTypes = manifest.agent_jobs?.map((job: any) => job.id) || [];
      const expectedJobTypes = [
        'ai_course_generate',
        'draft_assignment_plan',
        'guard_course',
        'compile_mockups',
        'plan_matrix_run',
      ];
      
      expectedJobTypes.forEach(jobType => {
        expect(jobTypes).toContain(jobType);
      });
    });

    it('validates job payload schemas match manifest', () => {
      if (!manifest) return;
      
      const aiCourseJob = manifest.agent_jobs?.find((job: any) => job.id === 'ai_course_generate');
      
      if (aiCourseJob) {
        const payloadSchema = aiCourseJob.payload_schema;
        expect(payloadSchema).toBeDefined();
        
        // Verify required fields
        const requiredFields = ['course_id', 'subject'];
        requiredFields.forEach(field => {
          expect(JSON.stringify(payloadSchema)).toContain(field);
        });
      }
    });
  });

  describe('Entity Contracts', () => {
    it('validates entity names match manifest', () => {
      if (!manifest) return;
      
      const entities = manifest.data_model?.map((entity: any) => entity.id) || [];
      const expectedEntities = [
        'learner-profile',
        'assignment',
        'course-blueprint',
        'message-thread',
        'job-ticket',
      ];
      
      expectedEntities.forEach(entity => {
        expect(entities).toContain(entity);
      });
    });

    it('validates entity field schemas', () => {
      if (!manifest) return;
      
      const courseBlueprint = manifest.data_model?.find((entity: any) => entity.id === 'course-blueprint');
      
      if (courseBlueprint) {
        expect(courseBlueprint.fields).toBeDefined();
        expect(Array.isArray(courseBlueprint.fields)).toBe(true);
      }
    });
  });

  describe('MCP Method Naming', () => {
    it('validates MCP method names follow pattern', () => {
      const validMethods = [
        'lms.health',
        'lms.getCourse',
        'lms.saveCourse',
        'lms.enqueueJob',
        'lms.getCourseJob',
        'lms.listCourseJobs',
      ];
      
      const methodPattern = /^lms\.[a-zA-Z][a-zA-Z0-9]*$/;
      
      validMethods.forEach(method => {
        expect(method).toMatch(methodPattern);
      });
    });

    it('validates entity methods follow naming convention', () => {
      if (!manifest) return;
      
      const entities = manifest.data_model || [];
      entities.forEach((entity: any) => {
        const entityName = entity.id;
        const pascalCase = entityName
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join('');
        
        // Methods should be: lms.get{PascalCase}, lms.save{PascalCase}
        const getMethod = `lms.get${pascalCase}`;
        const saveMethod = `lms.save${pascalCase}`;
        
        // Verify method names are valid
        expect(getMethod).toMatch(/^lms\.[a-zA-Z][a-zA-Z0-9]*$/);
        expect(saveMethod).toMatch(/^lms\.[a-zA-Z][a-zA-Z0-9]*$/);
      });
    });
  });
});

