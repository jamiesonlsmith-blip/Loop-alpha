import { createRemoteJWKSet, jwtVerify } from "jsr:@panva/jose@6";

// This Edge Function deliberately disables Supabase JWT verification: GitHub's
// signed OIDC JWT is verified below instead. Every mismatch fails closed.
const AUDIENCE = "loop-overture-import";
const REPO = "jamiesonlsmith-blip/Loop-alpha";
const REPO_ID = "1384260467";
const WORKFLOW_REF = REPO + "/.github/workflows/overture-broward-import-once.yml@refs/heads/main";
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const MAX_DATABASE_BYTES = 360 * 1024 * 1024;

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function readServiceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (legacy) return legacy;
  try {
    const available = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return String(available.default || Object.values(available)[0] || "");
  } catch {
    return "";
  }
}
async function authorize(request: Request) {
  const header = request.headers.get("Authorization") || "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: AUDIENCE,
      algorithms: ["RS256"],
      clockTolerance: "10s",
    });
    return payload.repository === REPO &&
      String(payload.repository_id) === REPO_ID &&
      payload.ref === "refs/heads/main" &&
      payload.sub === "repo:" + REPO + ":ref:refs/heads/main" &&
      payload.workflow_ref === WORKFLOW_REF &&
      payload.event_name === "push" &&
      payload.runner_environment === "github-hosted";
  } catch {
    return false;
  }
}
function sanitize(value: unknown, max = 200): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("Invalid text property");
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}
function cleanRow(entry: Record<string, unknown>) {
  const id = sanitize(entry.overture_id, 50);
  const name = sanitize(entry.name, 220);
  const point = sanitize(entry.position, 120);
  const release = sanitize(entry.source_release, 60);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !name ||
      !release || !/^20\d{2}-\d{2}-\d{2}\.\d+$/.test(release) || !point) {
    throw new Error("Invalid Overture identity, name, release, or position");
  }
  const geo = /^SRID=4326;POINT\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/.exec(point);
  if (!geo) throw new Error("Invalid geographic point");
  const lon = Number(geo[1]), lat = Number(geo[2]);
  if (!(lon >= -80.53 && lon <= -80.04 && lat >= 25.94 && lat <= 26.42))
    throw new Error("Outside Broward pilot region");
  const confidence = Number(entry.confidence);
  if (!Number.isFinite(confidence) || confidence < 0.55 || confidence > 1)
    throw new Error("Confidence not within pilot bounds");
  if (entry.operating_status === "permanently_closed")
    throw new Error("Permanently closed place");
  const hierarchy = Array.isArray(entry.taxonomy_hierarchy)
    ? entry.taxonomy_hierarchy.map(v => sanitize(v, 120)).filter(Boolean).slice(0, 12) : [];
  const datasets = Array.isArray(entry.source_datasets)
    ? entry.source_datasets.map(v => sanitize(v, 80)).filter(Boolean).slice(0, 20) : [];
  return {
    overture_id: id, name,
    basic_category: sanitize(entry.basic_category, 100),
    taxonomy_primary: sanitize(entry.taxonomy_primary, 120),
    taxonomy_hierarchy: hierarchy,
    full_address: sanitize(entry.full_address, 320),
    locality: sanitize(entry.locality, 160),
    region: sanitize(entry.region, 100),
    country: sanitize(entry.country, 5),
    website: (() => {
      const url = sanitize(entry.website, 420);
      return url && /^https?:\/\//.test(url) ? url : null;
    })(),
    confidence,
    operating_status: sanitize(entry.operating_status, 32),
    position: point, source_release: release, source_datasets: datasets,
  };
}
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return fail("POST required", 405);
  if (!(await authorize(request))) return fail("Unauthorized import identity", 403);
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const key = readServiceKey();
  if (!base.startsWith("https://") || !key) return fail("Server import configuration missing", 503);
  const authHeaders = { apikey: key, Authorization: "Bearer " + key };
  try {
    if (Number(request.headers.get("content-length") || "0") > 240000)
      return fail("Import batch too large", 413);
    const body = await request.json();
    if (!body || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 200)
      return fail("Only batches of 1-200 places are supported", 400);
    const safeRows = body.items.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new Error("Place must be an object");
      return cleanRow(item as Record<string, unknown>);
    });
    const sizeResponse = await fetch(base + "/rest/v1/rpc/loop_overture_storage_guard", {
      method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
      body: "{}", signal: AbortSignal.timeout(8000),
    });
    if (!sizeResponse.ok) return fail("Storage check unavailable", 503);
    const databaseBytes = Number(await sizeResponse.json());
    if (!Number.isFinite(databaseBytes)) return fail("Invalid storage check", 503);
    if (databaseBytes >= MAX_DATABASE_BYTES)
      return fail("Database safety limit reached (360 MiB)", 507);
    const response = await fetch(base + "/rest/v1/loop_place_index?on_conflict=overture_id", {
      method: "POST",
      headers: {
        ...authHeaders, "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(safeRows),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.error("Overture storage write returned HTTP", response.status);
      return fail("Database write temporarily unavailable", 502);
    }
    return Response.json(
      { imported: safeRows.length, databaseBytesBeforeWrite: databaseBytes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.warn("Overture batch rejected:", err instanceof Error ? err.message : "unknown");
    return fail("Invalid import request or upstream failure", 400);
  }
});
