export class UnifiedIntelligenceGraph {
  constructor({ store, fusion, anomaly }) {
    if (!store) throw new Error('store required');
    if (!fusion) throw new Error('fusion required');
    if (!anomaly) throw new Error('anomaly required');

    this.store = store;
    this.fusion = fusion;
    this.anomaly = anomaly;
  }

  trajectory(id) {
    if (typeof this.store.trajectory !== 'function') return [];

    return this.store.trajectory(id, { limit: 5000 });
  }

  fusionFindingsFor(id) {
    if (typeof this.fusion.listFindings !== 'function') return [];

    return this.fusion
      .listFindings({ limit: 5000 })
      .filter((finding) =>
        Array.isArray(finding.entities) &&
        finding.entities.some((entity) => entity.id === id)
      );
  }

  anomalyFindingsFor(id) {
    if (typeof this.anomaly.listFindings !== 'function') return [];

    return this.anomaly.listFindings({
      entityId: id,
      limit: 5000
    });
  }

  entity(id) {
    const entity = this.store.getEntity(id);
    if (!entity) return null;

    const trajectory = this.trajectory(id);

    const events = this.store.listEvents({
      entityId: id,
      limit: 5000
    });

    const fusionFindings = this.fusionFindingsFor(id);
    const anomalies = this.anomalyFindingsFor(id);

    const relationships = [];

    for (const finding of fusionFindings) {
      for (const related of finding.entities || []) {
        if (related.id === id) continue;

        relationships.push({
          entity: related,
          findingId: finding.id,
          relationship:
            finding.relationship ||
            finding.type ||
            'related',
          confidence:
            finding.confidence ?? null,
          evidence:
            finding.evidence || {}
        });
      }
    }

    return {
      entity,
      current: entity,
      trajectory,
      events,
      relationships,
      fusionFindings,
      anomalies,
      summary: {
        observations: trajectory.length,
        events: events.length,
        relationships: relationships.length,
        fusionFindings: fusionFindings.length,
        anomalies: anomalies.length
      }
    };
  }

  search(query = '', options = {}) {
    const q = String(query).trim().toLowerCase();

    return this.store
      .listEntities({
        type: options.type || undefined,
        source: options.source || undefined,
        limit: 5000
      })
      .filter((entity) => {
        if (!q) return true;

        return [
          entity.id,
          entity.type,
          entity.source,
          entity.sourceId,
          JSON.stringify(entity.attributes || {})
        ]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .slice(0, Math.min(
        Math.max(Number(options.limit) || 100, 1),
        1000
      ));
  }

  nearby(latitude, longitude, options = {}) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    const radiusKm = Math.max(
      Number(options.radiusKm) || 50,
      0
    );

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error(
        'latitude and longitude must be numeric'
      );
    }

    const radians = (x) => x * Math.PI / 180;

    const haversine = (a, b) => {
      if (!a?.position || !b?.position) return null;

      const lat1 = Number(a.position.latitude);
      const lon1 = Number(a.position.longitude);
      const lat2 = Number(b.position.latitude);
      const lon2 = Number(b.position.longitude);

      if (
        !Number.isFinite(lat1) ||
        !Number.isFinite(lon1) ||
        !Number.isFinite(lat2) ||
        !Number.isFinite(lon2)
      ) return null;

      const R = 6371;
      const dLat = radians(lat2 - lat1);
      const dLon = radians(lon2 - lon1);

      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(radians(lat1)) *
        Math.cos(radians(lat2)) *
        Math.sin(dLon / 2) ** 2;

      return 2 * R * Math.asin(
        Math.sqrt(Math.min(1, h))
      );
    };

    const center = {
      position: {
        latitude: lat,
        longitude: lon
      }
    };

    return this.store
      .listEntities({
        type: options.type || undefined,
        source: options.source || undefined,
        limit: 5000
      })
      .map((entity) => ({
        ...entity,
        distanceKm: haversine(center, entity)
      }))
      .filter((entity) =>
        entity.distanceKm !== null &&
        entity.distanceKm <= radiusKm
      )
      .sort((a, b) =>
        a.distanceKm - b.distanceKm
      )
      .slice(
        0,
        Math.min(
          Math.max(Number(options.limit) || 100, 1),
          1000
        )
      )
      .map((entity) => ({
        ...entity,
        distanceKm: Number(
          entity.distanceKm.toFixed(3)
        )
      }));
  }

  timeline(id, options = {}) {
    const entity = this.store.getEntity(id);
    if (!entity) return null;

    const events = this.store.listEvents({
      entityId: id,
      limit: 5000
    });

    const observations = this.trajectory(id);
    const anomalies = this.anomalyFindingsFor(id);
    const fusion = this.fusionFindingsFor(id);

    const timeline = [
      ...events.map((event) => ({
        timestamp: event.observedAt,
        kind: 'event',
        id: event.id,
        type: event.type,
        confidence: event.confidence,
        data: event
      })),

      ...observations.map((observation, index) => ({
        timestamp: observation.observedAt,
        kind: 'observation',
        id: `${id}:observation:${index}`,
        type: 'observation',
        confidence: observation.confidence,
        data: observation
      })),

      ...anomalies.map((finding) => ({
        timestamp:
          finding.observedAt ||
          finding.createdAt ||
          entity.observedAt,
        kind: 'anomaly',
        id: finding.id,
        type: finding.type,
        severity: finding.severity,
        confidence: finding.confidence,
        data: finding
      })),

      ...fusion.map((finding) => ({
        timestamp:
          finding.updatedAt ||
          finding.createdAt ||
          entity.observedAt,
        kind: 'fusion',
        id: finding.id,
        type:
          finding.relationship ||
          finding.type ||
          'relationship',
        confidence: finding.confidence,
        data: finding
      }))
    ];

    return timeline
      .filter((item) =>
        Number.isFinite(Date.parse(item.timestamp))
      )
      .sort((a, b) =>
        Date.parse(a.timestamp) -
        Date.parse(b.timestamp)
      )
      .slice(
        -Math.min(
          Math.max(Number(options.limit) || 500, 1),
          5000
        )
      );
  }

  overview() {
    const entities = this.store.listEntities({
      limit: 5000
    });

    const fusionFindings =
      typeof this.fusion.listFindings === 'function'
        ? this.fusion.listFindings({ limit: 5000 })
        : [];

    const anomalies =
      typeof this.anomaly.listFindings === 'function'
        ? this.anomaly.listFindings({ limit: 5000 })
        : [];

    const byType = {};
    const bySource = {};

    for (const entity of entities) {
      byType[entity.type] =
        (byType[entity.type] || 0) + 1;

      bySource[entity.source] =
        (bySource[entity.source] || 0) + 1;
    }

    return {
      status: 'ok',
      generatedAt: new Date().toISOString(),
      entities: entities.length,
      sources: Object.keys(bySource).length,
      byType,
      bySource,
      fusion: {
        findings: fusionFindings.length
      },
      anomalies: {
        findings: anomalies.length,
        critical: anomalies.filter(
          (x) => x.severity === 'critical'
        ).length,
        high: anomalies.filter(
          (x) => x.severity === 'high'
        ).length,
        medium: anomalies.filter(
          (x) => x.severity === 'medium'
        ).length,
        low: anomalies.filter(
          (x) => x.severity === 'low'
        ).length
      },
      worldState: this.store.stats()
    };
  }
}
