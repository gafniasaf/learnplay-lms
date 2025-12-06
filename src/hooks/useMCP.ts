import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { JOB_MODES } from '@/lib/contracts';

// MCP Proxy settings (for local development only)
const MCP_BASE_URL = import.meta.env.VITE_MCP_BASE_URL || 'http://127.0.0.1:4000';
const MCP_TOKEN = import.meta.env.VITE_MCP_AUTH_TOKEN || 'dev-local-secret';

// Mock mode for E2E testing - returns demo data without network calls
const useMockMode = import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.VITE_USE_MOCK === '1';

// Determine if we should use MCP proxy (local) or Supabase Edge Functions (production)
// 
// Environment detection logic:
// 1. VITE_USE_MCP_PROXY=true → Use local MCP proxy (for local dev with MCP server running)
// 2. Otherwise → Use Supabase Edge Functions (production, Lovable, or local without MCP)
//
// This defaults to Edge Functions, which is the safer choice for deployed environments.
// Developers who want to use the local MCP proxy should set VITE_USE_MCP_PROXY=true
const useMCPProxy = import.meta.env.VITE_USE_MCP_PROXY === 'true' || import.meta.env.VITE_USE_MCP_PROXY === '1';
const isLocalDev = useMCPProxy;

// Mock data for E2E testing
const MOCK_DATA: Record<string, unknown> = {
  'learner-profile': {
    records: [{
      id: 'mock-1',
      fullName: 'Demo Student',
      currentMinutes: 45,
      weeklyGoalMinutes: 60,
      streakDays: 3,
      totalSessions: 12,
      averageAccuracy: 78,
    }],
  },
  'assignment': {
    records: [{
      id: 'mock-assign-1',
      title: 'Fractions Practice',
      subject: 'Mathematics',
      status: 'in_progress',
    }],
  },
  'course-blueprint': {
    records: [],
  },
  'message-thread': {
    records: [{
      id: 'thread-1',
      title: 'Math Help',
      participant_ids: ['user-1', 'teacher-1'],
      last_message: 'Thanks for the help!',
    }],
  },
  'job-ticket': {
    records: [],
  },
  'session-event': {
    records: [],
  },
  'goal-update': {
    records: [],
  },
};

interface MCPResponse<T = unknown> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

export function useMCP() {
  const [loading, setLoading] = useState(false);

  // Call Supabase Edge Function via the official client (for production/Lovable)
  const callEdgeFunction = async <T = unknown>(functionName: string, body: Record<string, unknown>): Promise<T> => {
    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body,
      });

      if (error) {
        console.error(`[MCP] Edge Function error (${functionName}):`, error);
        throw new Error(error.message || `Edge Function ${functionName} failed`);
      }

      return data as T;
    } catch (err) {
      // Log but don't crash - preview environment may have different CORS/security restrictions
      console.warn(`[MCP] Edge Function call failed (${functionName}):`, err);
      throw err;
    }
  };

  // Call MCP proxy (for local development only)
  const callMCP = async <T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    const response = await fetch(MCP_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MCP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: MCPResponse<T> = await response.json();
    
    if (data.error) {
      throw new Error(`MCP Error ${data.error.code}: ${data.error.message}`);
    }

    return data.result as T;
  };

  const enqueueJob = async (jobType: string, payload: Record<string, unknown> = {}) => {
    setLoading(true);
    try {
      // Mock mode for E2E testing
      if (useMockMode) {
        console.log('[MCP Mock] enqueueJob:', jobType, payload);
        return { ok: true, jobId: 'mock-job-id' };
      }

      if (isLocalDev) {
        return await callMCP('lms.enqueueJob', { jobType, payload });
      }

      // Check execution mode from manifest contract
      const mode = (JOB_MODES as Record<string, string | undefined>)[jobType];
      
      if (mode === 'synchronous') {
        // Bypass queue, call runner directly (Live Pipeline)
        return await callEdgeFunction('ai-job-runner', { jobType, payload });
      }

      // Default: Async queue (Factory Pipeline)
      return await callEdgeFunction('enqueue-job', { jobType, payload });
    } finally {
      setLoading(false);
    }
  };

  const saveRecord = async (entity: string, values: Record<string, unknown>) => {
    setLoading(true);
    try {
      // Mock mode for E2E testing
      if (useMockMode) {
        console.log('[MCP Mock] saveRecord:', entity, values);
        return { ok: true, id: values.id || 'mock-saved-id' };
      }

      if (isLocalDev) {
        return await callMCP('lms.saveRecord', { entity, values });
      }
      // Use Supabase Edge Function in production
      return await callEdgeFunction('save-record', { entity, values });
    } finally {
      setLoading(false);
    }
  };

  const getRecord = async (entity: string, id: string) => {
    setLoading(true);
    try {
      // Mock mode for E2E testing
      if (useMockMode) {
        console.log('[MCP Mock] getRecord:', entity, id);
        const mockRecords = MOCK_DATA[entity] as { records?: unknown[] } | undefined;
        return { record: mockRecords?.records?.[0] || null };
      }

      if (isLocalDev) {
        return await callMCP('lms.getRecord', { entity, id });
      }
      // Use Supabase Edge Function in production
      return await callEdgeFunction('get-record', { entity, id });
    } finally {
      setLoading(false);
    }
  };

  const listRecords = async (entity: string, limit = 20) => {
    setLoading(true);
    try {
      // Mock mode for E2E testing
      if (useMockMode) {
        console.log('[MCP Mock] listRecords:', entity, limit);
        return MOCK_DATA[entity] || { records: [] };
      }

      if (isLocalDev) {
        return await callMCP<{ ok: boolean, records: unknown[] }>('lms.listRecords', { entity, limit });
      }
      // Use Supabase Edge Function in production
      return await callEdgeFunction<{ ok: boolean, records: unknown[] }>('list-records', { entity, limit });
    } finally {
      setLoading(false);
    }
  };

  const listJobs = async (limit = 20) => {
    setLoading(true);
    try {
      // Mock mode for E2E testing
      if (useMockMode) {
        console.log('[MCP Mock] listJobs:', limit);
        return { jobs: [] };
      }

      if (isLocalDev) {
        return await callMCP<{ jobs: unknown[] }>('lms.listJobs', { limit });
      }
      // Use Supabase Edge Function in production
      return await callEdgeFunction<{ jobs: unknown[] }>('list-jobs', { limit });
    } finally {
      setLoading(false);
    }
  };

  // Generic call method
  const call = async <T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    setLoading(true);
    try {
      // Mock mode for E2E testing
      if (useMockMode) {
        console.log('[MCP Mock] call:', method, params);
        // Handle health check
        if (method === 'health' || method === 'lms.health') {
          return { ok: true, services: { database: true, mcp: true } } as T;
        }
        return { ok: true } as T;
      }

      if (isLocalDev) {
        return await callMCP<T>(method, params);
      }
      // Map MCP method names to Edge Function names
      const methodMap: Record<string, string> = {
        'lms.enqueueJob': 'enqueue-job',
        'lms.saveRecord': 'save-record',
        'lms.getRecord': 'get-record',
        'lms.listRecords': 'list-records',
        'lms.listJobs': 'list-jobs',
        'lms.getJob': 'get-job',
      };
      const functionName = methodMap[method] || method.replace('lms.', '').replace(/([A-Z])/g, '-$1').toLowerCase();
      return await callEdgeFunction<T>(functionName, params);
    } finally {
      setLoading(false);
    }
  };

  return { call, enqueueJob, saveRecord, getRecord, listJobs, listRecords, loading };
}
