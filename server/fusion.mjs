import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WorldStateStore } from '../src/cyvx/world-state/store.js';
import { IntelligenceFusionEngine } from '../src/cyvx/fusion/engine.js';

const port = Number(process.env.CYVX_FUSION_PORT || 8788);
const dataDir = resolve(process.env.CYVX_DATA_DIR || './data/cyvx');

await mkdir(dataDir, { recursive: true });

const store = await new WorldStateStore(
  resolve(dataDir, 'world-state.json'),
).load();

const engine = new IntelligenceFusionEngine({
  store,
  maxDistanceKm: Number(process.env.CYVX_FUSION_DISTANCE_KM || 50),
  maxTimeSeconds: Number(process.env.CYVX_FUSION_TIME_SECONDS || 900),
  minimumScore: Number(process.env.CYVX_FUSION_MIN_SCORE || 0.25),
});

function json(res, status, payload) {
  const body = JSON.stringify(payload);

  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });

  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url,
      `http://${req.headers.host || 'localhost'}`,
    );

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
      });

      return res.end();
    }

    if (req.method === 'GET' && url.pathname === '/api/cyvx/fusion/health') {
      return json(res, 200, engine.stats());
    }

    if (req.method === 'GET' && url.pathname === '/api/cyvx/fusion/findings') {
      return json(res, 200, {
        findings: engine.listFindings({
          minimumConfidence: url.searchParams.get('minConfidence') || 0,
          status: url.searchParams.get('status') || 'active',
          limit: url.searchParams.get('limit') || 500,
        }),
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname.startsWith('/api/cyvx/fusion/findings/')
    ) {
      const id = decodeURIComponent(
        url.pathname.slice('/api/cyvx/fusion/findings/'.length),
      );

      const finding = engine.getFinding(id);

      if (!finding) {
        return json(res, 404, { error: 'Finding not found' });
      }

      return json(res, 200, finding);
    }

    if (req.method === 'POST' && url.pathname === '/api/cyvx/fusion/run') {
      const findings = await engine.run();

      return json(res, 200, {
        count: findings.length,
        findings,
      });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(
      `[CYVX][fusion] request failure: ${error.stack || error}`,
    );

    return json(res, 400, {
      error: error.message || 'Request failed',
    });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.info(
    `[CYVX][fusion] listening on http://127.0.0.1:${port}`,
  );
});

const shutdown = () => {
  console.info('[CYVX][fusion] shutting down');
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
