import { defineConfig } from 'vite';

// `base` controls the public path the app is served from:
//   - '/'         local dev & single-origin server (Render)
//   - '/croyal/'  GitHub Pages project site (set VITE_BASE in the Pages workflow)
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  server: {
    port: 5173,
    host: true,
    fs: { allow: ['..'] }, // allow importing the @croyal/shared workspace source
  },
  optimizeDeps: {
    exclude: ['@croyal/shared'], // processed as TS source, not pre-bundled
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
