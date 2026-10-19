import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em dev, o Vite (5173) repassa /api para o backend (dotnet run, porta 5244).
// No publish, o build vai para wwwroot e o próprio Kestrel serve a SPA (porta 4444).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5244' },
  },
  build: { outDir: 'dist', sourcemap: false },
});
