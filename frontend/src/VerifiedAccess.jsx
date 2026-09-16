import { useEffect, useState } from "react";
import { Compass, ShieldCheck } from "lucide-react";

export function LoginScreen({ api, mode = "paused", onSignedIn, checking, initialError }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const passwordMode = mode === "temporary_password";
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (passwordMode) {
        const result = await api("/api/auth/password", { method: "POST", body: JSON.stringify({ email, password }) });
        setPassword(""); onSignedIn(result.user);
      } else if (mode !== "email") {
        setMessage("Staff sign-in is paused. Customer records remain protected.");
      } else if (!sent) {
        const result = await api("/api/auth/request-code", { method: "POST", body: JSON.stringify({ email }) });
        setSent(true); setMessage(result.message);
      } else {
        const result = await api("/api/auth/verify-code", { method: "POST", body: JSON.stringify({ email, code }) });
        onSignedIn(result.user);
      }
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <main className="verified-login"><section className="card verified-login-card">
    <div className="brand-mark"><Compass size={24} /></div>
    <div className="eyebrow">Japs_CRM · Staff workspace</div>
    <h1>{mode === "paused" ? "Staff access paused" : passwordMode ? "Administrator access" : "Welcome back"}</h1>
    <p>{mode === "paused" ? "Customer records are protected while staff access is being configured. WhatsApp intake is configured separately." : passwordMode ? "Use your administrator email and temporary password. Email codes and confirmation links are paused." : "Sign in with an approved email address to access your agency’s leads and trips."}</p>
    {checking ? <p role="status">Checking your session…</p> : mode !== "paused" && <form className="modal-form" onSubmit={submit}>
      <label className="field"><span>Email address</span><input required type="email" autoComplete="email" value={email} disabled={sent || busy} onChange={(event) => setEmail(event.target.value)} /></label>
      {passwordMode && <label className="field"><span>Temporary administrator password</span><input required type="password" autoComplete="current-password" minLength={12} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
      {!passwordMode && sent && <label className="field"><span>Code from your email</span><input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" maxLength={10} value={code} onChange={(event) => setCode(event.target.value)} /></label>}
      <button className="primary-button" disabled={busy}>{busy ? "Please wait…" : passwordMode ? "Sign in" : sent ? "Verify and sign in" : "Email me a sign-in code"}</button>
      {!passwordMode && sent && <button type="button" className="text-button" disabled={busy} onClick={() => { setSent(false); setCode(""); }}>Change email or request a new code</button>}
    </form>}
    {(message || initialError) && <p className="integration-notice" role="status">{message || initialError}</p>}
    <p className="settings-copy"><ShieldCheck size={15} /> Access is granted by your administrator. No customer data is available before verification.</p>
    <p className="settings-copy"><a href="/privacy">Privacy notice</a> · <a href="/data-deletion">Data-deletion instructions</a></p>
  </section></main>;
}

export function IntegrationSettings({ api, user }) {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [mapping, setMapping] = useState({ ad_id: "", offering_name: "", destination: "", event_reference: "" });
  const admin = ["Admin", "Owner"].includes(user.role);
  async function refresh() {
    try { setState(await api("/api/integrations/whatsapp")); } catch (error) { setMessage(error.message); }
  }
  useEffect(() => { if (admin) void refresh(); }, [admin]);
  async function action(name, body = {}) {
    setBusy(true); setMessage("");
    try {
      const result = await api(`/api/integrations/whatsapp/${name}`, { method: "POST", body: JSON.stringify(body) });
      setMessage(name === "check-coexistence" ? (result.coexistence_confirmed ? "Meta confirms Business app + Cloud API coexistence. A real enquiry test is still required." : "Coexistence is not confirmed. Do not migrate or disconnect the number.") : name === "map-ad" ? "Ad-to-offering mapping saved." : `Attribution retried for ${result.attempted} ads.`);
      await refresh();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  if (!admin) return <p>Integration settings are available to verified administrators.</p>;
  return <section className="card settings-card integration-panel"><h2>WhatsApp → lead inbox</h2>
    <p className="settings-copy">A customer must send a message. Opening a chat alone does not create a lead. This screen never changes your ads or registers your number.</p>
    {message && <p className="integration-notice" role="status">{message}</p>}
    {!state ? <p>Connection details are not available yet. Apply the integration migration and configure server access.</p> : <>
      <div className="settings-list">{Object.entries(state.configured).map(([key, ready]) => <div key={key}><span>{({ signing: "Webhook signature secret", verification: "Webhook verification token", ads_read: "Ads read credential", whatsapp_read: "WhatsApp read credential" })[key]}</span><strong>{ready ? "Configured" : "Not configured"}</strong></div>)}</div>
      <p><strong>Callback:</strong> <code>{window.location.origin}{state.callback_path}</code></p>
      {state.connections.length === 0 && <p>No business number mapped yet.</p>}
      {state.connections.map((connection) => <p key={connection.phone_number_id}>{connection.display_phone_number || connection.phone_number_id} · {connection.active ? "Receiver enabled" : "Receiver inactive"} · Last message: {connection.last_message_at ? new Date(connection.last_message_at).toLocaleString() : "None"}</p>)}
      <p>Unresolved ad lookups: {state.pending.length}{state.pending.length === 20 ? "+" : ""}</p>
      {state.recent.filter((item) => item.error_code).map((item, index) => <p role="alert" key={index}>Incoming message error {item.error_code} at {new Date(item.received_at).toLocaleString()}. Check the original enquiry in the Business app; it may need manual reconciliation.</p>)}
      <div className="integration-actions"><button className="secondary-button" disabled={busy} onClick={() => action("check-coexistence")}>Check coexistence (read-only)</button><button className="secondary-button" disabled={busy} onClick={() => action("retry-attribution")}>Retry campaign lookups</button><button className="secondary-button" disabled={busy} onClick={refresh}>Refresh status</button></div>
      <details><summary>Map an ad to your agency’s offering</summary><p className="settings-copy">Use the actual Meta ad ID. This identifies the advertised trip, not the customer’s chosen travel dates or final preference.</p>
        <form className="modal-form" onSubmit={(event) => { event.preventDefault(); void action("map-ad", mapping); }}>
          {Object.entries({ ad_id: "Meta ad ID", offering_name: "Advertised trip / package", destination: "Advertised destination", event_reference: "Agency event reference (optional)" }).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input required={key === "ad_id"} value={mapping[key]} onChange={(event) => setMapping({ ...mapping, [key]: event.target.value })} /></label>)}
          <button className="primary-button" disabled={busy}>Save mapping</button>
        </form>
      </details>
    </>}
    <p className="settings-copy">Setup is not complete until a real ad enquiry reaches this CRM. Delivery errors, app echoes and historical messages are not counted as new leads.</p>
  </section>;
}
