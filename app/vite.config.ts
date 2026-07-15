import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// IIFE output + no `type="module"` so the bundle runs reliably inside Domo's
// custom-app iframe (some instances reject ESM module scripts).
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'no-module-type',
      transformIndexHtml: {
        order: 'post',
        handler: (html) =>
          html
            .replace(/ type="module"/g, '')
            .replace(/ crossorigin/g, '')
            .replace(/<script src=/g, '<script defer src='),
      },
    },
  ],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});
