/**
 * Course Types Tests
 * Validates the structure of course-related types
 */

import type { Course, CourseItem, CourseLevel, CourseGroup, StudyText } from '@/lib/types/course';

describe('CourseItem type', () => {
  it('accepts valid course item', () => {
    const item: CourseItem = {
      id: 1,
      groupId: 1,
      text: 'What is 2 + 2?',
      explain: '2 + 2 equals 4',
      clusterId: 'cluster-1',
      variant: '1',
      options: ['3', '4', '5', '6'],
      correctIndex: 1,
    };
    
    expect(item.id).toBe(1);
    expect(item.options.length).toBe(4);
    expect(item.correctIndex).toBe(1);
  });

  it('accepts item with optional mode', () => {
    const item: CourseItem = {
      id: 1,
      groupId: 1,
      text: 'What is 10 / 2?',
      explain: '10 / 2 = 5',
      clusterId: 'cluster-1',
      variant: '1',
      options: [],
      correctIndex: 0,
      mode: 'numeric',
      answer: 5,
    };
    
    expect(item.mode).toBe('numeric');
    expect(item.answer).toBe(5);
  });

  it('accepts item with stimulus', () => {
    const item: CourseItem = {
      id: 1,
      groupId: 1,
      text: 'Look at the image and answer',
      explain: 'The answer is A',
      clusterId: 'cluster-1',
      variant: '1',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
      stimulus: {
        type: 'image',
        url: 'https://example.com/image.jpg',
        alt: 'Test image',
      },
    };
    
    expect(item.stimulus?.type).toBe('image');
  });

  it('accepts item with audio stimulus', () => {
    const item: CourseItem = {
      id: 1,
      groupId: 1,
      text: 'Listen and answer',
      explain: 'The answer is B',
      clusterId: 'cluster-1',
      variant: '1',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 1,
      stimulus: {
        type: 'audio',
        url: 'https://example.com/audio.mp3',
      },
    };
    
    expect(item.stimulus?.type).toBe('audio');
  });

  it('accepts item with video stimulus', () => {
    const item: CourseItem = {
      id: 1,
      groupId: 1,
      text: 'Watch and answer',
      explain: 'The answer is C',
      clusterId: 'cluster-1',
      variant: '1',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 2,
      stimulus: {
        type: 'video',
        url: 'https://example.com/video.mp4',
      },
    };
    
    expect(item.stimulus?.type).toBe('video');
  });

  it('accepts item with optionMedia', () => {
    const item: CourseItem = {
      id: 1,
      groupId: 1,
      text: 'Select the correct image',
      explain: 'Image A is correct',
      clusterId: 'cluster-1',
      variant: '1',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
      optionMedia: [
        { type: 'image', url: 'https://example.com/a.jpg', alt: 'Option A' },
        { type: 'image', url: 'https://example.com/b.jpg', alt: 'Option B' },
        null,
        null,
      ],
    };
    
    expect(item.optionMedia?.length).toBe(4);
    expect(item.optionMedia?.[0]?.type).toBe('image');
  });
});

describe('CourseLevel type', () => {
  it('accepts valid course level', () => {
    const level: CourseLevel = {
      id: 1,
      start: 1,
      end: 5,
      title: 'Beginner',
    };
    
    expect(level.id).toBe(1);
    expect(level.start).toBe(1);
    expect(level.end).toBe(5);
  });

  it('accepts level with optional properties', () => {
    const level: CourseLevel = {
      id: 2,
      start: 6,
      end: 10,
      title: 'Intermediate',
      description: 'For students who completed beginner',
      minScore: 70,
    };
    
    expect(level.description).toBe('For students who completed beginner');
    expect(level.minScore).toBe(70);
  });
});

describe('CourseGroup type', () => {
  it('accepts valid course group', () => {
    const group: CourseGroup = {
      id: 1,
      name: 'Addition',
    };
    
    expect(group.id).toBe(1);
    expect(group.name).toBe('Addition');
  });

  it('accepts group with color', () => {
    const group: CourseGroup = {
      id: 2,
      name: 'Subtraction',
      color: '#FF5733',
    };
    
    expect(group.color).toBe('#FF5733');
  });
});

describe('StudyText type', () => {
  it('accepts valid study text', () => {
    const text: StudyText = {
      id: 'text-1',
      title: 'Introduction to Addition',
      content: 'Addition is combining two numbers...',
      order: 1,
    };
    
    expect(text.id).toBe('text-1');
    expect(text.order).toBe(1);
  });

  it('accepts study text with metadata', () => {
    const text: StudyText = {
      id: 'text-2',
      title: 'Advanced Addition',
      content: 'For larger numbers...',
      order: 2,
      learningObjectives: ['Understand carry-over', 'Add three-digit numbers'],
      metadata: {
        difficulty: 'intermediate',
        estimatedReadingTime: 5,
        keywords: ['addition', 'math', 'arithmetic'],
      },
    };
    
    expect(text.learningObjectives?.length).toBe(2);
    expect(text.metadata?.difficulty).toBe('intermediate');
  });
});

describe('Course type', () => {
  it('accepts valid complete course', () => {
    const course: Course = {
      id: 'math-101',
      title: 'Math Basics',
      levels: [
        { id: 1, title: 'Level 1', start: 1, end: 3 },
        { id: 2, title: 'Level 2', start: 4, end: 6 },
      ],
      groups: [
        { id: 1, name: 'Addition' },
        { id: 2, name: 'Subtraction' },
      ],
      items: [
        {
          id: 1,
          groupId: 1,
          text: 'What is 1 + 1?',
          explain: '1 + 1 = 2',
          clusterId: 'c1',
          variant: '1',
          options: ['1', '2', '3', '4'],
          correctIndex: 1,
        },
      ],
    };
    
    expect(course.levels.length).toBe(2);
    expect(course.groups.length).toBe(2);
    expect(course.items.length).toBe(1);
  });

  it('accepts course with optional properties', () => {
    const course: Course = {
      id: 'math-102',
      title: 'Math Advanced',
      locale: 'en-US',
      contentVersion: '1.0.0',
      format: 'v2',
      description: 'Advanced math topics',
      studyTexts: [
        {
          id: 'st-1',
          title: 'Intro',
          content: 'Welcome...',
          order: 1,
        },
      ],
      levels: [],
      groups: [],
      items: [],
    };
    
    expect(course.locale).toBe('en-US');
    expect(course.studyTexts?.length).toBe(1);
  });
});

