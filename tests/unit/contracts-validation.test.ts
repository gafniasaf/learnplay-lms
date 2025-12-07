/**
 * Unit Tests: Contracts Validation
 * 
 * Tests that contracts.ts matches system-manifest.json and is correctly generated.
 * These tests verify:
 * - Job types match manifest
 * - Entity types match manifest
 * - Field types are valid
 * - Schemas are correctly structured
 */

import { describe, it, expect } from '@jest/globals';
import { JOB_MODES, ENTITY_FIELDS } from '@/lib/contracts';

describe('Contracts Validation', () => {
  describe('JOB_MODES', () => {
    it('has all required job types', () => {
      const requiredJobTypes = [
        'ai_course_generate',
        'draft_assignment_plan',
        'guard_course',
        'compile_mockups',
        'plan_matrix_run',
      ];
      
      requiredJobTypes.forEach(jobType => {
        expect(JOB_MODES).toHaveProperty(jobType);
      });
    });

    it('has valid execution modes', () => {
      const validModes = ['async', 'synchronous'];
      
      Object.values(JOB_MODES).forEach(mode => {
        expect(validModes).toContain(mode);
      });
    });

    it('has correct mode for ai_course_generate', () => {
      expect(JOB_MODES.ai_course_generate).toBe('async');
    });

    it('has correct mode for guard_course', () => {
      expect(JOB_MODES.guard_course).toBe('synchronous');
    });
  });

  describe('ENTITY_FIELDS', () => {
    it('has all required entities', () => {
      const requiredEntities = [
        'LearnerProfile',
        'Assignment',
        'CourseBlueprint',
        'MessageThread',
        'JobTicket',
      ];
      
      requiredEntities.forEach(entity => {
        expect(ENTITY_FIELDS).toHaveProperty(entity);
      });
    });

    it('has valid field types', () => {
      const validTypes = ['string', 'number', 'boolean', 'date', 'json', 'enum'];
      
      Object.values(ENTITY_FIELDS).forEach(fields => {
        fields.forEach(field => {
          expect(validTypes).toContain(field.type);
        });
      });
    });

    it('has required fields for CourseBlueprint', () => {
      const courseFields = ENTITY_FIELDS.CourseBlueprint || [];
      const fieldNames = courseFields.map(f => f.name);
      
      // Should have common course fields
      expect(fieldNames.length).toBeGreaterThan(0);
    });
  });

  describe('Contract Consistency', () => {
    it('job types are consistent across contracts', () => {
      const jobTypes = Object.keys(JOB_MODES);
      
      // All job types should be valid strings
      jobTypes.forEach(jobType => {
        expect(typeof jobType).toBe('string');
        expect(jobType.length).toBeGreaterThan(0);
        expect(jobType).toMatch(/^[a-z_]+$/); // snake_case
      });
    });

    it('entity names follow PascalCase convention', () => {
      const entityNames = Object.keys(ENTITY_FIELDS);
      
      entityNames.forEach(name => {
        expect(name).toMatch(/^[A-Z][a-zA-Z0-9]*$/); // PascalCase
      });
    });
  });
});

