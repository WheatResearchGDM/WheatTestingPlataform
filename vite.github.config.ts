import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'github-pages',
  base: '/WheatTestingPlataform/',
  publicDir: '../public',
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: 'next/dynamic',
        replacement: fileURLToPath(new URL('./github-pages/next-dynamic.tsx', import.meta.url)),
      },
      {
        find: '@',
        replacement: fileURLToPath(new URL('./', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: '../dist/github-pages',
    emptyOutDir: true,
    target: 'es2022',
  },
});
