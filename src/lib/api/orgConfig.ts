/**
 * Client-side wrapper for org-config Edge Function
 * Uses MCP proxy to route through Edge Functions
 */

import { supabase } from '@/integrations/supabase/client';
import { callEdgeFunctionGet } from '@/lib/api/common';
import { isDevAgentMode } from '@/lib/api/common';

export interface OrgConfig {
  organization: {
    id: string;
    name: string;
    slug: string;
    branding: {
      logoUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      typography?: {
        fontFamily?: string;
      };
    };
  };
  tagTypes: Array<{
    key: string;
    label: string;
    isEnabled: boolean;
    displayOrder: number;
    tags: Array<{
      id: string;
      value: string;
      slug: string;
    }>;
  }>;
  variantConfig: {
    difficulty: {
      levels: Array<{ id: string; label: string; order: number }>;
      default: string;
      exposeToUsers: boolean;
    };
  };
}

export async function getOrgConfig(options?: {
  organizationId?: string;
  slug?: string;
}): Promise<OrgConfig> {
  // Friendly guard: require an authenticated session unless dev-agent mode is enabled.
  // In Lovable preview, dev-agent mode may be used specifically because sessions are unreliable in iframes.
  if (!isDevAgentMode()) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      throw new Error('NOT_AUTHENTICATED');
    }
  }

  const params: Record<string, string> = {};
  if (options?.organizationId) params.organizationId = options.organizationId;
  if (options?.slug) params.slug = options.slug;

  // Use Edge Function (auth headers are handled by callEdgeFunctionGet, including dev-agent headers)
  const data = await callEdgeFunctionGet<any>('get-org-config', params);
  
  if (!data) {
    throw new Error('Failed to fetch org config: No data returned');
  }

  if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
    const err = (data as any).error;
    const code = typeof err?.code === 'string' ? err.code : 'org_config_failed';
    const message =
      code === 'unauthorized'
        ? 'NOT_AUTHENTICATED'
        : (typeof err?.message === 'string' ? err.message : 'Failed to load organization config');
    throw new Error(message);
  }

  return data as OrgConfig;
}

