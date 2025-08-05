  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';
  import path from 'path';

  const API_BASE_URL = 'http://192.1.66.117:8000';

  export default defineConfig({
    plugins: [react()],
    
    define: {
      'process.env': {},
      'import.meta.env.API_BASE_URL': JSON.stringify(API_BASE_URL)
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@models': path.resolve(__dirname, './src/models'),
      },
    },
    
    server: {
      proxy: {
        '/api': {
          target: API_BASE_URL,
          changeOrigin: true,
          secure: false,
          rewrite: path => path.replace(/^\/api/, ''),
          headers: {
            'X-Proxy': 'Vite-Dev-Server'
          }
        },
        '/api/chat/ws': {
          target: API_BASE_URL,
          changeOrigin: true,
          secure: false,
          ws: true // Явно разрешаем WebSocket upgrade для этого пути
        },
        '/auth': {
          target: API_BASE_URL,
          changeOrigin: true,
          secure: false,
        },        
        '/check-username': {
          target: API_BASE_URL,
          changeOrigin: true,
          secure: false
        },
      },
      
      host: true,
      port: 3000,
      open: true,
      strictPort: true,
      cors: true
    },
    
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true,
      minify: 'terser',
      chunkSizeWarningLimit: 100
    }
  });
