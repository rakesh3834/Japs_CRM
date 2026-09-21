import { useState } from "react";
import { ChevronRight, Plus, Clock3 } from "lucide-react";
import { LeadFacts, leadStatuses } from "./Management.jsx";
import { indianDay, timeInIndia } from "./record-time.js";
import { statusSlug } from "../../shared/lead-statuses.js";

export function LeadTimestamps({ lead }) {
  return <dl className="lead-timestamps">{[["First message sent", lead.first_message_at], ["Captured in CRM", lead.created_at], ["Last message sent", lead.last_message_at], ["Last updated", lead.updated_at]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ? <time dateTime={value}>{timeInIndia(value)}</time> : label.includes("message") ? "No message recorded" : "Not recorded"}</dd></div>)}</dl>;
}
export function LeadsWorkspace({ leads, onQuickAdd, onEdit, onRefresh, onMore, initialFilter = {} }) {
  const [filter, setFilter] = useState(initialFilter.status || "All leads");
  const [day, setDay] = useState(initialFilter.day || ""); const [source, setSource] = useState(initialFilter.source || "");
  const [sort, setSort] = useState("created_at"); const [busy, setBusy] = useState(false);
  const visible = leads.filter((lead) => (filter === "All leads" || filter === "Open enquiries" && !["Won", "Lost"].includes(lead.status) || lead.status === filter) && (!day || indianDay(lead.created_at) === day) && (!source || lead.source === source)).sort((a, b) => (Date.parse(b[sort]) || 0) - (Date.parse(a[sort]) || 0));
  return <><div className="page-heading"><div><div className="eyebrow">Sales workspace</div><h1>Leads</h1><p>Review enquiries, update the trip brief and keep the next action clear.</p></div>{onQuickAdd && <button className="primary-button" onClick={onQuickAdd}><Plus size={18} />Add lead</button>}</div>
    <div className="workspace-toolbar"><label>Lead status<select value={filter} onChange={(e) => setFilter(e.target.value)}>{["All leads", "Open enquiries", ...leadStatuses].map((status) => <option key={status}>{status}</option>)}</select></label><label>Captured date (IST)<input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label><label>Sort by<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="created_at">Newest captured</option><option value="updated_at">Recently updated</option><option value="last_message_at">Latest message</option></select></label><button disabled={busy} className="secondary-button" onClick={async () => { setBusy(true); try { await onRefresh(); } finally { setBusy(false); } }}>{busy ? "Refreshing…" : "Refresh enquiries"}</button></div>
    <div className="leads-results"><strong>{visible.length} loaded {visible.length === 1 ? "lead" : "leads"}</strong>{source && <button className="filter-chip" onClick={() => setSource("")}>{source} ×</button>}{(day || filter !== "All leads") && <button className="text-button" onClick={() => { setDay(""); setFilter("All leads"); setSource(""); }}>Clear filters</button>}<span><Clock3 size={14} />All timestamps are IST</span></div>
    <div className="lead-records">{visible.map((lead) => <article className="card lead-record" key={lead.uuid}>
      <button className="lead-record-main" onClick={() => onEdit(lead)} aria-label={`Review lead ${lead.name}`}>
        <div className="lead-record-heading"><span className="initials mint">{lead.name.slice(0, 2).toUpperCase()}</span><span className="lead-identity"><strong>{lead.name}</strong><span>{lead.phone || "Phone not supplied"}{lead.email ? ` · ${lead.email}` : ""}</span></span><span className={`stage-pill stage-${statusSlug(lead.status)}`}>{lead.status}</span><ChevronRight size={20} /></div>
        <div className="lead-brief-grid"><div><small>Trip brief</small><strong>{lead.destination}</strong><span>{lead.dates}</span><span>{lead.travelers}</span></div><div><small>Next action · {lead.owner}</small><strong>{lead.next}</strong><span className="lead-note-preview">{lead.notes || "No review notes added"}</span>{lead.status === "Lost" && lead.lost_reason && <span>Lost reason: {lead.lost_reason}</span>}</div><div><small>Budget</small><strong>{lead.budget == null ? "Not supplied" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(lead.budget)}</strong><small>Campaign / source</small><span>{lead.campaign_name || lead.source}</span><span className="subtle">Click platform: {lead.source_platform || "Not supplied"}</span></div></div>
      </button>
      <LeadTimestamps lead={lead} />
      <details className="lead-record-details"><summary>Full enquiry, notes & ad attribution</summary><LeadFacts lead={lead} /><p className="record-help">First message is the recorded message event time, not the ad-click time. Last updated includes staff edits and incoming follow-ups. Missing click platform is not inferred from ad placements.</p></details>
    </article>)}</div>
    {!visible.length && <section className="card empty-records">No matching enquiries in the loaded records. Clear filters or load older enquiries.</section>}
    {onMore && <button className="secondary-button load-older" onClick={onMore}>Load older leads</button>}
  </>;
}
