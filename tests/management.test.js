import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { contactChanges, contactVersion, leadChanges, paymentChanges, tripAmounts } from "../worker/management.js";
import { LEAD_STATUSES, storedLeadStatus, statusSlug } from "../shared/lead-statuses.js";

const org = "00000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000001";
const timestamp = "2026-09-20T00:00:00.000Z";
test("agency review statuses are accepted and translated to the deployed database labels", () => {
  for (const status of LEAD_STATUSES) assert.equal(leadChanges({status}, {}).status,storedLeadStatus(status));
  for (const status of ['Qualified','Discovery','Proposal','Negotiation','Nurture','Follow Up']) assert.throws(()=>leadChanges({status},{}));
  assert.equal(statusSlug('Payment / Negotiation'),'payment-negotiation');
  assert.equal(statusSlug('Requirements captured'),'requirements-captured');
});
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key", JAPS_CRM_APP_ORIGIN: "https://crm.example", JAPS_CRM_ORGANIZATION_ID: org, JAPS_CRM_AUTH_MODE: "email" };
const reply = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
function request(path, method = "GET", body, origin = env.JAPS_CRM_APP_ORIGIN, cookie = "verified") { return new Request(`https://crm.example/api/${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie ? `japs_verified_session=${cookie}` : "" }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
function mockDatabase(t, handler, role = "Admin") {
  t.mock.method(globalThis, "fetch", async (input, init = {}) => {
    const url = new URL(input);
    if (url.pathname === "/auth/v1/user") return reply({ id: "auth", email: "staff@example.com", email_confirmed_at: timestamp });
    if (url.pathname.endsWith("crm_staff_access")) return reply([{ role, organization_id: org, profile: { id, name: "Staff", email: "staff@example.com" } }]);
    return handler(url, init);
  });
}
test("management rejects invalid statuses, excess precision, identity replacement and malformed dates", () => {
  for (const body of [{ status: "invented" }, { organization_id: "other" }, { first_message: "replace original" }, { campaign_id: "fake" }, { travelers: -1 }, { budget: 1.001 }, { start_date: "2026-02-30" }, { start_date: "2026-09-21", end_date: "2026-09-20" }]) assert.throws(() => leadChanges(body, {}));
  assert.deepEqual(leadChanges({ status: "Won", travelers: null, budget: 10.25 }, {}), { status: "Won", travelers: null, budget_minor: 1025 });
  assert.throws(() => contactChanges({ email: "bad" })); assert.throws(() => contactChanges({ name: "  " }));
  for (const body of [{ amount: -1 }, { amount: 0 }, { amount: "100" }, { amount: 1.001 }, { status: "Paid" }, { direction: "other" }]) assert.throws(() => paymentChanges(body));
  assert.deepEqual(paymentChanges({ amount: 10.25, status: "Paid", paid_date: "2026-09-20" }), { amount_minor: 1025, status: "Paid", paid_at: timestamp });
  assert.equal(paymentChanges({ status: "Cancelled" }, { paid_at: timestamp }).paid_at, null);
  assert.throws(() => tripAmounts(-1, 0)); assert.throws(() => tripAmounts(10, 11)); assert.deepEqual(tripAmounts(10.25, 5), { total_minor: 1025, customer_due_minor: 500 });
});
test("PATCH needs a staff session, same origin and an allowed role", async (t) => {
  mockDatabase(t, () => assert.fail("No record access expected"), "Read-only");
  const body = { updated_at: timestamp, status: "Requirement_Captured" };
  assert.equal((await worker.fetch(request(`leads/${id}`, "PATCH", body, env.JAPS_CRM_APP_ORIGIN, ""), env)).status, 401);
  assert.equal((await worker.fetch(request(`leads/${id}`, "PATCH", body, "https://evil.example"), env)).status, 403);
  assert.equal((await worker.fetch(request(`leads/${id}`, "PATCH", body), env)).status, 403);
});
test("lead edits are organization scoped, preserve attribution and use atomic version checks", async (t) => {
  let writes = 0; let conflict = false;
  mockDatabase(t, (url, init) => {
    assert.equal(url.searchParams.get("organization_id"), `eq.${org}`); assert.equal(url.searchParams.get("id"), `eq.${id}`);
    assert.equal(url.searchParams.get("deleted_at"), "is.null");
    if (init.method === "PATCH") { writes++; assert.equal(url.searchParams.get("updated_at"), `eq.${timestamp}`); const body = JSON.parse(init.body); assert.deepEqual(Object.keys(body).sort(), ["notes", "status", "updated_at"]); return reply(conflict ? [] : [{ id, updated_at: body.updated_at }]); }
    return reply([{ id, updated_at: timestamp }]);
  });
  assert.equal((await worker.fetch(request(`leads/${id}`, "PATCH", { status: "Requirements captured", notes: "Reviewed", updated_at: timestamp }), env)).status, 200);
  conflict = true;
  assert.equal((await worker.fetch(request(`leads/${id}`, "PATCH", { status: "Won", notes: "Updated", updated_at: timestamp }), env)).status, 409);
  assert.equal(writes, 2);
});
test("contact edits detect webhook enrichment even when updated_at did not change", async (t) => {
  const before = { id, name: "WhatsApp enquiry", phone: null, email: null, type: "Customer", notes: null, updated_at: timestamp };
  let current = { ...before, phone: "919999000001" }; let writes = 0;
  mockDatabase(t, (url, init) => { if (init.method === "PATCH") { writes++; assert.equal(url.searchParams.get("phone"), "eq.919999000001"); assert.equal(url.searchParams.get("notes"), "is.null"); return reply([{ ...current, ...JSON.parse(init.body) }]); } return reply([current]); });
  assert.equal((await worker.fetch(request(`contacts/${id}`, "PATCH", { name: "Reviewed guest", updated_at: timestamp, expected_version: await contactVersion(before) }), env)).status, 409);
  assert.equal(writes, 0);
  assert.equal((await worker.fetch(request(`contacts/${id}`, "PATCH", { name: "Reviewed guest", updated_at: timestamp, expected_version: await contactVersion(current) }), env)).status, 200);
  assert.equal(writes, 1);
});
test("Sales cannot edit payments or trip financial values", async (t) => {
  mockDatabase(t, () => assert.fail("No database writes"), "Sales");
  for (const table of ["payments", "trips"]) assert.equal((await worker.fetch(request(`${table}/${id}`, "PATCH", { updated_at: timestamp }), env)).status, 403);
  assert.equal((await worker.fetch(request("payments", "POST", {}), env)).status, 403);
  assert.equal((await worker.fetch(request("trips", "POST", { destination: "Manali", total_amount: 100, customer_due: 0 }), env)).status, 403);
});
test("payment creation returns persisted identity and ambiguous retries do not duplicate", async (t) => {
  let saved; let inserts = 0;
  mockDatabase(t, (url, init) => {
    if (url.pathname.endsWith("trips")) { assert.equal(url.searchParams.get("organization_id"), `eq.${org}`); return reply([{ id }]); }
    if (init.method === "POST") { assert.equal(url.searchParams.get("on_conflict"), "id"); assert.match(init.headers.Prefer, /ignore-duplicates/); if (saved) return reply([]); saved = JSON.parse(init.body); inserts++; return reply([saved]); }
    assert.equal(url.searchParams.get("organization_id"), `eq.${org}`); return reply([saved]);
  }, "Finance");
  const body = { request_id: id, trip_id: id, title: "Deposit", direction: "in", amount: 25.5, status: "Paid", paid_date: "2026-09-20" };
  const first = await worker.fetch(request("payments", "POST", body), env); assert.equal(first.status, 201); assert.equal((await first.json()).id, id);
  assert.equal((await worker.fetch(request("payments", "POST", body), env)).status, 200);
  assert.equal((await worker.fetch(request("payments", "POST", { ...body, amount: 30 }), env)).status, 409);
  assert.equal(inserts, 1);
});
test("foreign and deleted contacts/trips are never usable through management endpoints", async (t) => {
  mockDatabase(t, (url, init) => { assert.notEqual(init.method, "PATCH"); assert.equal(url.searchParams.get("organization_id"), `eq.${org}`); assert.equal(url.searchParams.get("deleted_at"), "is.null"); return reply([]); });
  assert.equal((await worker.fetch(request(`contacts/${id}`), env)).status, 404);
  assert.equal((await worker.fetch(request(`leads/${id}`, "PATCH", { updated_at: timestamp, status: "Won" }), env)).status, 404);
  assert.equal((await worker.fetch(request("payments", "POST", { request_id: id, trip_id: id, title: "Deposit", direction: "in", amount: 10, status: "Scheduled" }), env)).status, 404);
});
