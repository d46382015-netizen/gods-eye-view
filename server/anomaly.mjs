import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WorldStateStore } from '../src/cyvx/world-state/store.js';
import { AnomalyEngine } from '../src/cyvx/anomaly/engine.js';

const port = Number(process.env.CYVX_ANOMALY_PORT || 8789);
const dataDir = resolve(
  process.env.CYVX_DATA_DIR || './data/cyvx',
);

await mkdir(dataDir, { recursive: true });

const store = await new WorldStateStore(
  resolve(dataDir, 'world-state.json'),
).load();

const engine = new AnomalyEngine({
  store,
  thresholds: {
    rapidMovementKmPerHour:
      Number(process.env.CYVX_RAPID_MOVEMENT_KMH || 900),

    rapidAltitudeChangePerMinute:
      Number(process.env.CYVX_RAPID_ALTITUDE_PER_MINUTE || 3000),

    observationGapMinutes:
      Number(process.env.CYVX_OBSERVATION_GAP_MINUTES || 30),

    lowConfidence:
      Number(process.env.CYVX_LOW_CONFIDENCE || 0.35),
  },
});

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });

  res.end(JSON.stringify(payload));
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

    if (
      req.method === 'GET' &&
      url.pathname === '/api/cyvx/anomaly/health'
    ) {
      return json(res, 200, engine.stats());
    }

    if (
      req.method === 'GET' &&
      url.pathname === '/api/cyvx/anomaly/findings'
    ) {
      return json(res, 200, {
        findings: engine.listFindings({
          severity:
            url.searchParams.get('severity') || undefined,
          type:
            url.searchParams.get('type') || undefined,
          entityId:
            url.searchParams.get('entityId') || undefined,
          limit:
            url.searchParams.get('limit') || 500,
        }),
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname.startsWith('/api/cyvx/anomaly/findings/')
    ) {
      const id = decodeURIComponent(
        url.pathname.slice(
          '/api/cyvx/anomaly/findings/'.length,
        ),
      );

      const finding = engine.getFinding(id);

      if (!finding) {
        return json(res, 404, {
          error: 'Anomaly finding not found',
        });
      }

      return json(res, 200, finding);
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/cyvx/anomaly/run'
    ) {
      const findings = await engine.run();

      return json(res, 200, {
        count: findings.length,
        findings,
      });
    }

    return json(res, 404, {
      error: 'Not found',
    });
  } catch (error) {
    console.error(
      `[CYVX][anomaly] request failure: ${error.stack || error}`,
    );

    return json(res, 400, {
      error: error.message || 'Request failed',
    });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.info(
    `[CYVX][anomaly] listening on http://127.0.0.1:${port}`,
  );
});

const shutdown = () => {
  console.info('[CYVX][anomaly] shutting down');
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
