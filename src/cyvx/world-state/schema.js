export const WORLD_STATE_VERSION = 1;

export const ENTITY_TYPES = Object.freeze([
  'aircraft',
  'vessel',
  'satellite',
  'earthquake',
  'fire',
  'camera',
  'infrastructure',
  'unknown',
]);

export const EVENT_TYPES = Object.freeze([
  'observed',
  'updated',
  'appeared',
  'disappeared',
  'anomaly',
  'source_degraded',
]);

export function nowIso() {
  return new Date().toISOString();
}

export function stableId(prefix, value) {
  const input = String(value ?? '').trim();
  if (!input) throw new Error('stableId requires a non-empty value');
  return `${prefix}:${input}`;
}

export function normalizeEntity(input = {}) {
  const type = ENTITY_TYPES.includes(input.type) ? input.type : 'unknown';
  const source = String(input.source || 'unknown');
  const sourceId = String(input.sourceId ?? input.id ?? '').trim();

  if (!sourceId) {
    throw new Error('Entity requires sourceId or id');
  }

  const observedAt = input.observedAt
    ? new Date(input.observedAt).toISOString()
    : nowIso();

  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);

  const position = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? {
        latitude,
        longitude,
        ...(Number.isFinite(Number(input.altitude))
          ? { altitude: Number(input.altitude) }
          : {}),
      }
    : null;

  const confidence = input.confidence == null
    ? 1
    : Math.max(0, Math.min(1, Number(input.confidence)));

  return {
    id: String(input.entityId || stableId(type, `${source}:${sourceId}`)),
    type,
    source,
    sourceId,
    observedAt,
    position,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    attributes: input.attributes && typeof input.attributes === 'object'
      ? structuredClone(input.attributes)
      : {},
  };
}

export function createEvent(entity, type = 'observed', attributes = {}) {
  if (!EVENT_TYPES.includes(type)) {
    throw new Error(`Unsupported event type: ${type}`);
  }

  return {
    id: crypto.randomUUID(),
    version: WORLD_STATE_VERSION,
    type,
    entityId: entity.id,
    entityType: entity.type,
    source: entity.source,
    observedAt: entity.observedAt,
    createdAt: nowIso(),
    confidence: entity.confidence,
    position: entity.position,
    attributes: structuredClone(attributes),
  };
}
