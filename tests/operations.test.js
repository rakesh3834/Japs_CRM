import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { taskChanges } from "../worker/operations.js";
import { dashboardAnalytics } from "../worker/analytics.js";
import { createRefreshQueue } from "../frontend/src/refresh-queue.js";
import { indianDay, indiaInput, timeInIndia } from "../frontend/src/record-time.js";

const org = "00000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000001";
const foreign = "20000000-0000-4000-8000-000000000002";
const stamp = "2026-09-20T00:00:00.000Z";
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key", JAPS_CRM_APP_ORIGIN: "https://crm.example", JAPS_CRM_ORGANIZATION_ID: org, JAPS_CRM_AUTH_MODE: "email" };
const reply = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
function request(path, method = "GET", body, origin = env.JAPS_CRM_APP_ORIGIN, cookie = "verified") { return new Request(`https://crm.example/api/${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie ? `japs_verified_session=${cookie}` : "" }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
function mock(t, handler, role = "Admin") {
  t.mock.method(globalThis, "fetch", async (input, init = {}) => {
    const url = new URL(input);
    if (url.pathname === "/auth/v1/user") return reply({ id: "auth", email: "staff@example.com", email_confirmed_at: stamp });
    if (url.pathname.endsWith("crm_staff_access")) { assert.equal(url.searchParams.get("organization_id"), `eq.${org}`); assert.equal(url.searchParams.get("active"), "eq.true"); return reply([{ role, organization_id: org, profile: { id, name: "Staff" } }]); }
    assert.equal(url.searchParams.get("organization_id") || (init.body ? `eq.${JSON.parse(init.body).organization_id}` : null), `eq.${org}`);
    if (url.pathname.endsWith("tasks")) assert.equal(url.searchParams.has("deleted_at"), false);
    return handler(url, init);
  });
}
test("task validation rejects injected fields, malformed times and enums", () => {
  for (const body of [{ title: " " }, { title: "x".repeat(201) }, { type: "Payment execution" }, { priority: "invalid" }, { status: "Paid" }, { organization_id: foreign }, { completed_at: stamp }, { due_at: "2026-09-20T12:00" }, { due_at: "2026-02-30T12:00:00Z" }, { trip_id: "bad" }]) assert.throws(() => taskChanges(body));
  assert.equal(taskChanges({ due_at: "2026-09-20T10:30:00+05:30" }).due_at, "2026-09-20T05:00:00.000Z");
  assert.deepEqual(taskChanges({ trip_id: null, lead_id: null, assignee_id: null, due_at: null }), { trip_id: null, lead_id: null, assignee_id: null, due_at: null });
});
test("task completion timestamps are server-owned and survive same-status edits", () => {
  assert.equal(taskChanges({ status: "Done" }, { status: "Open" }, stamp).completed_at, stamp);
  assert.equal(taskChanges({ status: "Done" }, { status: "Done", completed_at: stamp }, "2026-09-21T00:00:00Z").completed_at, stamp);
  assert.equal(taskChanges({ status: "Open" }, { status: "Done", completed_at: stamp }).completed_at, null);
});
test("operations and tasks require authenticated same-origin authorised staff", async (t) => {
  mock(t, () => assert.fail("No record access expected"), "Read-only");
  assert.equal((await worker.fetch(request("operations", "GET", undefined, env.JAPS_CRM_APP_ORIGIN, ""), env)).status, 401);
  assert.equal((await worker.fetch(request("tasks", "POST", { title: "test" }), env)).status, 403);
  assert.equal((await worker.fetch(request(`tasks/${id}`, "PATCH", { status: "Done", updated_at: stamp }), env)).status, 403);
  assert.equal((await worker.fetch(request("tasks", "POST", {}, "https://evil.example"), env)).status, 403);
});
test("task edits are scoped, nullable and reject stale versions", async (t) => {
  let conflict = false; let patch;
  mock(t, (url, init) => {
    assert.equal(url.searchParams.get("id"), `eq.${id}`);
    if (init.method === "PATCH") { assert.equal(url.searchParams.get("updated_at"), `eq.${stamp}`); patch = JSON.parse(init.body); return reply(conflict ? [] : [{ id, ...patch }]); }
    return reply([{ id, updated_at: stamp, status: "Done", completed_at: stamp }]);
  });
  const body = { status: "Open", trip_id: null, due_at: null, updated_at: stamp };
  assert.equal((await worker.fetch(request(`tasks/${id}`, "PATCH", body), env)).status, 200);
  assert.equal(patch.completed_at, null); assert.equal(patch.trip_id, null);
  conflict = true; assert.equal((await worker.fetch(request(`tasks/${id}`, "PATCH", body), env)).status, 409);
});
test("task creation is idempotent and conflicting retries cannot overwrite", async (t) => {
  let saved; let count = 0;
  mock(t, (url, init) => {
    if (init.method === "POST") { assert.equal(url.searchParams.get("on_conflict"), "id"); if (saved) return reply([]); saved = JSON.parse(init.body); count++; return reply([saved]); }
    return reply([saved]);
  });
  const body = { request_id: id, title: "Verify transfer", status: "Done", due_at: "2026-09-21T12:00:00+05:30" };
  assert.equal((await worker.fetch(request("tasks", "POST", body), env)).status, 201);
  assert.equal((await worker.fetch(request("tasks", "POST", body), env)).status, 200);
  assert.equal((await worker.fetch(request("tasks", "POST", { ...body, title: "Different task" }), env)).status, 409);
  assert.equal(count, 1);
});
test("foreign task, linked record and assignee are rejected before mutation", async (t) => {
  mock(t, (url, init) => { assert.notEqual(init.method, "PATCH"); assert.notEqual(init.method, "POST"); return reply([]); });
  assert.equal((await worker.fetch(request(`tasks/${foreign}`, "PATCH", { title: "changed", updated_at: stamp }), env)).status, 404);
  assert.equal((await worker.fetch(request("tasks", "POST", { request_id: id, title: "test", trip_id: foreign }), env)).status, 404);
  assert.equal((await worker.fetch(request("tasks", "POST", { request_id: id, title: "test", lead_id: foreign }), env)).status, 404);
  assert.equal((await worker.fetch(request("tasks", "POST", { request_id: id, title: "test", assignee_id: foreign }), env)).status, 422);
});
test("task lead and trip links must refer to the same enquiry", async (t) => {
  mock(t, (url, init) => { assert.equal(url.searchParams.get("deleted_at"), "is.null"); assert.notEqual(init.method, "POST"); return reply([{ id, lead_id: foreign }]); });
  assert.equal((await worker.fetch(request("tasks", "POST", { request_id: id, title: "test", lead_id: id, trip_id: id }), env)).status, 422);
});
test("operations reads are paginated and expose active staff choices", async (t) => {
  mock(t, (url) => reply(url.searchParams.get("offset") === "0" ? Array.from({ length: 1000 }, (_, i) => ({ id: i })) : [{ id: "last" }]), "Read-only");
  const response = await worker.fetch(request("operations"), env); const result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.items.length, 1001); assert.equal(result.assignees[0].id, id);
});
test("overview aggregates every lead, zeros missing days and uses IST midnight", () => {
  const leads = Array.from({ length: 125 }, () => ({ status: "Inbox", source: "WhatsApp", created_at: "2026-09-19T18:30:00Z" }));
  leads.push({ status: "Won", source: "Manual", created_at: "2026-09-19T18:29:59Z" });
  const a = dashboardAnalytics(leads, [{ status: "Open", due_at: stamp }, { status: "Done", due_at: stamp }, { status: "Cancelled", due_at: stamp }, { status: "Blocked", due_at: null }], new Date("2026-09-20T10:00:00Z"));
  assert.equal(a.total_leads, 126); assert.equal(a.today_leads, 125); assert.equal(a.daily.length, 14); assert.equal(a.daily.at(-2).count, 1); assert.equal(a.daily[0].count, 0); assert.equal(a.open_tasks, 2); assert.equal(a.overdue_tasks, 1); assert.equal(a.sources[0].count, 125);
});
test("lead timestamps distinguish first message, capture and update in API", async (t) => {
  mock(t, () => reply([{ id, created_at: stamp, updated_at: "2026-09-21T00:00:00Z", first_message_at: "2026-09-19T23:59:00Z", last_message_at: stamp }]));
  const { items } = await (await worker.fetch(request("leads"), env)).json();
  assert.equal(items[0].first_message_at, "2026-09-19T23:59:00Z"); assert.equal(items[0].created_at, stamp); assert.equal(items[0].updated_at, "2026-09-21T00:00:00Z");
  assert.equal(indianDay("2026-09-19T18:30:00Z"), "2026-09-20"); assert.equal(indiaInput(stamp), "2026-09-20T05:30"); assert.match(timeInIndia(stamp), /05:30:00.*IST/); assert.equal(timeInIndia("bad"), "Not recorded");
});
test("post-save refresh waits for earlier poll and reads fresh state; failures do not block later reads", async () => {
  const queue = createRefreshQueue(); let release; const events = [];
  const poll = queue(async () => { events.push("poll"); await new Promise((r) => { release = r; }); events.push("old read"); });
  await Promise.resolve(); const saved = queue(async () => { events.push("fresh read"); }); release(); await Promise.all([poll, saved]);
  assert.deepEqual(events, ["poll", "old read", "fresh read"]);
  await assert.rejects(queue(() => { throw Error("temporary"); })); assert.equal(await queue(() => "recovered"), "recovered");
});
