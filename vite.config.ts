import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

// `/debug` redirige a `/debug/` (la página vive en debug/index.html).
// Así la URL funciona igual en desarrollo, en `vite preview` y en un hosting estático.
const redirectDebugSlash = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  const [path, query] = (req.url ?? '').split('?');
  if (path === '/debug') {
    res.statusCode = 302;
    res.setHeader('Location', query ? `/debug/?${query}` : '/debug/');
    res.end();
    return;
  }
  next();
};

const debugRedirectPlugin = (): Plugin => ({
  name: 'redirect-debug-slash',
  configureServer(server) {
    server.middlewares.use(redirectDebugSlash);
  },
  configurePreviewServer(server) {
    server.middlewares.use(redirectDebugSlash);
  },
});

export default defineConfig({
  // Subruta de publicación. GitHub Pages la pasa en BASE_PATH ('/the-museum-of-stars/', ver .github/workflows/pages.yml);
  // en local es la raíz.
  base: process.env.BASE_PATH ?? '/',
  plugins: [debugRedirectPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        debug: fileURLToPath(new URL('./debug/index.html', import.meta.url)),
      },
    },
  },
});
