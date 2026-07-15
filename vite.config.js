import { defineConfig } from 'vite';

export default defineConfig({
  // Tauri loads the production build through a custom local protocol, so
  // production assets must be addressed relative to index.html.
  base: './',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
