/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// GitHub Pages serves the game from https://<user>.github.io/retro-padel/
export default defineConfig({
  base: '/retro-padel/',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Phaser in its own file so the browser can cache it between updates.
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
