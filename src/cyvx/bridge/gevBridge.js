import {
  layerHealthSnapshot,
  normalizeLayerSnapshot,
} from './layerAdapter.js';

export class GevCyvxBridge {
  constructor({ dataManager, store, intervalMs = 5000 } = {}) {
    if (!dataManager) throw new Error('GevCyvxBridge requires dataManager');
    if (!store) throw new Error('GevCyvxBridge requires world state store');

    this.dataManager = dataManager;
    this.store = store;
    this.intervalMs = Math.max(1000, Number(intervalMs) || 5000);

    this.timer = null;
    this.running = false;
    this.refreshing = false;

    this.metrics = {
      cycles: 0,
      layers: 0,
      entities: 0,
      rejected: 0,
      failures: 0,
      startedAt: null,
      lastCycleAt: null,
      lastError: null,
    };
  }

  layerEntries() {
    return [...(this.dataManager.layers?.entries?.() || [])];
  }

  async cycle() {
    if (this.refreshing) return false;

    this.refreshing = true;
    this.metrics.cycles += 1;
    this.metrics.lastCycleAt = new Date().toISOString();

    try {
      for (const [layerId, entry] of this.layerEntries()) {
        if (!entry?.enabled || entry.destroying) continue;

        this.metrics.layers += 1;

        let stats;
        try {
          stats = typeof entry.module?.getStats === 'function'
            ? entry.module.getStats()
            : {};
        } catch (error) {
          this.metrics.failures += 1;
          this.metrics.lastError = `${layerId}: ${error.message}`;
          console.warn(`[CYVX][bridge] ${layerId} stats failure:`, error);
          continue;
        }

        const health = layerHealthSnapshot(layerId, stats);

        if (
          health.unavailable ||
          health.degraded ||
          health.stale ||
          health.status === 'fallback'
        ) {
          console.info(
            `[CYVX][bridge] ${layerId} health=${health.status} stale=${health.stale} degraded=${health.degraded}`,
          );
        }

        const entities = normalizeLayerSnapshot(layerId, stats);

        for (const entity of entities) {
          try {
            await this.store.ingest(entity);
            this.metrics.entities += 1;
          } catch (error) {
            this.metrics.rejected += 1;
            this.metrics.lastError = `${layerId}: ${error.message}`;
          }
        }
      }

      return true;
    } catch (error) {
      this.metrics.failures += 1;
      this.metrics.lastError = error.message;
      console.error('[CYVX][bridge] cycle failure:', error);
      return false;
    } finally {
      this.refreshing = false;
    }
  }

  start() {
    if (this.running) return this;

    this.running = true;
    this.metrics.startedAt = new Date().toISOString();

    void this.cycle();

    this.timer = setInterval(() => {
      void this.cycle();
    }, this.intervalMs);

    console.info(
      `[CYVX][bridge] started interval=${this.intervalMs}ms`,
    );

    return this;
  }

  async stop() {
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.refreshing) {
      await new Promise((resolve) => {
        const check = () => {
          if (!this.refreshing) resolve();
          else setTimeout(check, 25);
        };
        check();
      });
    }

    console.info('[CYVX][bridge] stopped');
  }

  stats() {
    return {
      running: this.running,
      intervalMs: this.intervalMs,
      ...this.metrics,
    };
  }
}
