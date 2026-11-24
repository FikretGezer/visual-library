// Kullanici deposu: RPA_DB'deki visuallibrary.users (SQL Server, tedious) ve testler icin bellek ici surum.
import { readFileSync } from "node:fs";

/** E-postayi kirpar ve kucuk harfe cevirir (tabloda hep bu bicimde tutulur). */
export function normalizeEmail(s) {
  return String(s ?? "").trim().toLowerCase();
}

/** `sqlserver://host:port;database=ADI;user=..;password=..;encrypt=true` adresini ayirir. */
export function parseDatabaseUrl(url) {
  const m = String(url ?? "").trim().match(/^sqlserver:\/\/([^:;/]+)(?::(\d+))?;(.+)$/i);
  if (!m) throw new Error("DATABASE_URL bicimi gecersiz. Beklenen: sqlserver://host:1433;database=ADI;user=..;password=..");
  const props = {};
  for (const part of m[3].split(";")) {
    const i = part.indexOf("=");
    if (i > 0) props[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  const database = props.database ?? props["initial catalog"];
  if (!database) throw new Error("DATABASE_URL icinde 'database' bulunamadi");
  const bool = (v, d) => (v === undefined ? d : /^(true|yes|1)$/i.test(v));
  return {
    server: m[1],
    port: m[2] ? Number(m[2]) : 1433,
    database,
    user: props.user ?? props["user id"] ?? props.uid ?? "",
    password: props.password ?? props.pwd ?? "",
    encrypt: bool(props.encrypt, true),
    trustServerCertificate: bool(props.trustservercertificate, true),
  };
}

function storeError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** Bellek ici depo: testler ve gelistirme icin. */
export function createMemoryStore() {
  let seq = 0;
  const rows = new Map();
  const clone = (u) => ({ ...u });
  const byEmail = (email) => [...rows.values()].find((u) => u.email === normalizeEmail(email)) ?? null;
  return {
    async migrate() {},
    async findByEmail(email) {
      const u = byEmail(email);
      return u ? clone(u) : null;
    },
    async list() {
      return [...rows.values()].sort((a, b) => a.email.localeCompare(b.email)).map(clone);
    },
    async create({ email, displayName = null, role = "user", createdBy = null }) {
      const norm = normalizeEmail(email);
      if (byEmail(norm)) throw storeError("DUPLICATE", "Bu e-posta zaten kayitli");
      const u = {
        id: ++seq, email: norm, displayName, role, isActive: true,
        createdAt: new Date().toISOString(), createdBy, lastLoginAt: null,
      };
      rows.set(u.id, u);
      return clone(u);
    },
    async update(id, patch) {
      const u = rows.get(id);
      if (!u) throw storeError("NOT_FOUND", "Kullanici bulunamadi");
      for (const k of ["displayName", "role", "isActive"]) if (patch[k] !== undefined) u[k] = patch[k];
      return clone(u);
    },
    async remove(id) {
      rows.delete(id);
    },
    async touchLogin(id) {
      const u = rows.get(id);
      if (u) u.lastLoginAt = new Date().toISOString();
    },
    async count() {
      return rows.size;
    },
  };
}

const COLUMNS = "id, email, display_name, role, is_active, created_at, created_by, last_login_at";

function mapRow(r) {
  const iso = (d) => (d ? new Date(d).toISOString() : null);
  return {
    id: Number(r.id), email: r.email, displayName: r.display_name ?? null, role: r.role,
    isActive: Boolean(r.is_active), createdAt: iso(r.created_at), createdBy: r.created_by ?? null,
    lastLoginAt: iso(r.last_login_at),
  };
}

/** SQL Server deposu. Her islem kisa omurlu bir baglanti acar (dusuk trafik). */
export function createSqlStore(databaseUrl) {
  const cfg = parseDatabaseUrl(databaseUrl);

  async function exec(sql, params = [], { batch = false } = {}) {
    const { Connection, Request, TYPES } = await import("tedious");
    return new Promise((resolve, reject) => {
      const conn = new Connection({
        server: cfg.server,
        authentication: { type: "default", options: { userName: cfg.user, password: cfg.password } },
        options: {
          port: cfg.port, database: cfg.database, encrypt: cfg.encrypt,
          trustServerCertificate: cfg.trustServerCertificate, rowCollectionOnRequestCompletion: true,
          connectTimeout: 15000, requestTimeout: 30000,
        },
      });
      conn.on("error", () => {});
      conn.connect((err) => {
        if (err) return reject(err);
        const req = new Request(sql, (e, _n, rows) => {
          conn.close();
          if (e) return reject(e);
          resolve((rows ?? []).map((cols) => Object.fromEntries(cols.map((c) => [c.metadata.colName, c.value]))));
        });
        for (const [name, type, value] of params) req.addParameter(name, TYPES[type], value);
        if (batch) conn.execSqlBatch(req);
        else conn.execSql(req);
      });
    });
  }

  const isDuplicate = (e) => [2601, 2627].includes(e?.number);
  const one = async (sql, params) => (await exec(sql, params)).map(mapRow)[0] ?? null;

  return {
    async migrate() {
      const sql = readFileSync(new URL("../sql/0001_users.sql", import.meta.url), "utf8");
      await exec(sql, [], { batch: true });
    },
    findByEmail: (email) => one(`SELECT ${COLUMNS} FROM visuallibrary.users WHERE email = @email`, [["email", "NVarChar", normalizeEmail(email)]]),
    async list() {
      return (await exec(`SELECT ${COLUMNS} FROM visuallibrary.users ORDER BY email`)).map(mapRow);
    },
    async create({ email, displayName = null, role = "user", createdBy = null }) {
      try {
        return await one(
          `INSERT INTO visuallibrary.users (email, display_name, role, created_by)
           OUTPUT INSERTED.id, INSERTED.email, INSERTED.display_name, INSERTED.role, INSERTED.is_active,
                  INSERTED.created_at, INSERTED.created_by, INSERTED.last_login_at
           VALUES (@email, @name, @role, @by)`,
          [["email", "NVarChar", normalizeEmail(email)], ["name", "NVarChar", displayName], ["role", "NVarChar", role], ["by", "NVarChar", createdBy]],
        );
      } catch (e) {
        if (isDuplicate(e)) throw storeError("DUPLICATE", "Bu e-posta zaten kayitli");
        throw e;
      }
    },
    async update(id, patch) {
      const sets = [];
      const params = [["id", "BigInt", id]];
      if (patch.displayName !== undefined) { sets.push("display_name = @name"); params.push(["name", "NVarChar", patch.displayName]); }
      if (patch.role !== undefined) { sets.push("role = @role"); params.push(["role", "NVarChar", patch.role]); }
      if (patch.isActive !== undefined) { sets.push("is_active = @active"); params.push(["active", "Bit", patch.isActive]); }
      if (!sets.length) {
        const cur = await one(`SELECT ${COLUMNS} FROM visuallibrary.users WHERE id = @id`, params);
        if (!cur) throw storeError("NOT_FOUND", "Kullanici bulunamadi");
        return cur;
      }
      const row = await one(
        `UPDATE visuallibrary.users SET ${sets.join(", ")}
         OUTPUT INSERTED.id, INSERTED.email, INSERTED.display_name, INSERTED.role, INSERTED.is_active,
                INSERTED.created_at, INSERTED.created_by, INSERTED.last_login_at
         WHERE id = @id`,
        params,
      );
      if (!row) throw storeError("NOT_FOUND", "Kullanici bulunamadi");
      return row;
    },
    async remove(id) {
      await exec("DELETE FROM visuallibrary.users WHERE id = @id", [["id", "BigInt", id]]);
    },
    async touchLogin(id) {
      await exec("UPDATE visuallibrary.users SET last_login_at = SYSUTCDATETIME() WHERE id = @id", [["id", "BigInt", id]]);
    },
    async count() {
      const rows = await exec("SELECT COUNT(*) AS n FROM visuallibrary.users");
      return Number(rows[0]?.n ?? 0);
    },
  };
}
