export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", ...headers,
  } });
}

export async function bodyJson(request, maxBytes = 16384) {
  const bytes = await limitedBody(request, maxBytes);
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  }
  catch { throw new HttpError(400, "Invalid JSON."); }
}

export async function limitedBody(request, maxBytes) {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new HttpError(413, "Request too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, "Request too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export function databaseConfigured(env) { return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY); }
export function organizationId(env) {
  if (!/^[0-9a-f-]{36}$/i.test(env.JAPS_CRM_ORGANIZATION_ID || "")) throw new HttpError(503, "Workspace not configured.");
  return env.JAPS_CRM_ORGANIZATION_ID;
}

export async function database(env, table, params = {}, init = {}) {
  if (!databaseConfigured(env)) throw new HttpError(503, "Database not configured.");
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== "https:") throw new HttpError(503, "Database configuration invalid.");
  const url = new URL(`/rest/v1/${table}`, base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(10000), headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", ...init.headers,
    } });
  } catch { throw new HttpError(503, "Database temporarily unavailable. Please retry."); }
  if (!response.ok) throw new HttpError(503, "Database operation failed. Check the integration migration and connection.");
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function rpc(env, name, args) {
  return database(env, `rpc/${name}`, {}, { method: "POST", body: JSON.stringify(args) });
}

export function requireSameOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = env.JAPS_CRM_APP_ORIGIN;
  if (!allowed || origin !== allowed) throw new HttpError(403, "This request must come from the CRM.");
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "JSON required.");
}

export function requireRole(user, roles) {
  if (!roles.includes(user.role)) throw new HttpError(403, "Your role cannot perform this action.");
}
