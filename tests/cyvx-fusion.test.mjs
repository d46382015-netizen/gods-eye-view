import assert from 'node:assert/strict';
import {
  distanceKm,
  timeDeltaSeconds,
  relationshipAllowed,
  correlationScore,
  buildFinding,
} from '../src/cyvx/fusion/engine.js';

const aircraft = {
  id: 'aircraft:test:A1',
  type: 'aircraft',
  source: 'source-a',
  observedAt: '2026-08-31T12:00:00.000Z',
  confidence: 0.9,
  position: {
    latitude: 44.000,
    longitude: -92.000,
    altitude: 10000,
  },
};

const camera = {
  id: 'camera:test:C1',
  type: 'camera',
  source: 'source-b',
  observedAt: '2026-08-31T12:05:00.000Z',
  confidence: 0.8,
  position: {
    latitude: 44.010,
    longitude: -92.010,
  },
};

const farCamera = {
  ...camera,
  id: 'camera:test:C2',
  position: {
    latitude: 10,
    longitude: 10,
  },
};

assert.ok(distanceKm(aircraft, camera) > 0);
assert.equal(timeDeltaSeconds(aircraft, camera), 300);

assert.equal(
  relationshipAllowed(aircraft, camera),
  true,
);

assert.equal(
  relationshipAllowed(aircraft, {
    ...camera,
    source: aircraft.source,
  }),
  false,
);

const correlation = correlationScore(aircraft, camera, {
  maxDistanceKm: 50,
  maxTimeSeconds: 900,
});

assert.equal(correlation.related, true);
assert.ok(correlation.score > 0);
assert.ok(correlation.reasons.length >= 1);

const farCorrelation = correlationScore(aircraft, farCamera, {
  maxDistanceKm: 50,
  maxTimeSeconds: 900,
});

assert.equal(farCorrelation.related, false);
assert.equal(farCorrelation.score, 0);
assert.match(
  farCorrelation.reasons[0],
  /outside 50 km spatial threshold/,
);

// Regression: time proximity alone must not override a known
// geographic contradiction.
const geographicallyDistantButSynchronous = {
  ...camera,
  id: 'camera:test:C3',
  observedAt: aircraft.observedAt,
  position: {
    latitude: 44.01,
    longitude: -92.01,
  },
};

const distant = {
  ...aircraft,
  position: {
    latitude: 0,
    longitude: 0,
  },
};

const contradiction = correlationScore(
  distant,
  geographicallyDistantButSynchronous,
  {
    maxDistanceKm: 50,
    maxTimeSeconds: 900,
  },
);

assert.equal(contradiction.related, false);
assert.equal(contradiction.score, 0);

const finding = buildFinding(
  aircraft,
  camera,
  correlation,
);

assert.match(finding.id, /^fusion:/);
assert.equal(finding.status, 'active');
assert.equal(finding.entities.length, 2);
assert.ok(finding.confidence > 0);
assert.ok(finding.evidence.distanceKm > 0);

console.log('CYVX INTELLIGENCE FUSION TESTS: PASS');
