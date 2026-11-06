// vite.config.mjs — front-end React (pasta frontend/).
//   npm run dev     -> servidor de desenvolvimento em http://localhost:5173
//                      (as chamadas /api vão para o Express do backend em http://localhost:3000)
//   npm run build   -> gera frontend/dist, que o Express do backend entrega em produção
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
