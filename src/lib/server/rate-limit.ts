type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const maximumBuckets = 20_000;

function prune(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size >= maximumBuckets) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

export function consumeRateLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
) {
  const normalizedKey = key.trim().slice(0, 256) || "unknown";
  const bucketKey = `${namespace}:${normalizedKey}`;
  const current = buckets.get(bucketKey);
  if (!current || current.resetAt <= now) {
    if (buckets.size >= maximumBuckets) prune(now);
    const resetAt = now + windowMs;
    buckets.set(bucketKey, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
  }
  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }
  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

export function clearRateLimitsForTests() {
  buckets.clear();
}
