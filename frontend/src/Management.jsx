import { useEffect, useRef, useState } from "react";
import { ChevronRight, Plus, X } from "lucide-react";
import { timeInIndia } from "./record-time.js";

export const leadStatuses = ["Inbox", "Qualified", "Discovery", "Proposal", "Negotiation", "Won", "Lost", "Nurture"];
export const canManage = (user) => ["Admin", "Owner", "Sales", "Operations"].includes(user?.role);
export const canFinance = (user) => ["Admin", "Owner", "Finance"].includes(user?.role);
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
const when = timeInIndia;
const field = (label, control) => <label className="field"><span>{label}</span>{control}</label>;
function Heading({ title, description, action, label }) { return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action && <button className="primary-button" onClick={action}><Plus size={17} />{label}</button>}</div>; }
function Tile({ label, value, onClick, hint = "Saved records" }) { return <button className="metric-card tone-mint actionable-metric" onClick={onClick}><div className="metric-top"><span>{label}</span><ChevronRight size={18} /></div><strong className="metric-value">{value}</strong><span className="metric-label">{hint}</span></button>; }
function Empty({ children }) { return <p className="empty-records">{children}</p>; }

export function Editor({ title, children, onClose, onSave, readOnly = false }) {
  const dialog = useRef(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const previouslyFocused = document.activeElement; dialog.current.showModal(); return () => previouslyFocused?.focus(); }, []);
  async function submit(event) {
    event.preventDefault(); if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError("");
    try { await onSave(); } catch (problem) { setError(problem.message); } finally { submitting.current = false; setBusy(false); }
  }
  return <dialog className="record-dialog" ref={dialog} aria-labelledby="record-editor-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={submit}><header className="modal-head"><h2 id="record-editor-title">{title}</h2><button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label="Close editor"><X size={20} /></button></header>
      <div className="modal-form"><fieldset disabled={busy || readOnly}>{children}</fieldset>{error && <p role="alert" className="integration-notice">{error}</p>}
        <div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{readOnly ? "Close" : "Cancel"}</button>{!readOnly && <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>}</div>
      </div></form></dialog>;
}

export function LeadFacts({ lead }) {
  const rows = [["Name", lead.name], ["Phone", lead.phone], ["Email", lead.email], ["Lead status", lead.status], ["Source", lead.source], ["Campaign", lead.campaign_name], ["Campaign ID", lead.campaign_id], ["Ad set", lead.adset_name], ["Ad", lead.ad_name], ["Ad ID", lead.ad_id], ["Click platform", lead.source_platform || "Unknown — not supplied by Meta"], ["Advertised package", lead.offering_name], ["Event", lead.event_reference], ["First message", lead.first_message], ["Review notes", lead.notes], ["Next action", lead.next], ["First message sent", when(lead.first_message_at)], ["Captured in CRM", when(lead.created_at)], ["Last message sent", when(lead.last_message_at)], ["Last updated", when(lead.updated_at)], ["Lead ID", lead.id]];
  return <dl className="record-facts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not supplied"}</dd></div>)}</dl>;
}

export function LeadEditor({ lead, api, user, onClose, onSaved }) {
  const [form, setForm] = useState({ status: lead.status, destination: lead.requested_destination || "", start_date: lead.start_date || "", end_date: lead.end_date || "", travelers: lead.traveler_count ?? "", budget: lead.budget ?? "", next_action: lead.next || "", notes: lead.notes || "", lost_reason: lead.lost_reason || "" });
  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return <Editor title={`Review lead · ${lead.name}`} onClose={onClose} readOnly={!canManage(user)} onSave={async () => {
    await api(`/api/leads/${lead.uuid}`, { method: "PATCH", body: JSON.stringify({ ...form, travelers: form.travelers === "" ? null : Number(form.travelers), budget: form.budget === "" ? null : Number(form.budget), updated_at: lead.updated_at }) }); await onSaved(); onClose();
  }}>
    <p className="record-help lead-edit-stamp">Last updated {when(lead.updated_at)}. Original message and capture timestamps are preserved.</p>
    <div className="form-two">{field("Lead status", <select value={form.status} onChange={update("status")}>{leadStatuses.map((status) => <option key={status}>{status}</option>)}</select>)}{field("Requested destination", <input maxLength={500} value={form.destination} onChange={update("destination")} />)}</div>
    <div className="form-two">{field("Travel start", <input type="date" value={form.start_date} onChange={update("start_date")} />)}{field("Travel end", <input type="date" min={form.start_date || undefined} value={form.end_date} onChange={update("end_date")} />)}</div>
    <div className="form-two">{field("Travelers", <input type="number" min="1" max="10000" placeholder="Not supplied" value={form.travelers} onChange={update("travelers")} />)}{field("Budget (INR)", <input type="number" min="0" max="1000000000" step="0.01" placeholder="Not supplied" value={form.budget} onChange={update("budget")} />)}</div>
    {field("Next action", <input maxLength={500} value={form.next_action} onChange={update("next_action")} />)}
    {field("Lead notes", <textarea rows="4" maxLength={6000} value={form.notes} onChange={update("notes")} />)}
    {form.status === "Lost" && field("Lost reason", <input maxLength={500} value={form.lost_reason} onChange={update("lost_reason")} />)}
    <p className="record-help">Name, email and phone can be updated in Contacts. Original message and ad attribution stay unchanged. A new message after Won or Lost starts a new enquiry.</p>
    <details className="record-source"><summary>Original enquiry & attribution</summary><LeadFacts lead={lead} /></details>
  </Editor>;
}

function ContactEditor({ contact, api, user, onClose, onSaved }) {
  const [form, setForm] = useState({ name: contact.name || "", email: contact.email || "", phone: contact.phone || "", type: contact.type || "Customer", notes: contact.notes || "" });
  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return <Editor title={contact.id ? "Edit contact" : "Add contact"} onClose={onClose} readOnly={!canManage(user)} onSave={async () => {
    await api(`/api/contacts${contact.id ? `/${contact.id}` : ""}`, { method: contact.id ? "PATCH" : "POST", body: JSON.stringify({ ...form, ...(contact.id ? { updated_at: contact.updated_at, expected_version: contact.version } : {}) }) }); await onSaved(); onClose();
  }}>{field("Contact name", <input required maxLength={200} value={form.name} onChange={update("name")} />)}<div className="form-two">{field("Phone", <input type="tel" maxLength={40} value={form.phone} onChange={update("phone")} />)}{field("Email", <input type="email" maxLength={254} value={form.email} onChange={update("email")} />)}</div>{field("Contact type", <select value={form.type} onChange={update("type")}><option>Customer</option><option>Traveler</option><option>Agency partner</option></select>)}{field("Contact notes", <textarea rows="4" maxLength={6000} value={form.notes} onChange={update("notes")} />)}<p className="record-help">Updates apply to this contact’s linked leads. Changing the contact phone does not change the original WhatsApp sender or redirect messages.</p></Editor>;
}

export function ContactsManager({ contacts, api, user, onSaved, onEditLead }) {
  const [query, setQuery] = useState(""); const [selected, setSelected] = useState(null); const [detail, setDetail] = useState(null); const [editing, setEditing] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const detailGeneration = useRef(0);
  const loadedContactPages = useRef(1); const priorSelected = useRef(null);
  useEffect(() => {
    detailGeneration.current++;
    if (!selected) { setDetail(null); return; }
    let live = true; setError("");
    if (priorSelected.current !== selected) { loadedContactPages.current = 1; setDetail(null); priorSelected.current = selected; }
    (async () => {
      let result = await api(`/api/contacts/${selected}`);
      for (let page = 1; live && page < loadedContactPages.current && result.next_offset !== null; page++) {
        const next = await api(`/api/contacts/${selected}?offset=${result.next_offset}`);
        result = { ...next, leads: [...result.leads, ...next.leads] };
      }
      if (live) setDetail(result);
    })().catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [selected, contacts]);
  const visible = contacts.filter((c) => [c.name, c.phone, c.email, c.notes].join(" ").toLowerCase().includes(query.toLowerCase()));
  async function more() { const generation = detailGeneration.current; setBusy(true); try { const result = await api(`/api/contacts/${selected}?offset=${detail.next_offset}`); if (generation === detailGeneration.current) { loadedContactPages.current++; setDetail((old) => old?.item.id === result.item.id ? ({ ...result, leads: [...old.leads, ...result.leads] }) : old); } } catch (e) { if (generation === detailGeneration.current) setError(e.message); } finally { setBusy(false); } }
  return <><Heading title="Contacts" description="Contact details, linked enquiries and their original ad attribution." action={canManage(user) ? () => setEditing({}) : null} label="Add contact" /><label className="module-search"><span>Search contacts</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone, email or notes" /></label>
    <div className="contact-workspace"><section className="card contact-directory" aria-label="Contact directory">{visible.map((contact) => <button key={contact.id} className={`record-list-row ${selected === contact.id ? "selected-record" : ""}`} onClick={() => setSelected(contact.id)}><span><strong>{contact.name}</strong><small>{contact.phone || "Phone not supplied"}</small><small>{contact.email || contact.type}</small></span><ChevronRight size={17} /></button>)}{!visible.length && <Empty>No matching contacts.</Empty>}</section>
      <section className="card contact-detail" aria-label="Contact details">{error && <p role="alert" className="integration-notice">{error}</p>}{!detail ? <Empty>{selected ? "Loading contact…" : "Select a contact to review and manage their enquiries."}</Empty> : <><header className="card-header"><div><h2>{detail.item.name}</h2><p>{detail.item.type}</p></div>{canManage(user) && <button className="secondary-button" onClick={() => setEditing(detail.item)}>Edit contact</button>}</header><dl className="record-facts inset">{[["Phone", detail.item.phone], ["Email", detail.item.email], ["Contact notes", detail.item.notes], ["Added", when(detail.item.created_at)]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value || "Not supplied"}</dd></div>)}</dl><h3 className="inset">Linked enquiries</h3>{detail.leads.map((lead) => <article className="contact-enquiry" key={lead.uuid}><header><strong>{lead.destination} · {lead.status}</strong><button className="secondary-button" onClick={() => onEditLead(lead)}>{canManage(user) ? "Review / edit lead" : "View lead"}</button></header><p>{lead.dates} · {lead.travelers} · Budget: {lead.budget == null ? "Not supplied" : money(lead.budget)}</p><p>Next: {lead.next} · Owner: {lead.owner}</p>{lead.notes && <p className="preserve-text">{lead.notes}</p>}{lead.lost_reason && <p>Lost reason: {lead.lost_reason}</p>}<LeadFacts lead={lead} /></article>)}{!detail.leads.length && <Empty>No linked enquiries yet.</Empty>}{detail.next_offset !== null && <button className="secondary-button" disabled={busy} onClick={more}>Load older enquiries</button>}</>}</section></div>
    {editing && <ContactEditor key={editing.id || "new"} contact={editing} api={api} user={user} onClose={() => setEditing(null)} onSaved={onSaved} />}</>;
}

function PaymentEditor({ payment, trips, api, onSaved, onClose }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ trip_id: payment.trip_id || "", title: payment.title || "", direction: payment.direction || "in", amount: payment.amount ?? "", due_date: payment.due_date || "", paid_date: payment.paid_at?.slice(0, 10) || "", status: payment.status || "Scheduled", method: payment.method || "Bank transfer", reference: payment.reference || "", notes: payment.notes || "" });
  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return <Editor title={payment.id ? "Edit payment record" : "Add payment record"} onClose={onClose} onSave={async () => { await api(`/api/payments${payment.id ? `/${payment.id}` : ""}`, { method: payment.id ? "PATCH" : "POST", body: JSON.stringify({ ...form, amount: Number(form.amount), ...(payment.id ? { updated_at: payment.updated_at } : { request_id: requestId }) }) }); await onSaved(); onClose(); }}>
    {field("Trip", <select required value={form.trip_id} onChange={update("trip_id")}><option value="">Select a saved trip</option>{trips.map((trip) => <option key={trip.uuid} value={trip.uuid}>{trip.id} · {trip.destination} · {trip.guest}</option>)}</select>)}
    {field("Payment title", <input required maxLength={200} value={form.title} onChange={update("title")} />)}
    <div className="form-two">{field("Direction", <select value={form.direction} onChange={update("direction")}><option value="in">Incoming · customer</option><option value="out">Outgoing · supplier</option></select>)}{field("Amount (INR)", <input required type="number" min="0.01" max="1000000000" step="0.01" value={form.amount} onChange={update("amount")} />)}</div>
    <div className="form-two">{field("Payment status", <select value={form.status} onChange={update("status")}>{["Scheduled", "Due soon", "Overdue", "Paid", "Cancelled", ...(payment.status === "Logged" ? ["Logged"] : [])].map((status) => <option key={status}>{status}</option>)}</select>)}{field("Due date", <input type="date" value={form.due_date} onChange={update("due_date")} />)}</div>
    {form.status === "Paid" && field("Paid date", <input required type="date" value={form.paid_date} onChange={update("paid_date")} />)}
    <div className="form-two">{field("Method", <input maxLength={200} value={form.method} onChange={update("method")} />)}{field("Reference", <input maxLength={200} value={form.reference} onChange={update("reference")} />)}</div>{field("Payment notes", <textarea maxLength={6000} rows="3" value={form.notes} onChange={update("notes")} />)}
    <p className="record-help">Record keeping only. This does not collect or transfer money. Cancelled entries are excluded from totals. Trip package values are maintained separately below.</p>
  </Editor>;
}

function TripAmountsEditor({ trip, api, onSaved, onClose }) {
  const [total, setTotal] = useState(trip.amount); const [due, setDue] = useState(trip.due);
  return <Editor title={`Trip amounts · ${trip.id}`} onClose={onClose} onSave={async () => { await api(`/api/trips/${trip.uuid}`, { method: "PATCH", body: JSON.stringify({ total_amount: Number(total), customer_due: Number(due), updated_at: trip.updated_at }) }); await onSaved(); onClose(); }}><div className="form-two">{field("Package value (INR)", <input required min="0" max="1000000000" step="0.01" type="number" value={total} onChange={(e) => setTotal(e.target.value)} />)}{field("Trip balance due (INR)", <input required min="0" max={total} step="0.01" type="number" value={due} onChange={(e) => setDue(e.target.value)} />)}</div><p className="record-help">These are manually maintained trip amounts, separate from the payment ledger. Update them when the agreed package or balance changes.</p></Editor>;
}

export function MoneyManager({ payments = [], trips = [], user, api, onSaved, initialFilter = "All" }) {
  const [editing, setEditing] = useState(null); const [tripEdit, setTripEdit] = useState(null); const [filter, setFilter] = useState(initialFilter);
  const paidIn = payments.filter((p) => p.direction === "in" && p.status === "Paid").reduce((sum, p) => sum + p.amount, 0);
  const paidOut = payments.filter((p) => p.direction === "out" && p.status === "Paid").reduce((sum, p) => sum + p.amount, 0);
  const due = (direction) => payments.filter((p) => p.direction === direction && !["Paid", "Cancelled"].includes(p.status)).reduce((sum, p) => sum + p.amount, 0);
  const visible = payments.filter((p) => filter === "All" || filter === "Incoming due" && p.direction === "in" && !["Paid", "Cancelled"].includes(p.status) || filter === "Outgoing due" && p.direction === "out" && !["Paid", "Cancelled"].includes(p.status) || p.status === filter);
  return <><Heading title="Money" description="Manually recorded collections, supplier payments and trip amounts. No bank or payment gateway is connected." action={canFinance(user) && trips.length ? () => setEditing({}) : null} label="Add payment" />
    <section className="metric-grid"><Tile label="Collected" value={money(paidIn)} hint="Paid incoming · all time" onClick={() => setFilter("Paid")} /><Tile label="Customer due" value={money(due("in"))} hint="Unpaid incoming records" onClick={() => setFilter("Incoming due")} /><Tile label="Supplier payable" value={money(due("out"))} hint="Unpaid outgoing records" onClick={() => setFilter("Outgoing due")} /><Tile label="Net cash recorded" value={money(paidIn - paidOut)} hint="Paid incoming minus outgoing · not profit" onClick={() => setFilter("Paid")} /></section>
    <section className="card"><header className="card-header"><div><h2>Payment records</h2><p>Choose a record to update its amount, status or reference</p></div><label>Show <select aria-label="Payment filter" value={filter} onChange={(e) => setFilter(e.target.value)}>{["All", "Incoming due", "Outgoing due", "Paid", "Cancelled"].map((status) => <option key={status}>{status}</option>)}</select></label></header>
      {visible.map((payment) => <button className="record-list-row" key={payment.id} disabled={!canFinance(user)} onClick={() => setEditing(payment)}><span><strong>{payment.title}</strong><small>{payment.trip_code} · {payment.direction === "in" ? "Incoming" : "Outgoing"} · {payment.due_date || "No due date"}</small><small>{payment.reference || payment.method}</small></span><strong>{money(payment.amount)}</strong><span>{payment.status === "Logged" ? "Logged · payment unconfirmed" : payment.status}</span>{canFinance(user) && <ChevronRight size={16} />}</button>)}{!visible.length && <Empty>No payment records in this view. Totals remain zero until you add real entries.</Empty>}</section>
    <section className="card trip-amounts"><header className="card-header"><div><h2>Trip amounts</h2><p>Manually maintained package values and balances, separate from payment records</p></div></header>{trips.map((trip) => <button className="record-list-row" disabled={!canFinance(user)} key={trip.uuid} onClick={() => setTripEdit(trip)}><span><strong>{trip.id} · {trip.destination}</strong><small>{trip.guest}</small></span><span>Package {money(trip.amount)}<small>Trip balance {money(trip.due)}</small></span>{canFinance(user) && <ChevronRight size={16} />}</button>)}{!trips.length && <Empty>A saved trip is needed before adding trip-linked payment records.</Empty>}</section>
    {editing && <PaymentEditor payment={editing} trips={trips} api={api} onSaved={onSaved} onClose={() => setEditing(null)} />}{tripEdit && <TripAmountsEditor trip={tripEdit} api={api} onSaved={onSaved} onClose={() => setTripEdit(null)} />}</>;
}

export function ReportsLive({ data, onNavigate }) {
  return <><Heading title="Reports" description="Saved business records only. Revenue, profit and conversion forecasts are not connected." /><section className="metric-grid"><Tile label="Open enquiries" value={data?.stats?.open_enquiries ?? "—"} onClick={() => onNavigate("Leads")} /><Tile label="Active trips" value={data?.stats?.active_trips ?? "—"} onClick={() => onNavigate("Trips")} /><Tile label="Recorded customer dues" value={data ? money(data.stats.customer_due) : "—"} onClick={() => onNavigate("Money")} /></section><p className="integration-notice">No estimated revenue or margin is shown. Review the manual ledger in Money for recorded collections and expenses.</p></>;
}
