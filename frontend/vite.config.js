import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development every /api call is forwarded to the FastAPI server (port 8000 unless API_TARGET is set).
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': { target: process.env.API_TARGET || 'http://localhost:8000', changeOrigin: true },
    },
  },
});
