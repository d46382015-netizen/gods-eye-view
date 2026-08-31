const TYPE_BY_LAYER = Object.freeze({
  flights: 'aircraft',
  'military-flights': 'aircraft',
  satellites: 'satellite',
  earthquakes: 'earthquake',
  'rocket-launches': 'infrastructure',
  traffic: 'infrastructure',
  cctv: 'camera',
  radio: 'infrastructure',
  bikeshare: 'infrastructure',
  'ais-live-vessels': 'vessel',
  'military-installations': 'infrastructure',
  'military-awareness': 'infrastructure',
});

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function entityTypeForLayer(layerId) {
  return TYPE_BY_LAYER[layerId] || 'unknown';
}

export function normalizeLayerSnapshot(layerId, stats = {}) {
  const type = entityTypeForLayer(layerId);
  const source = String(
    stats.source ||
    stats.provider ||
    stats.feed ||
    layerId,
  );

  const records = Array.isArray(stats.entities)
    ? stats.entities
    : Array.isArray(stats.items)
      ? stats.items
      : Array.isArray(stats.data)
        ? stats.data
        : null;

  if (!records) return [];

  return records.flatMap((record, index) => {
    if (!record || typeof record !== 'object') return [];

    const sourceId = String(
      record.sourceId ??
      record.icao24 ??
      record.icao ??
      record.id ??
      record.uuid ??
      record.hex ??
      `${layerId}-${index}`,
    ).trim();

    if (!sourceId) return [];

    const latitude = firstFinite(
      record.latitude,
      record.lat,
      record.position?.latitude,
      record.position?.lat,
    );

    const longitude = firstFinite(
      record.longitude,
      record.lon,
      record.lng,
      record.position?.longitude,
      record.position?.lon,
      record.position?.lng,
    );

    const altitude = firstFinite(
      record.altitude,
      record.altitude_m,
      record.position?.altitude,
    );

    const observedAt =
      record.observedAt ||
      record.timestamp ||
      record.lastUpdate ||
      stats.lastUpdate ||
      new Date().toISOString();

    const confidence = Number.isFinite(Number(record.confidence))
      ? Math.max(0, Math.min(1, Number(record.confidence)))
      : Number.isFinite(Number(stats.confidence))
        ? Math.max(0, Math.min(1, Number(stats.confidence)))
        : 1;

    const attributes = { ...record };
    delete attributes.position;
    delete attributes.latitude;
    delete attributes.longitude;
    delete attributes.lat;
    delete attributes.lon;
    delete attributes.lng;
    delete attributes.altitude;

    return [{
      type,
      source,
      sourceId,
      observedAt,
      latitude,
      longitude,
      altitude,
      confidence,
      attributes,
    }];
  });
}

export function layerHealthSnapshot(layerId, stats = {}) {
  return {
    layerId,
    type: entityTypeForLayer(layerId),
    source: String(stats.source || stats.provider || stats.feed || layerId),
    status: String(stats.status || 'unknown'),
    count: Number.isFinite(Number(stats.count)) ? Number(stats.count) : 0,
    lastUpdate: stats.lastUpdate || null,
    stale: stats.stale === true,
    degraded: stats.degraded === true,
    unavailable: stats.unavailable === true || stats.available === false,
    error: stats.error || stats.lastError || null,
    capturedAt: new Date().toISOString(),
  };
}
