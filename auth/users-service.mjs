// Kullanici yonetimi kurallari: kendini silememe, son admini koruma, e-posta dogrulama.
import { normalizeEmail } from "./users-store.mjs";

export class ServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(["admin", "user"]);

export function createUsersService(store) {
  async function target(id) {
    const all = await store.list();
    const u = all.find((x) => x.id === id);
    if (!u) throw new ServiceError("NOT_FOUND", "Kullanici bulunamadi");
    return { u, all };
  }

  /** Hedef aktif bir admin ise ve baska aktif admin yoksa admin yetkisini kaldiran islem engellenir. */
  function guard(actor, { u, all }, removesAdminPower) {
    if (u.email === normalizeEmail(actor)) throw new ServiceError("SELF_ACTION", "Kendi hesabinizda bu islemi yapamazsiniz");
    if (removesAdminPower && u.role === "admin" && u.isActive) {
      const others = all.filter((x) => x.id !== u.id && x.role === "admin" && x.isActive).length;
      if (others === 0) throw new ServiceError("LAST_ADMIN", "Son aktif yonetici degistirilemez");
    }
  }

  return {
    list: () => store.list(),

    async add(actor, { email, displayName = null, role = "user" }) {
      const norm = normalizeEmail(email);
      if (!EMAIL_RE.test(norm)) throw new ServiceError("INVALID_EMAIL", "Gecerli bir e-posta girin");
      if (!ROLES.has(role)) throw new ServiceError("INVALID_ROLE", "Rol admin ya da user olmali");
      try {
        return await store.create({ email: norm, displayName: displayName || null, role, createdBy: normalizeEmail(actor) });
      } catch (e) {
        if (e.code === "DUPLICATE") throw new ServiceError("DUPLICATE", "Bu e-posta zaten kayitli");
        throw e;
      }
    },

    async setActive(actor, id, active) {
      const t = await target(id);
      guard(actor, t, active === false);
      return store.update(id, { isActive: Boolean(active) });
    },

    async setRole(actor, id, role) {
      if (!ROLES.has(role)) throw new ServiceError("INVALID_ROLE", "Rol admin ya da user olmali");
      const t = await target(id);
      guard(actor, t, role !== "admin");
      return store.update(id, { role });
    },

    async remove(actor, id) {
      const t = await target(id);
      guard(actor, t, true);
      await store.remove(id);
    },
  };
}

/** Tablo bossa ADMIN_EMAILS listesini admin olarak ekler; eklenen sayiyi doner. */
export async function seedAdmins(store, adminEmails) {
  if ((await store.count()) > 0) return 0;
  const emails = String(adminEmails ?? "").split(",").map(normalizeEmail).filter(Boolean);
  let added = 0;
  for (const email of new Set(emails)) {
    await store.create({ email, role: "admin", createdBy: "ADMIN_EMAILS" });
    added++;
  }
  return added;
}
