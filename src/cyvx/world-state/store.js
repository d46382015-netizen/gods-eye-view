import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createEvent, normalizeEntity } from './schema.js';
import { filterTemporal, observationDelta } from './temporal.js';

const MAX_EVENTS = 10000;
const MAX_OBSERVATIONS = 50000;

export class WorldStateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.entities = new Map();
    this.events = [];
    this.observations = [];
    this.startedAt = new Date().toISOString();

    this.metrics = {
      ingested: 0,
      rejected: 0,
      events: 0,
      observations: 0,
      writes: 0,
    };
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const state = JSON.parse(raw);

      for (const entity of state.entities || []) {
        this.entities.set(entity.id, entity);
      }

      this.events = Array.isArray(state.events)
        ? state.events.slice(-MAX_EVENTS)
        : [];

      this.observations = Array.isArray(state.observations)
        ? state.observations.slice(-MAX_OBSERVATIONS)
        : [];

      console.info(
        `[CYVX][world-state] loaded ${this.entities.size} entities / ${this.events.length} events / ${this.observations.length} observations`,
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      console.info('[CYVX][world-state] starting new state store');
    }

    return this;
  }

  async persist() {
    const payload = JSON.stringify({
      version: 2,
      updatedAt: new Date().toISOString(),
      entities: [...this.entities.values()],
      events: this.events.slice(-MAX_EVENTS),
      observations: this.observations.slice(-MAX_OBSERVATIONS),
    }, null, 2);

    await mkdir(dirname(this.filePath), { recursive: true });

    const temp = `${this.filePath}.tmp`;
    await writeFile(temp, payload, 'utf8');
    await rename(temp, this.filePath);

    this.metrics.writes += 1;
  }

  async ingest(input) {
    try {
      const entity = normalizeEntity(input);
      const previous = this.entities.get(entity.id);

      const delta = observationDelta(previous, entity);

      this.entities.set(entity.id, entity);

      const observation = {
        id: crypto.randomUUID(),
        entityId: entity.id,
        observedAt: entity.observedAt,
        recordedAt: new Date().toISOString(),
        source: entity.source,
        type: entity.type,
        position: entity.position,
        confidence: entity.confidence,
        attributes: structuredClone(entity.attributes),
        delta,
      };

      this.observations.push(observation);

      const event = createEvent(
        entity,
        previous ? 'updated' : 'appeared',
        previous
          ? {
              previous,
              delta,
            }
          : {},
      );

      this.events.push(event);

      this.metrics.ingested += 1;
      this.metrics.events += 1;
      this.metrics.observations += 1;

      await this.persist();

      console.info(
        `[CYVX][world-state] ${event.type} ${entity.id} source=${entity.source} observed=${entity.observedAt}`,
      );

      return {
        entity,
        event,
        observation,
        delta,
      };
    } catch (error) {
      this.metrics.rejected += 1;
      console.warn(`[CYVX][world-state] rejected input: ${error.message}`);
      throw error;
    }
  }

  getEntity(id) {
    return this.entities.get(id) || null;
  }

  listEntities({ type, source, limit = 500 } = {}) {
    let values = [...this.entities.values()];

    if (type) values = values.filter((x) => x.type === type);
    if (source) values = values.filter((x) => x.source === source);

    return values.slice(
      -Math.max(1, Math.min(Number(limit) || 500, 5000)),
    );
  }

  listEvents({ entityId, type, since, until, limit = 500 } = {}) {
    let values = this.events;

    if (entityId) values = values.filter((x) => x.entityId === entityId);
    if (type) values = values.filter((x) => x.type === type);

    values = filterTemporal(values, { since, until });

    return values.slice(
      -Math.max(1, Math.min(Number(limit) || 500, 5000)),
    );
  }

  listObservations({
    entityId,
    source,
    since,
    until,
    limit = 500,
  } = {}) {
    let values = this.observations;

    if (entityId) values = values.filter((x) => x.entityId === entityId);
    if (source) values = values.filter((x) => x.source === source);

    values = filterTemporal(values, { since, until });

    return values.slice(
      -Math.max(1, Math.min(Number(limit) || 500, 5000)),
    );
  }

  timeline({
    since,
    until,
    entityId,
    type,
    limit = 1000,
  } = {}) {
    const events = this.listEvents({
      since,
      until,
      entityId,
      type,
      limit,
    });

    return events.sort(
      (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
    );
  }

  trajectory(entityId, { since, until, limit = 5000 } = {}) {
    const observations = this.listObservations({
      entityId,
      since,
      until,
      limit,
    });

    return observations.sort(
      (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
    );
  }

  entityHistory(entityId, options = {}) {
    const entity = this.getEntity(entityId);
    const observations = this.trajectory(entityId, options);

    return {
      entity,
      firstSeen: observations[0]?.observedAt || null,
      lastSeen: observations.at(-1)?.observedAt || null,
      observationCount: observations.length,
      observations,
    };
  }

  stats() {
    return {
      status: 'ok',
      version: 2,
      startedAt: this.startedAt,
      entities: this.entities.size,
      events: this.events.length,
      observations: this.observations.length,
      metrics: { ...this.metrics },
    };
  }
}
