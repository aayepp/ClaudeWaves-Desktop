import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import type { IncomingMessage, ServerResponse } from 'node:http';

const require = createRequire(import.meta.url);
const { handleApiRequest } = require('./electron/ytmusic.cjs') as {
  handleApiRequest: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
};

function claudeWavesApiPlugin(): Plugin {
  return {
    name: 'claudewaves-ytmusic-api',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!(req.url ?? '').startsWith('/api/')) return next();
        try {
          const handled = await handleApiRequest(req, res);
          if (!handled) next();
        } catch (err) {
          const message = err instanceof Error ? err.message : 'API error';
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: message }));
          } else if (!res.writableEnded) {
            res.end();
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), claudeWavesApiPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/release/**', '**/src-tauri/target/**'],
    },
  },
});
