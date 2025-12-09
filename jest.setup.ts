// Only load jest-dom in Jest environment
if (typeof jest !== 'undefined') {
  // @ts-ignore - dynamic import for Jest only
  require('@testing-library/jest-dom');
  
  // Load learnplay.env for Jest tests
  try {
    const { loadLearnPlayEnv } = require('./tests/helpers/parse-learnplay-env.cjs');
    loadLearnPlayEnv();
  } catch {
    // Ignore if helper not available
  }
}

// Mock import.meta for Jest environment
if (typeof (global as any).import === 'undefined') {
  (global as any).import = { meta: { env: {} } };
}

// Set up environment variables for tests
(global as any).import.meta.env = {
  VITE_USE_MOCK: process.env.VITE_USE_MOCK || 'true',
  VITE_FORCE_SAME_ORIGIN_PREVIEW: process.env.VITE_FORCE_SAME_ORIGIN_PREVIEW || 'false',
  VITE_ENABLE_DEV: process.env.VITE_ENABLE_DEV || 'false',
  VITE_EMBED_ALLOWED_ORIGINS: process.env.VITE_EMBED_ALLOWED_ORIGINS || '',
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  VITE_SENTRY_DSN: process.env.VITE_SENTRY_DSN || '',
};

// Reduce noisy logs during tests while preserving real errors
const origWarn = console.warn;
const origInfo = console.info;
const origLog = console.log;

console.warn = (...args: any[]) => {
  const msg = args.map(String).join(' ');
  // React Router future flag deprecation noise
  if (msg.includes('React Router Future Flag Warning')) return;
  // Recharts sizing warnings in jsdom
  if (msg.includes('The width(0) and height(0) of chart should be greater than 0')) return;
  origWarn(...args);
};

console.info = (...args: any[]) => {
  const msg = args.map(String).join(' ');
  // OfflineQueue spam can be noisy; allow failures/warnings/errors to pass via console.error
  if (msg.startsWith('[OfflineQueue]')) return;
  origInfo(...args);
};

console.log = (...args: any[]) => {
  const msg = args.map(String).join(' ');
  // CORS helper debug logs from edge function stubs
  if (msg.startsWith('[stdHeaders]')) return;
  origLog(...args);
};

