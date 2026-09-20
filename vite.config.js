import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: 'index.html', send: 'send.html' },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
