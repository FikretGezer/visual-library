// Guncelle.bat'in kullandigi betik: calisan sunucuya yerelden guncelleme istegi atar.
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const n = Number(process.env.PORT);
const port = Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 4099;

try {
  const res = await fetch(`http://127.0.0.1:${port}/_guncelle`, { method: "POST", signal: AbortSignal.timeout(180_000) });
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    const files = body.changedFiles ?? [];
    console.log(files.length ? `Guncellendi (${body.method}): ${files.length} dosya degisti` : `Guncel (${body.method}): degisiklik yok`);
    for (const f of files) console.log("  " + f);
  } else if (res.status === 409) {
    console.log("Guncelleme zaten calisiyor, biraz sonra tekrar deneyin.");
  } else {
    console.log(`Guncelleme basarisiz: ${body.error ?? res.status}`);
    process.exitCode = 1;
  }
} catch {
  console.log(`Sunucuya ulasilamadi (127.0.0.1:${port}). Baslat.bat calisiyor mu?`);
  process.exitCode = 1;
}
