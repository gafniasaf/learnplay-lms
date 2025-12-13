/**
 * Auto-login hook for Lovable preview environments.
 * 
 * When running in Lovable preview (*.lovable.app), this hook will automatically
 * sign in with test credentials if no session exists. This provides a seamless
 * development experience without requiring manual login each time.
 * 
 * SECURITY: This only runs in Lovable preview environments and uses
 * a dedicated test account. It does NOT run in production.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Test credentials for Lovable preview auto-login
const LOVABLE_TEST_EMAIL = 'test-admin@learnplay.dev';
const LOVABLE_TEST_PASSWORD = 'TestAdmin123!';

function isLovablePreview(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return (
    hostname.includes('lovable.app') ||
    hostname.includes('lovableproject.com') ||
    hostname.includes('lovable.dev')
  );
}

export function useLovableAutoLogin() {
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);
  const [autoLoginComplete, setAutoLoginComplete] = useState(false);
  const [autoLoginError, setAutoLoginError] = useState<string | null>(null);

  useEffect(() => {
    // Only run in Lovable preview
    if (!isLovablePreview()) {
      setAutoLoginComplete(true);
      return;
    }

    const attemptAutoLogin = async () => {
      try {
        // Check if already logged in
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          console.log('[LovableAutoLogin] Already logged in as:', session.user.email);
          setAutoLoginComplete(true);
          return;
        }

        // No session - attempt auto-login
        console.log('[LovableAutoLogin] No session found, attempting auto-login...');
        setIsAutoLoggingIn(true);

        const { data, error } = await supabase.auth.signInWithPassword({
          email: LOVABLE_TEST_EMAIL,
          password: LOVABLE_TEST_PASSWORD,
        });

        if (error) {
          console.error('[LovableAutoLogin] Auto-login failed:', error.message);
          setAutoLoginError(error.message);
          setAutoLoginComplete(true);
          return;
        }

        if (data.session) {
          console.log('[LovableAutoLogin] ✅ Auto-login successful!');
          console.log('[LovableAutoLogin] User:', data.user?.email);
          console.log('[LovableAutoLogin] Org ID:', data.user?.user_metadata?.organization_id);
          
          // Force a page reload to ensure all components pick up the new session
          // This is a simple way to ensure React Query caches are refreshed
          window.location.reload();
        }
      } catch (err) {
        console.error('[LovableAutoLogin] Unexpected error:', err);
        setAutoLoginError(err instanceof Error ? err.message : 'Unknown error');
        setAutoLoginComplete(true);
      } finally {
        setIsAutoLoggingIn(false);
      }
    };

    attemptAutoLogin();
  }, []);

  return { isAutoLoggingIn, autoLoginComplete, autoLoginError };
}

