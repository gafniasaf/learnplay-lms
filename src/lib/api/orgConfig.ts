/**
 * Client-side wrapper for org-config Edge Function
 * Uses MCP proxy to route through Edge Functions
 */

import { supabase } from '@/integrations/supabase/client';
import { callEdgeFunctionGet } from '@/lib/api/common';

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
  // Friendly guard: require an authenticated session so we don't fire the function with anon key
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    throw new Error('NOT_AUTHENTICATED');
  }

  const params: Record<string, string> = {};
  if (options?.organizationId) params.organizationId = options.organizationId;
  if (options?.slug) params.slug = options.slug;

  // Use MCP proxy (routes through Edge Function with auth)
  const data = await callEdgeFunctionGet<OrgConfig>('org-config', params);
  
  if (!data) {
    throw new Error('Failed to fetch org config: No data returned');
  }

  return data;
}

