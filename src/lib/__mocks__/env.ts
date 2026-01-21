/**
 * Jest mock for @/lib/env
 * 
 * This mock provides all exported functions from env.ts without using import.meta.env
 * which Jest cannot parse.
 */

export function isLiveMode(): boolean {
  return true;
}

export function getApiMode(): 'mock' | 'live' {
  return 'live';
}

export function forceSameOriginPreview(): boolean {
  return false;
}

export function clearModeOverride(): void {
  return;
}

export function isDevEnabled(): boolean {
  return false;
}

export function setDevEnabled(_enabled: boolean): void {
  return;
}

export function onDevChange(_fn: (enabled: boolean) => void): () => void {
  return () => {};
}

export function getEmbedAllowedOrigins(): string[] {
  return [];
}

export function validateEnv(): void {
  return;
}
