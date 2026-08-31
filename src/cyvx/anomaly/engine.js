import { distanceKm } from '../fusion/engine.js';

const DEFAULTS = Object.freeze({
  rapidMovementKmPerHour: 900,
  rapidAltitudeChangePerMinute: 3000,
  observationGapMinutes: 30,
  disappearanceMinutes: 30,
  lowConfidence: 0.35,
  minObservationsForBehavior: 2,
});

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function hoursBetween(a, b) {
  const x = Date.parse(a);
  const y = Date.parse(b);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return Math.abs(y - x) / 3600000;
}

function minutesBetween(a, b) {
  const hours = hoursBetween(a, b);
  return hours === null ? null : hours * 60;
}

function severity(score) {
  if (score >= 0.85) return 'critical';
  if (score >= 0.65) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

function findingId(type, entityId, observedAt) {
  return `anomaly:${type}:${entityId}:${observedAt}`;
}

function makeFinding({
  type,
  entity,
  score,
  observedAt,
  evidence,
}) {
  const normalizedScore = Number(clamp(score).toFixed(4));

  return {
    id: findingId(type, entity.id, observedAt),
    version: 1,
    status: 'active',
    type,
    severity: severity(normalizedScore),
    confidence: Number(
      clamp(
        normalizedScore * Number(entity.confidence ?? 1),
      ).toFixed(4),
    ),
    entity: {
      id: entity.id,
      type: entity.type,
      source: entity.source,
    },
    observedAt,
    createdAt: new Date().toISOString(),
    evidence,
  };
}

export class AnomalyEngine {
  constructor({
    store,
    thresholds = {},
  } = {}) {
    if (!store) throw new Error('AnomalyEngine requires store');

    this.store = store;
    this.thresholds = {
      ...DEFAULTS,
      ...thresholds,
    };

    this.findings = new Map();

    this.metrics = {
      runs: 0,
      entitiesScanned: 0,
      observationsScanned: 0,
      anomalies: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      startedAt: null,
      lastRunAt: null,
      lastRunDurationMs: 0,
    };
  }

  evaluateTrajectory(entity, observations) {
    const findings = [];

    if (!observations.length) return findings;

    const latest = observations.at(-1);
    const previous = observations.at(-2);

    if (previous) {
      const elapsedHours = hoursBetween(
        previous.observedAt,
        latest.observedAt,
      );

      const distance = distanceKm(previous, latest);

      if (
        distance !== null &&
        elapsedHours !== null &&
        elapsedHours > 0
      ) {
        const speed = distance / elapsedHours;

        if (speed > this.thresholds.rapidMovementKmPerHour) {
          const score = clamp(
            speed / this.thresholds.rapidMovementKmPerHour / 2,
          );

          findings.push(
            makeFinding({
              type: 'rapid_movement',
              entity,
              score,
              observedAt: latest.observedAt,
              evidence: {
                distanceKm: Number(distance.toFixed(3)),
                elapsedHours: Number(elapsedHours.toFixed(4)),
                estimatedSpeedKmH: Number(speed.toFixed(2)),
                thresholdKmH:
                  this.thresholds.rapidMovementKmPerHour,
                explanation:
                  'Observed movement exceeds the configured movement threshold.',
              },
            }),
          );
        }
      }

      const oldAltitude = Number(
        previous.position?.altitude,
      );
      const newAltitude = Number(
        latest.position?.altitude,
      );

      const elapsedMinutes = minutesBetween(
        previous.observedAt,
        latest.observedAt,
      );

      if (
        Number.isFinite(oldAltitude) &&
        Number.isFinite(newAltitude) &&
        elapsedMinutes !== null &&
        elapsedMinutes > 0
      ) {
        const altitudeDelta = newAltitude - oldAltitude;
        const rate = Math.abs(altitudeDelta) / elapsedMinutes;

        if (rate > this.thresholds.rapidAltitudeChangePerMinute) {
          const score = clamp(
            rate /
            this.thresholds.rapidAltitudeChangePerMinute /
            2,
          );

          findings.push(
            makeFinding({
              type: 'rapid_altitude_change',
              entity,
              score,
              observedAt: latest.observedAt,
              evidence: {
                altitudeDelta,
                elapsedMinutes: Number(elapsedMinutes.toFixed(3)),
                altitudeRatePerMinute: Number(rate.toFixed(2)),
                threshold:
                  this.thresholds.rapidAltitudeChangePerMinute,
                explanation:
                  'Observed altitude change exceeds the configured rate threshold.',
              },
            }),
          );
        }
      }
    }

    if (
      Number(entity.confidence ?? 1) <
      this.thresholds.lowConfidence
    ) {
      const score = clamp(
        1 -
        Number(entity.confidence ?? 1),
      );

      findings.push(
        makeFinding({
          type: 'confidence_degradation',
          entity,
          score,
          observedAt: latest.observedAt,
          evidence: {
            confidence: entity.confidence,
            threshold: this.thresholds.lowConfidence,
            explanation:
              'The latest observation has reduced source confidence.',
          },
        }),
      );
    }

    if (observations.length >= this.thresholds.minObservationsForBehavior) {
      const first = observations[0];

      const gap = minutesBetween(
        observations.at(-2).observedAt,
        latest.observedAt,
      );

      if (
        gap !== null &&
        gap > this.thresholds.observationGapMinutes
      ) {
        const score = clamp(
          gap /
          this.thresholds.observationGapMinutes /
          3,
        );

        findings.push(
          makeFinding({
            type: 'observation_gap',
            entity,
            score,
            observedAt: latest.observedAt,
            evidence: {
              gapMinutes: Number(gap.toFixed(2)),
              thresholdMinutes:
                this.thresholds.observationGapMinutes,
              firstSeen: first.observedAt,
              explanation:
                'The entity was not observed for longer than the configured continuity threshold.',
            },
          }),
        );
      }
    }

    return findings;
  }

  evaluateEntity(entity) {
    const observations = this.store.trajectory(
      entity.id,
      { limit: 5000 },
    );

    this.metrics.observationsScanned += observations.length;

    return this.evaluateTrajectory(
      entity,
      observations,
    );
  }

  async run() {
    const started = performance.now();

    this.metrics.runs += 1;
    this.metrics.lastRunAt = new Date().toISOString();

    const entities = this.store.listEntities({
      limit: 5000,
    });

    this.metrics.entitiesScanned = entities.length;

    for (const entity of entities) {
      const findings = this.evaluateEntity(entity);

      for (const finding of findings) {
        this.findings.set(finding.id, finding);
      }
    }

    const active = this.listFindings();

    this.metrics.anomalies = active.length;
    this.metrics.critical =
      active.filter((x) => x.severity === 'critical').length;
    this.metrics.high =
      active.filter((x) => x.severity === 'high').length;
    this.metrics.medium =
      active.filter((x) => x.severity === 'medium').length;
    this.metrics.low =
      active.filter((x) => x.severity === 'low').length;

    this.metrics.lastRunDurationMs =
      Number((performance.now() - started).toFixed(2));

    console.info(
      `[CYVX][anomaly] run=${this.metrics.runs} entities=${entities.length} anomalies=${active.length} duration=${this.metrics.lastRunDurationMs}ms`,
    );

    return active;
  }

  listFindings({
    severity: requestedSeverity,
    type,
    entityId,
    limit = 500,
  } = {}) {
    return [...this.findings.values()]
      .filter((finding) => (
        (!requestedSeverity ||
          finding.severity === requestedSeverity) &&
        (!type || finding.type === type) &&
        (!entityId || finding.entity.id === entityId)
      ))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(
        0,
        Math.max(
          1,
          Math.min(Number(limit) || 500, 5000),
        ),
      );
  }

  getFinding(id) {
    return this.findings.get(id) || null;
  }

  stats() {
    return {
      status: 'ok',
      thresholds: this.thresholds,
      findings: this.findings.size,
      metrics: { ...this.metrics },
    };
  }
}
