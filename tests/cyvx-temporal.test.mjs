import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStateStore } from '../src/cyvx/world-state/store.js';

const dir = await mkdtemp(join(tmpdir(), 'cyvx-temporal-'));
const file = join(dir, 'world-state.json');
const store = await new WorldStateStore(file).load();

const t1 = '2026-08-31T12:00:00.000Z';
const t2 = '2026-08-31T12:05:00.000Z';
const t3 = '2026-08-31T12:10:00.000Z';

await store.ingest({
  type: 'aircraft',
  source: 'test',
  sourceId: 'TEMP001',
  observedAt: t1,
  latitude: 44.000,
  longitude: -92.000,
  altitude: 10000,
  confidence: 0.9,
});

await store.ingest({
  type: 'aircraft',
  source: 'test',
  sourceId: 'TEMP001',
  observedAt: t2,
  latitude: 44.100,
  longitude: -92.100,
  altitude: 12000,
  confidence: 0.95,
});

await store.ingest({
  type: 'aircraft',
  source: 'test',
  sourceId: 'TEMP001',
  observedAt: t3,
  latitude: 44.200,
  longitude: -92.200,
  altitude: 14000,
  confidence: 0.97,
});

const id = 'aircraft:test:TEMP001';

const trajectory = store.trajectory(id);

assert.equal(trajectory.length, 3);
assert.equal(trajectory[0].observedAt, t1);
assert.equal(trajectory.at(-1).observedAt, t3);

assert.equal(trajectory[1].delta.altitudeDelta, 2000);
assert.ok(trajectory[1].delta.distanceKm > 0);
assert.ok(trajectory[1].delta.changedFields.includes('position'));

const windowed = store.trajectory(id, {
  since: t2,
  until: t3,
});

assert.equal(windowed.length, 2);

const history = store.entityHistory(id);

assert.equal(history.firstSeen, t1);
assert.equal(history.lastSeen, t3);
assert.equal(history.observationCount, 3);

const timeline = store.timeline({
  entityId: id,
  since: t2,
});

assert.equal(timeline.length, 2);

const persisted = JSON.parse(await readFile(file, 'utf8'));

assert.equal(persisted.version, 2);
assert.equal(persisted.observations.length, 3);

console.log('CYVX TEMPORAL INTELLIGENCE TESTS: PASS');
