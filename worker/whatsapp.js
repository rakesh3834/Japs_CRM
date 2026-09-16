import { HttpError, json, limitedBody, database, rpc, organizationId, requireRole, bodyJson } from "./platform.js";

const textLimit = (value, max = 4096) => typeof value === "string" ? value.slice(0, max) : null;
const metaId = (value) => /^\d{5,30}$/.test(String(value || "")) ? String(value) : null;

export async function validSignature(raw, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature || "")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from(signature.slice(7).match(/../g), (part) => parseInt(part, 16));
  return crypto.subtle.verify("HMAC", key, bytes, raw);
}

export function normalizeMessages(payload) {
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) return [];
  const results = [];
  for (const entry of payload.entry) for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
    // History, echoes, status changes and business auto-replies are not new enquiries.
    if (change?.field !== "messages") continue;
    const value = change.value || {};
    for (const msg of Array.isArray(value.messages) ? value.messages : []) {
      if (!msg || typeof msg.id !== "string" || !msg.id || !msg.from) continue;
      if (String(msg.from) === String(value.metadata?.display_phone_number)) continue;
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const contact = contacts.find((item) => String(item?.wa_id) === String(msg.from));
      const unsupported = Array.isArray(msg.errors) && msg.errors.length > 0;
      const content = msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? msg.image?.caption ?? msg.video?.caption ?? msg.document?.caption ?? null;
      const referral = msg.referral && typeof msg.referral === "object" ? msg.referral : {};
      results.push({
        waba_id: textLimit(String(entry.id || ""), 64), phone_number_id: textLimit(value.metadata?.phone_number_id, 64),
        message_id: textLimit(msg.id, 512), sender_id: textLimit(String(msg.from), 256),
        phone: /^\+?\d{7,15}$/.test(String(msg.from)) ? `+${String(msg.from).replace(/^\+/, "")}` : null,
        profile_name: textLimit(contact?.profile?.name, 160), message_type: textLimit(msg.type, 64),
        message_text: textLimit(content), timestamp: /^\d+$/.test(String(msg.timestamp)) ? Number(msg.timestamp) : null,
        referral, ad_id: referral.source_type === "ad" ? metaId(referral.source_id) : null,
        error_code: unsupported ? textLimit(String(msg.errors[0].code || "unknown"), 64) : null,
        ignored: ["reaction", "edit", "revoke", "system"].includes(msg.type),
      });
    }
  }
  return results;
}

export async function receiveWebhook(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    if (!env.META_WEBHOOK_VERIFY_TOKEN) throw new HttpError(503, "Webhook verification is not configured.");
    if (url.searchParams.get("hub.mode") !== "subscribe" || url.searchParams.get("hub.verify_token") !== env.META_WEBHOOK_VERIFY_TOKEN) throw new HttpError(403, "Verification rejected.");
    const challenge = url.searchParams.get("hub.challenge");
    if (!challenge || challenge.length > 1024) throw new HttpError(400, "Invalid challenge.");
    return new Response(challenge, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  }
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");
  if (!env.META_APP_SECRET) throw new HttpError(503, "Webhook signing secret is not configured.");
  const raw = await limitedBody(request, 1024 * 1024);
  if (!await validSignature(raw, request.headers.get("X-Hub-Signature-256"), env.META_APP_SECRET)) throw new HttpError(401, "Signature rejected.");
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new HttpError(400, "Invalid JSON."); }
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) throw new HttpError(400, "Unexpected webhook object.");
  const messages = normalizeMessages(payload);
  const ads = new Set(); let stored = 0;
  for (const message of messages) {
    if (message.ignored) continue;
    // The RPC resolves organization from an explicitly enabled phone + WABA mapping.
    // A wrong or unconfigured account cannot write into the default organization.
    const result = await rpc(env, "crm_ingest_whatsapp_message", { p_message: message });
    if (result?.accepted) { stored++; if (message.ad_id) ads.add(`${result.organization_id}:${message.ad_id}`); }
  }
  // The enquiry is durable before we acknowledge; ads enrichment is recoverable.
  if (ads.size && ctx?.waitUntil) ctx.waitUntil(Promise.all([...ads].map(async (key) => {
    const [org, ad] = key.split(":"); await enrichAd(env, org, ad);
  })).catch(() => {}));
  return json({ ok: true, received: stored });
}

export async function graphGet(env, path, fields, token) {
  const version = env.META_GRAPH_VERSION || "v26.0";
  if (!/^v\d+\.\d+$/.test(version)) throw new HttpError(503, "Meta version configuration invalid.");
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  url.searchParams.set("fields", fields);
  let response;
  try { response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }); }
  catch { throw new HttpError(502, "Meta could not be reached."); }
  const value = await response.json();
  if (!response.ok || value.error) throw new HttpError(502, `Meta access check failed${value.error?.code ? ` (code ${Number(value.error.code)})` : ""}.`);
  return value;
}

export async function enrichAd(env, org, adId) {
  if (!metaId(adId)) return;
  const current = await database(env, "meta_ad_attribution", { organization_id: `eq.${org}`, ad_id: `eq.${adId}`, select: "enrichment_status", limit: "1" });
  if (current?.[0]?.enrichment_status === "ready") return;
  const token = env.META_ADS_ACCESS_TOKEN;
  const base = { organization_id: org, ad_id: adId, last_attempt_at: new Date().toISOString() };
  const save = (data) => database(env, "meta_ad_attribution", { on_conflict: "organization_id,ad_id" }, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ ...base, ...data }) });
  if (!token || !env.META_AD_ACCOUNT_ID) { await save({ enrichment_status: "needs_access" }); return; }
  try {
    const ad = await graphGet(env, adId, "id,name,account_id,campaign{id,name},adset{id,name},effective_status", token);
    if (String(ad.account_id) !== env.META_AD_ACCOUNT_ID) throw new HttpError(403, "Ad belongs to a different account.");
    await save({ ad_name: ad.name || null, campaign_id: ad.campaign?.id || null, campaign_name: ad.campaign?.name || null, adset_id: ad.adset?.id || null, adset_name: ad.adset?.name || null, enrichment_status: "ready", last_error: null, enriched_at: new Date().toISOString() });
  } catch (error) { await save({ enrichment_status: "retry", last_error: error instanceof HttpError ? error.message : "Meta enrichment unavailable." }); }
}

export async function integrationStatus(env, user) {
  requireRole(user, ["Owner", "Admin"]);
  const org = organizationId(env);
  const [connections, pending, recent] = await Promise.all([
    database(env, "whatsapp_connections", { organization_id: `eq.${org}`, select: "phone_number_id,waba_id,display_phone_number,active,last_message_at" }),
    database(env, "meta_ad_attribution", { organization_id: `eq.${org}`, enrichment_status: "neq.ready", select: "ad_id,enrichment_status,last_error", limit: "20" }),
    database(env, "whatsapp_messages", { organization_id: `eq.${org}`, select: "received_at,error_code,message_type", order: "received_at.desc", limit: "5" }),
  ]);
  return json({ ok: true, configured: { signing: Boolean(env.META_APP_SECRET), verification: Boolean(env.META_WEBHOOK_VERIFY_TOKEN), ads_read: Boolean(env.META_ADS_ACCESS_TOKEN), whatsapp_read: Boolean(env.META_WHATSAPP_ACCESS_TOKEN) }, connections, pending, recent,
    callback_path: "/api/webhooks/whatsapp", live_test_verified: false });
}

export async function integrationAction(request, env, user, action) {
  requireRole(user, ["Owner", "Admin"]);
  if (action === "retry-attribution") {
    const pending = await database(env, "meta_ad_attribution", { organization_id: `eq.${organizationId(env)}`, enrichment_status: "neq.ready", select: "ad_id", order: "last_attempt_at.asc.nullsfirst,ad_id.asc", limit: "3" });
    await Promise.all((pending || []).map((row) => enrichAd(env, user.organization_id, row.ad_id)));
    return json({ ok: true, attempted: pending?.length || 0 });
  }
  if (action === "check-coexistence") {
    if (!env.META_WHATSAPP_ACCESS_TOKEN) throw new HttpError(503, "WhatsApp read access is not configured.");
    const connections = await database(env, "whatsapp_connections", { organization_id: `eq.${organizationId(env)}`, select: "phone_number_id,waba_id", limit: "1" });
    const phone = connections?.[0]?.phone_number_id;
    if (!metaId(phone)) throw new HttpError(503, "Business number mapping not configured.");
    const status = await graphGet(env, phone, "is_on_biz_app,platform_type", env.META_WHATSAPP_ACCESS_TOKEN);
    return json({ ok: true, coexistence_confirmed: status.is_on_biz_app === true && status.platform_type === "CLOUD_API", is_on_biz_app: status.is_on_biz_app ?? null, platform_type: status.platform_type ?? null });
  }
  if (action === "map-ad") {
    const body = await bodyJson(request);
    if (!metaId(body.ad_id)) throw new HttpError(400, "A valid ad ID is required.");
    await database(env, "meta_ad_mappings", { on_conflict: "organization_id,ad_id" }, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ organization_id: organizationId(env), ad_id: body.ad_id, offering_name: textLimit(body.offering_name, 160), destination: textLimit(body.destination, 160), event_reference: textLimit(body.event_reference, 160) }) });
    return json({ ok: true });
  }
  throw new HttpError(404, "Unknown integration action.");
}
