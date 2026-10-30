import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // .env belongs exclusively to the backend. Do not load environment files in Vite.
  envDir: false,
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    fs: { deny: ['**/.env', '**/.env.*', '**/*.env', '**/*.{crt,pem}', '**/.git/**'] },
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
