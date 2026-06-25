import { defineConfig } from 'vite';

export default defineConfig({
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
