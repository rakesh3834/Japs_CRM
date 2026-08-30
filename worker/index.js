const DEFAULT_ORG = "00000000-0000-4000-8000-000000000001";
const DEFAULT_USER = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Aarav Mehta",
  email: "ops@japstravels.in",
  phone: "+91 98765 43210",
  role: "Admin",
  organization_id: DEFAULT_ORG,
};

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleApi(request, env, url) {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    if (url.pathname === "/api/health" && request.method === "GET") {
      let reachable = false;
      let warning = null;
      if (supabaseEnabled(env)) {
        try {
          await supabaseRequest(env, "organizations", { select: "id", limit: "1" });
          reachable = true;
        } catch (error) {
          warning = error instanceof Error ? error.message : "Supabase request failed.";
        }
      }
      return respond({ ok: true, service: "Japs_CRM API", supabase_configured: supabaseEnabled(env), supabase_reachable: reachable, warning, currency: "INR", tax_rate: 5 }, 200, cors);
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      return respond({ ok: true, brand: "Japs_CRM", default_currency: "INR", tax_rate: 5, payment_collection_enabled: false, lead_channels: ["Manual", "Web form", "Email", "WhatsApp", "Instagram", "Meta lead", "Referral"] }, 200, cors);
    }

    const user = await requestUser(request, env);
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readJson(request);
      if (!body.name || !body.email || !body.phone) return respond({ detail: "Name, email, and phone are required." }, 422, cors);
      const loggedIn = { id: await stableUuid(`japs-crm:${String(body.email).toLowerCase()}`), name: String(body.name), email: String(body.email), phone: String(body.phone), role: "Admin", organization_id: orgId(env) };
      await ensureUser(env, loggedIn);
      const response = respond({ ok: true, user: loggedIn, trusted_login: true }, 200, cors);
      response.headers.append("Set-Cookie", `japs_crm_user=${encodeUser(loggedIn)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`);
      return response;
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const response = respond({ ok: true }, 200, cors);
      response.headers.append("Set-Cookie", "japs_crm_user=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
      return response;
    }
    if (url.pathname === "/api/me" && request.method === "GET") return respond({ ok: true, user, trusted_login: true }, 200, cors);

    if (!supabaseEnabled(env)) return respond({ ok: false, source: "demo", error: "Supabase environment variables are not configured." }, 503, cors);

    if (url.pathname === "/api/dashboard" && request.method === "GET") {
      const [leads, trips, payments] = await Promise.all([remoteLeads(env, user), remoteTrips(env, user), remotePayments(env, user)]);
      const incomingDue = payments.filter((item) => item.direction === "in" && item.status !== "Paid").reduce((sum, item) => sum + item.amount, 0);
      return respond({ ok: true, source: "supabase", workspace: { name: "Japs Travels", brand: "Japs_CRM", currency: "INR", tax_rate: 5 }, stats: { open_enquiries: leads.filter((item) => !["Won", "Lost"].includes(item.status)).length, active_trips: trips.length, customer_due: incomingDue, margin_at_risk: trips.filter((item) => item.health === "At risk").length }, leads: leads.slice(0, 5), trips, payments, viewer: user }, 200, cors);
    }

    if (url.pathname === "/api/leads" && request.method === "GET") {
      let items = await remoteLeads(env, user);
      const status = url.searchParams.get("status");
      const q = url.searchParams.get("q")?.toLowerCase().trim();
      if (status) items = items.filter((item) => item.status === status);
      if (q) items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
      return respond({ ok: true, source: "supabase", items, count: items.length }, 200, cors);
    }
    if (url.pathname === "/api/leads" && request.method === "POST") {
      const body = await readJson(request);
      if (!body.name || !body.phone || !body.destination) return respond({ detail: "Name, phone, and destination are required." }, 422, cors);
      await ensureUser(env, user);
      const contacts = await supabaseRequest(env, "contacts", {}, { method: "POST", body: JSON.stringify([{ organization_id: orgId(env), name: body.name, phone: body.phone, email: body.email || null, type: "Customer" }]), headers: { Prefer: "return=representation" } });
      const code = randomCode("JAP");
      await supabaseRequest(env, "leads", {}, { method: "POST", body: JSON.stringify([{ organization_id: orgId(env), contact_id: contacts?.[0]?.id || null, code, source: body.source || "Manual", owner_id: user.id, status: "Inbox", destination: body.destination, start_date: body.start_date || null, travelers: Number(body.travelers || 2), notes: body.notes || "", next_action: "Qualify this lead" }]), headers: { Prefer: "return=minimal" } });
      return respond({ ok: true, synced: true, item: { id: code, name: body.name, phone: body.phone, email: body.email || "", source: body.source || "Manual", destination: body.destination, travelers: `${Number(body.travelers || 2)} travelers`, status: "Inbox", next: "Qualify this lead", value: 0 } }, 201, cors);
    }

    if (url.pathname === "/api/trips" && request.method === "GET") {
      let items = await remoteTrips(env, user);
      const stage = url.searchParams.get("stage");
      if (stage) items = items.filter((item) => item.stage === stage);
      return respond({ ok: true, source: "supabase", items, count: items.length }, 200, cors);
    }
    if (url.pathname === "/api/trips" && request.method === "POST") {
      const body = await readJson(request);
      if (!body.destination) return respond({ detail: "Destination is required." }, 422, cors);
      await ensureUser(env, user);
      let lead = null;
      if (body.lead_id) lead = await resolveLead(env, user, body.lead_id);
      const code = randomCode("TRP");
      const rows = await supabaseRequest(env, "trips", {}, { method: "POST", body: JSON.stringify([{ organization_id: orgId(env), lead_id: lead?.id || null, primary_contact_id: lead?.contact_id || null, code, stage: body.stage || "Plan", health: "On track", destination: body.destination, start_date: body.start_date || null, end_date: body.end_date || null, travelers: Number(body.travelers || 2), total_minor: Number(body.total_amount || 0) * 100, customer_due_minor: Number(body.customer_due || 0) * 100, progress: 0, services_summary: "Services pending", owner_id: user.id }]), headers: { Prefer: "return=representation" } });
      return respond({ ok: true, source: "supabase", synced: true, item: mapTrip(rows?.[0] || { code, destination: body.destination }) }, 201, cors);
    }

    if (url.pathname === "/api/contacts" && request.method === "GET") {
      let items = await remoteContacts(env, user);
      const q = url.searchParams.get("q")?.toLowerCase().trim();
      if (q) items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
      return respond({ ok: true, source: "supabase", items, count: items.length }, 200, cors);
    }
    if (url.pathname === "/api/suppliers" && request.method === "GET") {
      let items = await remoteSuppliers(env, user);
      const q = url.searchParams.get("q")?.toLowerCase().trim();
      if (q) items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
      return respond({ ok: true, source: "supabase", items, count: items.length }, 200, cors);
    }
    if (url.pathname === "/api/operations" && request.method === "GET") return respond({ ok: true, week_start: new Date().toISOString().slice(0, 10), items: [] }, 200, cors);
    if (url.pathname === "/api/payments" && request.method === "GET") {
      let items = await remotePayments(env, user);
      const direction = url.searchParams.get("direction");
      if (direction) items = items.filter((item) => item.direction === direction);
      return respond({ ok: true, source: "supabase", items, currency: "INR", tax_rate: 5 }, 200, cors);
    }
    if (url.pathname === "/api/payments" && request.method === "POST") {
      const body = await readJson(request);
      if (!body.trip_id || !body.title || !body.amount || !body.due_date) return respond({ detail: "Trip, title, amount, and due date are required." }, 422, cors);
      await ensureUser(env, user);
      const trip = await resolveTrip(env, user, body.trip_id);
      await supabaseRequest(env, "payments", {}, { method: "POST", body: JSON.stringify([{ organization_id: orgId(env), trip_id: trip.id, title: body.title, direction: body.direction || "in", amount_minor: Number(body.amount) * 100, currency: "INR", due_date: body.due_date, method: body.method || "Bank transfer", reference: body.reference || "", status: "Logged" }]), headers: { Prefer: "return=minimal" } });
      return respond({ ok: true, synced: true, item: { id: `PAY-${crypto.randomUUID().slice(0, 8)}`, ...body, status: "Logged", meta: `${body.trip_id} · manually logged` } }, 201, cors);
    }
    return respond({ ok: false, error: "Route not found." }, 404, cors);
  } catch (error) {
    return respond({ ok: false, error: error instanceof Error ? error.message : "Request failed." }, 422, cors);
  }
}

function supabaseEnabled(env) { return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY); }
function orgId(env) { return env.JAPS_CRM_ORGANIZATION_ID || DEFAULT_ORG; }
function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  return { ...jsonHeaders, "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
}
function respond(data, status, headers) { return new Response(JSON.stringify(data), { status, headers }); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function randomCode(prefix) { return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`; }
function encodeUser(user) { const bytes = new TextEncoder().encode(JSON.stringify(user)); let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function decodeUser(value) { try { const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=="); const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0)); return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; } }
function requestUser(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const value = cookie.match(/(?:^|;\s*)japs_crm_user=([^;]+)/)?.[1];
  return Promise.resolve((value && decodeUser(value)) || { ...DEFAULT_USER, organization_id: orgId(env) });
}
async function stableUuid(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function ensureUser(env, user) {
  await supabaseRequest(env, "organizations", {}, { method: "POST", body: JSON.stringify([{ id: orgId(env), name: "Japs Travels", brand_name: "Japs_CRM", default_currency: "INR", tax_rate: 5 }]), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
  await supabaseRequest(env, "profiles", {}, { method: "POST", body: JSON.stringify([{ id: user.id, name: user.name, email: user.email, phone: user.phone }]), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
  await supabaseRequest(env, "organization_memberships", { on_conflict: "organization_id,profile_id" }, { method: "POST", body: JSON.stringify([{ organization_id: orgId(env), profile_id: user.id, role: user.role || "Admin" }]), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
}
async function supabaseRequest(env, table, params = {}, init = {}) {
  const query = new URLSearchParams(params).toString();
  const base = String(env.SUPABASE_URL).replace(/\/$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY);
  const response = await fetch(`${base}/rest/v1/${table}${query ? `?${query}` : ""}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, ...init.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(readableError(text));
  return text ? JSON.parse(text) : [];
}
function readableError(text) { try { const parsed = JSON.parse(text); return parsed.message || parsed.details || parsed.hint || text; } catch { return text || "Supabase request failed."; } }
function orgParams() { return { organization_id: `eq.${DEFAULT_ORG}` }; }
async function remoteLeads(env, user) {
  const rows = await supabaseRequest(env, "leads", { select: "id,code,source,status,destination,start_date,end_date,travelers,budget_minor,next_action,notes,created_at,contact:contacts(name,email,phone),owner:profiles(name)", organization_id: `eq.${user.organization_id}`, order: "created_at.desc", limit: "100" });
  return rows.map(mapLead);
}
async function remoteTrips(env, user) {
  const rows = await supabaseRequest(env, "trips", { select: "id,code,stage,health,destination,start_date,end_date,travelers,total_minor,customer_due_minor,progress,services_summary,primary_contact:contacts(name),owner:profiles(name)", organization_id: `eq.${user.organization_id}`, order: "start_date.asc", limit: "100" });
  return rows.map(mapTrip);
}
async function remoteContacts(env, user) { const rows = await supabaseRequest(env, "contacts", { select: "id,name,email,phone,type,notes,created_at", organization_id: `eq.${user.organization_id}`, order: "created_at.desc", limit: "100" }); return rows.map((row) => ({ id: row.id, name: row.name, email: row.email || "", phone: row.phone || "", type: row.type || "Customer", notes: row.notes || "", created_at: row.created_at })); }
async function remoteSuppliers(env, user) { const rows = await supabaseRequest(env, "suppliers", { select: "id,name,contact_name,email,phone,capabilities,created_at", organization_id: `eq.${user.organization_id}`, order: "name.asc", limit: "100" }); return rows.map((row) => ({ id: row.id, name: row.name, type: (row.capabilities || []).join(" · ") || "Travel supplier", destination: "", contact: [row.contact_name, row.phone, row.email].filter(Boolean).join(" · "), status: "Active" })); }
async function remotePayments(env, user) { const rows = await supabaseRequest(env, "payments", { select: "id,trip_id,title,direction,amount_minor,currency,due_date,paid_at,method,reference,status,trip:trips(code)", organization_id: `eq.${user.organization_id}`, order: "due_date.asc", limit: "100" }); return rows.map((row) => { const trip = Array.isArray(row.trip) ? row.trip[0] || {} : row.trip || {}; const code = trip.code || row.trip_id; return { id: row.id, trip_id: code, title: row.title, meta: `${code} · ${row.status || "Scheduled"}`, direction: row.direction, amount: Math.round((row.amount_minor || 0) / 100), status: row.status || "Scheduled", due_date: row.due_date || "", method: row.method || "", reference: row.reference || "" }; }); }
function mapLead(row) { const contact = Array.isArray(row.contact) ? row.contact[0] || {} : row.contact || {}; const owner = Array.isArray(row.owner) ? row.owner[0] || {} : row.owner || {}; return { id: row.code || row.id?.slice(0, 8).toUpperCase(), uuid: row.id, name: contact.name || "Unnamed contact", email: contact.email || "", phone: contact.phone || "", source: row.source || "Manual", destination: row.destination || "", dates: readableDates(row.start_date, row.end_date), travelers: `${row.travelers || 0} travelers`, value: Math.round((row.budget_minor || 0) / 100), owner: (owner.name || "Unassigned").split(" ")[0], status: row.status || "Inbox", next: row.next_action || "Qualify this lead", notes: row.notes || "", created_at: row.created_at || "" }; }
function mapTrip(row) { const contact = Array.isArray(row.primary_contact) ? row.primary_contact[0] || {} : row.primary_contact || {}; const owner = Array.isArray(row.owner) ? row.owner[0] || {} : row.owner || {}; return { id: row.code || row.id?.slice(0, 8).toUpperCase(), uuid: row.id, guest: contact.name || "Unnamed guest", destination: row.destination || "", dates: readableDates(row.start_date, row.end_date), days: row.start_date && row.end_date ? Math.round((new Date(`${row.end_date}T00:00:00Z`) - new Date(`${row.start_date}T00:00:00Z`)) / 86400000) + 1 : 0, travelers: row.travelers || 0, stage: row.stage || "Plan", health: row.health || "On track", healthTone: row.health === "At risk" ? "warning" : "success", progress: row.progress || 0, amount: Math.round((row.total_minor || 0) / 100), due: Math.round((row.customer_due_minor || 0) / 100), owner: (owner.name || "Unassigned").split(" ")[0], services: row.services_summary || "Services pending" }; }
function readableDates(start, end) { if (!start) return "Dates flexible"; if (!end) return start; return `${start.slice(8, 10)} ${start.slice(5, 7)} - ${end.slice(8, 10)} ${end.slice(5, 7)}`; }
async function resolveLead(env, user, reference) { const key = /^[0-9a-f-]{36}$/i.test(String(reference)) ? "id" : "code"; const rows = await supabaseRequest(env, "leads", { select: "id,contact_id,destination,start_date,end_date,travelers", organization_id: `eq.${user.organization_id}`, [key]: `eq.${reference}`, limit: "1" }); if (!rows[0]) throw new Error(`Lead ${reference} was not found in Supabase`); return rows[0]; }
async function resolveTrip(env, user, reference) { const key = /^[0-9a-f-]{36}$/i.test(String(reference)) ? "id" : "code"; const rows = await supabaseRequest(env, "trips", { select: "id,code", organization_id: `eq.${user.organization_id}`, [key]: `eq.${reference}`, limit: "1" }); if (!rows[0]) throw new Error(`Trip ${reference} was not found in Supabase`); return rows[0]; }
