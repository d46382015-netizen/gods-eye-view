import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import * as WorldStateModule from '../src/cyvx/world-state/store.js';
import * as FusionModule from '../src/cyvx/fusion/engine.js';
import * as AnomalyModule from '../src/cyvx/anomaly/engine.js';

import { UnifiedIntelligenceGraph } from '../src/cyvx/intelligence/graph.js';

const pickClass = (module, patterns) => {
  for (const pattern of patterns) {
    const found = Object.entries(module)
      .find(([name, value]) =>
        typeof value === 'function' &&
        pattern.test(name),
      );

    if (found) return found[1];
  }

  return null;
};

const WorldStateStore = pickClass(
  WorldStateModule,
  [/WorldStateStore/i],
);

const FusionEngine = pickClass(
  FusionModule,
  [/IntelligenceFusionEngine/i, /^FusionEngine$/i],
);

const AnomalyEngine = pickClass(
  AnomalyModule,
  [/AnomalyEngine/i],
);

if (!WorldStateStore) {
  throw new Error(
    `Could not find WorldStateStore. Exports: ${Object.keys(WorldStateModule).join(', ')}`,
  );
}

if (!FusionEngine) {
  throw new Error(
    `Could not find Fusion Engine. Exports: ${Object.keys(FusionModule).join(', ')}`,
  );
}

if (!AnomalyEngine) {
  throw new Error(
    `Could not find Anomaly Engine. Exports: ${Object.keys(AnomalyModule).join(', ')}`,
  );
}

const port = Number(
  process.env.CYVX_INTELLIGENCE_PORT || 8790,
);

const dataDir = resolve(
  process.env.CYVX_DATA_DIR || './data/cyvx',
);

await mkdir(dataDir, { recursive: true });

const store = await new WorldStateStore(
  resolve(dataDir, 'world-state.json'),
).load();

const fusion = new FusionEngine({ store });
const anomaly = new AnomalyEngine({ store });

const graph = new UnifiedIntelligenceGraph({
  store,
  fusion,
  anomaly,
});

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type':
      'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods':
      'GET,POST,OPTIONS',
    'access-control-allow-headers':
      'content-type',
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
        'access-control-allow-methods':
          'GET,POST,OPTIONS',
        'access-control-allow-headers':
          'content-type',
      });

      return res.end();
    }

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/cyvx/intelligence/health'
    ) {
      return json(res, 200, {
        status: 'ok',
        service: 'unified-intelligence-graph',
        worldState: store.stats(),
        fusion:
          typeof fusion.stats === 'function'
            ? fusion.stats()
            : { status: 'ok' },
        anomaly:
          typeof anomaly.stats === 'function'
            ? anomaly.stats()
            : { status: 'ok' },
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/cyvx/intelligence/overview'
    ) {
      return json(res, 200, graph.overview());
    }

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/cyvx/intelligence/search'
    ) {
      return json(res, 200, {
        results: graph.search(
          url.searchParams.get('q') || '',
          {
            type:
              url.searchParams.get('type') ||
              undefined,
            source:
              url.searchParams.get('source') ||
              undefined,
            limit:
              url.searchParams.get('limit') || 100,
          },
        ),
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/cyvx/intelligence/nearby'
    ) {
      const latitude =
        url.searchParams.get('latitude');

      const longitude =
        url.searchParams.get('longitude');

      if (latitude === null ||
          longitude === null) {
        return json(res, 400, {
          error:
            'latitude and longitude are required',
        });
      }

      return json(res, 200, {
        results: graph.nearby(
          latitude,
          longitude,
          {
            radiusKm:
              url.searchParams.get('radiusKm') || 50,
            type:
              url.searchParams.get('type') ||
              undefined,
            source:
              url.searchParams.get('source') ||
              undefined,
            limit:
              url.searchParams.get('limit') || 100,
          },
        ),
      });
    }

    const prefix =
      '/api/cyvx/intelligence/entity/';

    if (
      req.method === 'GET' &&
      url.pathname.startsWith(prefix)
    ) {
      const remainder =
        url.pathname.slice(prefix.length);

      if (remainder.endsWith('/timeline')) {
        const id = decodeURIComponent(
          remainder.slice(0, -'/timeline'.length),
        );

        const timeline = graph.timeline(id, {
          limit:
            url.searchParams.get('limit') || 500,
        });

        if (!timeline) {
          return json(res, 404, {
            error: 'Entity not found',
          });
        }

        return json(res, 200, {
          entityId: id,
          timeline,
        });
      }

      const id = decodeURIComponent(remainder);
      const result = graph.entity(id);

      if (!result) {
        return json(res, 404, {
          error: 'Entity not found',
        });
      }

      return json(res, 200, result);
    }

    return json(res, 404, {
      error: 'Not found',
    });
  } catch (error) {
    console.error(
      `[CYVX][intelligence] ${error.stack || error}`,
    );

    return json(res, 400, {
      error: error.message || 'Request failed',
    });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.info(
    `[CYVX][intelligence] listening on http://127.0.0.1:${port}`,
  );
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
