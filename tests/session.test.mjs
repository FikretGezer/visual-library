import { test } from "node:test";
import assert from "node:assert/strict";
import { newSession, verifySession, slideSession, SLIDING_MS, ABSOLUTE_MS } from "../auth/session.mjs";

const S = "gizli-anahtar-1234567890";
const T0 = 1_700_000_000_000;

test("newSession + verifySession: yuk doner, sureler dogru", () => {
  const p = verifySession(S, newSession(S, "a@x.com", T0), T0 + 1000);
  assert.equal(p.email, "a@x.com");
  assert.equal(p.exp, T0 + SLIDING_MS);
  assert.equal(p.abs, T0 + ABSOLUTE_MS);
});

test("bozulmus imza, farkli anahtar, suresi dolmus, bozuk bicim: null", () => {
  const tok = newSession(S, "a@x.com", T0);
  const tampered = tok.slice(0, -1) + (tok.endsWith("A") ? "B" : "A");
  assert.equal(verifySession(S, tampered, T0), null);
  assert.equal(verifySession("baska-anahtar", tok, T0), null);
  assert.equal(verifySession(S, tok, T0 + SLIDING_MS + 1), null);
  for (const bad of ["", "x", "a.b", "....", "e30.e30", undefined, null]) assert.equal(verifySession(S, bad, T0), null, String(bad));
});

test("payload'u degistirip imzayi korumak olmaz", () => {
  const [, sig] = newSession(S, "a@x.com", T0).split(".");
  const forged = Buffer.from(JSON.stringify({ email: "admin@x.com", iat: T0, exp: T0 + SLIDING_MS, abs: T0 + ABSOLUTE_MS })).toString("base64url");
  assert.equal(verifySession(S, `${forged}.${sig}`, T0), null);
});

test("slideSession: 14 gun uzatir ama mutlak siniri asmaz", () => {
  const first = verifySession(S, newSession(S, "a@x.com", T0), T0);
  const day10 = T0 + 10 * 86_400_000;
  const slid = verifySession(S, slideSession(S, first, day10), day10);
  assert.equal(slid.exp, day10 + SLIDING_MS);
  assert.equal(slid.abs, first.abs);
  const day25 = T0 + 25 * 86_400_000;
  const near = verifySession(S, slideSession(S, slid, day25), day25);
  assert.equal(near.exp, first.abs);
  assert.equal(verifySession(S, slideSession(S, near, day25), first.abs + 1), null);
});
