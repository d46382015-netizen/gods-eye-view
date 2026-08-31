const KEY = 'cyvx-world-state-v1';
const MAX_EVENTS = 5000;

export class BrowserWorldStateStore {
  constructor() {
    this.entities = new Map();
    this.events = [];
    this.metrics = {
      ingested: 0,
      rejected: 0,
      events: 0,
      writes: 0,
    };

    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;

      const state = JSON.parse(raw);

      for (const entity of state.entities || []) {
        this.entities.set(entity.id, entity);
      }

      this.events = Array.isArray(state.events)
        ? state.events.slice(-MAX_EVENTS)
        : [];
    } catch (error) {
      console.warn('[CYVX][browser-store] load failed:', error);
    }
  }

  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        entities: [...this.entities.values()],
        events: this.events.slice(-MAX_EVENTS),
      }));

      this.metrics.writes += 1;
    } catch (error) {
      console.warn('[CYVX][browser-store] persist failed:', error);
    }
  }

  async ingest(input) {
    if (!input?.sourceId) {
      this.metrics.rejected += 1;
      throw new Error('CYVX browser store requires sourceId');
    }

    const id = String(
      input.entityId ||
      `${input.type || 'unknown'}:${input.source}:${input.sourceId}`,
    );

    const entity = {
      ...input,
      id,
      observedAt: input.observedAt || new Date().toISOString(),
    };

    const previous = this.entities.get(id);

    this.entities.set(id, entity);

    const event = {
      id: crypto.randomUUID(),
      version: 1,
      type: previous ? 'updated' : 'appeared',
      entityId: id,
      entityType: entity.type || 'unknown',
      source: entity.source || 'unknown',
      observedAt: entity.observedAt,
      createdAt: new Date().toISOString(),
      confidence: entity.confidence ?? 1,
    };

    this.events.push(event);
    this.metrics.ingested += 1;
    this.metrics.events += 1;

    this.persist();

    return { entity, event };
  }

  stats() {
    return {
      status: 'ok',
      entities: this.entities.size,
      events: this.events.length,
      metrics: { ...this.metrics },
    };
  }
}
