import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStateStore } from '../src/cyvx/world-state/store.js';
import { normalizeEntity } from '../src/cyvx/world-state/schema.js';

const dir = await mkdtemp(join(tmpdir(), 'cyvx-world-state-'));
const file = join(dir, 'world-state.json');

const store = await new WorldStateStore(file).load();

const first = await store.ingest({
  type: 'aircraft',
  source: 'test',
  sourceId: 'ABC123',
  latitude: 44.012,
  longitude: -92.481,
  altitude: 12000,
  confidence: 0.9,
  attributes: { callsign: 'CYVX1' },
});

assert.equal(first.event.type, 'appeared');
assert.equal(store.stats().entities, 1);

const second = await store.ingest({
  type: 'aircraft',
  source: 'test',
  sourceId: 'ABC123',
  latitude: 44.022,
  longitude: -92.491,
  altitude: 12100,
  confidence: 0.95,
});

assert.equal(second.event.type, 'updated');
assert.equal(store.listEntities({ type: 'aircraft' }).length, 1);
assert.equal(store.listEvents().length, 2);

const persisted = JSON.parse(await readFile(file, 'utf8'));
assert.equal(persisted.entities.length, 1);
assert.equal(persisted.events.length, 2);

assert.throws(
  () => normalizeEntity({ type: 'aircraft', source: 'test' }),
  /sourceId or id/,
);

console.log('CYVX WORLD STATE TESTS: PASS');
