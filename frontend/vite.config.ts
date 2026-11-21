import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Vercel serves only static files: a relative API base would send every call to the SPA and
  // fail silently, so a Vercel build must be pointed at the absolute API URL.
  if (process.env.VERCEL && mode === 'production' && !/^https:\/\/.+\/api$/.test(env.VITE_API_BASE ?? '')) {
    throw new Error(
      'VITE_API_BASE must be the absolute HTTPS API URL ending in /api, e.g. https://examguard-api.onrender.com/api',
    );
  }
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
            query: ['@tanstack/react-query'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      // Playwright owns e2e/ and cannot be collected by Vitest.
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
      // MUI + jsdom renders take a few seconds each on slower CI machines.
      testTimeout: 20000,
      hookTimeout: 20000,
    },
  };
});
