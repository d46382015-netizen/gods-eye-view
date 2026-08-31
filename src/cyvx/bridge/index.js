import { GevCyvxBridge } from './gevBridge.js';

export function initGevCyvxBridge({
  dataManager,
  store,
  intervalMs = 5000,
} = {}) {
  const bridge = new GevCyvxBridge({
    dataManager,
    store,
    intervalMs,
  });

  bridge.start();
  return bridge;
}
