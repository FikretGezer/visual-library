import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../auth/users-store.mjs";
import { createUsersService, seedAdmins, ServiceError } from "../auth/users-service.mjs";

async function setup() {
  const store = createMemoryStore();
  const svc = createUsersService(store);
  const admin = await store.create({ email: "admin@x.com", role: "admin" });
  const user = await store.create({ email: "user@x.com", role: "user" });
  return { store, svc, admin, user };
}
const code = (c) => (e) => e instanceof ServiceError && e.code === c;

test("add: gecersiz e-posta INVALID_EMAIL", async () => {
  const { svc } = await setup();
  for (const bad of ["abc", "", "  ", "a@b", "a b@x.com"]) {
    await assert.rejects(() => svc.add("admin@x.com", { email: bad, role: "user" }), code("INVALID_EMAIL"), bad);
  }
});

test("add: normalize eder, createdBy aktoru yazar, ayni e-posta DUPLICATE", async () => {
  const { svc } = await setup();
  const u = await svc.add("admin@x.com", { email: "  Yeni@X.com ", displayName: "Yeni", role: "user" });
  assert.equal(u.email, "yeni@x.com");
  assert.equal(u.createdBy, "admin@x.com");
  await assert.rejects(() => svc.add("admin@x.com", { email: "YENI@x.com", role: "user" }), code("DUPLICATE"));
});

test("add: gecersiz rol INVALID_ROLE", async () => {
  const { svc } = await setup();
  await assert.rejects(() => svc.add("admin@x.com", { email: "a@b.com", role: "root" }), code("INVALID_ROLE"));
});

test("kendi kendine: pasife alma, silme, rolu dusurme SELF_ACTION", async () => {
  const { svc, admin } = await setup();
  await svc.add("admin@x.com", { email: "admin2@x.com", role: "admin" });
  await assert.rejects(() => svc.setActive("admin@x.com", admin.id, false), code("SELF_ACTION"));
  await assert.rejects(() => svc.remove("admin@x.com", admin.id), code("SELF_ACTION"));
  await assert.rejects(() => svc.setRole("admin@x.com", admin.id, "user"), code("SELF_ACTION"));
});

test("son aktif admin: baskasi silemez/pasifleyemez/dusuremez LAST_ADMIN", async () => {
  const { svc, store, admin } = await setup();
  const other = await store.create({ email: "other@x.com", role: "admin" });
  await svc.setActive("admin@x.com", other.id, false);
  await assert.rejects(() => svc.remove("other@x.com", admin.id), code("LAST_ADMIN"));
  await assert.rejects(() => svc.setActive("other@x.com", admin.id, false), code("LAST_ADMIN"));
  await assert.rejects(() => svc.setRole("other@x.com", admin.id, "user"), code("LAST_ADMIN"));
});

test("normal akis: admin baskasini pasife alir, rol degistirir, siler", async () => {
  const { svc, store, user } = await setup();
  assert.equal((await svc.setActive("admin@x.com", user.id, false)).isActive, false);
  assert.equal((await svc.setRole("admin@x.com", user.id, "admin")).role, "admin");
  await svc.remove("admin@x.com", user.id);
  assert.equal(await store.findByEmail("user@x.com"), null);
  await assert.rejects(() => svc.remove("admin@x.com", 999), code("NOT_FOUND"));
});

test("seedAdmins: bos depoda ekler, dolu depoda eklemez, listeyi kirpar", async () => {
  const store = createMemoryStore();
  assert.equal(await seedAdmins(store, " a@x.com , B@x.com,, "), 2);
  assert.equal((await store.findByEmail("b@x.com")).role, "admin");
  assert.equal(await seedAdmins(store, "c@x.com"), 0);
  assert.equal(await store.findByEmail("c@x.com"), null);
  assert.equal(await seedAdmins(createMemoryStore(), ""), 0);
});
