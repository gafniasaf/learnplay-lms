// supabase/functions/_shared/types.ts
// Shared type definitions for edge functions

/**
 * Standard Supabase error shape
 */
export interface SupabaseError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

/**
 * Generic Supabase RPC response
 */
export interface RpcResponse<T> {
  data: T | null;
  error: SupabaseError | null;
}

/**
 * Join class RPC result
 */
export interface JoinClassResult {
  class_id: string;
  class_name: string;
  org_id: string;
  already_member: boolean;
}


