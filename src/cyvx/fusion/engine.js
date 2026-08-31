const EARTH_RADIUS_KM = 6371;

const RELATIONSHIPS = Object.freeze({
  aircraft: new Set(['aircraft', 'vessel', 'infrastructure', 'camera']),
  vessel: new Set(['aircraft', 'vessel', 'infrastructure', 'camera']),
  satellite: new Set(['satellite', 'infrastructure', 'camera']),
  earthquake: new Set(['infrastructure', 'camera', 'fire']),
  fire: new Set(['infrastructure', 'camera', 'earthquake']),
  camera: new Set(['aircraft', 'vessel', 'infrastructure', 'fire', 'earthquake']),
  infrastructure: new Set(['aircraft', 'vessel', 'satellite', 'camera', 'fire', 'earthquake']),
  unknown: new Set(),
});

function radians(value) {
  return value * Math.PI / 180;
}

export function distanceKm(a, b) {
  if (!a?.position || !b?.position) return null;

  const lat1 = Number(a.position.latitude);
  const lon1 = Number(a.position.longitude);
  const lat2 = Number(b.position.latitude);
  const lon2 = Number(b.position.longitude);

  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) {
    return null;
  }

  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
    Math.cos(radians(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM *
    Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function timeDeltaSeconds(a, b) {
  const t1 = Date.parse(a?.observedAt);
  const t2 = Date.parse(b?.observedAt);

  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;

  return Math.abs(t1 - t2) / 1000;
}

export function relationshipAllowed(a, b) {
  if (!a || !b || a.id === b.id) return false;

  if (a.source === b.source) {
    return false;
  }

  return Boolean(
    RELATIONSHIPS[a.type]?.has(b.type) ||
    RELATIONSHIPS[b.type]?.has(a.type),
  );
}

export function correlationScore(
  a,
  b,
  {
    maxDistanceKm = 50,
    maxTimeSeconds = 900,
  } = {},
) {
  if (!relationshipAllowed(a, b)) {
    return {
      score: 0,
      related: false,
      reasons: [],
      distanceKm: null,
      timeDeltaSeconds: null,
    };
  }

  const distance = distanceKm(a, b);
  const time = timeDeltaSeconds(a, b);

  const reasons = [];
  const components = [];

  // If both entities have usable positions, geographic proximity is
  // mandatory. Temporal proximity must not create a relationship between
  // entities that are physically far apart.
  if (distance !== null && distance > maxDistanceKm) {
    return {
      score: 0,
      related: false,
      reasons: [`outside ${maxDistanceKm} km spatial threshold`],
      distanceKm: distance,
      timeDeltaSeconds: time,
    };
  }

  if (distance !== null && distance <= maxDistanceKm) {
    const spatialScore = 1 - distance / maxDistanceKm;
    components.push(spatialScore * 0.6);
    reasons.push(`within ${distance.toFixed(2)} km`);
  }

  if (time !== null && time <= maxTimeSeconds) {
    const temporalScore = 1 - time / maxTimeSeconds;
    components.push(temporalScore * 0.4);
    reasons.push(`observed within ${time.toFixed(0)} seconds`);
  }

  if (!components.length) {
    return {
      score: 0,
      related: false,
      reasons,
      distanceKm: distance,
      timeDeltaSeconds: time,
    };
  }

  const score = Math.max(
    0,
    Math.min(
      1,
      components.reduce((sum, value) => sum + value, 0),
    ),
  );

  return {
    score,
    related: score >= 0.25,
    reasons,
    distanceKm: distance,
    timeDeltaSeconds: time,
  };
}

export function buildFinding(a, b, correlation) {
  const ordered = [a.id, b.id].sort();

  return {
    id: `fusion:${ordered[0]}:${ordered[1]}`,
    version: 1,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    confidence: Number(
      ((a.confidence ?? 1) * (b.confidence ?? 1) * correlation.score)
        .toFixed(4),
    ),
    relationship: `${a.type}<->${b.type}`,
    entities: [
      {
        id: a.id,
        type: a.type,
        source: a.source,
      },
      {
        id: b.id,
        type: b.type,
        source: b.source,
      },
    ],
    evidence: {
      score: Number(correlation.score.toFixed(4)),
      distanceKm: correlation.distanceKm,
      timeDeltaSeconds: correlation.timeDeltaSeconds,
      reasons: correlation.reasons,
    },
  };
}

export class IntelligenceFusionEngine {
  constructor({
    store,
    maxDistanceKm = 50,
    maxTimeSeconds = 900,
    minimumScore = 0.25,
  } = {}) {
    if (!store) throw new Error('IntelligenceFusionEngine requires store');

    this.store = store;
    this.maxDistanceKm = maxDistanceKm;
    this.maxTimeSeconds = maxTimeSeconds;
    this.minimumScore = minimumScore;

    this.findings = new Map();

    this.metrics = {
      runs: 0,
      comparisons: 0,
      related: 0,
      findings: 0,
      updated: 0,
      startedAt: null,
      lastRunAt: null,
      lastRunDurationMs: 0,
    };
  }

  async run() {
    const started = performance.now();

    this.metrics.runs += 1;
    this.metrics.lastRunAt = new Date().toISOString();

    const entities = this.store.listEntities({ limit: 5000 });

    for (let i = 0; i < entities.length; i += 1) {
      for (let j = i + 1; j < entities.length; j += 1) {
        const a = entities[i];
        const b = entities[j];

        this.metrics.comparisons += 1;

        const correlation = correlationScore(a, b, {
          maxDistanceKm: this.maxDistanceKm,
          maxTimeSeconds: this.maxTimeSeconds,
        });

        if (!correlation.related || correlation.score < this.minimumScore) {
          continue;
        }

        this.metrics.related += 1;

        const finding = buildFinding(a, b, correlation);
        const previous = this.findings.get(finding.id);

        if (previous) {
          finding.createdAt = previous.createdAt;
          this.metrics.updated += 1;
        }

        this.findings.set(finding.id, finding);
        this.metrics.findings = this.findings.size;
      }
    }

    this.metrics.lastRunDurationMs =
      Number((performance.now() - started).toFixed(2));

    console.info(
      `[CYVX][fusion] run=${this.metrics.runs} entities=${entities.length} findings=${this.findings.size} duration=${this.metrics.lastRunDurationMs}ms`,
    );

    return this.listFindings();
  }

  listFindings({
    minimumConfidence = 0,
    status = 'active',
    limit = 500,
  } = {}) {
    return [...this.findings.values()]
      .filter((finding) => (
        (!status || finding.status === status) &&
        finding.confidence >= Number(minimumConfidence || 0)
      ))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, Math.max(1, Math.min(Number(limit) || 500, 5000)));
  }

  getFinding(id) {
    return this.findings.get(id) || null;
  }

  stats() {
    return {
      status: 'ok',
      thresholds: {
        maxDistanceKm: this.maxDistanceKm,
        maxTimeSeconds: this.maxTimeSeconds,
        minimumScore: this.minimumScore,
      },
      findings: this.findings.size,
      metrics: { ...this.metrics },
    };
  }
}
