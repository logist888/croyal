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
  // NOTE: Phaser's build-time feature flags (PLUGIN_3D, WEBGL_DEBUG, …) are not
  // usable here — the npm package resolves to the prebuilt `dist/phaser.esm.js`,
  // which has those branches already baked out. Defining them is a no-op.
  build: {
    target: 'es2022',
    outDir: 'dist',
    // Phaser is only reachable through the lazily-imported battle/boss/replay
    // screens; pinning it to its own chunk keeps it out of the entry bundle and
    // lets it be cached across app deploys.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
});
