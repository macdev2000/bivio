import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Configurazione pensata per Tauri: porta fissa e percorsi relativi.
export default defineConfig({
  base: './',
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version) },
  build: {
    target: ['es2020', 'safari14', 'chrome100'],
    chunkSizeWarningLimit: 4000,
    sourcemap: false,
  },
});
