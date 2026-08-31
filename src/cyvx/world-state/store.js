import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createEvent, normalizeEntity } from './schema.js';

export class WorldStateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.entities = new Map();
    this.events = [];
    this.startedAt = new Date().toISOString();
    this.metrics = {
      ingested: 0,
      rejected: 0,
      events: 0,
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

      this.events = Array.isArray(state.events) ? state.events : [];
      console.info(`[CYVX][world-state] loaded ${this.entities.size} entities / ${this.events.length} events`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      console.info('[CYVX][world-state] starting new state store');
    }

    return this;
  }

  async persist() {
    const payload = JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      entities: [...this.entities.values()],
      events: this.events.slice(-10000),
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

      this.entities.set(entity.id, entity);

      const event = createEvent(
        entity,
        previous ? 'updated' : 'appeared',
        previous ? { previous } : {},
      );

      this.events.push(event);
      this.metrics.ingested += 1;
      this.metrics.events += 1;

      await this.persist();

      console.info(
        `[CYVX][world-state] ${event.type} ${entity.id} source=${entity.source} confidence=${entity.confidence}`,
      );

      return { entity, event };
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

    return values.slice(-Math.max(1, Math.min(Number(limit) || 500, 5000)));
  }

  listEvents({ entityId, type, limit = 500 } = {}) {
    let values = this.events;

    if (entityId) values = values.filter((x) => x.entityId === entityId);
    if (type) values = values.filter((x) => x.type === type);

    return values.slice(-Math.max(1, Math.min(Number(limit) || 500, 5000)));
  }

  stats() {
    return {
      status: 'ok',
      startedAt: this.startedAt,
      entities: this.entities.size,
      events: this.events.length,
      metrics: { ...this.metrics },
    };
  }
}
