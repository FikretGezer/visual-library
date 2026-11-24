import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../auth/rate-limit.mjs";

test("5. yanlis denemeden sonra kilitlenir, sure dolunca acilir", () => {
  let now = 0;
  const l = createRateLimiter({ max: 5, windowMs: 900_000, now: () => now });
  for (let i = 0; i < 4; i++) l.hit("a|1.1.1.1");
  assert.equal(l.blocked("a|1.1.1.1"), false);
  l.hit("a|1.1.1.1");
  assert.equal(l.blocked("a|1.1.1.1"), true);
  assert.equal(l.blocked("b|1.1.1.1"), false);
  now = 900_001;
  assert.equal(l.blocked("a|1.1.1.1"), false);
});

test("reset sayaci temizler; eski denemeler pencereden duser", () => {
  let now = 0;
  const l = createRateLimiter({ max: 3, windowMs: 1000, now: () => now });
  l.hit("k"); l.hit("k"); now = 1500; l.hit("k");
  assert.equal(l.blocked("k"), false);
  l.hit("k"); l.hit("k");
  assert.equal(l.blocked("k"), true);
  l.reset("k");
  assert.equal(l.blocked("k"), false);
});
