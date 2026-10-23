import { defineConfig } from 'vite';

// Configurazione pensata per Tauri: porta fissa e percorsi relativi.
export default defineConfig({
  base: './',
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2020', 'safari14', 'chrome100'],
    chunkSizeWarningLimit: 4000,
    sourcemap: false,
  },
});
