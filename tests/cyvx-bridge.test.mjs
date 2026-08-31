import assert from 'node:assert/strict';
import {
  entityTypeForLayer,
  normalizeLayerSnapshot,
  layerHealthSnapshot,
} from '../src/cyvx/bridge/layerAdapter.js';

assert.equal(entityTypeForLayer('flights'), 'aircraft');
assert.equal(entityTypeForLayer('ais-live-vessels'), 'vessel');
assert.equal(entityTypeForLayer('unknown-layer'), 'unknown');

const entities = normalizeLayerSnapshot('flights', {
  source: 'opensky',
  lastUpdate: '2026-08-31T12:00:00.000Z',
  entities: [{
    icao24: 'ABC123',
    callsign: 'CYVX',
    latitude: 44.012,
    longitude: -92.481,
    altitude: 12000,
  }],
});

assert.equal(entities.length, 1);
assert.equal(entities[0].type, 'aircraft');
assert.equal(entities[0].source, 'opensky');
assert.equal(entities[0].sourceId, 'ABC123');
assert.equal(entities[0].position, undefined);
assert.equal(entities[0].latitude, 44.012);
assert.equal(entities[0].longitude, -92.481);

const health = layerHealthSnapshot('flights', {
  source: 'opensky',
  status: 'stale',
  count: 1,
  stale: true,
});

assert.equal(health.layerId, 'flights');
assert.equal(health.stale, true);
assert.equal(health.count, 1);

console.log('CYVX BRIDGE TESTS: PASS');
