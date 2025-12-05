// supabase/functions/_shared/course-validator.test.ts

import { validateCourse, estimateReadabilityGrade } from './course-validator.ts';
import type { FilledCourse } from './filler.ts';

describe('validateCourse', () => {
  const createBaseCourse = (): FilledCourse => ({
    id: 'test-course',
    title: 'Test Course',
    description: 'A test course',
    subject: 'test',
    gradeBand: 'All Grades',
    contentVersion: 'test-v1',
    groups: [{ id: 0, name: 'Group 1' }],
    levels: [{ id: 1, title: 'Level 1', start: 0, end: 2 }],
    studyTexts: [
      {
        id: 'study-1',
        title: 'Introduction',
        order: 1,
        content: '[SECTION:Basics] This is educational content about the subject.',
      },
    ],
    items: [
      {
        id: 0,
        text: 'What is 2 + 2? [blank]',
        groupId: 0,
        clusterId: 'cluster-1',
        variant: '1',
        mode: 'options' as const,
        options: ['3', '4', '5'],
        correctIndex: 1,
      },
      {
        id: 1,
        text: 'Calculate: 5 + 3 = [blank]',
        groupId: 0,
        clusterId: 'cluster-1',
        variant: '2',
        mode: 'numeric' as const,
        answer: 8,
      },
    ],
  });

  describe('Schema validation', () => {
    it('should pass validation for valid course', () => {
      const course = createBaseCourse();
      const result = validateCourse(course);
      
      expect(result.valid).toBe(true);
      expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const course = createBaseCourse();
      // @ts-ignore - testing runtime validation
      delete course.title;
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.code === 'schema_error')).toBe(true);
    });
  });

  describe('Placeholder validation', () => {
    it('should detect missing [blank] placeholder', () => {
      const course = createBaseCourse();
      course.items[0].text = 'Question without blank';
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'invalid_blank_count');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('Expected exactly 1 [blank], found 0');
    });

    it('should detect multiple [blank] placeholders', () => {
      const course = createBaseCourse();
      course.items[0].text = 'Fill [blank] and [blank]';
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'invalid_blank_count');
      expect(issue?.message).toContain('Expected exactly 1 [blank], found 2');
    });
  });

  describe('Options mode validation', () => {
    it('should detect too few options', () => {
      const course = createBaseCourse();
      course.items[0].options = ['1', '2'];
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'invalid_options_count');
      expect(issue).toBeDefined();
    });

    it('should detect too many options', () => {
      const course = createBaseCourse();
      course.items[0].options = ['1', '2', '3', '4', '5'];
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'invalid_options_count');
      expect(issue).toBeDefined();
    });

    it('should detect invalid correctIndex', () => {
      const course = createBaseCourse();
      course.items[0].correctIndex = 5;
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'invalid_correct_index');
      expect(issue).toBeDefined();
    });

    it('should detect negative correctIndex', () => {
      const course = createBaseCourse();
      course.items[0].correctIndex = -1;
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'invalid_correct_index');
      expect(issue).toBeDefined();
    });

    it('should detect undefined correctIndex', () => {
      const course = createBaseCourse();
      course.items[0].correctIndex = undefined;
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'invalid_correct_index');
      expect(issue).toBeDefined();
    });

    it('should detect duplicate options as warning', () => {
      const course = createBaseCourse();
      course.items[0].options = ['1', '2', '2'];
      
      const result = validateCourse(course);
      
      const warning = result.issues.find(i => i.code === 'duplicate_options');
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe('warning');
    });
  });

  describe('Numeric mode validation', () => {
    it('should detect missing answer', () => {
      const course = createBaseCourse();
      course.items[1].answer = undefined;
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'missing_answer');
      expect(issue).toBeDefined();
    });

    it('should detect non-numeric answer', () => {
      const course = createBaseCourse();
      // @ts-ignore - testing runtime validation
      course.items[1].answer = 'eight';
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'missing_answer');
      expect(issue).toBeDefined();
    });

    it('should detect unexpected options in numeric mode', () => {
      const course = createBaseCourse();
      course.items[1].options = ['7', '8', '9'];
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'unexpected_options');
      expect(issue).toBeDefined();
    });
  });

  describe('Math correctness validation', () => {
    it('should validate correct math answer for numeric mode', () => {
      const course = createBaseCourse();
      course.items[1]._meta = { op: 'add', a: 5, b: 3, expected: 8 };
      course.items[1].answer = 8;
      
      const result = validateCourse(course);
      
      const mathIssues = result.issues.filter(i => i.code === 'math_incorrect');
      expect(mathIssues).toHaveLength(0);
    });

    it('should detect incorrect math answer for numeric mode', () => {
      const course = createBaseCourse();
      course.items[1]._meta = { op: 'add', a: 5, b: 3, expected: 8 };
      course.items[1].answer = 7;
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'math_incorrect');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('expected 8, got 7');
    });

    it('should validate correct math answer for options mode', () => {
      const course = createBaseCourse();
      course.items[0]._meta = { op: 'add', a: 2, b: 2, expected: 4 };
      course.items[0].options = ['3', '4', '5'];
      course.items[0].correctIndex = 1;
      
      const result = validateCourse(course);
      
      const mathIssues = result.issues.filter(i => i.code === 'math_incorrect');
      expect(mathIssues).toHaveLength(0);
    });

    it('should detect incorrect math answer for options mode', () => {
      const course = createBaseCourse();
      course.items[0]._meta = { op: 'add', a: 2, b: 2, expected: 4 };
      course.items[0].options = ['3', '4', '5'];
      course.items[0].correctIndex = 0; // Points to '3' instead of '4'
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'math_incorrect');
      expect(issue).toBeDefined();
    });

    it('should handle math validation with small floating point differences', () => {
      const course = createBaseCourse();
      course.items[1]._meta = { op: 'div', a: 10, b: 3, expected: 3.333333 };
      course.items[1].answer = 3.333334; // Very close, within tolerance
      
      const result = validateCourse(course);
      
      const mathIssues = result.issues.filter(i => i.code === 'math_incorrect');
      expect(mathIssues).toHaveLength(0);
    });
  });

  describe('Study text validation', () => {
    it('should detect unfilled study text content', () => {
      const course = createBaseCourse();
      course.studyTexts[0].content = '__FILL__';
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'unfilled_content');
      expect(issue).toBeDefined();
    });

    it('should warn about missing section markers', () => {
      const course = createBaseCourse();
      course.studyTexts[0].content = 'This is content without section markers.';
      
      const result = validateCourse(course);
      
      const warning = result.issues.find(i => i.code === 'missing_section_markers');
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe('warning');
    });

    it('should pass with proper section markers', () => {
      const course = createBaseCourse();
      // Already has [SECTION:] markers in base course
      
      const result = validateCourse(course);
      
      const warning = result.issues.find(i => i.code === 'missing_section_markers');
      expect(warning).toBeUndefined();
    });
  });

  describe('Item text validation', () => {
    it('should detect unfilled item text', () => {
      const course = createBaseCourse();
      course.items[0].text = '__FILL__';
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      const issue = result.issues.find(i => i.code === 'unfilled_text');
      expect(issue).toBeDefined();
    });
  });

  describe('Complex validation scenarios', () => {
    it('should accumulate multiple errors', () => {
      const course = createBaseCourse();
      course.items[0].text = 'No blank here';
      course.items[0].options = ['1'];
      course.items[1].answer = undefined;
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(false);
      expect(result.issues.filter(i => i.severity === 'error').length).toBeGreaterThanOrEqual(3);
    });

    it('should allow warnings while still being valid', () => {
      const course = createBaseCourse();
      course.studyTexts[0].content = 'Content without section markers';
      course.items[0].options = ['1', '2', '2'];
      
      const result = validateCourse(course);
      
      expect(result.valid).toBe(true); // Warnings don't invalidate
      expect(result.issues.filter(i => i.severity === 'warning').length).toBeGreaterThan(0);
    });
  });
});

describe('estimateReadabilityGrade', () => {
  it('should estimate grade level for simple text', () => {
    const text = 'The cat sat on the mat. It was a red mat.';
    const grade = estimateReadabilityGrade(text);
    
    expect(grade).toBeGreaterThanOrEqual(1);
    expect(grade).toBeLessThanOrEqual(6);
  });

  it('should estimate higher grade for complex text', () => {
    const simpleText = 'The cat ran. The dog ran.';
    const complexText = 'The sophisticated feline demonstrated extraordinary capabilities while traversing the perpendicular surfaces of the architectural structure.';
    
    const simpleGrade = estimateReadabilityGrade(simpleText);
    const complexGrade = estimateReadabilityGrade(complexText);
    
    expect(complexGrade).toBeGreaterThan(simpleGrade);
  });

  it('should handle empty text', () => {
    const grade = estimateReadabilityGrade('');
    expect(grade).toBe(1); // Minimum grade
  });

  it('should handle single word', () => {
    const grade = estimateReadabilityGrade('Hello');
    expect(grade).toBeGreaterThanOrEqual(1);
  });

  it('should handle text without punctuation', () => {
    const text = 'This is a sentence without ending punctuation';
    const grade = estimateReadabilityGrade(text);
    
    expect(grade).toBeGreaterThanOrEqual(1);
  });

  it('should estimate reasonable grade for educational content', () => {
    const text = '[SECTION:Understanding Addition] Addition means putting numbers together to find the total. For example, if you have three apples and get two more apples, you now have five apples. [SECTION:Strategies] You can use your fingers, a number line, or mental math to add numbers.';
    const grade = estimateReadabilityGrade(text);
    
    expect(grade).toBeGreaterThanOrEqual(1);
    expect(grade).toBeLessThanOrEqual(12);
  });

  it('should handle text with multiple sentences', () => {
    const text = 'First sentence. Second sentence! Third sentence? Fourth sentence.';
    const grade = estimateReadabilityGrade(text);
    
    expect(grade).toBeGreaterThanOrEqual(1);
  });
});
