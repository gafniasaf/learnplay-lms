/**
 * Client-side wrapper for org-config Edge Function
 */

import { supabase } from '@/integrations/supabase/client';

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

  const payload: Record<string, string | undefined> = {
    organizationId: options?.organizationId,
    slug: options?.slug,
  };

  // Use POST so the client automatically attaches the user's JWT
  const { data, error } = await supabase.functions.invoke('org-config', {
    body: payload,
  });

  if (error) {
    throw new Error(`Failed to fetch org config: ${error.message}`);
  }

  return data as OrgConfig;
}

