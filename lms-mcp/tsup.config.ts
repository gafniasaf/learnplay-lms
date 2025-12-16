import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/handlers/**/*.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node18', // Target Node 18+ as per env
  outDir: 'dist',
  sourcemap: true,
  splitting: false,
  bundle: true,
  external: ['@supabase/supabase-js', 'dotenv'], // dependencies
});
