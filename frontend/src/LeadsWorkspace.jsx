import { useMemo, useState } from "react";
import { ChevronRight, Plus, Clock3, Search, RefreshCw } from "lucide-react";
import { LeadFacts } from "./Management.jsx";
import { indianDay, timeInIndia } from "./record-time.js";
import { PRIMARY_LEAD_STATUSES, normalizeLeadStatus, statusSlug } from "../../shared/lead-statuses.js";

const otherStatuses = ["All leads", "Open enquiries", "Travel Later", "Won", "Payment / Negotiation", "Lost"];
const displayDate = (value) => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Not supplied";

export function LeadTimestamps({ lead }) {
  return <dl className="lead-timestamps">{[["First message sent", lead.first_message_at], ["Captured in CRM", lead.created_at], ["Last message sent", lead.last_message_at], ["Last updated", lead.updated_at]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ? <time dateTime={value}>{timeInIndia(value)}</time> : label.includes("message") ? "No message recorded" : "Not recorded"}</dd></div>)}</dl>;
}

export function LeadsWorkspace({ leads, onQuickAdd, onEdit, onRefresh, onMore, initialFilter = {} }) {
  const [filter, setFilter] = useState(initialFilter.status || "Yet to contact");
  const [day, setDay] = useState(initialFilter.day || "");
  const [source, setSource] = useState(initialFilter.source || "");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("created_at");
  const [busy, setBusy] = useState(false);
  const canonicalLeads = useMemo(() => leads.map((lead) => ({ ...lead, status: normalizeLeadStatus(lead.status) })), [leads]);
  const counts = useMemo(() => Object.fromEntries([...PRIMARY_LEAD_STATUSES, ...otherStatuses].map((status) => [status, status === "All leads" ? canonicalLeads.length : status === "Open enquiries" ? canonicalLeads.filter((lead) => !["Won", "Lost"].includes(lead.status)).length : canonicalLeads.filter((lead) => lead.status === status).length])), [canonicalLeads]);
  const visible = canonicalLeads.filter((lead) => {
    const matchesStatus = filter === "All leads" || filter === "Open enquiries" && !["Won", "Lost"].includes(lead.status) || lead.status === filter;
    const matchesDay = !day || indianDay(lead.created_at) === day;
    const matchesSource = !source || lead.source === source;
    const matchesQuery = !query || [lead.name, lead.phone, lead.email, lead.campaign_name, lead.ad_name, lead.adset_name, lead.destination, lead.source].join(" ").toLowerCase().includes(query.trim().toLowerCase());
    return matchesStatus && matchesDay && matchesSource && matchesQuery;
  }).sort((a, b) => (Date.parse(b[sort]) || 0) - (Date.parse(a[sort]) || 0));
  const clearFilters = () => { setDay(""); setSource(""); setQuery(""); setFilter("All leads"); };

  return <>
    <div className="page-heading"><div><div className="eyebrow">Sales workspace</div><h1>Leads</h1><p>Review Meta ad enquiries, keep the trip brief current and plan the next action.</p></div>{onQuickAdd && <button className="primary-button" onClick={onQuickAdd}><Plus size={18} />Add lead</button>}</div>

    <nav className="lead-status-tabs" aria-label="Filter leads by working status">
      {PRIMARY_LEAD_STATUSES.map((status) => <button key={status} className={filter === status ? "selected" : ""} aria-pressed={filter === status} onClick={() => setFilter(status)}><span>{status}</span><strong>{counts[status] || 0}</strong></button>)}
      <label className="lead-other-status">Other statuses<select value={otherStatuses.includes(filter) ? filter : ""} onChange={(event) => event.target.value && setFilter(event.target.value)} aria-label="Show all leads or another status"><option value="" disabled>Other statuses…</option>{otherStatuses.map((status) => <option key={status} value={status}>{status} ({counts[status] || 0})</option>)}</select></label>
    </nav>

    <div className="lead-table-toolbar">
      <label className="lead-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads, phones or campaigns" aria-label="Search leads, phones or campaigns" /></label>
      <label>Captured date (IST)<input type="date" value={day} onChange={(event) => setDay(event.target.value)} /></label>
      <label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="created_at">Newest captured</option><option value="updated_at">Recently updated</option><option value="last_message_at">Latest message</option></select></label>
      <label>Source<select value={source} onChange={(event) => setSource(event.target.value)}><option value="">All sources</option>{[...new Set(canonicalLeads.map((lead) => lead.source).filter(Boolean))].sort().map((item) => <option key={item}>{item}</option>)}</select></label>
      <button disabled={busy} className="secondary-button" onClick={async () => { setBusy(true); try { await onRefresh(); } finally { setBusy(false); } }}><RefreshCw size={15} />{busy ? "Refreshing…" : "Refresh"}</button>
    </div>

    <div className="leads-results"><strong>{visible.length} shown</strong><span className="lead-loaded-count">{canonicalLeads.length} loaded</span>{(day || source || query || filter !== "Yet to contact") && <button className="text-button" onClick={clearFilters}>Clear filters</button>}<span><Clock3 size={14} />All timestamps are IST</span></div>

    {visible.length ? <div className="lead-table-wrap"><table className="lead-table"><thead><tr><th>Lead name / phone</th><th>Modified on</th><th>Destination</th><th>Travelers</th><th>Travel date</th><th>Email</th><th>Campaign / source</th><th>Review</th></tr></thead>
      {visible.map((lead) => <tbody key={lead.uuid}>
        <tr className="lead-table-row">
          <td><button className="lead-table-name" onClick={() => onEdit(lead)}><strong>{lead.name || "WhatsApp enquiry"}</strong><span>{lead.phone || "Phone not supplied"}</span></button></td>
          <td><time dateTime={lead.updated_at || lead.created_at}>{lead.updated_at ? timeInIndia(lead.updated_at) : timeInIndia(lead.created_at)}</time><small>Captured {timeInIndia(lead.created_at)}</small></td>
          <td>{lead.destination || "Not yet provided"}</td><td>{lead.travelers || "Not supplied"}</td><td>{lead.start_date ? displayDate(lead.start_date) : "Flexible"}</td><td>{lead.email || "Not supplied"}</td>
          <td><strong>{lead.campaign_name || lead.source || "Unknown source"}</strong><small>{lead.source_platform || lead.source || "Platform not supplied"}</small></td>
          <td><button className={`stage-pill stage-${statusSlug(lead.status)} lead-status-action`} onClick={() => onEdit(lead)} aria-label={`Edit ${lead.name} status, currently ${lead.status}`}>{lead.status}<ChevronRight size={14} /></button></td>
        </tr>
        <tr className="lead-table-detail-row"><td colSpan="8"><details><summary>Full enquiry, notes and ad attribution</summary><div className="lead-table-detail-content"><LeadFacts lead={lead} /><p className="record-help">First message is the message event time, not the ad-click time. Platform is shown only when supplied by Meta; it is not guessed from placements.</p></div></details></td></tr>
      </tbody>)}</table></div> : <section className="card empty-records">No matching leads in the loaded records. Try another status, clear filters or load older leads.</section>}
    {onMore && <button className="secondary-button load-older" onClick={onMore}>Load older leads</button>}
  </>;
}
