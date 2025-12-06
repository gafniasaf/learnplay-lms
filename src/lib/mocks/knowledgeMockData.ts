/**
 * Knowledge Map Mock Data Service
 * 
 * Provides realistic mock data for Knowledge Objectives system:
 * - 50+ Knowledge Objectives across Math/Reading/Science
 * - Mastery states for multiple students
 * - Assignments with various statuses
 * - Helper functions for simulating mastery updates and assignment completion
 */

import type {
  KnowledgeObjective,
  MasteryState,
  MasteryStateWithKO,
  Assignment,
  Topic,
  CourseKOScope,
  AutoAssignSettings,
  ClassKOSummary,
  DomainGrowthSummary,
  SkillCard,
  SkillsViewData,
  AssignmentWithDetails,
  RecommendedCourse,
  ExerciseKOMapping,
  KOExample,
  CompletionCriteria,
} from '../types/knowledgeMap';

// =====================================================
// CONFIGURATION
// =====================================================

const MOCK_STUDENT_IDS = [
  'student-1', // Alex (self-directed, high mastery)
  'student-2', // Bailey (teacher-assigned, medium mastery)
  'student-3', // Casey (parent-assigned, low mastery)
  'student-4', // Drew (autonomous AI, high mastery)
  'student-5', // Elliot (struggling, multiple assignments)
];

const MOCK_TEACHER_ID = 'teacher-1';
const MOCK_PARENT_ID = 'parent-1';
const MOCK_CLASS_ID = 'class-123';

// =====================================================
// TOPICS
// =====================================================

export const MOCK_TOPICS: Topic[] = [
  {
    id: 'math.arithmetic',
    name: 'Arithmetic',
    domain: 'math',
    displayOrder: 1,
    description: 'Basic operations with numbers',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'math.algebra',
    name: 'Algebra',
    domain: 'math',
    displayOrder: 2,
    description: 'Variables, expressions, and equations',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'math.geometry',
    name: 'Geometry',
    domain: 'math',
    displayOrder: 3,
    description: 'Shapes, angles, and spatial reasoning',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'math.fractions',
    name: 'Fractions & Decimals',
    domain: 'math',
    displayOrder: 4,
    description: 'Working with parts of wholes',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'reading.comprehension',
    name: 'Reading Comprehension',
    domain: 'reading',
    displayOrder: 1,
    description: 'Understanding and analyzing text',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'reading.vocabulary',
    name: 'Vocabulary',
    domain: 'reading',
    displayOrder: 2,
    description: 'Word meanings and usage',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'reading.grammar',
    name: 'Grammar',
    domain: 'reading',
    displayOrder: 3,
    description: 'Sentence structure and language rules',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'science.biology',
    name: 'Biology',
    domain: 'science',
    displayOrder: 1,
    description: 'Living organisms and life processes',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'science.physics',
    name: 'Physics',
    domain: 'science',
    displayOrder: 2,
    description: 'Matter, energy, and forces',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'science.chemistry',
    name: 'Chemistry',
    domain: 'science',
    displayOrder: 3,
    description: 'Substances and chemical reactions',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

// =====================================================
// KNOWLEDGE OBJECTIVES
// =====================================================

export const MOCK_KNOWLEDGE_OBJECTIVES: KnowledgeObjective[] = [
  // MATH - Arithmetic (10 KOs)
  {
    id: 'ko-math-001',
    name: 'Single-digit addition',
    description: 'Add numbers 0-9 without regrouping',
    domain: 'math',
    topicClusterId: 'math.arithmetic',
    prerequisites: [],
    examples: [
      { problem: '3 + 5 = ?', solution: '8' },
      { problem: '7 + 2 = ?', solution: '9' },
    ],
    difficulty: 0.2,
    levelScore: 15,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-002',
    name: 'Two-digit addition with regrouping',
    description: 'Add two-digit numbers requiring carrying',
    domain: 'math',
    topicClusterId: 'math.arithmetic',
    prerequisites: ['ko-math-001'],
    examples: [
      { problem: '27 + 48 = ?', solution: '75' },
      { problem: '56 + 39 = ?', solution: '95' },
    ],
    difficulty: 0.4,
    levelScore: 25,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-003',
    name: 'Single-digit subtraction',
    description: 'Subtract numbers 0-9 without borrowing',
    domain: 'math',
    topicClusterId: 'math.arithmetic',
    prerequisites: [],
    examples: [
      { problem: '9 - 4 = ?', solution: '5' },
      { problem: '8 - 3 = ?', solution: '5' },
    ],
    difficulty: 0.25,
    levelScore: 15,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-004',
    name: 'Multiplication tables (1-5)',
    description: 'Recall multiplication facts 1x1 through 5x10',
    domain: 'math',
    topicClusterId: 'math.arithmetic',
    prerequisites: ['ko-math-001'],
    examples: [
      { problem: '3 × 4 = ?', solution: '12' },
      { problem: '5 × 7 = ?', solution: '35' },
    ],
    difficulty: 0.35,
    levelScore: 30,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-005',
    name: 'Multiplication tables (6-10)',
    description: 'Recall multiplication facts 6x1 through 10x10',
    domain: 'math',
    topicClusterId: 'math.arithmetic',
    prerequisites: ['ko-math-004'],
    examples: [
      { problem: '7 × 8 = ?', solution: '56' },
      { problem: '9 × 6 = ?', solution: '54' },
    ],
    difficulty: 0.5,
    levelScore: 35,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-006',
    name: 'Division with single-digit divisors',
    description: 'Divide numbers evenly with single-digit divisors',
    domain: 'math',
    topicClusterId: 'math.arithmetic',
    prerequisites: ['ko-math-005'],
    examples: [
      { problem: '24 ÷ 6 = ?', solution: '4' },
      { problem: '45 ÷ 5 = ?', solution: '9' },
    ],
    difficulty: 0.45,
    levelScore: 35,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-007',
    name: 'Order of operations',
    description: 'Apply PEMDAS/BODMAS to multi-step expressions',
    domain: 'math',
    topicClusterId: 'math.arithmetic',
    prerequisites: ['ko-math-004', 'ko-math-006'],
    examples: [
      { problem: '3 + 4 × 2 = ?', solution: '11' },
      { problem: '(8 - 3) × 2 = ?', solution: '10' },
    ],
    difficulty: 0.6,
    levelScore: 45,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-008',
    name: 'Rounding whole numbers',
    description: 'Round to nearest 10, 100, or 1000',
    domain: 'math',
    topicClusterId: 'math.arithmetic',
    prerequisites: ['ko-math-002'],
    examples: [
      { problem: 'Round 347 to the nearest 10', solution: '350' },
      { problem: 'Round 1,482 to the nearest 100', solution: '1,500' },
    ],
    difficulty: 0.4,
    levelScore: 30,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-009',
    name: 'Place value (thousands)',
    description: 'Identify place value in 4-digit numbers',
    domain: 'math',
    topicClusterId: 'math.arithmetic',
    prerequisites: [],
    examples: [
      { problem: 'In 4,528, what digit is in the hundreds place?', solution: '5' },
      { problem: 'What is the value of 7 in 7,314?', solution: '7,000' },
    ],
    difficulty: 0.35,
    levelScore: 25,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-010',
    name: 'Comparing whole numbers',
    description: 'Use >, <, = to compare multi-digit numbers',
    domain: 'math',
    topicClusterId: 'math.arithmetic',
    prerequisites: ['ko-math-009'],
    examples: [
      { problem: 'Compare: 3,456 ___ 3,465', solution: '<' },
      { problem: 'Compare: 8,921 ___ 8,912', solution: '>' },
    ],
    difficulty: 0.3,
    levelScore: 20,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },

  // MATH - Fractions (10 KOs)
  {
    id: 'ko-math-011',
    name: 'Understanding fractions',
    description: 'Recognize fractions as parts of a whole',
    domain: 'math',
    topicClusterId: 'math.fractions',
    prerequisites: [],
    examples: [
      { problem: 'If a pizza has 8 slices and you eat 3, what fraction did you eat?', solution: '3/8' },
      { problem: 'Shade 2/5 of the circle', solution: '[visual]' },
    ],
    difficulty: 0.3,
    levelScore: 25,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-012',
    name: 'Equivalent fractions',
    description: 'Identify and create equivalent fractions',
    domain: 'math',
    topicClusterId: 'math.fractions',
    prerequisites: ['ko-math-011'],
    examples: [
      { problem: '1/2 = ?/8', solution: '4/8' },
      { problem: 'Simplify 6/9', solution: '2/3' },
    ],
    difficulty: 0.5,
    levelScore: 35,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-013',
    name: 'Adding fractions (same denominator)',
    description: 'Add fractions with common denominators',
    domain: 'math',
    topicClusterId: 'math.fractions',
    prerequisites: ['ko-math-011'],
    examples: [
      { problem: '2/7 + 3/7 = ?', solution: '5/7' },
      { problem: '1/5 + 3/5 = ?', solution: '4/5' },
    ],
    difficulty: 0.4,
    levelScore: 30,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-014',
    name: 'Adding fractions (different denominators)',
    description: 'Add fractions by finding common denominators',
    domain: 'math',
    topicClusterId: 'math.fractions',
    prerequisites: ['ko-math-012', 'ko-math-013'],
    examples: [
      { problem: '1/3 + 1/4 = ?', solution: '7/12' },
      { problem: '2/5 + 1/2 = ?', solution: '9/10' },
    ],
    difficulty: 0.6,
    levelScore: 45,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-015',
    name: 'Comparing fractions',
    description: 'Compare fractions using benchmarks and common denominators',
    domain: 'math',
    topicClusterId: 'math.fractions',
    prerequisites: ['ko-math-012'],
    examples: [
      { problem: 'Compare: 2/3 ___ 3/4', solution: '<' },
      { problem: 'Compare: 5/8 ___ 1/2', solution: '>' },
    ],
    difficulty: 0.5,
    levelScore: 35,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-016',
    name: 'Converting fractions to decimals',
    description: 'Express fractions as decimal values',
    domain: 'math',
    topicClusterId: 'math.fractions',
    prerequisites: ['ko-math-011', 'ko-math-006'],
    examples: [
      { problem: 'Convert 3/4 to decimal', solution: '0.75' },
      { problem: 'Convert 1/5 to decimal', solution: '0.2' },
    ],
    difficulty: 0.55,
    levelScore: 40,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-017',
    name: 'Multiplying fractions',
    description: 'Multiply fractions and simplify results',
    domain: 'math',
    topicClusterId: 'math.fractions',
    prerequisites: ['ko-math-011', 'ko-math-004'],
    examples: [
      { problem: '2/3 × 3/5 = ?', solution: '6/15 or 2/5' },
      { problem: '1/4 × 2/7 = ?', solution: '2/28 or 1/14' },
    ],
    difficulty: 0.6,
    levelScore: 45,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-018',
    name: 'Dividing fractions',
    description: 'Divide fractions using reciprocals',
    domain: 'math',
    topicClusterId: 'math.fractions',
    prerequisites: ['ko-math-017'],
    examples: [
      { problem: '1/2 ÷ 1/4 = ?', solution: '2' },
      { problem: '3/4 ÷ 2/3 = ?', solution: '9/8 or 1 1/8' },
    ],
    difficulty: 0.65,
    levelScore: 50,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-019',
    name: 'Mixed numbers and improper fractions',
    description: 'Convert between mixed numbers and improper fractions',
    domain: 'math',
    topicClusterId: 'math.fractions',
    prerequisites: ['ko-math-011'],
    examples: [
      { problem: 'Convert 2 3/4 to improper fraction', solution: '11/4' },
      { problem: 'Convert 17/5 to mixed number', solution: '3 2/5' },
    ],
    difficulty: 0.5,
    levelScore: 40,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-020',
    name: 'Decimal place value',
    description: 'Identify place value in decimal numbers',
    domain: 'math',
    topicClusterId: 'math.fractions',
    prerequisites: ['ko-math-009'],
    examples: [
      { problem: 'In 3.456, what digit is in the tenths place?', solution: '4' },
      { problem: 'What is the value of 7 in 12.078?', solution: '0.07 or 7 hundredths' },
    ],
    difficulty: 0.4,
    levelScore: 30,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },

  // MATH - Algebra (10 KOs)
  {
    id: 'ko-math-021',
    name: 'Evaluating expressions with one variable',
    description: 'Substitute values into algebraic expressions',
    domain: 'math',
    topicClusterId: 'math.algebra',
    prerequisites: ['ko-math-007'],
    examples: [
      { problem: 'If x = 5, what is 3x + 2?', solution: '17' },
      { problem: 'If y = 4, what is 2y - 7?', solution: '1' },
    ],
    difficulty: 0.5,
    levelScore: 40,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-022',
    name: 'Solving one-step equations',
    description: 'Solve equations using inverse operations',
    domain: 'math',
    topicClusterId: 'math.algebra',
    prerequisites: ['ko-math-021'],
    examples: [
      { problem: 'x + 7 = 12', solution: 'x = 5' },
      { problem: '3y = 15', solution: 'y = 5' },
    ],
    difficulty: 0.55,
    levelScore: 45,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-023',
    name: 'Solving two-step equations',
    description: 'Solve equations requiring two inverse operations',
    domain: 'math',
    topicClusterId: 'math.algebra',
    prerequisites: ['ko-math-022'],
    examples: [
      { problem: '2x + 5 = 13', solution: 'x = 4' },
      { problem: '3y - 7 = 8', solution: 'y = 5' },
    ],
    difficulty: 0.6,
    levelScore: 50,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-024',
    name: 'Writing expressions from word problems',
    description: 'Translate verbal descriptions into algebraic expressions',
    domain: 'math',
    topicClusterId: 'math.algebra',
    prerequisites: ['ko-math-021'],
    examples: [
      { problem: 'Five more than three times a number', solution: '3x + 5' },
      { problem: 'The product of 4 and a number, decreased by 7', solution: '4x - 7' },
    ],
    difficulty: 0.65,
    levelScore: 50,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-025',
    name: 'Combining like terms',
    description: 'Simplify expressions by combining like terms',
    domain: 'math',
    topicClusterId: 'math.algebra',
    prerequisites: ['ko-math-021'],
    examples: [
      { problem: 'Simplify: 3x + 5x - 2x', solution: '6x' },
      { problem: 'Simplify: 7y + 3 - 2y + 5', solution: '5y + 8' },
    ],
    difficulty: 0.55,
    levelScore: 45,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-026',
    name: 'Distributive property',
    description: 'Apply distributive property to expand expressions',
    domain: 'math',
    topicClusterId: 'math.algebra',
    prerequisites: ['ko-math-025'],
    examples: [
      { problem: 'Expand: 3(x + 4)', solution: '3x + 12' },
      { problem: 'Expand: 2(3y - 5)', solution: '6y - 10' },
    ],
    difficulty: 0.6,
    levelScore: 50,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-027',
    name: 'Graphing points on coordinate plane',
    description: 'Plot ordered pairs on x-y coordinate system',
    domain: 'math',
    topicClusterId: 'math.algebra',
    prerequisites: [],
    examples: [
      { problem: 'Plot (3, -2)', solution: '[visual]' },
      { problem: 'What are the coordinates of point A?', solution: '(-4, 5)' },
    ],
    difficulty: 0.45,
    levelScore: 35,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-028',
    name: 'Graphing linear equations',
    description: 'Create graphs of linear equations using tables or slope',
    domain: 'math',
    topicClusterId: 'math.algebra',
    prerequisites: ['ko-math-027', 'ko-math-023'],
    examples: [
      { problem: 'Graph: y = 2x + 1', solution: '[visual]' },
      { problem: 'Graph: y = -x + 3', solution: '[visual]' },
    ],
    difficulty: 0.7,
    levelScore: 60,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-029',
    name: 'Understanding slope',
    description: 'Calculate and interpret slope (rise over run)',
    domain: 'math',
    topicClusterId: 'math.algebra',
    prerequisites: ['ko-math-027'],
    examples: [
      { problem: 'Find slope between (1,2) and (3,6)', solution: '2' },
      { problem: 'Find slope between (-1,4) and (2,-2)', solution: '-2' },
    ],
    difficulty: 0.65,
    levelScore: 55,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-math-030',
    name: 'Exponents and powers',
    description: 'Evaluate expressions with exponents',
    domain: 'math',
    topicClusterId: 'math.algebra',
    prerequisites: ['ko-math-005'],
    examples: [
      { problem: '2³ = ?', solution: '8' },
      { problem: '5² = ?', solution: '25' },
    ],
    difficulty: 0.4,
    levelScore: 35,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },

  // READING - Comprehension (8 KOs)
  {
    id: 'ko-read-001',
    name: 'Main idea identification',
    description: 'Identify the central idea or theme of a passage',
    domain: 'reading',
    topicClusterId: 'reading.comprehension',
    prerequisites: [],
    examples: [
      { problem: 'Read passage and state main idea', solution: '[student-specific]' },
    ],
    difficulty: 0.5,
    levelScore: 40,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-002',
    name: 'Supporting details',
    description: 'Identify evidence that supports main idea',
    domain: 'reading',
    topicClusterId: 'reading.comprehension',
    prerequisites: ['ko-read-001'],
    examples: [
      { problem: 'Find two details that support the main idea', solution: '[student-specific]' },
    ],
    difficulty: 0.55,
    levelScore: 45,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-003',
    name: 'Making inferences',
    description: 'Draw logical conclusions based on text evidence',
    domain: 'reading',
    topicClusterId: 'reading.comprehension',
    prerequisites: ['ko-read-002'],
    examples: [
      { problem: 'What can you infer about the character?', solution: '[student-specific]' },
    ],
    difficulty: 0.65,
    levelScore: 55,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-004',
    name: 'Summarizing text',
    description: 'Create concise summaries of passages',
    domain: 'reading',
    topicClusterId: 'reading.comprehension',
    prerequisites: ['ko-read-001', 'ko-read-002'],
    examples: [
      { problem: 'Summarize this passage in 2-3 sentences', solution: '[student-specific]' },
    ],
    difficulty: 0.6,
    levelScore: 50,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-005',
    name: 'Character analysis',
    description: 'Analyze character traits, motivations, and development',
    domain: 'reading',
    topicClusterId: 'reading.comprehension',
    prerequisites: ['ko-read-003'],
    examples: [
      { problem: 'Describe the protagonist and how they change', solution: '[student-specific]' },
    ],
    difficulty: 0.7,
    levelScore: 60,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-006',
    name: 'Author\'s purpose',
    description: 'Determine why the author wrote the text (inform, persuade, entertain)',
    domain: 'reading',
    topicClusterId: 'reading.comprehension',
    prerequisites: ['ko-read-001'],
    examples: [
      { problem: 'What is the author\'s purpose in this article?', solution: 'To inform readers about...' },
    ],
    difficulty: 0.55,
    levelScore: 45,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-007',
    name: 'Context clues for vocabulary',
    description: 'Use surrounding text to determine word meanings',
    domain: 'reading',
    topicClusterId: 'reading.comprehension',
    prerequisites: [],
    examples: [
      { problem: 'What does "elated" mean based on context?', solution: 'Very happy' },
    ],
    difficulty: 0.5,
    levelScore: 40,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-008',
    name: 'Compare and contrast',
    description: 'Identify similarities and differences in texts',
    domain: 'reading',
    topicClusterId: 'reading.comprehension',
    prerequisites: ['ko-read-002'],
    examples: [
      { problem: 'Compare the two characters\' approaches', solution: '[student-specific]' },
    ],
    difficulty: 0.6,
    levelScore: 50,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },

  // READING - Grammar (7 KOs)
  {
    id: 'ko-read-009',
    name: 'Parts of speech: nouns and verbs',
    description: 'Identify nouns and verbs in sentences',
    domain: 'reading',
    topicClusterId: 'reading.grammar',
    prerequisites: [],
    examples: [
      { problem: 'Identify the verb: "The cat sleeps on the mat."', solution: 'sleeps' },
      { problem: 'Identify the nouns: "The dog chased the ball."', solution: 'dog, ball' },
    ],
    difficulty: 0.3,
    levelScore: 20,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-010',
    name: 'Subject-verb agreement',
    description: 'Match singular/plural subjects with correct verb forms',
    domain: 'reading',
    topicClusterId: 'reading.grammar',
    prerequisites: ['ko-read-009'],
    examples: [
      { problem: 'Choose correct verb: "The dogs (run/runs) fast."', solution: 'run' },
      { problem: 'Choose correct verb: "She (eat/eats) breakfast."', solution: 'eats' },
    ],
    difficulty: 0.45,
    levelScore: 35,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-011',
    name: 'Sentence types',
    description: 'Identify declarative, interrogative, exclamatory, and imperative sentences',
    domain: 'reading',
    topicClusterId: 'reading.grammar',
    prerequisites: [],
    examples: [
      { problem: 'What type of sentence: "Where are you going?"', solution: 'Interrogative' },
      { problem: 'What type of sentence: "Close the door."', solution: 'Imperative' },
    ],
    difficulty: 0.4,
    levelScore: 30,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-012',
    name: 'Punctuation: commas and periods',
    description: 'Use commas and periods correctly',
    domain: 'reading',
    topicClusterId: 'reading.grammar',
    prerequisites: [],
    examples: [
      { problem: 'Add punctuation: "I like apples oranges and bananas"', solution: 'I like apples, oranges, and bananas.' },
    ],
    difficulty: 0.4,
    levelScore: 30,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-013',
    name: 'Capitalization rules',
    description: 'Apply capitalization for proper nouns and sentence starts',
    domain: 'reading',
    topicClusterId: 'reading.grammar',
    prerequisites: [],
    examples: [
      { problem: 'Fix capitalization: "i live in new york."', solution: 'I live in New York.' },
    ],
    difficulty: 0.35,
    levelScore: 25,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-014',
    name: 'Verb tenses: past, present, future',
    description: 'Identify and use verb tenses correctly',
    domain: 'reading',
    topicClusterId: 'reading.grammar',
    prerequisites: ['ko-read-009'],
    examples: [
      { problem: 'Change to past tense: "I walk to school."', solution: 'I walked to school.' },
      { problem: 'Change to future tense: "She eats lunch."', solution: 'She will eat lunch.' },
    ],
    difficulty: 0.5,
    levelScore: 40,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-read-015',
    name: 'Pronouns and antecedents',
    description: 'Match pronouns with their referents',
    domain: 'reading',
    topicClusterId: 'reading.grammar',
    prerequisites: ['ko-read-009'],
    examples: [
      { problem: 'What does "it" refer to: "The dog wagged its tail."', solution: 'The dog' },
      { problem: 'Choose pronoun: "Sarah lost __ backpack."', solution: 'her' },
    ],
    difficulty: 0.5,
    levelScore: 40,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },

  // SCIENCE - Biology (7 KOs)
  {
    id: 'ko-sci-001',
    name: 'Plant structures and functions',
    description: 'Identify parts of plants (roots, stem, leaves, flowers) and their roles',
    domain: 'science',
    topicClusterId: 'science.biology',
    prerequisites: [],
    examples: [
      { problem: 'What part of the plant absorbs water?', solution: 'Roots' },
      { problem: 'Where does photosynthesis occur?', solution: 'Leaves' },
    ],
    difficulty: 0.4,
    levelScore: 30,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-sci-002',
    name: 'Animal classification',
    description: 'Classify animals into groups (mammals, reptiles, birds, fish, amphibians)',
    domain: 'science',
    topicClusterId: 'science.biology',
    prerequisites: [],
    examples: [
      { problem: 'Is a frog a mammal or amphibian?', solution: 'Amphibian' },
      { problem: 'Name two characteristics of mammals', solution: 'Have fur/hair, produce milk' },
    ],
    difficulty: 0.45,
    levelScore: 35,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-sci-003',
    name: 'Food chains and webs',
    description: 'Understand energy flow in ecosystems',
    domain: 'science',
    topicClusterId: 'science.biology',
    prerequisites: [],
    examples: [
      { problem: 'What eats plants in this food chain?', solution: 'Herbivores' },
      { problem: 'Order: grass → rabbit → fox', solution: 'Producer → Primary consumer → Secondary consumer' },
    ],
    difficulty: 0.5,
    levelScore: 40,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-sci-004',
    name: 'Life cycles',
    description: 'Describe stages in plant and animal life cycles',
    domain: 'science',
    topicClusterId: 'science.biology',
    prerequisites: [],
    examples: [
      { problem: 'Order butterfly life cycle stages', solution: 'Egg → Larva → Pupa → Adult' },
      { problem: 'What is the first stage of a plant?', solution: 'Seed' },
    ],
    difficulty: 0.45,
    levelScore: 35,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-sci-005',
    name: 'Photosynthesis',
    description: 'Explain how plants make food using sunlight',
    domain: 'science',
    topicClusterId: 'science.biology',
    prerequisites: ['ko-sci-001'],
    examples: [
      { problem: 'What do plants need for photosynthesis?', solution: 'Sunlight, water, carbon dioxide' },
      { problem: 'What do plants produce?', solution: 'Oxygen and glucose' },
    ],
    difficulty: 0.55,
    levelScore: 45,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-sci-006',
    name: 'Human body systems',
    description: 'Identify major body systems and their functions',
    domain: 'science',
    topicClusterId: 'science.biology',
    prerequisites: [],
    examples: [
      { problem: 'Which system helps you breathe?', solution: 'Respiratory system' },
      { problem: 'What does the circulatory system do?', solution: 'Moves blood through the body' },
    ],
    difficulty: 0.5,
    levelScore: 40,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-sci-007',
    name: 'Ecosystems and habitats',
    description: 'Understand how organisms interact with their environment',
    domain: 'science',
    topicClusterId: 'science.biology',
    prerequisites: ['ko-sci-003'],
    examples: [
      { problem: 'What is a habitat?', solution: 'The natural environment where an organism lives' },
      { problem: 'Name an adaptation for desert animals', solution: 'Storing water, nocturnal behavior' },
    ],
    difficulty: 0.55,
    levelScore: 45,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },

  // SCIENCE - Physics (5 KOs)
  {
    id: 'ko-sci-008',
    name: 'Force and motion',
    description: 'Understand how forces cause objects to move or change direction',
    domain: 'science',
    topicClusterId: 'science.physics',
    prerequisites: [],
    examples: [
      { problem: 'What makes a ball roll?', solution: 'A force (push or pull)' },
      { problem: 'What happens when you push harder?', solution: 'The object moves faster' },
    ],
    difficulty: 0.4,
    levelScore: 30,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-sci-009',
    name: 'Simple machines',
    description: 'Identify and explain levers, pulleys, ramps, wheels',
    domain: 'science',
    topicClusterId: 'science.physics',
    prerequisites: ['ko-sci-008'],
    examples: [
      { problem: 'Name a simple machine in a playground', solution: 'Seesaw (lever), slide (ramp)' },
      { problem: 'How does a pulley help?', solution: 'Makes it easier to lift heavy objects' },
    ],
    difficulty: 0.5,
    levelScore: 40,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-sci-010',
    name: 'Energy forms and transformations',
    description: 'Recognize different forms of energy (light, heat, sound, motion)',
    domain: 'science',
    topicClusterId: 'science.physics',
    prerequisites: [],
    examples: [
      { problem: 'What form of energy comes from the sun?', solution: 'Light and heat' },
      { problem: 'How does a battery store energy?', solution: 'Chemical energy' },
    ],
    difficulty: 0.55,
    levelScore: 45,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-sci-011',
    name: 'Properties of matter',
    description: 'Describe states of matter (solid, liquid, gas) and properties',
    domain: 'science',
    topicClusterId: 'science.physics',
    prerequisites: [],
    examples: [
      { problem: 'Is ice a solid, liquid, or gas?', solution: 'Solid' },
      { problem: 'What happens when water boils?', solution: 'It changes from liquid to gas (steam)' },
    ],
    difficulty: 0.45,
    levelScore: 35,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
  {
    id: 'ko-sci-012',
    name: 'Magnetism and electricity',
    description: 'Understand magnetic attraction and basic circuits',
    domain: 'science',
    topicClusterId: 'science.physics',
    prerequisites: [],
    examples: [
      { problem: 'What metals do magnets attract?', solution: 'Iron, nickel, cobalt' },
      { problem: 'What do you need to light a bulb?', solution: 'Battery, wires, and a complete circuit' },
    ],
    difficulty: 0.5,
    levelScore: 40,
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'llm',
  },
];

// =====================================================
// MASTERY STATES
// =====================================================

function generateMasteryStates(): MasteryState[] {
  const states: MasteryState[] = [];
  
  // Student 1 (Alex): Self-directed, high achiever
  // High mastery in arithmetic and fractions, medium in algebra
  MOCK_KNOWLEDGE_OBJECTIVES.slice(0, 15).forEach((ko, idx) => {
    states.push({
      studentId: MOCK_STUDENT_IDS[0],
      koId: ko.id,
      mastery: 0.7 + Math.random() * 0.25, // 0.7-0.95
      evidenceCount: 10 + Math.floor(Math.random() * 20),
      lastUpdated: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
      firstPracticed: new Date(Date.now() - (30 + Math.random() * 30) * 24 * 60 * 60 * 1000).toISOString(),
    });
  });

  // Student 2 (Bailey): Teacher-assigned, medium mastery
  // Working on specific skills with teacher guidance
  const baileyKOs = ['ko-math-004', 'ko-math-005', 'ko-math-011', 'ko-math-012', 'ko-math-013'];
  baileyKOs.forEach(koId => {
    states.push({
      studentId: MOCK_STUDENT_IDS[1],
      koId,
      mastery: 0.45 + Math.random() * 0.3, // 0.45-0.75
      evidenceCount: 5 + Math.floor(Math.random() * 10),
      lastUpdated: new Date(Date.now() - Math.random() * 2 * 24 * 60 * 60 * 1000).toISOString(), // Last 2 days
      firstPracticed: new Date(Date.now() - (14 + Math.random() * 7) * 24 * 60 * 60 * 1000).toISOString(),
    });
  });

  // Student 3 (Casey): Parent-assigned, struggling
  // Low mastery, needs support
  const caseyKOs = ['ko-math-001', 'ko-math-003', 'ko-read-001', 'ko-read-009', 'ko-read-012'];
  caseyKOs.forEach(koId => {
    states.push({
      studentId: MOCK_STUDENT_IDS[2],
      koId,
      mastery: 0.2 + Math.random() * 0.35, // 0.2-0.55
      evidenceCount: 3 + Math.floor(Math.random() * 7),
      lastUpdated: new Date(Date.now() - Math.random() * 5 * 24 * 60 * 60 * 1000).toISOString(), // Last 5 days
      firstPracticed: new Date(Date.now() - (7 + Math.random() * 7) * 24 * 60 * 60 * 1000).toISOString(),
    });
  });

  // Student 4 (Drew): Autonomous AI, advanced
  // High mastery across multiple domains
  MOCK_KNOWLEDGE_OBJECTIVES.slice(0, 20).forEach(ko => {
    states.push({
      studentId: MOCK_STUDENT_IDS[3],
      koId: ko.id,
      mastery: 0.75 + Math.random() * 0.2, // 0.75-0.95
      evidenceCount: 15 + Math.floor(Math.random() * 25),
      lastUpdated: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000).toISOString(),
      firstPracticed: new Date(Date.now() - (45 + Math.random() * 30) * 24 * 60 * 60 * 1000).toISOString(),
    });
  });

  // Student 5 (Elliot): Struggling with multiple assignments
  const elliotKOs = ['ko-math-002', 'ko-math-004', 'ko-math-011', 'ko-read-002', 'ko-read-010'];
  elliotKOs.forEach(koId => {
    states.push({
      studentId: MOCK_STUDENT_IDS[4],
      koId,
      mastery: 0.15 + Math.random() * 0.3, // 0.15-0.45
      evidenceCount: 2 + Math.floor(Math.random() * 5),
      lastUpdated: new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000).toISOString(),
      firstPracticed: new Date(Date.now() - (10 + Math.random() * 10) * 24 * 60 * 60 * 1000).toISOString(),
    });
  });

  return states;
}

export const MOCK_MASTERY_STATES = generateMasteryStates();

// =====================================================
// ASSIGNMENTS
// =====================================================

export const MOCK_ASSIGNMENTS: Assignment[] = [
  // Bailey: Teacher-assigned multiplication
  {
    id: 'assign-001',
    studentId: MOCK_STUDENT_IDS[1],
    koId: 'ko-math-005',
    courseId: 'multiplication',
    assignedBy: MOCK_TEACHER_ID,
    assignedByRole: 'teacher',
    completionCriteria: {
      primary_kpi: 'mastery_score',
      target_mastery: 0.75,
      min_evidence: 10,
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    status: 'active',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  // Casey: Parent-assigned reading
  {
    id: 'assign-002',
    studentId: MOCK_STUDENT_IDS[2],
    koId: 'ko-read-001',
    courseId: 'reading-grade3',
    assignedBy: MOCK_PARENT_ID,
    assignedByRole: 'parent',
    completionCriteria: {
      primary_kpi: 'mastery_score',
      target_mastery: 0.7,
      min_evidence: 8,
    },
    status: 'active',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  // Elliot: Overdue math assignment
  {
    id: 'assign-003',
    studentId: MOCK_STUDENT_IDS[4],
    koId: 'ko-math-002',
    courseId: 'arithmetic-grade4',
    assignedBy: MOCK_TEACHER_ID,
    assignedByRole: 'teacher',
    completionCriteria: {
      primary_kpi: 'mastery_score',
      target_mastery: 0.7,
      min_evidence: 10,
      due_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    status: 'overdue',
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  // Drew: AI-assigned autonomous
  {
    id: 'assign-004',
    studentId: MOCK_STUDENT_IDS[3],
    koId: 'ko-math-028',
    courseId: 'algebra-linear-equations',
    assignedBy: 'ai-system',
    assignedByRole: 'ai_autonomous',
    completionCriteria: {
      primary_kpi: 'mastery_score',
      target_mastery: 0.8,
      min_evidence: 12,
    },
    llmRationale: 'Student has mastered prerequisites (plotting points, two-step equations). Ready for graphing linear equations with high confidence.',
    llmConfidence: 0.85,
    status: 'active',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  // Bailey: Completed assignment
  {
    id: 'assign-005',
    studentId: MOCK_STUDENT_IDS[1],
    koId: 'ko-math-004',
    courseId: 'multiplication',
    assignedBy: MOCK_TEACHER_ID,
    assignedByRole: 'teacher',
    completionCriteria: {
      primary_kpi: 'mastery_score',
      target_mastery: 0.75,
      min_evidence: 10,
    },
    status: 'completed',
    completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    completionReason: 'mastery_achieved',
    finalMastery: 0.78,
    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// =====================================================
// AUTO-ASSIGN SETTINGS
// =====================================================

export const MOCK_AUTO_ASSIGN_SETTINGS: AutoAssignSettings[] = [
  {
    studentId: MOCK_STUDENT_IDS[3], // Drew has autonomous AI enabled
    enabled: true,
    masteryThreshold: 0.65,
    frequency: 'on_completion',
    maxConcurrent: 3,
    notifyOnAssign: true,
    notifyEmail: 'drew@example.com',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// =====================================================
// COURSE-KO SCOPE
// =====================================================

export const MOCK_COURSE_KO_SCOPE: CourseKOScope[] = [
  // Multiplication course
  { courseId: 'multiplication', koId: 'ko-math-004', relevance: 1.0, exerciseCount: 25, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  { courseId: 'multiplication', koId: 'ko-math-005', relevance: 1.0, exerciseCount: 30, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  { courseId: 'multiplication', koId: 'ko-math-001', relevance: 0.3, exerciseCount: 5, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  
  // Arithmetic course
  { courseId: 'arithmetic-grade4', koId: 'ko-math-001', relevance: 0.8, exerciseCount: 12, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  { courseId: 'arithmetic-grade4', koId: 'ko-math-002', relevance: 1.0, exerciseCount: 20, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  { courseId: 'arithmetic-grade4', koId: 'ko-math-003', relevance: 0.8, exerciseCount: 15, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  
  // Fractions course
  { courseId: 'fractions-grade5', koId: 'ko-math-011', relevance: 1.0, exerciseCount: 18, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  { courseId: 'fractions-grade5', koId: 'ko-math-012', relevance: 1.0, exerciseCount: 22, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  { courseId: 'fractions-grade5', koId: 'ko-math-013', relevance: 0.9, exerciseCount: 16, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  
  // Reading comprehension
  { courseId: 'reading-grade3', koId: 'ko-read-001', relevance: 1.0, exerciseCount: 20, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  { courseId: 'reading-grade3', koId: 'ko-read-002', relevance: 0.9, exerciseCount: 15, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  { courseId: 'reading-grade3', koId: 'ko-read-007', relevance: 0.7, exerciseCount: 12, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
];

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Simulates mastery update using EMA algorithm
 * new_mastery = (1 - α·w)·old + (α·w)·score
 */
export function simulateMasteryUpdate(
  currentMastery: number,
  isCorrect: boolean,
  weight: number = 1.0,
  alpha: number = 0.25
): { newMastery: number; evidenceIncrease: number } {
  const score = isCorrect ? 1.0 : 0.0;
  const effectiveAlpha = alpha * weight;
  const newMastery = (1 - effectiveAlpha) * currentMastery + effectiveAlpha * score;
  
  return {
    newMastery: Math.max(0, Math.min(1, newMastery)), // Clamp to [0,1]
    evidenceIncrease: 1,
  };
}

/**
 * Applies time decay to mastery (optional, for aging simulation)
 * Half-life ~60 days toward 0.5
 */
export function applyTimeDecay(
  mastery: number,
  daysSinceLastPractice: number,
  halfLife: number = 60
): number {
  const lambda = Math.log(2) / halfLife;
  const decay = Math.exp(-lambda * daysSinceLastPractice);
  return 0.5 + (mastery - 0.5) * decay;
}

/**
 * Checks if assignment completion criteria are met
 */
export function checkAssignmentCompletion(
  assignment: Assignment,
  currentMastery: number,
  exercisesCompleted: number
): boolean {
  const { completionCriteria } = assignment;
  const { primary_kpi, target_mastery, min_evidence, target_exercise_count, require_both } = completionCriteria;

  const masteryMet = currentMastery >= (target_mastery || 0.75) && exercisesCompleted >= (min_evidence || 5);
  const exercisesMet = target_exercise_count ? exercisesCompleted >= target_exercise_count : false;

  if (primary_kpi === 'mastery_score') {
    return masteryMet;
  } else if (primary_kpi === 'exercise_count') {
    return exercisesMet;
  } else if (primary_kpi === 'hybrid') {
    return require_both ? (masteryMet && exercisesMet) : (masteryMet || exercisesMet);
  }

  return false;
}

/**
 * Gets student's enrolled course IDs (mock)
 */
export function getStudentEnrolledCourses(studentId: string): string[] {
  // Mock enrollment data
  const enrollments: Record<string, string[]> = {
    [MOCK_STUDENT_IDS[0]]: ['multiplication', 'fractions-grade5', 'algebra-linear-equations'],
    [MOCK_STUDENT_IDS[1]]: ['multiplication', 'arithmetic-grade4'],
    [MOCK_STUDENT_IDS[2]]: ['reading-grade3', 'arithmetic-grade4'],
    [MOCK_STUDENT_IDS[3]]: ['algebra-linear-equations', 'fractions-grade5', 'reading-grade4'],
    [MOCK_STUDENT_IDS[4]]: ['arithmetic-grade4', 'reading-grade3'],
  };
  
  return enrollments[studentId] || [];
}

/**
 * Gets teacher's class student IDs
 */
export function getTeacherStudentIds(teacherId: string): string[] {
  if (teacherId === MOCK_TEACHER_ID) {
    return [MOCK_STUDENT_IDS[1], MOCK_STUDENT_IDS[4]]; // Bailey and Elliot
  }
  return [];
}

/**
 * Gets parent's child student IDs
 */
export function getParentStudentIds(parentId: string): string[] {
  if (parentId === MOCK_PARENT_ID) {
    return [MOCK_STUDENT_IDS[2]]; // Casey
  }
  return [];
}

/**
 * Filters KOs by student's enrolled courses and joins with mastery data
 */
export function getKOsForStudent(studentId: string): MasteryStateWithKO[] {
  const enrolledCourses = getStudentEnrolledCourses(studentId);
  const relevantKOIds = new Set(
    MOCK_COURSE_KO_SCOPE
      .filter(scope => enrolledCourses.includes(scope.courseId) && scope.relevance >= 0.5)
      .map(scope => scope.koId)
  );
  
  const relevantKOs = MOCK_KNOWLEDGE_OBJECTIVES.filter(ko => relevantKOIds.has(ko.id));
  
  // Join with mastery states
  return relevantKOs.map(ko => {
    const masteryState = MOCK_MASTERY_STATES.find(m => m.studentId === studentId && m.koId === ko.id);
    
    if (!masteryState) {
      // No mastery data yet - locked state
      return {
        studentId,
        koId: ko.id,
        mastery: 0,
        evidenceCount: 0,
        lastUpdated: new Date().toISOString(),
        firstPracticed: new Date().toISOString(),
        ko,
        status: 'locked' as const,
        daysSinceLastPractice: 999,
      };
    }
    
    // Calculate days since last practice
    const lastPracticed = new Date(masteryState.lastUpdated);
    const daysSinceLastPractice = Math.floor((Date.now() - lastPracticed.getTime()) / (24 * 60 * 60 * 1000));
    
    // Determine status based on mastery
    let status: 'locked' | 'in-progress' | 'mastered';
    if (masteryState.mastery >= 0.8) {
      status = 'mastered';
    } else if (masteryState.mastery >= 0.3) {
      status = 'in-progress';
    } else {
      status = 'locked';
    }
    
    return {
      ...masteryState,
      ko,
      status,
      daysSinceLastPractice,
    };
  });
}

/**
 * Gets student mastery states with KO details
 */
export function getStudentMasteryStates(studentId: string): MasteryStateWithKO[] {
  return getKOsForStudent(studentId);
}

/**
 * Gets assignment details for a student
 */
export function getAssignmentsForStudentDetailed(studentId: string): AssignmentWithDetails[] {
  const assignments = MOCK_ASSIGNMENTS.filter(a => a.studentId === studentId);
  
  return assignments.map(a => {
    const ko = MOCK_KNOWLEDGE_OBJECTIVES.find(k => k.id === a.koId);
    const masteryState = MOCK_MASTERY_STATES.find(m => m.studentId === studentId && m.koId === a.koId);
    const progressTarget = a.completionCriteria.target_exercise_count ?? 20;
    const progressCurrent = Math.min(progressTarget, Math.max(0, Math.round((masteryState?.evidenceCount ?? 5) * 0.6)));
    const progressPercentage = Math.min(100, Math.round((progressCurrent / progressTarget) * 100));
    
    const daysUntilDue = a.dueDate
      ? Math.max(0, Math.ceil((new Date(a.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : undefined;
    
    return {
      ...a,
      ko: ko ?? MOCK_KNOWLEDGE_OBJECTIVES[0],
      courseName: getCourseTitle(a.courseId),
      currentMastery: masteryState?.mastery ?? 0.3,
      progressCurrent,
      progressTarget,
      progressPercentage,
      daysUntilDue,
      assignedByName: a.assignedBy,
    };
  });
}

/**
 * Gets recommended courses for a KO
 */
export function getRecommendedCoursesForKO(koId: string, studentId: string): RecommendedCourse[] {
  const enrolledCourses = getStudentEnrolledCourses(studentId);
  
  return MOCK_COURSE_KO_SCOPE
    .filter(scope => scope.koId === koId && enrolledCourses.includes(scope.courseId))
    .map(scope => ({
      courseId: scope.courseId,
      courseTitle: getCourseTitle(scope.courseId),
      exerciseCount: scope.exerciseCount,
      completionPct: Math.floor(Math.random() * 100),
      relevance: scope.relevance,
    }))
    .sort((a, b) => b.relevance - a.relevance);
}

function getCourseTitle(courseId: string): string {
  const titles: Record<string, string> = {
    'multiplication': 'Multiplication Mastery',
    'arithmetic-grade4': 'Grade 4 Arithmetic',
    'fractions-grade5': 'Fractions & Decimals',
    'algebra-linear-equations': 'Linear Equations',
    'reading-grade3': 'Reading Comprehension',
    'reading-grade4': 'Advanced Reading',
  };
  return titles[courseId] || courseId;
}

/**
 * Mock delay helper
 */
export const simulateNetworkDelay = (ms: number = 300): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};
