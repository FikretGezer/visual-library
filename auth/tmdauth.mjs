// TmdAuth: kurumsal Active Directory dogrulama REST servisi (AiMonitoring'deki tmdauth.ts'in karsiligi).
//   POST {domain}/api/login        (api_key, password)         -> { result: "success", token }
//   POST {domain}/api/checkAdUser  (api_token, user, password) -> { result: "success" }
// Servis tokeni bellekte tutulur; "Unauthenticated." cevabinda bir kez yenilenir. Parolalar loglanmaz.

/** Ortam degiskenlerinden ayarlari okur (AiMonitoring ile ayni adlar). */
export function tmdSettingsFromEnv(env) {
  return {
    enabled: String(env.TMDAUTH_ENABLED ?? "").toLowerCase() === "true",
    domain: env.TMDAUTH_API_DOMAIN ?? "",
    apiKey: env.TMDAUTH_API_KEY ?? "",
    apiPass: env.TMDAUTH_API_PASS ?? "",
    userMode: env.TMDAUTH_USER_MODE === "localpart" ? "localpart" : "email",
    insecureSsl: String(env.TMDAUTH_INSECURE_SSL ?? "").toLowerCase() === "true",
    timeoutMs: Number(env.TMDAUTH_TIMEOUT_MS) > 0 ? Number(env.TMDAUTH_TIMEOUT_MS) : 10_000,
  };
}

export function createTmdAuth(settings, fetchImpl = fetch) {
  let token = null;
  const s = settings;
  const isEnabled = () => Boolean(s.enabled && s.domain.trim() && s.apiKey.trim() && s.apiPass.trim());
  const base = () => s.domain.trim().replace(/\/+$/, "");

  async function post(path, fields) {
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    try {
      // Yalnizca acikca istenirse (kurum ici sertifika); varsayilan dogrulama acik.
      if (s.insecureSsl) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      const res = await fetchImpl(base() + path, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields).toString(),
        signal: AbortSignal.timeout(s.timeoutMs),
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      return { status: res.status, data };
    } catch {
      return { status: 0, data: null, error: true };
    } finally {
      if (s.insecureSsl) {
        if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
      }
    }
  }

  async function login() {
    const r = await post("/api/login", { api_key: s.apiKey, password: s.apiPass });
    if (r.status !== 200 || r.data?.result !== "success" || typeof r.data?.token !== "string") return null;
    token = r.data.token;
    return token;
  }

  const adUser = (email) => (s.userMode === "localpart" && email.includes("@") ? email.split("@")[0] : email);
  const unavailable = { ok: false, unavailable: true };

  async function check(email, password) {
    if (!isEnabled()) return unavailable;
    if (!email || !password) return { ok: false, unavailable: false };
    token ??= await login();
    if (!token) return unavailable;
    const fields = (t) => ({ api_token: t, user: adUser(email), password });

    let r = await post("/api/checkAdUser", fields(token));
    if (r.error) return unavailable;
    if (r.data?.message === "Unauthenticated.") {
      token = null;
      if (!(await login())) return unavailable;
      r = await post("/api/checkAdUser", fields(token));
      if (r.error) return unavailable;
    }
    if (r.status >= 500) return unavailable;
    if (r.status === 200 && r.data?.result === "success") return { ok: true };
    return { ok: false, unavailable: false };
  }

  return { isEnabled, check };
}
