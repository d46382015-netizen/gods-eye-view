export function toTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function changedFields(previous, current) {
  if (!previous) return Object.keys(current || {});

  const ignored = new Set(['observedAt']);
  const keys = new Set([
    ...Object.keys(previous || {}),
    ...Object.keys(current || {}),
  ]);

  return [...keys].filter((key) => {
    if (ignored.has(key)) return false;
    return JSON.stringify(previous?.[key]) !== JSON.stringify(current?.[key]);
  });
}

export function observationDelta(previous, current) {
  if (!previous || !current) return null;

  const delta = {
    changedFields: changedFields(previous, current),
  };

  const p1 = previous.position;
  const p2 = current.position;

  if (p1 && p2) {
    const lat1 = Number(p1.latitude);
    const lon1 = Number(p1.longitude);
    const lat2 = Number(p2.latitude);
    const lon2 = Number(p2.longitude);

    if (
      Number.isFinite(lat1) &&
      Number.isFinite(lon1) &&
      Number.isFinite(lat2) &&
      Number.isFinite(lon2)
    ) {
      const earthRadiusKm = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

      delta.distanceKm =
        2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    if (Number.isFinite(Number(p1.altitude)) && Number.isFinite(Number(p2.altitude))) {
      delta.altitudeDelta = Number(p2.altitude) - Number(p1.altitude);
    }
  }

  return delta;
}

export function filterTemporal(items, { since, until } = {}) {
  const sinceTime = since ? toTime(since) : null;
  const untilTime = until ? toTime(until) : null;

  return items.filter((item) => {
    const time = toTime(item.observedAt);
    if (time === null) return false;
    if (sinceTime !== null && time < sinceTime) return false;
    if (untilTime !== null && time > untilTime) return false;
    return true;
  });
}
