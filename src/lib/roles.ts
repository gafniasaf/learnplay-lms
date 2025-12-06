/**
 * Centralized role detection and override system
 * 
 * Priority order:
 * 1. Live mode + profile role from database (via useAuth or get-dashboard)
 * 2. URL param role=X (when dev enabled) → persist to localStorage
 * 3. localStorage.role if set
 * 4. Default 'student'
 */

import { isLiveMode, isDevEnabled } from "./env";

export type Role = 'student' | 'teacher' | 'parent' | 'school' | 'admin';

const STORAGE_KEY = 'role';
const ROLE_CHANGED_EVENT = 'role:changed';

// Session memory for role from live backend (not persisted)
let liveRoleCache: Role | null = null;

/**
 * Check URL parameters once on module load for role override (dev mode only)
 * Persists to localStorage if found
 */
function checkUrlRoleOnBoot(): void {
  if (typeof window === 'undefined') return;
  
  // Only allow URL overrides in dev mode
  if (!isDevEnabled()) return;

  const params = new URLSearchParams(window.location.search);
  const roleParam = params.get('role');

  if (roleParam && isValidRole(roleParam)) {
    const role = roleParam as Role;
    localStorage.setItem(STORAGE_KEY, role);
    console.info(`[Roles] Dev override: role=${role} (from URL at boot)`);
    
    // Dispatch event to notify listeners
    window.dispatchEvent(new CustomEvent(ROLE_CHANGED_EVENT, { detail: role }));
  }
}

// Run URL check once on module load
checkUrlRoleOnBoot();

/**
 * Validate if a string is a valid Role
 */
function isValidRole(value: string): value is Role {
  return ['student', 'teacher', 'parent', 'school', 'admin'].includes(value);
}

/**
 * Get the current user role
 * 
 * Priority order:
 * 1. Dev override (localStorage) - only if dev mode enabled
 * 2. Live mode + cached live role (from useAuth/getDashboard)
 * 3. Default 'student'
 * 
 * @returns Current user role
 */
export function getRole(): Role {
  // 1. Dev mode: check localStorage for dev override
  if (isDevEnabled()) {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isValidRole(stored)) {
        return stored as Role;
      }
    }
  }

  // 2. Live mode: prefer cached live role from backend
  if (isLiveMode() && liveRoleCache) {
    return liveRoleCache;
  }

  // 3. Default to student
  return 'student';
}

/**
 * Set the current role (persists to localStorage and notifies listeners)
 * 
 * @param role - Role to set
 */
export function setRole(role: Role): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(STORAGE_KEY, role);
  
  // Dispatch custom event for listeners
  window.dispatchEvent(new CustomEvent(ROLE_CHANGED_EVENT, { detail: role }));
  
  console.info(`[Roles] Role set to: ${role}`);
}

/**
 * Set the live role from backend (session memory only, not persisted)
 * This takes priority in live mode unless a dev override exists
 * Dispatches role:changed event to notify listeners
 * 
 * @param role - Role from backend
 */
export function setLiveRole(role: Role | null): void {
  liveRoleCache = role;
  
  if (role) {
    console.info(`[Roles] Live role cached: ${role}`);
    
    // Dispatch event to notify listeners (only if no dev override)
    if (typeof window !== 'undefined' && !isDevEnabled()) {
      window.dispatchEvent(new CustomEvent(ROLE_CHANGED_EVENT, { detail: role }));
    }
  }
}

/**
 * Clear live role cache (used when user logs out)
 */
export function clearLiveRole(): void {
  liveRoleCache = null;
  console.info('[Roles] Live role cache cleared');
}

/**
 * Listen for role changes
 * 
 * @param fn - Callback function to be called when role changes
 * @returns Cleanup function to remove listeners
 */
export function onRoleChange(fn: (role: Role) => void): () => void {
  // Handle custom role:changed event
  const handleRoleChanged = (e: Event) => {
    const customEvent = e as CustomEvent<Role>;
    fn(customEvent.detail);
  };

  // Handle storage event (for cross-tab synchronization)
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      fn(getRole());
    }
  };

  window.addEventListener(ROLE_CHANGED_EVENT, handleRoleChanged);
  window.addEventListener('storage', handleStorage);

  // Return cleanup function
  return () => {
    window.removeEventListener(ROLE_CHANGED_EVENT, handleRoleChanged);
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Clear role override (resets to default behavior)
 */
export function clearRoleOverride(): void {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem(STORAGE_KEY);
  clearLiveRole();
  
  window.dispatchEvent(new CustomEvent(ROLE_CHANGED_EVENT, { detail: getRole() }));
  
  console.info('[Roles] Role override cleared');
}
