import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_BASE_URL = 'http://192.1.66.117:8000';

export default defineConfig({
  plugins: [react()],
  
  define: {
    'process.env': {},
    'import.meta.env.API_BASE_URL': JSON.stringify(API_BASE_URL)
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
      
      '/auth': {
        target: API_BASE_URL,
        changeOrigin: true,
        secure: false,
      },
      
      '/contacts': {
        target: API_BASE_URL,
        changeOrigin: true,
        secure: false,
        ws: true
      },
      
      '/check-username': {
        target: API_BASE_URL,
        changeOrigin: true,
        secure: false
      },

      '/request_list': {
        target: API_BASE_URL,
        changeOrigin: true,
        secure: false,
        ws: true
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