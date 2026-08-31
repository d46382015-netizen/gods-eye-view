import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WorldStateStore } from '../src/cyvx/world-state/store.js';

const port = Number(process.env.CYVX_WORLD_STATE_PORT || 8787);
const dataDir = resolve(process.env.CYVX_DATA_DIR || './data/cyvx');
await mkdir(dataDir, { recursive: true });

const store = await new WorldStateStore(
  resolve(dataDir, 'world-state.json'),
).load();

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      return res.end();
    }

    if (req.method === 'GET' && url.pathname === '/api/cyvx/health') {
      return json(res, 200, store.stats());
    }

    if (req.method === 'GET' && url.pathname === '/api/cyvx/entities') {
      return json(res, 200, {
        entities: store.listEntities({
          type: url.searchParams.get('type') || undefined,
          source: url.searchParams.get('source') || undefined,
          limit: url.searchParams.get('limit') || 500,
        }),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/cyvx/events') {
      return json(res, 200, {
        events: store.listEvents({
          entityId: url.searchParams.get('entityId') || undefined,
          type: url.searchParams.get('type') || undefined,
          since: url.searchParams.get('since') || undefined,
          until: url.searchParams.get('until') || undefined,
          limit: url.searchParams.get('limit') || 500,
        }),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/cyvx/observations') {
      return json(res, 200, {
        observations: store.listObservations({
          entityId: url.searchParams.get('entityId') || undefined,
          source: url.searchParams.get('source') || undefined,
          since: url.searchParams.get('since') || undefined,
          until: url.searchParams.get('until') || undefined,
          limit: url.searchParams.get('limit') || 500,
        }),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/cyvx/timeline') {
      return json(res, 200, {
        timeline: store.timeline({
          entityId: url.searchParams.get('entityId') || undefined,
          type: url.searchParams.get('type') || undefined,
          since: url.searchParams.get('since') || undefined,
          until: url.searchParams.get('until') || undefined,
          limit: url.searchParams.get('limit') || 1000,
        }),
      });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/cyvx/entities/')) {
      const entityId = decodeURIComponent(
        url.pathname.slice('/api/cyvx/entities/'.length),
      );

      return json(res, 200, store.entityHistory(entityId, {
        since: url.searchParams.get('since') || undefined,
        until: url.searchParams.get('until') || undefined,
        limit: url.searchParams.get('limit') || 5000,
      }));
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/cyvx/trajectory/')) {
      const entityId = decodeURIComponent(
        url.pathname.slice('/api/cyvx/trajectory/'.length),
      );

      return json(res, 200, {
        entityId,
        trajectory: store.trajectory(entityId, {
          since: url.searchParams.get('since') || undefined,
          until: url.searchParams.get('until') || undefined,
          limit: url.searchParams.get('limit') || 5000,
        }),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/cyvx/ingest') {
      const input = await readBody(req);
      const result = await store.ingest(input);
      return json(res, 201, result);
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(`[CYVX][world-state] request failure: ${error.stack || error}`);
    return json(res, 400, {
      error: error.message || 'Request failed',
    });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.info(`[CYVX][world-state] listening on http://127.0.0.1:${port}`);
});

const shutdown = async (signal) => {
  console.info(`[CYVX][world-state] ${signal}; shutting down`);
  await store.persist();
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
