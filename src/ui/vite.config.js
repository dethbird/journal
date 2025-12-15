import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Root is src/ui; output is served by Fastify from src/web/public
export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '../web/public'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
