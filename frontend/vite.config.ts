import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const BACKEND = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000';

/**
 * A client that navigates away mid-request makes http-proxy emit an unhandled
 * `ECONNRESET`, which would take the whole dev server down. Swallow it.
 */
function proxy(options: ProxyOptions = {}): ProxyOptions {
  return {
    target: BACKEND,
    changeOrigin: true,
    ...options,
    configure: (proxyServer) => {
      proxyServer.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code !== 'ECONNRESET') {
          console.warn('[proxy]', err.message);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), {
    name: 'complete-offline-shell',
    generateBundle(_options, bundle) {
      const template = readFileSync(path.resolve(__dirname, 'src/service-worker.template.js'), 'utf8');
      const assets = Object.keys(bundle).filter((name) => /\.(?:js|css)$/.test(name)).sort().map((name) => `/${name}`);
      const digest = createHash('sha256').update(template).update(JSON.stringify(assets)).digest('hex').slice(0, 20);
      const worker = template.replace('__SHELL_CACHE_NAME__', `quran-circles-shell-${digest}`)
        .replace('__PRECACHE_ASSETS__', JSON.stringify([...assets, '/favicon.svg']));
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source: worker });
    },
  }],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    // Keeps the dev origin identical to the app origin, so no CORS in development.
    proxy: {
      '/api': proxy(),
      '/uploads': proxy(),
      '/socket.io': proxy({ ws: true }),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Charts and the socket client are heavy and rarely change; keeping them
        // in separate chunks lets the browser cache them across deployments.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          data: ['@tanstack/react-query', 'axios', 'socket.io-client'],
        },
      },
    },
  },
});
