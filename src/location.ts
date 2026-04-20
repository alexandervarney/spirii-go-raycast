import { getPreferenceValues } from "@raycast/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pExecFile = promisify(execFile);

type Prefs = {
  lat?: string;
  lon?: string;
};

export type Coords = {
  lat: number;
  lon: number;
  source: "preference" | "corelocation" | "ip" | "default";
  warning?: string;
};

const COPENHAGEN: Coords = { lat: 55.6761, lon: 12.5683, source: "default" };

const CORELOCATION_PATHS = [
  "/opt/homebrew/bin/CoreLocationCLI",
  "/usr/local/bin/CoreLocationCLI",
];

type CliResult = { coords?: Coords; error?: string; installed: boolean };

async function tryCoreLocation(): Promise<CliResult> {
  let installed = false;
  let lastError: string | undefined;
  for (const bin of CORELOCATION_PATHS) {
    try {
      const { stdout, stderr } = await pExecFile(bin, ["-once", "true", "-format", "%latitude %longitude"], {
        timeout: 8000,
      });
      installed = true;
      const out = (stdout || stderr || "").trim();
      const [latStr, lonStr] = out.split(/\s+/);
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { coords: { lat, lon, source: "corelocation" }, installed: true };
      }
      lastError = out || "CoreLocationCLI returned no coordinates";
    } catch (e) {
      const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
      if (err.code === "ENOENT") continue;
      installed = true;
      lastError = (err.stderr || err.stdout || err.message || "").toString().trim();
    }
  }
  return { installed, error: lastError };
}

async function tryIp(): Promise<Coords | null> {
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = (await res.json()) as { latitude?: number; longitude?: number };
      if (typeof data.latitude === "number" && typeof data.longitude === "number") {
        return { lat: data.latitude, lon: data.longitude, source: "ip" };
      }
    }
  } catch {
    // fall through
  }
  return null;
}

export async function getCoords(): Promise<Coords> {
  const prefs = getPreferenceValues<Prefs>();
  const lat = prefs.lat ? parseFloat(prefs.lat) : NaN;
  const lon = prefs.lon ? parseFloat(prefs.lon) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { lat, lon, source: "preference" };
  }

  const gps = await tryCoreLocation();
  if (gps.coords) return gps.coords;

  const ip = await tryIp();
  if (ip) {
    if (gps.installed && gps.error) {
      return { ...ip, warning: `GPS unavailable: ${gps.error}` };
    }
    return ip;
  }

  return { ...COPENHAGEN, warning: gps.error ?? "Could not determine location" };
}
