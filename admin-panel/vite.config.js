import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The panel is served from /admin in production (Express static). During dev,
// /api is proxied to the Express server on :3000 so cookies + auth work.
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
