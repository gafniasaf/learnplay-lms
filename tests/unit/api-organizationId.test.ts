/**
 * Tests for organization ID extraction and validation
 */

// Mock the API common module BEFORE imports
const mockCallEdgeFunctionGet = jest.fn();

jest.mock('@/lib/api/common', () => ({
  callEdgeFunctionGet: (...args: any[]) => mockCallEdgeFunctionGet(...args),
}));

describe('getUserOrganizationId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear module cache to reset mocks
    jest.resetModules();
  });

  it('returns organization_id from first role with org', async () => {
    // Reset module cache to clear internal cache
    jest.resetModules();
    const { getUserOrganizationId: freshGetUserOrganizationId } = await import('@/lib/api/roles');
    
    mockCallEdgeFunctionGet.mockResolvedValue({
      roles: [
        { user_id: 'user-1', organization_id: null, role: 'viewer' },
        { user_id: 'user-1', organization_id: 'org-123', role: 'editor' },
        { user_id: 'user-1', organization_id: 'org-456', role: 'admin' },
      ],
    });

    const orgId = await freshGetUserOrganizationId();
    expect(orgId).toBe('org-123');
  });

  it('returns null when no roles have organization_id', async () => {
    jest.resetModules();
    const { getUserOrganizationId: freshGetUserOrganizationId } = await import('@/lib/api/roles');
    
    mockCallEdgeFunctionGet.mockResolvedValue({
      roles: [
        { user_id: 'user-1', organization_id: null, role: 'viewer' },
        { user_id: 'user-1', organization_id: null, role: 'editor' },
      ],
    });

    const orgId = await freshGetUserOrganizationId();
    expect(orgId).toBeNull();
  });

  it('returns null when roles array is empty', async () => {
    jest.resetModules();
    const { getUserOrganizationId: freshGetUserOrganizationId } = await import('@/lib/api/roles');
    
    mockCallEdgeFunctionGet.mockResolvedValue({
      roles: [],
    });

    const orgId = await freshGetUserOrganizationId();
    expect(orgId).toBeNull();
  });

  it('handles API errors gracefully', async () => {
    jest.resetModules();
    const { getUserOrganizationId: freshGetUserOrganizationId } = await import('@/lib/api/roles');
    
    mockCallEdgeFunctionGet.mockRejectedValue(new Error('API error'));

    // Fail loudly: do not swallow backend errors.
    await expect(freshGetUserOrganizationId()).rejects.toThrow('API error');
  });

  it('uses cached roles when available', async () => {
    // Clear module cache to reset internal cache
    jest.resetModules();
    const { getUserOrganizationId: freshGetUserOrganizationId } = await import('@/lib/api/roles');
    
    // First call
    mockCallEdgeFunctionGet.mockResolvedValue({
      roles: [{ user_id: 'user-1', organization_id: 'org-123', role: 'editor' }],
    });

    const orgId1 = await freshGetUserOrganizationId();
    expect(orgId1).toBe('org-123');
    expect(mockCallEdgeFunctionGet).toHaveBeenCalledTimes(1);

    // Second call within cache TTL should use cache (not call API again)
    const orgId2 = await freshGetUserOrganizationId();
    expect(orgId2).toBe('org-123');
    // Cache is used, so still only called once
    expect(mockCallEdgeFunctionGet).toHaveBeenCalledTimes(1);
  });
});

describe('getUserRoles', () => {
  it('calls Edge Function in live mode', async () => {
    jest.resetModules();
    mockCallEdgeFunctionGet.mockResolvedValue({
      roles: [{ user_id: 'user-1', organization_id: 'org-123', role: 'admin' }],
    });
    
    const { getUserRoles: freshGetUserRoles } = await import('@/lib/api/roles');

    const roles = await freshGetUserRoles();
    expect(roles).toEqual([
      { user_id: 'user-1', organization_id: 'org-123', role: 'admin' },
    ]);
    expect(mockCallEdgeFunctionGet).toHaveBeenCalledWith('get-user-roles');
  });
});

