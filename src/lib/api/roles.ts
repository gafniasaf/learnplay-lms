/**
 * Role Management API
 * 
 * Helper functions for checking user roles in multi-tenant system
 * IgniteZero Compliant: Uses Edge Function instead of direct DB calls
 */

import { callEdgeFunctionGet, shouldUseMockData } from './common';

export type UserRole = 'superadmin' | 'org_admin' | 'editor' | 'viewer';

export interface UserRoleRecord {
  user_id: string;
  organization_id: string | null;
  role: UserRole;
}

interface GetUserRolesResponse {
  roles: UserRoleRecord[];
}

// Cache for user roles to avoid repeated API calls
let cachedRoles: UserRoleRecord[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60_000; // 1 minute cache

/**
 * Get all roles for current user
 * Uses Edge Function per IgniteZero MCP-First rules
 */
export async function getUserRoles(): Promise<UserRoleRecord[]> {
  // Return cached roles if still valid
  if (cachedRoles && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRoles;
  }

  if (shouldUseMockData()) {
    console.log('[Roles API] Using mock data');
    // Return mock roles for testing
    return [{
      user_id: 'mock-user',
      organization_id: 'mock-org',
      role: 'editor',
    }];
  }

  try {
    console.log('[Roles API] Fetching user roles via Edge Function');
    const response = await callEdgeFunctionGet<GetUserRolesResponse>('get-user-roles');
    
    cachedRoles = (response.roles ?? []).map(r => ({
      user_id: r.user_id,
      organization_id: r.organization_id,
      role: r.role as UserRole,
    }));
    cacheTimestamp = Date.now();

    console.log('[Roles API] Fetched roles:', cachedRoles);
    return cachedRoles;
  } catch (error) {
    console.error('[Roles API] Error fetching user roles:', error);
    // Clear cache on error
    cachedRoles = null;
    return [];
  }
}

/**
 * Clear the roles cache (useful after role changes)
 */
export function clearRolesCache(): void {
  cachedRoles = null;
  cacheTimestamp = 0;
}

/**
 * Check if current user is superadmin
 */
export async function isSuperadmin(): Promise<boolean> {
  const roles = await getUserRoles();
  return roles.some(r => r.role === 'superadmin' && r.organization_id === null);
}

/**
 * Check if current user has specific role in specific org
 */
export async function hasOrgRole(
  organizationId: string,
  requiredRole: UserRole
): Promise<boolean> {
  const roles = await getUserRoles();
  return roles.some(
    r => r.organization_id === organizationId && r.role === requiredRole
  );
}

/**
 * Check if current user has any of the specified roles in any org
 */
export async function hasAnyRole(requiredRoles: UserRole[]): Promise<boolean> {
  const roles = await getUserRoles();
  return roles.some(r => requiredRoles.includes(r.role));
}

/**
 * Check if user is admin (org_admin or superadmin)
 */
export async function isAdmin(): Promise<boolean> {
  const roles = await getUserRoles();
  return roles.some(
    r => r.role === 'superadmin' || r.role === 'org_admin'
  );
}

/**
 * Get user's organization ID (first one if multiple)
 */
export async function getUserOrganizationId(): Promise<string | null> {
  const roles = await getUserRoles();
  const orgRole = roles.find(r => r.organization_id !== null);
  return orgRole?.organization_id || null;
}
