/**
 * Role Management API
 * 
 * Helper functions for checking user roles in multi-tenant system
 */

import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'superadmin' | 'org_admin' | 'editor' | 'viewer';

export interface UserRoleRecord {
  user_id: string;
  organization_id: string | null;
  role: UserRole;
}

/**
 * Get all roles for current user
 */
export async function getUserRoles(): Promise<UserRoleRecord[]> {
  const { data: { user } } = await supabase.auth.getUser();
  
  console.log('[Roles API] Current user:', user?.id);
  
  if (!user) {
    console.log('[Roles API] No user logged in');
    return [];
  }

  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id, organization_id, role')
    .eq('user_id', user.id);

  console.log('[Roles API] Query result:', { data, error });

  if (error) {
    console.error('[Roles API] Error fetching user roles:', error);
    return [];
  }

  const roleRecords: UserRoleRecord[] = (data || []).map(d => ({
    user_id: d.user_id,
    organization_id: d.organization_id,
    role: d.role as UserRole,
  }));

  console.log('[Roles API] Parsed roles:', roleRecords);

  return roleRecords;
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

