import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeEmail, parseDatabaseUrl, createMemoryStore } from "../auth/users-store.mjs";

test("normalizeEmail: kirpar ve kucuk harfe cevirir", () => {
  assert.equal(normalizeEmail("  Ali@X.com "), "ali@x.com");
});

test("parseDatabaseUrl: sqlserver adresini ayirir", () => {
  const c = parseDatabaseUrl("sqlserver://sunucu:1433;database=RPA_DB;user=u;password=p;encrypt=true;trustServerCertificate=true");
  assert.equal(c.server, "sunucu");
  assert.equal(c.port, 1433);
  assert.equal(c.database, "RPA_DB");
  assert.equal(c.user, "u");
  assert.equal(c.password, "p");
  assert.equal(c.encrypt, true);
  assert.equal(c.trustServerCertificate, true);
});

test("parseDatabaseUrl: database yoksa firlatir, port yoksa 1433", () => {
  assert.throws(() => parseDatabaseUrl("sqlserver://h:1433;user=u"));
  assert.throws(() => parseDatabaseUrl("http://x"));
  assert.equal(parseDatabaseUrl("sqlserver://h;database=D;user=u;password=p").port, 1433);
});

test("bellek deposu: create/findByEmail buyuk-kucuk harfe bakmaz", async () => {
  const s = createMemoryStore();
  const u = await s.create({ email: " Ali@X.com", role: "user", createdBy: "a@x.com" });
  assert.equal(u.email, "ali@x.com");
  assert.equal(u.isActive, true);
  assert.equal(u.createdBy, "a@x.com");
  assert.equal((await s.findByEmail("ALI@x.COM")).id, u.id);
  assert.equal(await s.findByEmail("yok@x.com"), null);
});

test("bellek deposu: ayni e-posta ikinci kez DUPLICATE", async () => {
  const s = createMemoryStore();
  await s.create({ email: "a@x.com", role: "user" });
  await assert.rejects(() => s.create({ email: "A@x.com", role: "admin" }), (e) => e.code === "DUPLICATE");
});

test("bellek deposu: update, remove, touchLogin, count, list", async () => {
  const s = createMemoryStore();
  const a = await s.create({ email: "a@x.com", role: "user" });
  await s.create({ email: "b@x.com", role: "admin" });
  assert.equal(await s.count(), 2);
  const upd = await s.update(a.id, { isActive: false, role: "admin", displayName: "Ali" });
  assert.equal(upd.isActive, false);
  assert.equal(upd.role, "admin");
  assert.equal(upd.displayName, "Ali");
  assert.equal((await s.findByEmail("a@x.com")).isActive, false);
  await s.touchLogin(a.id);
  assert.ok((await s.findByEmail("a@x.com")).lastLoginAt);
  await assert.rejects(() => s.update(999, { isActive: true }), (e) => e.code === "NOT_FOUND");
  await s.remove(a.id);
  assert.equal(await s.findByEmail("a@x.com"), null);
  assert.equal((await s.list()).length, 1);
});

test("migrasyon dosyasi: yalnizca visuallibrary nesnelerini yaratir, yikici komut yok", () => {
  const sql = readFileSync(new URL("../sql/0001_users.sql", import.meta.url), "utf8");
  assert.match(sql, /IF NOT EXISTS/i);
  assert.match(sql, /CREATE SCHEMA/i);
  assert.match(sql, /CREATE TABLE visuallibrary\.users/i);
  for (const word of ["DROP", "TRUNCATE", "DELETE", "UPDATE", "ALTER", "aimonitoring"]) {
    assert.doesNotMatch(sql, new RegExp(`\\b${word}\\b`, "i"), word);
  }
  for (const col of ["id", "email", "display_name", "role", "is_active", "created_at", "created_by", "last_login_at"]) {
    assert.match(sql, new RegExp(`\\b${col}\\b`), col);
  }
  assert.match(sql, /CHECK \(role IN \('admin','user'\)\)/i);
  assert.match(sql, /UNIQUE/i);
});
