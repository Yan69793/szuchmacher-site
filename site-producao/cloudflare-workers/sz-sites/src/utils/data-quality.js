export function toEpochMs(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

export function ageSeconds(value, nowMs = Date.now()) {
  const ms = toEpochMs(value);
  if (ms == null) return null;
  return Math.max(0, Math.round((nowMs - ms) / 1000));
}

export function freshnessState(value, maxAgeSeconds, nowMs = Date.now()) {
  const age = ageSeconds(value, nowMs);
  if (age == null) return { state: 'missing', age_s: null };
  if (age <= maxAgeSeconds) return { state: 'fresh', age_s: age };
  if (age <= maxAgeSeconds * 6) return { state: 'stale', age_s: age };
  return { state: 'expired', age_s: age };
}

export function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
