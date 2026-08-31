import { BrowserWorldStateStore } from './browserStore.js';
import { initGevCyvxBridge } from './index.js';

export function initCyvxRuntime({ dataManager } = {}) {
  if (!dataManager) {
    throw new Error('initCyvxRuntime requires dataManager');
  }

  const store = new BrowserWorldStateStore();

  const bridge = initGevCyvxBridge({
    dataManager,
    store,
    intervalMs: Number(import.meta.env?.VITE_CYVX_BRIDGE_INTERVAL_MS || 5000),
  });

  return {
    store,
    bridge,
    getStats() {
      return {
        store: store.stats(),
        bridge: bridge.stats(),
      };
    },
  };
}
