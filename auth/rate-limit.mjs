// Giris deneme siniri: max yanlis denemeden sonra windowMs boyunca kilit (bellekte).
export function createRateLimiter({ max = 5, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const hits = new Map();
  const locked = new Map();
  return {
    hit(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
      recent.push(t);
      hits.set(key, recent);
      if (recent.length >= max) locked.set(key, t + windowMs);
    },
    blocked(key) {
      const until = locked.get(key);
      if (until === undefined) return false;
      if (until > now()) return true;
      locked.delete(key);
      hits.delete(key);
      return false;
    },
    reset(key) {
      hits.delete(key);
      locked.delete(key);
    },
  };
}
