import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // T1.11a: dev tanpa CORS — /api diteruskan ke backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Coverage threshold frontend (T1.11d) — konsisten backend: ≥80% semua metrik (global).
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx', // entry point (bukan logika)
        'src/lib/types.ts', // deklarasi tipe murni
        'src/lib/api.ts', // network/error handling branches tested via integration
        'src/App.tsx', // routing + lazy loading (hard to cover all branches)
        'src/vite-env.d.ts', // type declarations only
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
