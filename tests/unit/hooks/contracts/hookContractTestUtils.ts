/**
 * Hook Contract Test Utilities
 * 
 * These utilities help verify that hooks call MCP/Edge Functions
 * with the correct parameters - catching bugs like passing { role }
 * instead of { studentId }.
 * 
 * Per IgniteZero: This is NOT about mocking to hide failures.
 * This is about verifying contracts between layers.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Track all MCP method calls
export interface MCPCall {
  method: string;
  params: Record<string, unknown>;
  timestamp: number;
}

// Global call tracker
let mcpCalls: MCPCall[] = [];

/**
 * Reset call tracker between tests
 */
export function resetMCPCallTracker() {
  mcpCalls = [];
}

/**
 * Get all captured MCP calls
 */
export function getMCPCalls(): MCPCall[] {
  return [...mcpCalls];
}

/**
 * Get calls to a specific method
 */
export function getCallsTo(method: string): MCPCall[] {
  return mcpCalls.filter(c => c.method === method);
}

/**
 * Record an MCP call
 */
export function recordMCPCall(method: string, params: Record<string, unknown>) {
  mcpCalls.push({ method, params, timestamp: Date.now() });
}

/**
 * Create a mock useMCP that tracks all calls
 */
export function createTrackedMCPMock() {
  return {
    loading: false,
    
    // Generic call methods
    callGet: jest.fn((method: string, params: Record<string, unknown> = {}) => {
      recordMCPCall(method, params);
      return Promise.resolve({});
    }),
    
    callEdgeFunction: jest.fn((name: string, body: Record<string, unknown> = {}) => {
      recordMCPCall(`edge:${name}`, body);
      return Promise.resolve({});
    }),
    
    // Dashboard methods
    getStudentDashboard: jest.fn((studentId: string) => {
      recordMCPCall('getStudentDashboard', { studentId });
      return Promise.resolve({ assignments: [], performance: {}, recommendedCourses: [] });
    }),
    
    getParentDashboard: jest.fn((parentId?: string) => {
      recordMCPCall('getParentDashboard', { parentId });
      return Promise.resolve({ children: [], summary: {} });
    }),
    
    getTeacherDashboard: jest.fn(() => {
      recordMCPCall('getTeacherDashboard', {});
      return Promise.resolve({ classes: [], students: [], assignments: [] });
    }),
    
    // Student methods
    getStudentGoals: jest.fn((params: Record<string, unknown> = {}) => {
      recordMCPCall('getStudentGoals', params);
      return Promise.resolve({ goals: [] });
    }),
    
    getStudentTimeline: jest.fn((studentId?: string) => {
      recordMCPCall('getStudentTimeline', { studentId });
      return Promise.resolve({ events: [] });
    }),
    
    getStudentAchievements: jest.fn((studentId?: string) => {
      recordMCPCall('getStudentAchievements', { studentId });
      return Promise.resolve({ achievements: [] });
    }),
    
    getStudentAssignments: jest.fn((studentId: string) => {
      recordMCPCall('getStudentAssignments', { studentId });
      return Promise.resolve({ assignments: [] });
    }),
    
    // Parent methods
    getParentGoals: jest.fn((parentId?: string) => {
      recordMCPCall('getParentGoals', { parentId });
      return Promise.resolve({ goals: [] });
    }),
    
    getParentTimeline: jest.fn((parentId?: string) => {
      recordMCPCall('getParentTimeline', { parentId });
      return Promise.resolve({ events: [] });
    }),
    
    getParentTopics: jest.fn((parentId?: string) => {
      recordMCPCall('getParentTopics', { parentId });
      return Promise.resolve({ topics: [] });
    }),
    
    getParentSubjects: jest.fn((parentId?: string) => {
      recordMCPCall('getParentSubjects', { parentId });
      return Promise.resolve({ subjects: [] });
    }),
    
    getParentChildren: jest.fn((parentId?: string) => {
      recordMCPCall('getParentChildren', { parentId });
      return Promise.resolve({ children: [] });
    }),
    
    // Teacher methods
    listAssignmentsForTeacher: jest.fn(() => {
      recordMCPCall('listAssignmentsForTeacher', {});
      return Promise.resolve({ assignments: [] });
    }),
    
    listClasses: jest.fn(() => {
      recordMCPCall('listClasses', {});
      return Promise.resolve({ classes: [] });
    }),
    
    listOrgStudents: jest.fn(() => {
      recordMCPCall('listOrgStudents', {});
      return Promise.resolve({ students: [] });
    }),
    
    // Job methods
    listJobs: jest.fn((params: Record<string, unknown> = {}) => {
      recordMCPCall('listJobs', params);
      return Promise.resolve({ jobs: [], total: 0 });
    }),
    
    listCourseJobs: jest.fn((params: Record<string, unknown> = {}) => {
      recordMCPCall('listCourseJobs', params);
      return Promise.resolve({ ok: true, jobs: [], total: 0 });
    }),
    
    getJobStatus: jest.fn((jobId: string) => {
      recordMCPCall('getJobStatus', { jobId });
      return Promise.resolve({ status: 'pending' });
    }),
    
    getJobQuota: jest.fn(() => {
      recordMCPCall('getJobQuota', {});
      return Promise.resolve({ used: 0, limit: 100 });
    }),
    
    // Game methods
    startGameRound: jest.fn((params: Record<string, unknown>) => {
      recordMCPCall('startGameRound', params);
      return Promise.resolve({ roundId: 'mock-round', items: [] });
    }),
    
    logGameAttempt: jest.fn((params: Record<string, unknown>) => {
      recordMCPCall('logGameAttempt', params);
      return Promise.resolve({ ok: true });
    }),
    
    // Messaging methods
    listConversations: jest.fn((userId?: string) => {
      recordMCPCall('listConversations', { userId });
      return Promise.resolve({ conversations: [] });
    }),
    
    listMessages: jest.fn((conversationId: string) => {
      recordMCPCall('listMessages', { conversationId });
      return Promise.resolve({ messages: [] });
    }),
    
    sendMessage: jest.fn((params: Record<string, unknown>) => {
      recordMCPCall('sendMessage', params);
      return Promise.resolve({ ok: true, messageId: 'msg-1' });
    }),
    
    // Knowledge map
    getStudentSkills: jest.fn((params: Record<string, unknown> = {}) => {
      recordMCPCall('getStudentSkills', params);
      return Promise.resolve({ skills: [], totalCount: 0 });
    }),
    
    getDomainGrowth: jest.fn((studentId: string) => {
      recordMCPCall('getDomainGrowth', { studentId });
      return Promise.resolve([]);
    }),
    
    getClassKOSummary: jest.fn((params: Record<string, unknown> = {}) => {
      recordMCPCall('getClassKOSummary', params);
      return Promise.resolve([]);
    }),
    
    getAutoAssignSettings: jest.fn((studentId: string) => {
      recordMCPCall('getAutoAssignSettings', { studentId });
      return Promise.resolve(null);
    }),
    
    getRecommendedCourses: jest.fn((koId: string, studentId?: string, limit?: number) => {
      recordMCPCall('getRecommendedCourses', { koId, studentId, limit });
      return Promise.resolve([]);
    }),
    
    updateAutoAssignSettings: jest.fn((studentId: string, settings: Record<string, unknown>) => {
      recordMCPCall('updateAutoAssignSettings', { studentId, ...settings });
      return Promise.resolve({ ok: true });
    }),
    
    createAssignment: jest.fn((params: Record<string, unknown>) => {
      recordMCPCall('createAssignment', params);
      return Promise.resolve({ ok: true });
    }),
    
    updateMastery: jest.fn((params: Record<string, unknown>) => {
      recordMCPCall('updateMastery', params);
      return Promise.resolve({ ok: true });
    }),
    
    // Class management
    createClass: jest.fn((name: string, description?: string) => {
      recordMCPCall('createClass', { name, description });
      return Promise.resolve({ ok: true, classId: 'new-class-1' });
    }),
    
    addClassMember: jest.fn((classId: string, studentEmail: string) => {
      recordMCPCall('addClassMember', { classId, studentEmail });
      return Promise.resolve({ ok: true });
    }),
    
    removeClassMember: jest.fn((classId: string, studentId: string) => {
      recordMCPCall('removeClassMember', { classId, studentId });
      return Promise.resolve({ ok: true });
    }),
    
    generateClassCode: jest.fn((classId: string, refreshCode?: boolean) => {
      recordMCPCall('generateClassCode', { classId, refreshCode });
      return Promise.resolve({ code: 'ABC123' });
    }),
    
    joinClass: jest.fn((code: string) => {
      recordMCPCall('joinClass', { code });
      return Promise.resolve({ ok: true });
    }),
    
    createChildCode: jest.fn((studentId: string) => {
      recordMCPCall('createChildCode', { studentId });
      return Promise.resolve({ code: 'CHILD123' });
    }),
    
    linkChild: jest.fn((code: string) => {
      recordMCPCall('linkChild', { code });
      return Promise.resolve({ ok: true });
    }),
    
    // Job context methods
    getCourseJob: jest.fn((jobId: string, includeEvents?: boolean) => {
      recordMCPCall('getCourseJob', { jobId, includeEvents });
      return Promise.resolve({ ok: true, job: { id: jobId, status: 'pending' }, events: [] });
    }),
    
    getRecord: jest.fn((table: string, id: string) => {
      recordMCPCall('getRecord', { table, id });
      return Promise.resolve({ record: {} });
    }),
  };
}

/**
 * Create a wrapper with QueryClient for testing hooks
 */
export function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => 
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

/**
 * Assert that a method was called with specific params
 */
export function expectMethodCalledWith(method: string, expectedParams: Record<string, unknown>) {
  const calls = getCallsTo(method);
  expect(calls.length).toBeGreaterThan(0);
  
  const lastCall = calls[calls.length - 1];
  expect(lastCall.params).toMatchObject(expectedParams);
}

/**
 * Assert that a method was NOT called with specific params
 */
export function expectMethodNotCalledWith(method: string, forbiddenParams: Record<string, unknown>) {
  const calls = getCallsTo(method);
  
  for (const call of calls) {
    for (const [key, value] of Object.entries(forbiddenParams)) {
      if (call.params[key] === value) {
        throw new Error(
          `Method ${method} was called with forbidden param ${key}=${value}. ` +
          `Full params: ${JSON.stringify(call.params)}`
        );
      }
    }
  }
}

/**
 * Assert that studentId was passed (not role)
 */
export function expectStudentIdNotRole(method: string) {
  const calls = getCallsTo(method);
  expect(calls.length).toBeGreaterThan(0);
  
  const lastCall = calls[calls.length - 1];
  expect(lastCall.params).not.toHaveProperty('role');
  expect(lastCall.params).toHaveProperty('studentId');
  expect(lastCall.params.studentId).toBeTruthy();
}

/**
 * Assert that parentId was passed (not role)
 */
export function expectParentIdNotRole(method: string) {
  const calls = getCallsTo(method);
  expect(calls.length).toBeGreaterThan(0);
  
  const lastCall = calls[calls.length - 1];
  expect(lastCall.params).not.toHaveProperty('role');
  expect(lastCall.params).toHaveProperty('parentId');
}

