import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Always inject env values so Playwright/web builds can flip them
  // Note: These MUST be explicitly defined for Vite to bake them into the build
  const bypassAuthFlag =
    process.env.VITE_BYPASS_AUTH ??
    (process.env.SKIP_VERIFY ? 'true' : '');
  
  // Mock mode for E2E testing - allows running tests without network dependencies
  // VITE_USE_MOCK='false' explicitly enables live mode; VITE_USE_MOCK='true' or '1' enables mock mode
  const useMockValue = process.env.VITE_USE_MOCK;
  let useMockResult: string;
  if (useMockValue === 'false') {
    useMockResult = 'false'; // Explicit live mode
  } else if (useMockValue === 'true' || useMockValue === '1') {
    useMockResult = 'true'; // Explicit mock mode
  } else {
    useMockResult = ''; // Undefined, let runtime decide
  }
  
  const define = {
    'import.meta.env.VITE_BYPASS_AUTH': JSON.stringify(bypassAuthFlag),
    'import.meta.env.VITE_USE_MOCK': JSON.stringify(useMockResult),
  };

  return {
    server: {
      host: "::",
      port: 8080,
    },
    preview: {
      host: "::",
      port: 8080,
    },
    appType: "spa", // ensures SPA fallback for preview deep links
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define,
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined,
          // Force cache bust with a unique hash each build
          entryFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
          chunkFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
          assetFileNames: `assets/[name]-[hash]-${Date.now()}.[ext]`
        },
      },
      chunkSizeWarningLimit: 1000,
      minify: 'esbuild',
      target: 'es2015',
    },
    optimizeDeps: {
      // Pre-bundle commonly used dependencies
      include: ['react', 'react-dom', 'react-router-dom'],
    },
  };
});
