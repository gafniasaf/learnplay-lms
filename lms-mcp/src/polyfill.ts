// Polyfill for Deno environment in Node.js
// This allows sharing code between Supabase Edge Functions and Local Node Runner

if (!globalThis.Deno) {
  globalThis.Deno = {
    env: {
      get: (key: string) => process.env[key],
      toObject: () => process.env,
    },
  };
}


