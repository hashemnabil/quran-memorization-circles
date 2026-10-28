import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import { productionCsp } from './src/lib/security-csp';
import react from '@vitejs/plugin-react';
import path from 'path';
import { existsSync, readFileSync } from 'node:fs';
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
  define: {
    'import.meta.env.VITE_ANDROID_FCM_CONFIGURED': JSON.stringify(
      process.env.VITE_ANDROID_FCM_CONFIGURED === 'true' || existsSync(path.resolve(__dirname, 'android/app/google-services.json')) ? 'true' : 'false',
    ),
    'import.meta.env.VITE_SITE_URL': JSON.stringify((process.env.VITE_SITE_URL || 'https://quran-frontend-sknr.onrender.com').replace(/\/$/, '')),
  },
  plugins: [react(), {
    name: 'production-content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
      const siteUrl = (env.VITE_SITE_URL || 'https://quran-frontend-sknr.onrender.com').replace(/\/$/, '');
      return {
        html: html.replace(/__SITE_URL__/g, siteUrl),
        tags: [
          { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: productionCsp(env.VITE_API_URL, env.VITE_SOCKET_URL) }, injectTo: 'head-prepend' as const },
          { tag: 'link', attrs: { rel: 'canonical', href: `${siteUrl}/` } },
          { tag: 'meta', attrs: { property: 'og:url', content: `${siteUrl}/` } },
        ],
      };
    },
  }, {
    name: 'complete-offline-shell',
    generateBundle(_options, bundle) {
      const template = readFileSync(path.resolve(__dirname, 'src/service-worker.template.js'), 'utf8');
      const assets = Object.keys(bundle).filter((name) => /\.(?:js|css|woff2)$/.test(name)).sort().map((name) => `/${name}`);
      const digest = createHash('sha256').update(template).update(JSON.stringify(assets)).digest('hex').slice(0, 20);
      const worker = template.replace('__SHELL_CACHE_NAME__', `quran-circles-shell-${digest}`)
        .replace('__PRECACHE_ASSETS__', JSON.stringify([...assets, '/theme-init.js', '/favicon.svg', '/manifest.webmanifest', '/brand-logo.png', '/icons/icon-192.png', '/icons/icon-512.png', '/onboarding/quran-mosque.jpg', '/onboarding/quran-study.jpg', '/onboarding/quran-detail.jpg', '/sounds/calm.wav', '/sounds/electronic.wav', '/sounds/clear.wav', '/sounds/school.wav', '/sounds/soft.wav', '/sounds/bright.wav', '/sounds/pulse.wav']));
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source: worker });
      const siteUrl = (process.env.VITE_SITE_URL || 'https://quran-frontend-sknr.onrender.com').replace(/\/$/, '');
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n` });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl}/</loc></url><url><loc>${siteUrl}/about</loc></url><url><loc>${siteUrl}/privacy</loc></url></urlset>\n` });
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
