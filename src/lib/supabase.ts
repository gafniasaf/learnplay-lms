import { supabase } from "@/integrations/supabase/client";

let currentAccessToken: string | null = null;

/**
 * Initialize authentication by checking for existing session
 * No longer creates anonymous sessions - users authenticate normally
 */
export async function initAuth(): Promise<void> {
  try {
    // Check for existing session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.access_token) {
      console.log("[Auth] Existing session found:", session.user.id);
      currentAccessToken = session.access_token;
    } else {
      console.log("[Auth] No session found - user needs to sign in");
    }
  } catch (err) {
    console.error("[Auth] Error during auth initialization:", err);
  }
}

/**
 * Ensure a valid session exists by checking current session
 * Attempts to refresh the token if it exists but might be stale
 * @returns Access token or null if no valid session
 */
export async function ensureSession(): Promise<string | null> {
  try {
    // Check for existing session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.access_token) {
      // Try to refresh the token to get updated metadata
      // This will get a new token if the current one is close to expiring
      const { data: refreshData } = await supabase.auth.refreshSession();
      if (refreshData?.session?.access_token) {
        console.log("[Auth] Session refreshed:", refreshData.session.user.id);
        currentAccessToken = refreshData.session.access_token;
        return refreshData.session.access_token;
      }
      
      console.log("[Auth] Valid session exists:", session.user.id);
      currentAccessToken = session.access_token;
      return session.access_token;
    }

    console.log("[Auth] No valid session - user needs to authenticate");
    return null;
  } catch (err) {
    console.error("[Auth] Error ensuring session:", err);
    return null;
  }
}

/**
 * Get the current access token for authenticated requests
 * Returns cached token or fetches fresh session if needed
 */
export async function getAccessToken(): Promise<string | null> {
  // Return cached token if available
  if (currentAccessToken) {
    return currentAccessToken;
  }

  // Fetch fresh session
  const { data: { session } } = await supabase.auth.getSession();
  currentAccessToken = session?.access_token || null;
  
  return currentAccessToken;
}

/**
 * Listen for auth state changes and update cached token
 */
supabase.auth.onAuthStateChange((_event, session) => {
  currentAccessToken = session?.access_token || null;
});
