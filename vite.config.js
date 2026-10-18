import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Vite dev server middleware to run /api serverless functions locally
function apiDevServerPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost:5173');
        const pathname = url.pathname;

        try {
          let handlerModule = null;

          if (pathname === '/api/facebook/upload-video') {
            handlerModule = await import('./api/facebook/upload-video.js');
          } else if (pathname === '/api/youtube/upload-video') {
            handlerModule = await import('./api/youtube/upload-video.js');
          } else if (pathname === '/api/youtube/token') {
            handlerModule = await import('./api/youtube/token.js');
          } else if (pathname === '/api/facebook/pages') {
            handlerModule = await import('./api/facebook/pages.js');
          } else if (pathname === '/api/facebook/select-page') {
            handlerModule = await import('./api/facebook/select-page.js');
          } else if (pathname === '/api/facebook/upload-token') {
            handlerModule = await import('./api/facebook/upload-token.js');
          } else if (pathname === '/api/facebook/status') {
            handlerModule = await import('./api/facebook/status.js');
          } else if (pathname === '/api/facebook/publish') {
            handlerModule = await import('./api/facebook/publish.js');
          } else if (pathname === '/api/queue') {
            handlerModule = await import('./api/queue.js');
          } else if (pathname === '/api/cron') {
            handlerModule = await import('./api/cron.js');
          }

          if (handlerModule && handlerModule.default) {
            req.query = Object.fromEntries(url.searchParams.entries());
            res.status = (code) => {
              res.statusCode = code;
              return res;
            };
            res.json = (data) => {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            };

            if (pathname.includes('/upload-video')) {
              // Binary buffer accumulation for video files
              const chunks = [];
              req.on('data', chunk => { chunks.push(chunk); });
              req.on('end', async () => {
                req.rawBuffer = Buffer.concat(chunks);
                await handlerModule.default(req, res);
              });
            } else if (req.method === 'POST' || req.method === 'PUT') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  req.body = body ? JSON.parse(body) : {};
                } catch (e) {
                  req.body = {};
                }
                await handlerModule.default(req, res);
              });
            } else {
              await handlerModule.default(req, res);
            }
            return;
          }
        } catch (err) {
          console.error('[API Dev Server] Handler error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err.message }));
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [apiDevServerPlugin()],
  server: {
    port: 5173
  }
});
