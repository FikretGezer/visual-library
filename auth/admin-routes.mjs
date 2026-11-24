// Yonetim uclari (yalnizca admin): /yonetim sayfasi, /_api/users, /_api/update.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sendJson, readJson } from "./routes.mjs";
import { ServiceError } from "./users-service.mjs";

const STATUS = {
  INVALID_EMAIL: 400, INVALID_ROLE: 400, NOT_FOUND: 404,
  DUPLICATE: 409, SELF_ACTION: 409, LAST_ADMIN: 409,
};

export function createAdmin({ service, onUpdate, getStatus, sameOrigin, root = "." }) {
  const fail = (res, e) => {
    if (e instanceof ServiceError) return sendJson(res, STATUS[e.code] ?? 400, { error: e.code, message: e.message });
    if (e?.code === "BUSY") return sendJson(res, 409, { error: "busy", message: e.message });
    if (e?.code === "TOO_LARGE") return sendJson(res, 413, { error: "too-large" });
    console.error("Yonetim hatasi:", e?.message);
    return sendJson(res, 500, { error: "server", message: e?.message ?? "Sunucu hatasi" });
  };

  /** Isledi ise true doner. Yonetim yollari disindakiler false (sonra statik sunulur). */
  async function handle(req, res, user) {
    const path = (req.url ?? "/").split("?")[0];
    const isPage = path === "/yonetim" || path === "/yonetim.html";
    const isApi = path.startsWith("/_api/users") || path === "/_api/update" || path === "/_api/update/status";
    if (!isPage && !isApi) return false;

    if (user.role !== "admin") {
      sendJson(res, 403, { error: "forbidden" });
      return true;
    }
    try {
      if (isPage) {
        const html = readFileSync(join(root, "yonetim.html"));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": html.length, "x-content-type-options": "nosniff", "cache-control": "no-store" });
        res.end(req.method === "HEAD" ? undefined : html);
        return true;
      }
      if (req.method !== "GET" && !sameOrigin(req)) {
        sendJson(res, 403, { error: "origin" });
        return true;
      }
      const actor = user.email;
      if (path === "/_api/users" && req.method === "GET") sendJson(res, 200, await service.list());
      else if (path === "/_api/users" && req.method === "POST") {
        const b = await readJson(req);
        sendJson(res, 201, await service.add(actor, { email: b.email, displayName: b.displayName, role: b.role ?? "user" }));
      } else if (/^\/_api\/users\/\d+$/.test(path) && (req.method === "PATCH" || req.method === "DELETE")) {
        const id = Number(path.split("/").pop());
        if (req.method === "DELETE") {
          await service.remove(actor, id);
          sendJson(res, 200, { ok: true });
        } else {
          const b = await readJson(req);
          let updated = null;
          if (b.role !== undefined) updated = await service.setRole(actor, id, b.role);
          if (b.isActive !== undefined) updated = await service.setActive(actor, id, Boolean(b.isActive));
          if (!updated) throw new ServiceError("INVALID_ROLE", "Guncellenecek alan yok");
          sendJson(res, 200, updated);
        }
      } else if (path === "/_api/update" && req.method === "POST") {
        sendJson(res, 200, await onUpdate());
      } else if (path === "/_api/update/status" && req.method === "GET") {
        sendJson(res, 200, getStatus() ?? {});
      } else {
        sendJson(res, 405, { error: "method" });
      }
    } catch (e) {
      fail(res, e);
    }
    return true;
  }

  return { handle };
}
