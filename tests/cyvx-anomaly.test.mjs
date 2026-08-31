import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStateStore } from '../src/cyvx/world-state/store.js';
import { AnomalyEngine } from '../src/cyvx/anomaly/engine.js';

const dir = await mkdtemp(join(tmpdir(), 'cyvx-anomaly-'));
const file = join(dir, 'world-state.json');

const store = await new WorldStateStore(file).load();

const t1 = '2026-08-31T12:00:00.000Z';
const t2 = '2026-08-31T12:01:00.000Z';

await store.ingest({
  type: 'aircraft',
  source: 'source-a',
  sourceId: 'ANOM001',
  observedAt: t1,
  latitude: 44,
  longitude: -92,
  altitude: 10000,
  confidence: 0.95,
});

await store.ingest({
  type: 'aircraft',
  source: 'source-a',
  sourceId: 'ANOM001',
  observedAt: t2,
  latitude: 50,
  longitude: -92,
  altitude: 15000,
  confidence: 0.2,
});

const entity = store.listEntities()[0];

const engine = new AnomalyEngine({
  store,
  thresholds: {
    rapidMovementKmPerHour: 900,
    rapidAltitudeChangePerMinute: 3000,
    observationGapMinutes: 30,
    lowConfidence: 0.35,
  },
});

const findings = engine.evaluateEntity(entity);

assert.ok(
  findings.some(
    (x) => x.type === 'rapid_movement',
  ),
);

assert.ok(
  findings.some(
    (x) => x.type === 'rapid_altitude_change',
  ),
);

assert.ok(
  findings.some(
    (x) => x.type === 'confidence_degradation',
  ),
);

const result = await engine.run();

assert.ok(result.length >= 3);
assert.equal(engine.stats().status, 'ok');

const movement = result.find(
  (x) => x.type === 'rapid_movement',
);

assert.ok(movement);
assert.ok(movement.evidence.distanceKm > 0);
assert.ok(movement.evidence.estimatedSpeedKmH > 900);
assert.ok(
  ['medium', 'high', 'critical'].includes(
    movement.severity,
  ),
);

console.log('CYVX ANOMALY INTELLIGENCE TESTS: PASS');
