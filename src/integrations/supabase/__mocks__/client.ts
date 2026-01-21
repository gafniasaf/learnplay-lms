/**
 * Jest mock for @/integrations/supabase/client
 * 
 * This mock provides a minimal supabase client for testing without requiring
 * actual Supabase credentials or using import.meta.env.
 */

// Mock auth methods
const mockAuth = {
  getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
  getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
  signInWithPassword: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
  signOut: jest.fn().mockResolvedValue({ error: null }),
  onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
};

// Mock storage methods
const mockStorage = {
  from: jest.fn().mockReturnValue({
    download: jest.fn().mockResolvedValue({ data: null, error: null }),
    upload: jest.fn().mockResolvedValue({ data: null, error: null }),
    getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: '' } }),
  }),
};

// Mock database methods
const mockFrom = jest.fn().mockReturnValue({
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  then: jest.fn().mockResolvedValue({ data: [], error: null }),
});

// Mock RPC methods
const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });

// Mock supabase client
export const supabase = {
  auth: mockAuth,
  storage: mockStorage,
  from: mockFrom,
  rpc: mockRpc,
};

/**
 * Helper function to get the current user's access token
 */
export async function getAccessToken(): Promise<string | null> {
  return null;
}

// Export mocks for test assertions
export const __mocks__ = {
  auth: mockAuth,
  storage: mockStorage,
  from: mockFrom,
  rpc: mockRpc,
};
