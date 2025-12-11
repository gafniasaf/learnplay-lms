/**
 * Jest mock for useMCP hook
 * This file is auto-loaded by Jest for any imports of '@/hooks/useMCP'
 */

export const useMCP = jest.fn(() => ({
  // Core MCP methods
  call: jest.fn(),
  getRecord: jest.fn(),
  saveRecord: jest.fn(),
  enqueueJob: jest.fn(),
  getJobStatus: jest.fn(),
  
  // Game session methods
  startGameRound: jest.fn(),
  logGameAttempt: jest.fn(),
  
  // Course methods
  getCourse: jest.fn(),
  saveCourse: jest.fn(),
  listCourses: jest.fn(),
  
  // Job methods
  listJobs: jest.fn(),
  getJob: jest.fn(),
  
  // Loading state
  loading: false,
}));

