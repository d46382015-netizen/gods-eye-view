import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as WorldState from '../src/cyvx/world-state/store.js';
import * as Fusion from '../src/cyvx/fusion/engine.js';
import * as Anomaly from '../src/cyvx/anomaly/engine.js';

import {
  UnifiedIntelligenceGraph
} from '../src/cyvx/intelligence/graph.js';

const pick = (module, names) => {
  for (const name of names) {
    if (typeof module[name] === 'function') {
      return module[name];
    }
  }

  throw new Error(
    `Missing export: ${names.join(', ')}`
  );
};

const WorldStateStore =
  pick(WorldState, ['WorldStateStore']);

const FusionEngine =
  pick(Fusion, [
    'IntelligenceFusionEngine',
    'FusionEngine'
  ]);

const AnomalyEngine =
  pick(Anomaly, ['AnomalyEngine']);

const dir = await mkdtemp(
  join(tmpdir(), 'cyvx-intelligence-')
);

const store = await new WorldStateStore(
  join(dir, 'world-state.json')
).load();

const first = await store.ingest({
  type: 'aircraft',
  source: 'test',
  sourceId: 'GRAPH-A',
  observedAt: '2026-08-31T12:00:00.000Z',
  latitude: 44,
  longitude: -92,
  altitude: 10000,
  confidence: 0.95,
  attributes: {
    callsign: 'CYVX-A'
  }
});

await store.ingest({
  type: 'camera',
  source: 'test',
  sourceId: 'GRAPH-C',
  observedAt: '2026-08-31T12:05:00.000Z',
  latitude: 44.01,
  longitude: -92.01,
  confidence: 0.9
});

const fusion =
  new FusionEngine({ store });

const anomaly =
  new AnomalyEngine({ store });

if (typeof fusion.run === 'function') {
  await fusion.run();
}

if (typeof anomaly.run === 'function') {
  await anomaly.run();
}

const graph =
  new UnifiedIntelligenceGraph({
    store,
    fusion,
    anomaly
  });

const entity =
  graph.entity(first.entity.id);

assert.ok(entity);
assert.equal(
  entity.entity.id,
  first.entity.id
);
assert.ok(Array.isArray(entity.trajectory));
assert.ok(Array.isArray(entity.events));
assert.ok(Array.isArray(entity.relationships));
assert.ok(Array.isArray(entity.fusionFindings));
assert.ok(Array.isArray(entity.anomalies));

const search =
  graph.search('GRAPH-A');

assert.equal(search.length, 1);
assert.equal(
  search[0].id,
  first.entity.id
);

const nearby =
  graph.nearby(44, -92, {
    radiusKm: 50
  });

assert.ok(nearby.length >= 2);
assert.equal(
  nearby[0].id,
  first.entity.id
);

const timeline =
  graph.timeline(first.entity.id);

assert.ok(Array.isArray(timeline));
assert.ok(timeline.length >= 1);

const overview =
  graph.overview();

assert.equal(overview.status, 'ok');
assert.equal(overview.entities, 2);
assert.equal(overview.sources, 1);

console.log(
  'CYVX UNIFIED INTELLIGENCE GRAPH TESTS: PASS'
);
