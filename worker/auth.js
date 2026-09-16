import { bodyJson, database, databaseConfigured, HttpError, json, organizationId, rpc } from "./platform.js";

const COOKIE = "japs_verified_session";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sessionCookie(env, token = "", maxAge = 0) {
  const secure = env.JAPS_CRM_APP_ORIGIN?.startsWith("https://") ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.min(maxAge, 3600)}${secure}`;
}

async function authRequest(env, path, body, token) {
  if (!databaseConfigured(env)) throw new HttpError(503, "Sign-in is not configured yet.");
  if (!env.SUPABASE_URL.startsWith("https://")) throw new HttpError(503, "Sign-in configuration invalid.");
  let response;
  try {
    response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/${path}`, {
      method: body ? "POST" : "GET", signal: AbortSignal.timeout(10000),
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token || env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new HttpError(503, "Sign-in service unavailable. Please retry."); }
  if (!response.ok) {
    if (response.status === 429) throw new HttpError(429, "Please wait before requesting another code.");
    if (path === "otp") throw new HttpError(503, "The sign-in email could not be sent. Ask your administrator to check email delivery configuration.");
    throw new HttpError(401, "Sign-in could not be verified. Request a fresh email and try again.");
  }
  if (response.status === 204) return {};
  return response.json();
}

async function verifiedIdentity(env, token) {
  if (typeof token !== "string" || !token || token.length > 8192) throw new HttpError(401, "Please sign in.");
  const identity = await authRequest(env, "user", null, token);
  if (!identity.id || !identity.email || !identity.email_confirmed_at || identity.is_anonymous) throw new HttpError(401, "Verified email sign-in required.");
  return identity;
}

function tokenFromCookie(request) {
  try { return decodeURIComponent((request.headers.get("Cookie") || "").match(/(?:^|;\s*)japs_verified_session=([^;]+)/)?.[1] || ""); }
  catch { return ""; }
}

export async function authenticatedUser(request, env) {
  const identity = await verifiedIdentity(env, tokenFromCookie(request));
  const rows = await database(env, "crm_staff_access", {
    organization_id: `eq.${organizationId(env)}`, auth_user_id: `eq.${identity.id}`, active: "eq.true",
    select: "role,organization_id,profile:profiles(id,name,email,phone)", limit: "1",
  });
  const row = rows?.[0];
  const profile = Array.isArray(row?.profile) ? row.profile[0] : row?.profile;
  if (!profile?.id) throw new HttpError(403, "This account’s workspace access is unapproved or has been revoked.", "STAFF_ACCESS_DENIED");
  return { ...profile, role: row.role, organization_id: row.organization_id };
}

export async function handleAuth(request, env, path) {
  if (path === "/api/auth/login") throw new HttpError(410, "Unverified profile login has been removed. Use email sign-in.");
  if (path === "/api/auth/logout") {
    const token = tokenFromCookie(request);
    if (token) { try { await authRequest(env, "logout?scope=local", {}, token); } catch { /* Cookie clearing must still work after expiry. */ } }
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(env) });
  }
  const body = await bodyJson(request);
  if (path === "/api/auth/request-code") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!emailPattern.test(email) || email.length > 254) throw new HttpError(400, "Enter a valid email address.");
    const rows = await database(env, "crm_staff_access", { organization_id: `eq.${organizationId(env)}`, email: `eq.${email}`, active: "eq.true", select: "email", limit: "1" });
    if (rows?.length) {
      // Only explicitly approved staff can create an Auth account through this flow.
      // Configure Supabase's Magic Link email template to display {{ .Token }}.
      // Code-only exchange avoids putting access tokens in browser URL fragments.
      await authRequest(env, "otp", { email, create_user: true });
    }
    return json({ ok: true, message: "If this email is approved, a sign-in email will arrive shortly." });
  }
  let accessToken;
  let maxAge = 3600;
  if (path === "/api/auth/verify-code") {
    const email = String(body.email || "").trim().toLowerCase();
    const token = String(body.code || "").trim();
    if (!emailPattern.test(email) || !/^\d{6,10}$/.test(token)) throw new HttpError(400, "Enter the email and code from your sign-in email.");
    const verified = await authRequest(env, "verify", { email, token, type: "email" });
    accessToken = verified.access_token; maxAge = verified.expires_in || 3600;
  } else {
    throw new HttpError(404, "Not found.");
  }
  const identity = await verifiedIdentity(env, accessToken);
  // This function independently checks auth.users + the approved staff table.
  const user = await rpc(env, "crm_bind_verified_staff", { p_auth_user_id: identity.id, p_organization_id: organizationId(env) });
  if (!user?.id) throw new HttpError(403, "This account is not approved for Japs_CRM.");
  return json({ ok: true, user }, 200, { "Set-Cookie": sessionCookie(env, accessToken, maxAge) });
}
