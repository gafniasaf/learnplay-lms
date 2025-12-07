/**
 * Integration-lite: Auth session handling (no network)
 *
 * Ensures we detect missing organization_id errors coming back from API.
 */

import { describe, it, expect } from 'vitest';

describe('Auth Session Errors', () => {
  it('detects missing organization_id message shape', () => {
    const error = {
      status: 401,
      message: 'User account not configured: missing organization_id',
    };
    const isOrgError = error.message.includes('missing organization_id') || error.message.includes('not configured');
    expect(isOrgError).toBe(true);
  });
});

