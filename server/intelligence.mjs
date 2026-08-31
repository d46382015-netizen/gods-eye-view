import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import * as WorldState from '../src/cyvx/world-state/store.js';
import * as Fusion from '../src/cyvx/fusion/engine.js';
import * as Anomaly from '../src/cyvx/anomaly/engine.js';

import {
  UnifiedIntelligenceGraph
} from '../src/cyvx/intelligence/graph.js';

const findExport = (module, names) => {
  for (const name of names) {
    if (typeof module[name] === 'function') {
      return module[name];
    }
  }

  throw new Error(
    `Missing expected export: ${names.join(', ')}. ` +
    `Available: ${Object.keys(module).join(', ')}`
  );
};

const WorldStateStore = findExport(
  WorldState,
  ['WorldStateStore']
);

const FusionEngine = findExport(
  Fusion,
  ['IntelligenceFusionEngine', 'FusionEngine']
);

const AnomalyEngine = findExport(
  Anomaly,
  ['AnomalyEngine']
);

const port = Number(
  process.env.CYVX_INTELLIGENCE_PORT || 8790
);

const dataDir = resolve(
  process.env.CYVX_DATA_DIR || './data/cyvx'
);

await mkdir(dataDir, { recursive: true });

const store = await new WorldStateStore(
  resolve(dataDir, 'world-state.json')
).load();

const fusion = new FusionEngine({ store });
const anomaly = new AnomalyEngine({ store });

const graph = new UnifiedIntelligenceGraph({
  store,
  fusion,
  anomaly
});

function send(res, status, payload) {
  res.writeHead(status, {
    'content-type':
      'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods':
      'GET,POST,OPTIONS',
    'access-control-allow-headers':
      'content-type'
  });

  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url,
      `http://${req.headers.host || '127.0.0.1'}`
    );

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods':
          'GET,POST,OPTIONS',
        'access-control-allow-headers':
          'content-type'
      });

      return res.end();
    }

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/cyvx/intelligence/health'
    ) {
      return send(res, 200, {
        status: 'ok',
        service: 'unified-intelligence-graph',
        worldState: store.stats(),
        fusion:
          typeof fusion.stats === 'function'
            ? fusion.stats()
            : {},
        anomaly:
          typeof anomaly.stats === 'function'
            ? anomaly.stats()
            : {}
      });
    }

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/cyvx/intelligence/overview'
    ) {
      return send(res, 200, graph.overview());
    }

    if (
      req.method === 'GET' &&
      url.pathname ===
        '/api/cyvx/intelligence/search'
    ) {
      return send(res, 200, {
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
              url.searchParams.get('limit') || 100
          }
        )
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
        return send(res, 400, {
          error:
            'latitude and longitude are required'
        });
      }

      return send(res, 200, {
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
              url.searchParams.get('limit') || 100
          }
        )
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
          remainder.slice(
            0,
            -'/timeline'.length
          )
        );

        const timeline =
          graph.timeline(id, {
            limit:
              url.searchParams.get('limit') || 500
          });

        if (!timeline) {
          return send(res, 404, {
            error: 'Entity not found'
          });
        }

        return send(res, 200, {
          entityId: id,
          timeline
        });
      }

      const id = decodeURIComponent(remainder);
      const result = graph.entity(id);

      if (!result) {
        return send(res, 404, {
          error: 'Entity not found'
        });
      }

      return send(res, 200, result);
    }

    return send(res, 404, {
      error: 'Not found'
    });
  } catch (error) {
    console.error(
      `[CYVX][intelligence] ${error.stack || error}`
    );

    return send(res, 500, {
      error: error.message || 'Internal error'
    });
  }
});

server.listen(
  port,
  '127.0.0.1',
  () => {
    console.log(
      `[CYVX][intelligence] listening on 127.0.0.1:${port}`
    );
  }
);

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
