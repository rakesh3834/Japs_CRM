import { HttpError, bodyJson, database, json, requireRole } from "./platform.js";

export const TASK_STATUSES = ["Open", "In progress", "Blocked", "Done", "Cancelled"];
export const TASK_TYPES = ["Follow-up", "Booking", "Documents", "Transport", "Accommodation", "Trip handoff", "Other"];
const roles = ["Admin", "Owner", "Sales", "Operations"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message) => { throw new HttpError(422, message); };
export function taskChanges(body, current = {}, now = new Date().toISOString()) {
  const changes = {};
  for (const key of Object.keys(body)) if (!["request_id", "updated_at", "title", "type", "status", "priority", "due_at", "assignee_id", "trip_id", "lead_id"].includes(key)) fail(`Field ${key} is not editable.`);
  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 200) fail("Task title is required (maximum 200 characters).");
    changes.title = body.title.trim();
  }
  for (const [key, values] of Object.entries({ status: TASK_STATUSES, type: TASK_TYPES, priority: ["Urgent", "High", "Medium", "Low"] })) {
    if (key in body) { if (!values.includes(body[key])) fail(`Choose a valid ${key}.`); changes[key] = body[key]; }
  }
  for (const key of ["trip_id", "lead_id", "assignee_id"]) if (key in body) {
    if (body[key] !== null && !uuid.test(body[key] || "")) fail(`Choose a valid ${key.replaceAll("_", " ")}.`);
    changes[key] = body[key];
  }
  if ("due_at" in body) {
    const value = body.due_at;
    if (value !== null) {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail("Due time must include a valid timezone.");
      const day = value.slice(0, 10);
      if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) fail("Due date is invalid.");
    }
    changes.due_at = value === null ? null : new Date(value).toISOString();
  }
  if ("status" in changes) changes.completed_at = changes.status === "Done" ? (current.status === "Done" ? current.completed_at : now) : null;
  return changes;
}

async function pages(env, table, params) {
  const items = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const page = await database(env, table, { ...params, limit: "1000", offset: String(offset) });
    items.push(...page); if (page.length < 1000) return items;
  }
  throw new HttpError(503, "Too many operations records to load.");
}
export async function readTasks(env, user) {
  return pages(env, "tasks", { select: "*", organization_id: `eq.${user.organization_id}`, order: "due_at.asc.nullslast,created_at.desc,id.asc" });
}
async function assignees(env, user) {
  const rows = await pages(env, "crm_staff_access", { select: "role,profile:profiles(id,name)", organization_id: `eq.${user.organization_id}`, active: "eq.true", profile_id: "not.is.null", role: `in.(${roles.join(",")})`, order: "email.asc" });
  return rows.flatMap((row) => { const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile; return profile?.id ? [{ ...profile, role: row.role }] : []; });
}
async function record(env, user, table, id) {
  if (!uuid.test(id || "")) throw new HttpError(404, "Record not found.");
  const rows = await database(env, table, { select: "*", id: `eq.${id}`, organization_id: `eq.${user.organization_id}`, ...(table === "tasks" ? {} : { deleted_at: "is.null" }), limit: "1" });
  if (!rows[0]) throw new HttpError(404, "Record not found in this workspace.");
  return rows[0];
}
async function checkLinks(env, user, changes, current) {
  const resulting = { ...current, ...changes };
  if ("assignee_id" in changes && changes.assignee_id && changes.assignee_id !== current.assignee_id && !(await assignees(env, user)).some((p) => p.id === changes.assignee_id)) fail("Assignee must be active authorised staff in this workspace.");
  if ("lead_id" in changes || "trip_id" in changes) {
    if (resulting.lead_id) await record(env, user, "leads", resulting.lead_id);
    if (resulting.trip_id) {
      const trip = await record(env, user, "trips", resulting.trip_id);
      if (resulting.lead_id && trip.lead_id !== resulting.lead_id) fail("The selected trip does not belong to this lead. Clear one link or select matching records.");
    }
  }
}
export async function operationsRoute(request, env, user, url) {
  if (url.pathname === "/api/operations" && request.method === "GET") {
    const [items, people] = await Promise.all([readTasks(env, user), assignees(env, user)]);
    return json({ ok: true, items, assignees: people });
  }
  const match = url.pathname.match(/^\/api\/tasks\/([0-9a-f-]+)$/i);
  if (match && request.method === "PATCH") {
    requireRole(user, roles);
    const body = await bodyJson(request);
    if (typeof body.updated_at !== "string" || !Number.isFinite(Date.parse(body.updated_at))) fail("Refresh this task before saving.");
    const current = await record(env, user, "tasks", match[1]);
    const changes = taskChanges(body, current);
    if (!Object.keys(changes).length) fail("No task changes supplied.");
    await checkLinks(env, user, changes, current);
    const rows = await database(env, "tasks", { id: `eq.${current.id}`, organization_id: `eq.${user.organization_id}`, updated_at: `eq.${body.updated_at}` }, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...changes, updated_at: new Date().toISOString() }) });
    if (!rows?.length) throw new HttpError(409, "This task changed since it was opened. Close and reopen it before saving.");
    return json({ ok: true, item: rows[0] });
  }
  if (url.pathname === "/api/tasks" && request.method === "POST") {
    requireRole(user, roles);
    const body = await bodyJson(request);
    if (!uuid.test(body.request_id || "")) fail("A valid task request ID is required.");
    const changes = taskChanges({ status: "Open", priority: "Medium", type: "Follow-up", lead_id: null, trip_id: null, assignee_id: null, due_at: null, ...body });
    if (!changes.title) fail("Task title is required.");
    await checkLinks(env, user, changes, {});
    const entry = { ...changes, id: body.request_id, organization_id: user.organization_id };
    const rows = await database(env, "tasks", { on_conflict: "id" }, { method: "POST", headers: { Prefer: "return=representation,resolution=ignore-duplicates" }, body: JSON.stringify(entry) });
    const saved = rows?.[0] || await record(env, user, "tasks", body.request_id);
    if (!rows?.length) for (const [key, value] of Object.entries(entry)) {
      if (key === "completed_at") continue;
      const actual = key === "due_at" && saved[key] ? new Date(saved[key]).toISOString() : saved[key];
      if ((actual ?? null) !== (value ?? null)) throw new HttpError(409, "This request was already saved with different details. Reopen the saved task.");
    }
    return json({ ok: true, item: saved }, rows?.length ? 201 : 200);
  }
  return null;
}
