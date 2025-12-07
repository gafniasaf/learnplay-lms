/**
 * Pipeline Log Formatter Tests
 */

import {
  formatLogEntry,
  getLogType,
  getLogIcon,
  getLogColor,
} from '@/lib/pipeline/logFormatter';

describe('formatLogEntry', () => {
  it('formats log entry with message', () => {
    const event = {
      created_at: '2025-01-15T10:30:00Z',
      status: 'info',
      step: 'generating',
      message: 'Generating course content',
    };

    const result = formatLogEntry(event);

    expect(result.timestamp).toBeTruthy();
    expect(result.message).toBe('Generating course content');
    expect(result.type).toBe('info');
    expect(result.icon).toBe('📊');
    expect(result.color).toBe('text-gray-400');
  });

  it('formats log entry without message', () => {
    const event = {
      created_at: '2025-01-15T10:30:00Z',
      status: 'done',
      step: 'validating',
    };

    const result = formatLogEntry(event);

    expect(result.message).toBe('validating: done');
    expect(result.type).toBe('success');
  });

  it('handles error status', () => {
    const event = {
      created_at: '2025-01-15T10:30:00Z',
      status: 'error',
      message: 'Validation failed',
    };

    const result = formatLogEntry(event);

    expect(result.type).toBe('error');
    expect(result.icon).toBe('🔴');
    expect(result.color).toBe('text-red-400');
  });

  it('handles progress field', () => {
    const event = {
      created_at: '2025-01-15T10:30:00Z',
      status: 'processing',
      progress: 50,
      message: 'Processing items',
    };

    const result = formatLogEntry(event);

    expect(result.message).toBe('Processing items');
  });
});

describe('getLogType', () => {
  it('returns error for error status', () => {
    expect(getLogType('error')).toBe('error');
    expect(getLogType('failed')).toBe('error');
    expect(getLogType('ERROR')).toBe('error');
  });

  it('returns warning for warn status', () => {
    expect(getLogType('warn')).toBe('warning');
    expect(getLogType('warning')).toBe('warning');
  });

  it('returns repair for repair status', () => {
    expect(getLogType('repair')).toBe('repair');
    expect(getLogType('repairing')).toBe('repair');
  });

  it('returns ai for ai/generate status', () => {
    expect(getLogType('ai')).toBe('ai');
    expect(getLogType('generating')).toBe('ai');
    expect(getLogType('generate')).toBe('ai');
  });

  it('returns success for done/complete status', () => {
    expect(getLogType('done')).toBe('success');
    expect(getLogType('complete')).toBe('success');
  });

  it('returns info for default status', () => {
    expect(getLogType('info')).toBe('info');
    expect(getLogType('processing')).toBe('info');
    expect(getLogType('unknown')).toBe('info');
  });
});

describe('getLogIcon', () => {
  it('returns correct icons for each type', () => {
    expect(getLogIcon('success')).toBe('✅');
    expect(getLogIcon('error')).toBe('🔴');
    expect(getLogIcon('warning')).toBe('⚠️');
    expect(getLogIcon('ai')).toBe('🤖');
    expect(getLogIcon('repair')).toBe('🔧');
    expect(getLogIcon('info')).toBe('📊');
  });
});

describe('getLogColor', () => {
  it('returns correct colors for each type', () => {
    expect(getLogColor('success')).toBe('text-green-400');
    expect(getLogColor('error')).toBe('text-red-400');
    expect(getLogColor('warning')).toBe('text-yellow-400');
    expect(getLogColor('ai')).toBe('text-blue-400');
    expect(getLogColor('repair')).toBe('text-orange-400');
    expect(getLogColor('info')).toBe('text-gray-400');
  });
});

