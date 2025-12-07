/**
 * Enums Tests
 * Tests that enums are properly exported and have expected values
 */

import {
  UserRole,
  ApiMode,
  Environment,
  JobStatus,
  JobType,
  AIProvider,
  AssignmentStatus,
  CourseMode,
  StimulusType,
  GradeBand,
  TimeRange,
  MediaType,
  MessageType,
  MessageStatus,
  OrgRole,
  ApiErrorCode,
  LogLevel,
} from '@/lib/enums';

describe('UserRole', () => {
  it('exports all user roles', () => {
    expect(UserRole.Student).toBe('student');
    expect(UserRole.Teacher).toBe('teacher');
    expect(UserRole.Parent).toBe('parent');
    expect(UserRole.School).toBe('school');
    expect(UserRole.Admin).toBe('admin');
  });
});

describe('ApiMode', () => {
  it('exports API modes', () => {
    expect(ApiMode.Mock).toBe('mock');
    expect(ApiMode.Live).toBe('live');
  });
});

describe('Environment', () => {
  it('exports environments', () => {
    expect(Environment.Development).toBe('development');
    expect(Environment.Preview).toBe('preview');
    expect(Environment.Production).toBe('production');
  });
});

describe('JobStatus', () => {
  it('exports job statuses', () => {
    expect(JobStatus.Pending).toBe('pending');
    expect(JobStatus.Processing).toBe('processing');
    expect(JobStatus.Done).toBe('done');
    expect(JobStatus.Failed).toBe('failed');
    expect(JobStatus.DeadLetter).toBe('dead_letter');
    expect(JobStatus.Stale).toBe('stale');
  });
});

describe('JobType', () => {
  it('exports job types', () => {
    expect(JobType.Course).toBe('course');
    expect(JobType.Media).toBe('media');
  });
});

describe('AIProvider', () => {
  it('exports AI providers', () => {
    expect(AIProvider.OpenAI).toBe('openai');
    expect(AIProvider.Anthropic).toBe('anthropic');
    expect(AIProvider.ElevenLabs).toBe('elevenlabs');
    expect(AIProvider.Replicate).toBe('replicate');
  });
});

describe('AssignmentStatus', () => {
  it('exports assignment statuses', () => {
    expect(AssignmentStatus.Pending).toBe('pending');
    expect(AssignmentStatus.InProgress).toBe('in_progress');
    expect(AssignmentStatus.Completed).toBe('completed');
    expect(AssignmentStatus.Overdue).toBe('overdue');
    expect(AssignmentStatus.Graded).toBe('graded');
  });
});

describe('CourseMode', () => {
  it('exports course modes', () => {
    expect(CourseMode.Options).toBe('options');
    expect(CourseMode.Numeric).toBe('numeric');
  });
});

describe('StimulusType', () => {
  it('exports stimulus types', () => {
    expect(StimulusType.Image).toBe('image');
    expect(StimulusType.Audio).toBe('audio');
    expect(StimulusType.Video).toBe('video');
  });
});

describe('GradeBand', () => {
  it('exports grade bands', () => {
    expect(GradeBand.PreK).toBe('Pre-K');
    expect(GradeBand.K2).toBe('K-2');
    expect(GradeBand.Gr36).toBe('3-6');
    expect(GradeBand.Gr68).toBe('6-8');
    expect(GradeBand.Gr912).toBe('9-12');
    expect(GradeBand.AllGrades).toBe('All Grades');
  });
});

describe('TimeRange', () => {
  it('exports time ranges', () => {
    expect(TimeRange.Day).toBe('day');
    expect(TimeRange.Week).toBe('week');
    expect(TimeRange.Month).toBe('month');
  });
});

describe('MediaType', () => {
  it('exports media types', () => {
    expect(MediaType.Image).toBe('image');
    expect(MediaType.Audio).toBe('audio');
    expect(MediaType.Video).toBe('video');
  });
});

describe('MessageType', () => {
  it('exports message types', () => {
    expect(MessageType.Direct).toBe('direct');
    expect(MessageType.Class).toBe('class');
    expect(MessageType.Announcement).toBe('announcement');
  });
});

describe('MessageStatus', () => {
  it('exports message statuses', () => {
    expect(MessageStatus.Unread).toBe('unread');
    expect(MessageStatus.Read).toBe('read');
    expect(MessageStatus.Archived).toBe('archived');
  });
});

describe('OrgRole', () => {
  it('exports organization roles', () => {
    expect(OrgRole.Owner).toBe('owner');
    expect(OrgRole.Admin).toBe('admin');
    expect(OrgRole.Member).toBe('member');
    expect(OrgRole.Guest).toBe('guest');
  });
});

describe('ApiErrorCode', () => {
  it('exports API error codes', () => {
    expect(ApiErrorCode.Unauthorized).toBe('UNAUTHORIZED');
    expect(ApiErrorCode.Forbidden).toBe('FORBIDDEN');
    expect(ApiErrorCode.NotFound).toBe('NOT_FOUND');
    expect(ApiErrorCode.Timeout).toBe('TIMEOUT');
    expect(ApiErrorCode.RateLimit).toBe('RATE_LIMIT');
    expect(ApiErrorCode.ValidationError).toBe('VALIDATION_ERROR');
    expect(ApiErrorCode.InternalError).toBe('INTERNAL_ERROR');
    expect(ApiErrorCode.ConfigError).toBe('CONFIG_ERROR');
  });
});

describe('LogLevel', () => {
  it('exports log levels', () => {
    expect(LogLevel.Debug).toBe('debug');
    expect(LogLevel.Info).toBe('info');
    expect(LogLevel.Warn).toBe('warn');
    expect(LogLevel.Error).toBe('error');
  });
});

