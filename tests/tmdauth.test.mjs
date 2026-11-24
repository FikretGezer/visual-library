import { test } from "node:test";
import assert from "node:assert/strict";
import { createTmdAuth } from "../auth/tmdauth.mjs";

const base = { enabled: true, domain: "https://ad.example/", apiKey: "K", apiPass: "P", userMode: "email", insecureSsl: false, timeoutMs: 1000 };

/** routes: { "/api/login": [cevap...], "/api/checkAdUser": [cevap...] } cevap = { status, data } ya da Error */
function fakeFetch(routes) {
  const calls = [];
  const queues = Object.fromEntries(Object.entries(routes).map(([k, v]) => [k, [...v]]));
  const fn = async (url, init) => {
    const path = new URL(url).pathname;
    const body = Object.fromEntries(new URLSearchParams(init.body));
    calls.push({ path, body });
    const next = queues[path].length > 1 ? queues[path].shift() : queues[path][0];
    if (next instanceof Error) throw next;
    return { status: next.status, text: async () => JSON.stringify(next.data) };
  };
  fn.calls = calls;
  return fn;
}
const loginOk = { status: 200, data: { result: "success", token: "T1" } };
const checkOk = { status: 200, data: { result: "success" } };

test("dogru parola ok:true, servis tokeni kullanilir", async () => {
  const f = fakeFetch({ "/api/login": [loginOk], "/api/checkAdUser": [checkOk] });
  const r = await createTmdAuth(base, f).check("a@x.com", "pw");
  assert.deepEqual(r, { ok: true });
  assert.equal(f.calls[0].path, "/api/login");
  assert.deepEqual(f.calls[0].body, { api_key: "K", password: "P" });
  assert.deepEqual(f.calls[1].body, { api_token: "T1", user: "a@x.com", password: "pw" });
});

test("yanlis parola unavailable:false", async () => {
  const f = fakeFetch({ "/api/login": [loginOk], "/api/checkAdUser": [{ status: 200, data: { result: "failed" } }] });
  assert.deepEqual(await createTmdAuth(base, f).check("a@x.com", "yanlis"), { ok: false, unavailable: false });
});

test("ag hatasi unavailable:true", async () => {
  const f = fakeFetch({ "/api/login": [new Error("ECONNREFUSED")], "/api/checkAdUser": [checkOk] });
  assert.deepEqual(await createTmdAuth(base, f).check("a@x.com", "pw"), { ok: false, unavailable: true });
  const f2 = fakeFetch({ "/api/login": [loginOk], "/api/checkAdUser": [new Error("timeout")] });
  assert.deepEqual(await createTmdAuth(base, f2).check("a@x.com", "pw"), { ok: false, unavailable: true });
});

test("sunucu hatasi 5xx unavailable:true", async () => {
  const f = fakeFetch({ "/api/login": [loginOk], "/api/checkAdUser": [{ status: 503, data: null }] });
  assert.deepEqual(await createTmdAuth(base, f).check("a@x.com", "pw"), { ok: false, unavailable: true });
});

test("Unauthenticated. cevabinda token bir kez yenilenir", async () => {
  const f = fakeFetch({
    "/api/login": [loginOk, { status: 200, data: { result: "success", token: "T2" } }],
    "/api/checkAdUser": [{ status: 401, data: { message: "Unauthenticated." } }, checkOk],
  });
  assert.deepEqual(await createTmdAuth(base, f).check("a@x.com", "pw"), { ok: true });
  assert.equal(f.calls.filter((c) => c.path === "/api/login").length, 2);
  assert.equal(f.calls.at(-1).body.api_token, "T2");
});

test("kapali ya da eksik ayar unavailable:true, fetch cagrilmaz", async () => {
  for (const s of [{ ...base, enabled: false }, { ...base, domain: "" }, { ...base, apiKey: " " }, { ...base, apiPass: "" }]) {
    const f = fakeFetch({ "/api/login": [loginOk], "/api/checkAdUser": [checkOk] });
    const t = createTmdAuth(s, f);
    assert.equal(t.isEnabled(), false);
    assert.deepEqual(await t.check("a@x.com", "pw"), { ok: false, unavailable: true });
    assert.equal(f.calls.length, 0);
  }
});

test("bos parola ya da e-posta unavailable:false, fetch cagrilmaz", async () => {
  const f = fakeFetch({ "/api/login": [loginOk], "/api/checkAdUser": [checkOk] });
  const t = createTmdAuth(base, f);
  assert.deepEqual(await t.check("a@x.com", ""), { ok: false, unavailable: false });
  assert.deepEqual(await t.check("", "pw"), { ok: false, unavailable: false });
  assert.equal(f.calls.length, 0);
});

test("userMode localpart: @ oncesi gonderilir", async () => {
  const f = fakeFetch({ "/api/login": [loginOk], "/api/checkAdUser": [checkOk] });
  await createTmdAuth({ ...base, userMode: "localpart" }, f).check("ali@x.com", "pw");
  assert.equal(f.calls[1].body.user, "ali");
});

test("parola konsola yazilmaz", async () => {
  const logs = [];
  const orig = [console.log, console.info, console.warn, console.error];
  console.log = console.info = console.warn = console.error = (...a) => logs.push(a.join(" "));
  try {
    const f = fakeFetch({ "/api/login": [loginOk], "/api/checkAdUser": [{ status: 200, data: { result: "failed" } }] });
    await createTmdAuth(base, f).check("a@x.com", "GIZLI-PAROLA");
  } finally {
    [console.log, console.info, console.warn, console.error] = orig;
  }
  assert.ok(!logs.join("\n").includes("GIZLI-PAROLA"));
});
