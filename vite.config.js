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

          if (pathname === '/api/facebook/pages') {
            handlerModule = await import('./api/facebook/pages.js');
          } else if (pathname === '/api/facebook/select-page') {
            handlerModule = await import('./api/facebook/select-page.js');
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
            // Parse body if POST/PUT
            if (req.method === 'POST' || req.method === 'PUT') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  req.body = body ? JSON.parse(body) : {};
                } catch (e) {
                  req.body = {};
                }

                // Add express-like helpers for serverless handler compatibility
                res.status = (code) => {
                  res.statusCode = code;
                  return res;
                };
                res.json = (data) => {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                };

                await handlerModule.default(req, res);
              });
            } else {
              req.query = Object.fromEntries(url.searchParams.entries());
              res.status = (code) => {
                res.statusCode = code;
                return res;
              };
              res.json = (data) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              };

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
