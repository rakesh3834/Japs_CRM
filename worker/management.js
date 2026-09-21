import { HttpError, bodyJson, database, json, requireRole } from "./platform.js";

import { LEAD_STATUSES } from "../shared/lead-statuses.js";
export { LEAD_STATUSES };
const SALES = ["Admin", "Owner", "Sales", "Operations"];
const FINANCE = ["Admin", "Owner", "Finance"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(message) { throw new HttpError(422, message); }
function text(value, label, max = 500, required = false) {
  if (typeof value !== "string" || value.length > max) fail(`${label} must be text of at most ${max} characters.`);
  const result = value.trim();
  if (required && !result) fail(`${label} is required.`);
  return result || null;
}
function choice(value, allowed, label) { if (!allowed.includes(value)) fail(`Choose a valid ${label}.`); return value; }
function date(value, label) {
  if (value === "" || value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(`${label} must be a valid date.`);
  return value;
}
function amount(value, label, positive = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < (positive ? 0.01 : 0) || value > 1000000000 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) fail(`${label} must be a valid INR amount with at most two decimals.`);
  return Math.round(value * 100);
}
export function tripAmounts(total, due) {
  const total_minor = amount(total, "Package value"); const customer_due_minor = amount(due, "Customer due");
  if (customer_due_minor > total_minor) fail("Customer due cannot exceed package value.");
  return { total_minor, customer_due_minor };
}
function keys(body, allowed) { for (const key of Object.keys(body)) if (!allowed.includes(key)) fail(`Field ${key} is not editable.`); }
function stamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) fail("Refresh the record before saving.");
  return value;
}
async function findRecord(env, user, table, id, select = "*") {
  if (!uuidPattern.test(id)) throw new HttpError(404, "Record not found.");
  const rows = await database(env, table, { select, organization_id: `eq.${user.organization_id}`, id: `eq.${id}`, ...(table !== "payments" ? { deleted_at: "is.null" } : {}), limit: "1" });
  if (!rows[0]) throw new HttpError(404, "Record not found.");
  return rows[0];
}
async function updateRecord(env, user, table, id, expected, changes, guards = {}) {
  if (!Object.keys(changes).length) fail("No changes supplied.");
  const rows = await database(env, table, { organization_id: `eq.${user.organization_id}`, id: `eq.${id}`, updated_at: `eq.${stamp(expected)}`, ...guards, ...(table !== "payments" ? { deleted_at: "is.null" } : {}) }, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...changes, updated_at: new Date().toISOString() }) });
  if (!rows?.length) throw new HttpError(409, "This record changed since it was opened. Close and reopen it before saving; your changes have not been applied.");
  return json({ ok: true, id: rows[0].id, updated_at: rows[0].updated_at });
}

export function leadChanges(body, current) {
  keys(body, ["updated_at", "status", "destination", "start_date", "end_date", "travelers", "budget", "notes", "next_action", "lost_reason"]);
  const changes = {};
  if ("status" in body) changes.status = choice(body.status, LEAD_STATUSES, "lead status");
  for (const field of ["destination", "notes", "next_action", "lost_reason"]) if (field in body) changes[field] = text(body[field], field.replaceAll("_", " "), field === "notes" ? 6000 : 500);
  for (const field of ["start_date", "end_date"]) if (field in body) changes[field] = date(body[field], field.replaceAll("_", " "));
  const start = "start_date" in changes ? changes.start_date : current.start_date;
  const end = "end_date" in changes ? changes.end_date : current.end_date;
  if (start && end && end < start) fail("End date cannot precede start date.");
  if ("travelers" in body) {
    if (body.travelers === null) changes.travelers = null;
    else if (!Number.isInteger(body.travelers) || body.travelers < 1 || body.travelers > 10000) fail("Travelers must be between 1 and 10,000.");
    else changes.travelers = body.travelers;
  }
  if ("budget" in body) changes.budget_minor = body.budget === null ? null : amount(body.budget, "Budget");
  return changes;
}
export function contactChanges(body) {
  keys(body, ["updated_at", "expected_version", "name", "email", "phone", "type", "notes"]);
  const changes = {};
  if ("name" in body) changes.name = text(body.name, "Name", 200, true);
  if ("email" in body) {
    changes.email = text(body.email, "Email", 254);
    if (changes.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.email)) fail("Enter a valid email address.");
  }
  if ("phone" in body) {
    changes.phone = text(body.phone, "Phone", 40);
    if (changes.phone && !/^\+?[\d ()-]{6,40}$/.test(changes.phone)) fail("Enter a valid phone number.");
  }
  if ("type" in body) changes.type = choice(body.type, ["Customer", "Traveler", "Agency partner"], "contact type");
  if ("notes" in body) changes.notes = text(body.notes, "Notes", 6000);
  return changes;
}
// WhatsApp ingestion can populate name/phone without changing updated_at.
// Include editable content in the version and in the atomic PATCH predicates.
const contactFields = ["name", "email", "phone", "type", "notes"];
export async function contactVersion(contact) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(contactFields.map((key) => contact[key] ?? null))));
  return [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
export function paymentChanges(body, current = {}) {
  keys(body, ["updated_at", "request_id", "trip_id", "title", "direction", "amount", "due_date", "paid_date", "method", "reference", "status", "notes"]);
  const changes = {};
  if ("title" in body) changes.title = text(body.title, "Title", 200, true);
  if ("direction" in body) changes.direction = choice(body.direction, ["in", "out"], "direction");
  if ("amount" in body) changes.amount_minor = amount(body.amount, "Amount", true);
  if ("due_date" in body) changes.due_date = date(body.due_date, "Due date");
  if ("status" in body) changes.status = choice(body.status, ["Scheduled", "Due soon", "Overdue", "Paid", "Logged", "Cancelled"], "payment status");
  for (const field of ["method", "reference", "notes"]) if (field in body) changes[field] = text(body[field], field, field === "notes" ? 6000 : 200);
  const paidDate = "paid_date" in body ? date(body.paid_date, "Paid date") : current.paid_at?.slice(0, 10);
  const status = changes.status || current.status;
  if (status === "Paid") {
    if (!paidDate) fail("Paid date is required for a paid payment.");
    changes.paid_at = `${paidDate}T00:00:00.000Z`;
  } else if ("status" in body || "paid_date" in body) changes.paid_at = null;
  return changes;
}

export async function managementRoute(request, env, user, url, mapLead) {
  const match = url.pathname.match(/^\/api\/(leads|contacts|payments|trips)\/([0-9a-f-]+)$/i);
  if (match && request.method === "GET" && match[1] === "contacts") {
    const contact = await findRecord(env, user, "contacts", match[2]);
    const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset")) || 0));
    const leads = await database(env, "crm_lead_inbox", { select: "*", organization_id: `eq.${user.organization_id}`, contact_id: `eq.${contact.id}`, deleted_at: "is.null", order: "created_at.desc,id.desc", limit: "100", offset: String(offset) });
    return json({ ok: true, item: { ...contact, version: await contactVersion(contact) }, leads: leads.map(mapLead), next_offset: leads.length === 100 ? offset + 100 : null });
  }
  if (match && request.method === "PATCH") {
    const [, table, id] = match;
    requireRole(user, ["payments", "trips"].includes(table) ? FINANCE : SALES);
    const body = await bodyJson(request);
    const current = await findRecord(env, user, table, id);
    let changes;
    let guards = {};
    if (table === "leads") changes = leadChanges(body, current);
    if (table === "contacts") {
      changes = contactChanges(body);
      if (body.expected_version !== await contactVersion(current)) throw new HttpError(409, "Contact details have changed. Close and reopen the contact before saving.");
      guards = Object.fromEntries(contactFields.map((key) => [key, current[key] == null ? "is.null" : `eq.${current[key]}`]));
    }
    if (table === "payments") {
      changes = paymentChanges(body, current);
      if ("trip_id" in body) changes.trip_id = (await findRecord(env, user, "trips", body.trip_id, "id")).id;
    }
    if (table === "trips") {
      keys(body, ["updated_at", "total_amount", "customer_due"]);
      if (!("total_amount" in body) && !("customer_due" in body)) fail("No trip amounts supplied.");
      changes = tripAmounts(body.total_amount ?? current.total_minor / 100, body.customer_due ?? current.customer_due_minor / 100);
    }
    return updateRecord(env, user, table, id, body.updated_at, changes, guards);
  }
  if (url.pathname === "/api/contacts" && request.method === "POST") {
    requireRole(user, SALES);
    const changes = contactChanges(await bodyJson(request));
    if (!changes.name) fail("Name is required.");
    const rows = await database(env, "contacts", {}, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...changes, organization_id: user.organization_id }) });
    return json({ ok: true, item: rows[0] }, 201);
  }
  if (url.pathname === "/api/payments" && request.method === "POST") {
    requireRole(user, FINANCE);
    const body = await bodyJson(request);
    if (!uuidPattern.test(body.request_id || "")) fail("A valid payment request ID is required.");
    const changes = paymentChanges(body);
    if (!changes.title || !changes.amount_minor || !changes.direction || !changes.status) fail("Title, direction, amount and status are required.");
    const trip = await findRecord(env, user, "trips", body.trip_id || "", "id");
    const entry = { ...changes, trip_id: trip.id, organization_id: user.organization_id, currency: "INR" };
    const rows = await database(env, "payments", { on_conflict: "id" }, { method: "POST", headers: { Prefer: "return=representation,resolution=ignore-duplicates" }, body: JSON.stringify({ ...entry, id: body.request_id }) });
    if (!rows?.length) {
      const saved = await findRecord(env, user, "payments", body.request_id);
      for (const [key, value] of Object.entries(entry)) {
        const comparable = key === "paid_at" && saved[key] ? new Date(saved[key]).toISOString() : saved[key];
        if ((comparable ?? null) !== (value ?? null)) throw new HttpError(409, "This payment request was already saved with different details. Close this form and edit the saved record.");
      }
    }
    return json({ ok: true, id: body.request_id }, rows?.length ? 201 : 200);
  }
  return null;
}
