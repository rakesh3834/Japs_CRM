import { authenticatedUser, handleAuth, authMode } from "./auth.js";
import { policyResponse } from "./policies.js";
import { receiveWebhook, integrationStatus, integrationAction } from "./whatsapp.js";
import { HttpError, json, bodyJson, database, organizationId, requireRole, requireSameOrigin } from "./platform.js";
// prepare-sites.mjs replaces this empty map with the built frontend assets so
// the worker can serve a self-contained app on the hosted runtime.
const STATIC_ASSETS = (() => { try { return JSON.parse("__JAPS_STATIC_ASSETS__"); } catch { return {}; } })();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const policy = policyResponse(url.pathname);
    if (policy && ["GET", "HEAD"].includes(request.method)) {
      // URL validators may check headers before fetching the public document.
      return request.method === "HEAD" ? new Response(null, { status: policy.status, headers: policy.headers }) : policy;
    }
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url, ctx);
    }
    const assetPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const asset = STATIC_ASSETS[assetPath];
    if (asset) {
      const binary = atob(asset.body);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new Response(bytes, { headers: { "Content-Type": asset.type, "Cache-Control": assetPath === "/index.html" ? "no-cache" : "public, max-age=31536000, immutable" } });
    }
    if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};

async function handleApi(request, env, url, ctx) {
  const cors = {};
  try {
    // The only public data receiver: signature-verified, not staff-session authenticated.
    if (url.pathname === "/api/webhooks/whatsapp") return await receiveWebhook(request, env, ctx);
    if (!["GET", "POST"].includes(request.method)) throw new HttpError(405, "Method not allowed.");
    if (request.method === "POST") requireSameOrigin(request, env);
    if (url.pathname.startsWith("/api/auth/")) {
      if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");
      return await handleAuth(request, env, url.pathname);
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "Japs_CRM API", authentication: authMode(env) });
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      return respond({ ok: true, brand: "Japs_CRM", auth_mode: authMode(env), default_currency: "INR", tax_rate: 5, payment_collection_enabled: false, lead_channels: ["Manual", "Web form", "Email", "WhatsApp", "Instagram", "Meta lead", "Referral"] }, 200, cors);
    }

    const user = await authenticatedUser(request, env);
    if (url.pathname === "/api/me" && request.method === "GET") return respond({ ok: true, user, trusted_login: true }, 200, cors);
    if (url.pathname === "/api/integrations/whatsapp" && request.method === "GET") return await integrationStatus(env, user);
    if (url.pathname.startsWith("/api/integrations/whatsapp/") && request.method === "POST") return await integrationAction(request, env, user, url.pathname.split("/").pop());
    if (request.method === "POST") requireRole(user, url.pathname === "/api/payments" ? ["Admin", "Owner", "Finance"] : ["Admin", "Owner", "Sales", "Operations"]);

    if (url.pathname === "/api/dashboard" && request.method === "GET") {
      const [leads, trips, payments] = await Promise.all([remoteLeads(env, user), remoteTrips(env, user), remotePayments(env, user)]);
      const incomingDue = payments.filter((item) => item.direction === "in" && item.status !== "Paid").reduce((sum, item) => sum + item.amount, 0);
      return respond({ ok: true, source: "supabase", workspace: { name: "Japs Travels", brand: "Japs_CRM", currency: "INR", tax_rate: 5 }, stats: { open_enquiries: leads.filter((item) => !["Won", "Lost"].includes(item.status)).length, active_trips: trips.length, customer_due: incomingDue, margin_at_risk: trips.filter((item) => item.health === "At risk").length }, leads: leads.slice(0, 5), trips, payments, viewer: user }, 200, cors);
    }

    if (url.pathname === "/api/leads" && request.method === "GET") {
      const offset = Math.max(0, Math.min(Number(url.searchParams.get("offset")) || 0, 1000000));
      let items = await remoteLeads(env, user, offset);
      const hasMore = items.length === 100;
      const status = url.searchParams.get("status");
      const q = url.searchParams.get("q")?.toLowerCase().trim();
      if (status) items = items.filter((item) => item.status === status);
      if (q) items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
      return respond({ ok: true, source: "supabase", items, count: items.length, next_offset: hasMore ? offset + 100 : null }, 200, cors);
    }
    if (url.pathname === "/api/leads" && request.method === "POST") {
      const body = await readJson(request);
      if (!body.name || !body.phone || !body.destination) return respond({ detail: "Name, phone, and destination are required." }, 422, cors);
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
      const trip = await resolveTrip(env, user, body.trip_id);
      await supabaseRequest(env, "payments", {}, { method: "POST", body: JSON.stringify([{ organization_id: orgId(env), trip_id: trip.id, title: body.title, direction: body.direction || "in", amount_minor: Number(body.amount) * 100, currency: "INR", due_date: body.due_date, method: body.method || "Bank transfer", reference: body.reference || "", status: "Logged" }]), headers: { Prefer: "return=minimal" } });
      return respond({ ok: true, synced: true, item: { id: `PAY-${crypto.randomUUID().slice(0, 8)}`, ...body, status: "Logged", meta: `${body.trip_id} · manually logged` } }, 201, cors);
    }
    return respond({ ok: false, error: "Route not found." }, 404, cors);
  } catch (error) {
    return json({ ok: false, error: error instanceof HttpError ? error.message : "Request could not be completed. Please retry.", code: error instanceof HttpError ? error.code : undefined }, error instanceof HttpError ? error.status : 500);
  }
}

const orgId = organizationId;
const respond = json;
const readJson = bodyJson;
const supabaseRequest = database;
function randomCode(prefix) { return `${prefix}-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`; }
async function remoteLeads(env, user, offset = 0) {
  const rows = await supabaseRequest(env, "crm_lead_inbox", { select: "*", organization_id: `eq.${user.organization_id}`, deleted_at: "is.null", order: "created_at.desc,id.desc", limit: "100", offset: String(offset) });
  return rows.map(mapLead);
}
async function remoteTrips(env, user) {
  const rows = await supabaseRequest(env, "trips", { select: "id,code,stage,health,destination,start_date,end_date,travelers,total_minor,customer_due_minor,progress,services_summary,primary_contact:contacts(name),owner:profiles(name)", organization_id: `eq.${user.organization_id}`, order: "start_date.asc", limit: "100" });
  return rows.map(mapTrip);
}
async function remoteContacts(env, user) { const rows = await supabaseRequest(env, "contacts", { select: "id,name,email,phone,type,notes,created_at", organization_id: `eq.${user.organization_id}`, order: "created_at.desc", limit: "100" }); return rows.map((row) => ({ id: row.id, name: row.name, email: row.email || "", phone: row.phone || "", type: row.type || "Customer", notes: row.notes || "", created_at: row.created_at })); }
async function remoteSuppliers(env, user) { const rows = await supabaseRequest(env, "suppliers", { select: "id,name,contact_name,email,phone,capabilities,created_at", organization_id: `eq.${user.organization_id}`, order: "name.asc", limit: "100" }); return rows.map((row) => ({ id: row.id, name: row.name, type: (row.capabilities || []).join(" · ") || "Travel supplier", destination: "", contact: [row.contact_name, row.phone, row.email].filter(Boolean).join(" · "), status: "Active" })); }
async function remotePayments(env, user) { const rows = await supabaseRequest(env, "payments", { select: "id,trip_id,title,direction,amount_minor,currency,due_date,paid_at,method,reference,status,trip:trips(code)", organization_id: `eq.${user.organization_id}`, order: "due_date.asc", limit: "100" }); return rows.map((row) => { const trip = Array.isArray(row.trip) ? row.trip[0] || {} : row.trip || {}; const code = trip.code || row.trip_id; return { id: row.id, trip_id: code, title: row.title, meta: `${code} · ${row.status || "Scheduled"}`, direction: row.direction, amount: Math.round((row.amount_minor || 0) / 100), status: row.status || "Scheduled", due_date: row.due_date || "", method: row.method || "", reference: row.reference || "" }; }); }
function mapLead(row) { return { id: row.code || row.id?.slice(0, 8).toUpperCase(), uuid: row.id, name: row.contact_name || "WhatsApp enquiry", email: row.contact_email || "", phone: row.contact_phone || "", source: row.source || "Manual", destination: row.destination || row.advertised_destination || "Not yet provided", dates: readableDates(row.start_date, row.end_date), travelers: row.travelers ? `${row.travelers} travelers` : "Travelers not yet provided", value: Math.round((row.budget_minor || 0) / 100), owner: (row.owner_name || "Unassigned").split(" ")[0], status: row.status || "Inbox", next: row.next_action || "Qualify this lead", notes: row.notes || "", created_at: row.created_at || "", first_message: row.first_message || "", last_message_at: row.last_message_at, ad_id: row.originating_ad_id, ad_name: row.ad_name, campaign_id: row.campaign_id, campaign_name: row.campaign_name, adset_name: row.adset_name, source_platform: row.source_platform || null, attribution_status: row.enrichment_status, offering_name: row.offering_name, event_reference: row.event_reference }; }
function mapTrip(row) { const contact = Array.isArray(row.primary_contact) ? row.primary_contact[0] || {} : row.primary_contact || {}; const owner = Array.isArray(row.owner) ? row.owner[0] || {} : row.owner || {}; return { id: row.code || row.id?.slice(0, 8).toUpperCase(), uuid: row.id, guest: contact.name || "Unnamed guest", destination: row.destination || "", dates: readableDates(row.start_date, row.end_date), days: row.start_date && row.end_date ? Math.round((new Date(`${row.end_date}T00:00:00Z`) - new Date(`${row.start_date}T00:00:00Z`)) / 86400000) + 1 : 0, travelers: row.travelers || 0, stage: row.stage || "Plan", health: row.health || "On track", healthTone: row.health === "At risk" ? "warning" : "success", progress: row.progress || 0, amount: Math.round((row.total_minor || 0) / 100), due: Math.round((row.customer_due_minor || 0) / 100), owner: (owner.name || "Unassigned").split(" ")[0], services: row.services_summary || "Services pending" }; }
function readableDates(start, end) { if (!start) return "Dates flexible"; if (!end) return start; return `${start.slice(8, 10)} ${start.slice(5, 7)} - ${end.slice(8, 10)} ${end.slice(5, 7)}`; }
async function resolveLead(env, user, reference) { const key = /^[0-9a-f-]{36}$/i.test(String(reference)) ? "id" : "code"; const rows = await supabaseRequest(env, "leads", { select: "id,contact_id,destination,start_date,end_date,travelers", organization_id: `eq.${user.organization_id}`, [key]: `eq.${reference}`, limit: "1" }); if (!rows[0]) throw new Error(`Lead ${reference} was not found in Supabase`); return rows[0]; }
async function resolveTrip(env, user, reference) { const key = /^[0-9a-f-]{36}$/i.test(String(reference)) ? "id" : "code"; const rows = await supabaseRequest(env, "trips", { select: "id,code", organization_id: `eq.${user.organization_id}`, [key]: `eq.${reference}`, limit: "1" }); if (!rows[0]) throw new Error(`Trip ${reference} was not found in Supabase`); return rows[0]; }
