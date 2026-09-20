import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import worker from "../worker/index.js";
import { validSignature, normalizeMessages, enrichAd, integrationStatus, integrationAction } from "../worker/whatsapp.js";

const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-service-key", JAPS_CRM_APP_ORIGIN: "https://crm.example", JAPS_CRM_ORGANIZATION_ID: "00000000-0000-4000-8000-000000000001", META_APP_SECRET: "test-secret", META_WEBHOOK_VERIFY_TOKEN: "test-verify" };
const path = "/api/webhooks/whatsapp";
env.JAPS_CRM_AUTH_MODE = "email";
function payload(messages, field = "messages") {
  return { object: "whatsapp_business_account", entry: [{ id: "123456", changes: [{ field, value: { metadata: { phone_number_id: "987654", display_phone_number: "917303530355" }, contacts: [{ wa_id: "919999000001", profile: { name: "Test Guest" } }], messages } }] }] };
}
const message = { id: "wamid.test", from: "919999000001", timestamp: "1789600000", type: "text", text: { body: "I would like a Manali trip" }, referral: { source_id: "12345678", source_type: "ad", ctwa_clid: "test-click", headline: "Manali", source_url: "https://facebook.com/example" } };
function signed(value, secret = env.META_APP_SECRET) {
  const raw = JSON.stringify(value);
  return new Request(`https://crm.example${path}`, { method: "POST", headers: { "X-Hub-Signature-256": `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}` }, body: raw });
}
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const passwordEnv = { ...env, JAPS_CRM_AUTH_MODE: "temporary_password", JAPS_CRM_TEMP_ADMIN_EMAIL: "admin@example.com", JAPS_CRM_TEMP_ADMIN_EXPIRES_AT: "2099-01-01T00:00:00Z" };
function authPost(route, body) {
  return new Request(`https://crm.example/api/auth/${route}`, { method: "POST", headers: { Origin: env.JAPS_CRM_APP_ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("temporary administrator password authenticates without email or exposed tokens", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push(new URL(url).pathname);
    if (String(url).endsWith("/token?grant_type=password")) {
      assert.deepEqual(JSON.parse(init.body), { email: "admin@example.com", password: "test-only-password" });
      return reply({ access_token: "verified-password-token", refresh_token: "must-stay-server-side", expires_in: 3600 });
    }
    if (String(url).endsWith("/user")) return reply({ id: "verified-admin", email: "admin@example.com", email_confirmed_at: "2026-01-01" });
    if (String(url).endsWith("/rpc/crm_bind_verified_staff")) return reply({ id: "profile", role: "Admin", email: "admin@example.com" });
    throw new Error("Unexpected call");
  });
  const response = await worker.fetch(authPost("password", { email: " ADMIN@example.com ", password: "test-only-password", role: "Owner" }), passwordEnv);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, user: { id: "profile", role: "Admin", email: "admin@example.com" } });
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly; Path=\/; SameSite=Strict; Max-Age=3600; Secure/);
  assert.deepEqual(calls, ["/auth/v1/token", "/auth/v1/user", "/rest/v1/rpc/crm_bind_verified_staff"]);
});

test("password mode disables both email endpoints and rejects unapproved identities before upstream calls", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("Must not contact auth or database"));
  for (const route of ["request-code", "verify-code"]) assert.equal((await worker.fetch(authPost(route, { email: "admin@example.com", code: "123456" }), passwordEnv)).status, 503);
  assert.equal((await worker.fetch(authPost("password", { email: "outsider@example.com", password: "test-only-password" }), passwordEnv)).status, 401);
  assert.equal((await worker.fetch(authPost("password", { email: "admin@example.com", password: "short" }), passwordEnv)).status, 401);
});

test("missing or expired auth configuration pauses sign-in and existing sessions", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("Paused access must not query customer data"));
  for (const override of [{ JAPS_CRM_AUTH_MODE: undefined }, { JAPS_CRM_TEMP_ADMIN_EMAIL: "" }, { JAPS_CRM_TEMP_ADMIN_EXPIRES_AT: "2020-01-01" }, { JAPS_CRM_TEMP_ADMIN_EXPIRES_AT: "invalid" }]) {
    const paused = { ...passwordEnv, ...override };
    assert.equal((await worker.fetch(authPost("password", { email: "admin@example.com", password: "test-only-password" }), paused)).status, 503);
    const me = await worker.fetch(new Request("https://crm.example/api/me", { headers: { Cookie: "japs_verified_session=old" } }), paused);
    assert.equal(me.status, 401); assert.equal((await me.json()).code, "AUTH_PAUSED");
    assert.equal((await (await worker.fetch(new Request("https://crm.example/api/config"), paused)).json()).auth_mode, "paused");
  }
});

test("password failures preserve rate limits and never grant a session", async (t) => {
  t.mock.method(globalThis, "fetch", async () => reply({ error: "upstream detail" }, 429));
  const request = () => authPost("password", { email: "admin@example.com", password: "test-only-password" });
  assert.equal((await worker.fetch(request(), passwordEnv)).status, 429);
  globalThis.fetch.mock.mockImplementation(async () => reply({ error: "invalid grant" }, 400));
  const wrong = await worker.fetch(request(), passwordEnv);
  assert.equal(wrong.status, 401); assert.equal(wrong.headers.get("Set-Cookie"), null);
});

test("replaced or demoted temporary admin forces cached workspace data to clear", async (t) => {
  let email = "old-admin@example.com";
  t.mock.method(globalThis, "fetch", async (url) => String(url).endsWith("/user") ? reply({ id: "admin", email, email_confirmed_at: "2026-01-01" }) : reply([{ role: "Sales", organization_id: env.JAPS_CRM_ORGANIZATION_ID, profile: { id: "profile", email } }]));
  const request = () => new Request("https://crm.example/api/me", { headers: { Cookie: "japs_verified_session=verified" } });
  for (const nextEmail of ["old-admin@example.com", "admin@example.com"]) {
    email = nextEmail;
    const response = await worker.fetch(request(), passwordEnv);
    assert.equal(response.status, 403); assert.equal((await response.json()).code, "STAFF_ACCESS_DENIED");
  }
});

test("HMAC accepts exact body and rejects changed bytes", async () => {
  const body = new TextEncoder().encode("exact body");
  const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
  assert.equal(await validSignature(body, signature, "secret"), true);
  assert.equal(await validSignature(new TextEncoder().encode("changed"), signature, "secret"), false);
});

test("approved privacy and deletion instructions are public without customer access", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("Policies must not query customer data"));
  for (const route of ["privacy", "data-deletion"]) {
    const response = await worker.fetch(new Request(`https://crm.example/${route}`), {});
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Travel with Japs/); assert.match(html, /contactjapstours@gmail.com/);
    assert.equal(response.headers.get("Cache-Control"), "no-cache");
    for (const suffix of ["", "/"]) {
      const head = await worker.fetch(new Request(`https://crm.example/${route}${suffix}`, { method: "HEAD" }), {});
      assert.equal(head.status, 200);
      assert.deepEqual([...head.headers], [...response.headers]);
      assert.equal(await head.text(), "");
    }
  }
});

test("anonymous and old unsigned cookies cannot read customer data", async (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("Must not query customer tables"); });
  for (const cookie of ["", `japs_crm_user=${btoa(JSON.stringify({ role: "Admin", id: "forged" }))}`]) {
    const response = await worker.fetch(new Request("https://crm.example/api/leads", { headers: { Cookie: cookie } }), env);
    assert.equal(response.status, 401); assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("cross-origin login rejected and legacy self-declared login removed", async () => {
  const request = (origin) => new Request("https://crm.example/api/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: '{"role":"Admin"}' });
  assert.equal((await worker.fetch(request("https://evil.example"), env)).status, 403);
  assert.equal((await worker.fetch(request(env.JAPS_CRM_APP_ORIGIN), env)).status, 410);
  assert.equal((await worker.fetch(new Request("https://crm.example/api/auth/logout"), env)).status, 405);
});

test("approved verified identity reads data in server-selected organization only", async (t) => {
  const queries = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(url); queries.push(parsed);
    if (parsed.pathname === "/auth/v1/user") return reply({ id: "auth-id", email: "admin@example.com", email_confirmed_at: "2026-01-01" });
    if (parsed.pathname.endsWith("crm_staff_access")) return reply([{ role: "Read-only", organization_id: env.JAPS_CRM_ORGANIZATION_ID, profile: { id: "profile-id", name: "Staff" } }]);
    if (parsed.pathname.endsWith("crm_lead_inbox")) return reply([]);
    throw new Error("Unexpected query");
  });
  const headers = { Cookie: "japs_verified_session=verified-test", Origin: env.JAPS_CRM_APP_ORIGIN, "Content-Type": "application/json" };
  const read = await worker.fetch(new Request("https://crm.example/api/leads?organization_id=other", { headers }), env);
  assert.equal(read.status, 200);
  assert.equal(queries.find((url) => url.pathname.endsWith("crm_lead_inbox")).searchParams.get("organization_id"), `eq.${env.JAPS_CRM_ORGANIZATION_ID}`);
  const write = await worker.fetch(new Request("https://crm.example/api/leads", { method: "POST", headers, body: "{}" }), env);
  assert.equal(write.status, 403);
});

test("an Auth account without approved CRM access is denied", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => String(url).includes("auth/v1/user") ? reply({ id: "outsider", email: "x@example.com", email_confirmed_at: "2026-01-01" }) : reply([]));
  const response = await worker.fetch(new Request("https://crm.example/api/me", { headers: { Cookie: "japs_verified_session=valid-but-unapproved" } }), env);
  assert.equal(response.status, 403); assert.equal((await response.json()).code, "STAFF_ACCESS_DENIED");
});

test("email code exchange binds only independently verified staff and sets a secure cookie", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push(String(url));
    if (String(url).endsWith("/auth/v1/verify")) return reply({ access_token: "verified-token", expires_in: 3600 });
    if (String(url).endsWith("/auth/v1/user")) {
      assert.equal(init.headers.Authorization, "Bearer verified-token");
      return reply({ id: "verified-id", email: "approved@example.com", email_confirmed_at: "2026-01-01" });
    }
    if (String(url).endsWith("/rpc/crm_bind_verified_staff")) {
      assert.equal(JSON.parse(init.body).p_auth_user_id, "verified-id");
      return reply({ id: "approved-profile", role: "Admin", email: "approved@example.com" });
    }
    throw new Error("Unexpected auth request");
  });
  const request = new Request("https://crm.example/api/auth/verify-code", { method: "POST", headers: { Origin: env.JAPS_CRM_APP_ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ email: "approved@example.com", code: "123456", role: "Owner" }) });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200); assert.equal((await response.json()).user.role, "Admin");
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly; Path=\/; SameSite=Strict; Max-Age=3600; Secure/);
  assert.equal(calls.length, 3);
});

test("webhook verification and invalid signatures never query database", async (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("No database access expected"); });
  const verified = await worker.fetch(new Request(`https://crm.example${path}?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=12345`), env);
  assert.equal(verified.status, 200); assert.equal(await verified.text(), "12345");
  assert.equal((await worker.fetch(signed(payload([message]), "wrong-secret"), env)).status, 401);
});

test("inbound normalization preserves referrals and never invents click platform", () => {
  const [normalized] = normalizeMessages(payload([message]));
  assert.equal(normalized.ad_id, "12345678"); assert.equal(normalized.phone, "+919999000001");
  assert.equal(normalized.profile_name, "Test Guest"); assert.equal(normalized.referral.ctwa_clid, "test-click");
  assert.equal(normalized.source_platform, undefined);
  assert.equal(normalizeMessages(payload([message], "history")).length, 0);
  assert.equal(normalizeMessages(payload([message], "smb_message_echoes")).length, 0);
  assert.equal(normalizeMessages({ object: "whatsapp_business_account", entry: [{ changes: {} }] }).length, 0);
  assert.equal(normalizeMessages(payload([{ ...message, from: "917303530355" }])).length, 0);
  assert.equal(normalizeMessages(payload([{ ...message, type: "reaction" }]))[0].ignored, true);
  assert.equal(normalizeMessages(payload([{ ...message, type: "unsupported", errors: [{ code: 131060 }] }]))[0].error_code, "131060");
  const twoSenders = normalizeMessages(payload([message, { ...message, id: "other", from: "919999000002" }]));
  assert.notEqual(twoSenders[0].sender_id, twoSenders[1].sender_id);
  assert.equal(twoSenders[1].profile_name, null, "Unmatched sender must not borrow another customer's name");
});

test("batched enquiries are persisted before acknowledgement; DB outage returns retryable error", async (t) => {
  const saved = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.ok(String(url).endsWith("/rpc/crm_ingest_whatsapp_message"));
    saved.push(JSON.parse(init.body).p_message); return reply({ accepted: true, organization_id: env.JAPS_CRM_ORGANIZATION_ID });
  });
  const response = await worker.fetch(signed(payload([message, { ...message, id: "wamid.second" }])), env);
  assert.equal(response.status, 200); assert.equal(saved.length, 2);
  globalThis.fetch.mock.mockImplementation(async () => reply({}, 503));
  assert.equal((await worker.fetch(signed(payload([message])), env)).status, 503);
});

test("inbound intake does not require CRM staff login, origin, or email configuration", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push(String(url));
    assert.ok(String(url).endsWith("/rpc/crm_ingest_whatsapp_message"));
    assert.equal(JSON.parse(init.body).p_message.message_id, message.id);
    return reply({ accepted: true, organization_id: env.JAPS_CRM_ORGANIZATION_ID });
  });
  const receiverEnv = { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY, META_APP_SECRET: env.META_APP_SECRET };
  const response = await worker.fetch(signed(payload([message])), receiverEnv);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, received: 1 });
  assert.equal(calls.length, 1);
});

test("accepted ad enquiries schedule campaign lookup once per ad after persistence", async (t) => {
  const tasks = []; const calls = []; const writes = [];
  const adsEnv = { ...env, META_ADS_ACCESS_TOKEN: "test-ads-token", META_AD_ACCOUNT_ID: "123456789" };
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    const parsed = new URL(url); calls.push(parsed.pathname);
    if (parsed.pathname.endsWith("/rpc/crm_ingest_whatsapp_message")) return reply({ accepted: true, organization_id: env.JAPS_CRM_ORGANIZATION_ID });
    if (parsed.hostname === "graph.facebook.com") {
      assert.equal(init.headers.Authorization, "Bearer test-ads-token");
      assert.equal(parsed.searchParams.has("access_token"), false);
      return reply({ id: message.referral.source_id, account_id: "123456789", name: "Manali enquiry ad", campaign: { id: "333333", name: "Manali September" }, adset: { id: "444444", name: "WhatsApp enquiries" } });
    }
    assert.ok(parsed.pathname.endsWith("/meta_ad_attribution"));
    if (init.method === "POST") { writes.push(JSON.parse(init.body)); return reply(null); }
    return reply([{ enrichment_status: "pending" }]);
  });
  const response = await worker.fetch(signed(payload([message, { ...message, id: "wamid.followup" }])), adsEnv, { waitUntil: (task) => tasks.push(task) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, received: 2 });
  await Promise.all(tasks);
  assert.equal(tasks.length, 1);
  assert.deepEqual(calls.slice(0, 2), ["/rest/v1/rpc/crm_ingest_whatsapp_message", "/rest/v1/rpc/crm_ingest_whatsapp_message"]);
  assert.equal(calls.filter((path) => path === `/v26.0/${message.referral.source_id}`).length, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].campaign_name, "Manali September");
  assert.equal(writes[0].adset_name, "WhatsApp enquiries");
  assert.equal(writes[0].enrichment_status, "ready");
});

test("an inactive or unmapped account is not counted as an accepted enquiry", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.ok(String(url).endsWith("/rpc/crm_ingest_whatsapp_message"));
    return reply({ accepted: false });
  });
  const response = await worker.fetch(signed(payload([message])), env, { waitUntil: () => assert.fail("Unaccepted enquiries must not trigger attribution") });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, received: 0 });
});

test("successful campaign metadata is cached and cannot be downgraded by retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return reply([{ enrichment_status: "ready" }]); });
  await enrichAd(env, env.JAPS_CRM_ORGANIZATION_ID, "12345678"); assert.equal(calls, 1);
});

test("malformed and oversized public payloads fail without ingesting data", async () => {
  assert.equal((await worker.fetch(signed(null), env)).status, 400);
  const large = new Request(`https://crm.example${path}`, { method: "POST", headers: { "content-length": "4000000" }, body: "{}" });
  assert.equal((await worker.fetch(large, env)).status, 413);
});

test("username-only senders are captured without inventing phone numbers", () => {
  const value = payload([{ ...message, from: undefined, from_user_id: "IN.ABC123" }]);
  value.entry[0].changes[0].value.contacts = [{ user_id: "IN.UNRELATED", profile: { name: "Wrong guest" } }, { user_id: "IN.ABC123", profile: { username: "actual_username" } }];
  const [normalized] = normalizeMessages(value);
  assert.equal(normalized.sender_id, "bsuid:IN.ABC123");
  assert.equal(normalized.user_id, "IN.ABC123");
  assert.equal(normalized.phone, null);
  assert.equal(normalized.profile_name, "actual_username");
  delete value.entry[0].changes[0].value.metadata.display_phone_number;
  assert.equal(normalizeMessages(value)[0].sender_id, "bsuid:IN.ABC123", "Missing optional display number must not suppress an incoming enquiry");
  const [known] = normalizeMessages(payload([{ ...message, from_user_id: "IN.ABC123" }]));
  assert.equal(known.sender_id, message.from, "Existing phone identity must remain stable");
  assert.equal(normalizeMessages(payload([{ ...message, from: undefined, from_user_id: "invalid" }])).length, 0);
});

test("delivery diagnostics distinguish ignored, duplicate, error and unmapped events without PII", async (t) => {
  const logs = []; let call = 0;
  t.mock.method(console, "warn", (value) => logs.push(JSON.parse(value)));
  t.mock.method(console, "info", (value) => logs.push(JSON.parse(value)));
  t.mock.method(globalThis, "fetch", async () => reply([{ accepted: true, duplicate: true }, { accepted: true }, { accepted: false }][call++]));
  const event = payload([message, { ...message, id: "error", errors: [{ code: 131060 }] }, { ...message, id: "unmapped" }, { ...message, id: "ignore", type: "reaction" }, { id: "missing" }]);
  event.entry[0].changes[0].value.errors = [{ code: 1, title: "private text" }];
  assert.equal((await worker.fetch(signed(event), env)).status, 200);
  assert.equal(logs[0].duplicates, 1); assert.equal(logs[0].stored, 0);
  assert.equal(logs[0].error_records, 1); assert.equal(logs[0].unmapped, 1);
  assert.equal(logs[0].ignored, 1); assert.equal(logs[0].missing_identity, 1); assert.equal(logs[0].value_errors, 1);
  for (const secret of [message.from, message.text.body, "Test Guest", env.META_APP_SECRET, "private text"]) assert.equal(JSON.stringify(logs).includes(secret), false);
  globalThis.fetch.mock.mockImplementation(async () => reply({}, 503));
  assert.equal((await worker.fetch(signed(payload([message])), env)).status, 503);
  assert.equal(logs.at(-1).status, 503);
});

test("integration health uses successful storage and preserves older error visibility", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = new URL(url);
    assert.equal(u.searchParams.get("organization_id"), `eq.${env.JAPS_CRM_ORGANIZATION_ID}`);
    if (u.searchParams.get("error_code") === "not.is.null") return reply([{ error_code: "131060", received_at: "2026-01-01T00:00:00Z" }]);
    if (u.searchParams.get("lead_id") === "not.is.null") return reply([{ received_at: new Date().toISOString() }]);
    return reply([]);
  });
  const result = await (await integrationStatus(env, { role: "Admin" })).json();
  assert.equal(result.delivery.recent_delivery_observed, true);
  assert.equal(result.delivery.completeness_verified, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.live_test_verified, undefined);
  await assert.rejects(() => integrationStatus(env, { role: "Sales" }));
});

test("a connected coexistence number does not mask a missing messaging grant", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith("whatsapp_connections")) return reply([{ phone_number_id: "987654" }]);
    if (u.pathname.endsWith("me/permissions")) return reply({ data: [{ permission: "whatsapp_business_management", status: "granted" }] });
    return reply({ status: "CONNECTED", is_on_biz_app: true, platform_type: "CLOUD_API" });
  });
  const result = await (await integrationAction(new Request("https://crm.example"), { ...env, META_WHATSAPP_ACCESS_TOKEN: "test-token" }, { role: "Admin" }, "check-coexistence")).json();
  assert.equal(result.coexistence_confirmed, true); assert.equal(result.phone_connected, true); assert.equal(result.messaging_permission_granted, false);
});
