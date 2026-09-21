import { ChevronRight, Plus, Activity, Clock3 } from "lucide-react";
import { canManage, leadStatuses } from "./Management.jsx";
import { timeInIndia } from "./record-time.js";
import { statusSlug } from "../../shared/lead-statuses.js";

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
function Metric({ label, value, hint, onClick, accent }) {
  return <button className={`overview-metric ${accent ? "metric-emphasis" : ""}`} onClick={onClick}><span>{label}<ChevronRight size={18} /></span><strong>{value}</strong><small>{hint}</small></button>;
}
function Panel({ title, subtitle, action, children, className = "" }) {
  return <section className={`card overview-panel ${className}`}><header className="card-header"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</header>{children}</section>;
}
export function Overview({ data, currentUser, onNavigate, onEdit, onQuickAdd }) {
  const a = data?.analytics; const stats = data?.stats;
  if (!a) return <section className="card empty-records" role="status">Loading your workspace overview… If the connection fails, its status appears below.</section>;
  const maxDay = Math.max(1, ...a.daily.map((d) => d.count));
  const stages = leadStatuses.map((label) => ({ label, count: a.stages.find((s) => s.label === label)?.count || 0 }));
  const maxStage = Math.max(1, ...stages.map((s) => s.count));
  const link = (label, target) => <button className="card-action" onClick={() => onNavigate(target)}>{label}<ChevronRight size={16} /></button>;
  return <div className="overview-workspace">
    <div className="page-heading"><div><div className="eyebrow">Workspace overview</div><h1>Command center</h1><p>Enquiries, trip delivery and the work that needs your attention.</p></div>{canManage(currentUser) && <button className="primary-button" onClick={onQuickAdd}><Plus size={18} />Add lead</button>}</div>
    <section className="overview-metrics" aria-label="Workspace metrics">
      <Metric label="Open enquiries" value={stats.open_enquiries} hint={`${a.total_leads} total enquiries`} accent onClick={() => onNavigate("Leads", { status: "Open enquiries" })} />
      <Metric label="New today" value={a.today_leads} hint="Captured in CRM · IST" onClick={() => onNavigate("Leads", { day: a.daily.at(-1).date })} />
      <Metric label="Active trips" value={stats.active_trips} hint="Excludes closed trips" onClick={() => onNavigate("Trips", { status: "Active trips" })} />
      <Metric label="Open tasks" value={a.open_tasks} hint={`${a.overdue_tasks} overdue · Operations`} onClick={() => onNavigate("Operations", { status: "Open tasks" })} />
      <Metric label="Customer due" value={money(stats.customer_due)} hint="Unpaid manual ledger entries" onClick={() => onNavigate("Money", { status: "Incoming due" })} />
      <Metric label="Trips at risk" value={stats.margin_at_risk} hint="Review trip delivery" onClick={() => onNavigate("Trips", { status: "At risk" })} />
    </section>
    <div className="capture-notice"><Activity size={20} /><div><strong>Meta ad enquiries only</strong><p>Automatically captured after an ad-referred message, once campaign and sender phone are verified. Ordinary chats do not create leads. Updates are checked every 15 seconds.</p></div><button className="card-action" onClick={() => onNavigate("Settings")}>Connection details<ChevronRight size={16} /></button></div>
    <div className="overview-charts">
      <Panel title="New enquiries" subtitle="Last 14 days · CRM capture date in IST" action={link("View leads", "Leads")}>
        <div className="chart-summary"><strong>{a.daily.reduce((n, d) => n + d.count, 0)}</strong><span>enquiries in this period</span></div>
        <div className="enquiry-bars" aria-label="Daily lead counts">{a.daily.map((day) => <button key={day.date} className="day-bar" aria-label={`${day.date}: ${day.count} enquiries. View leads`} title={`${day.date} · ${day.count} enquiries`} onClick={() => onNavigate("Leads", { day: day.date })}><span className="day-value">{day.count}</span><span className="day-track"><i style={{ height: `${day.count / maxDay * 100}%` }} /></span><span className="day-label">{Number(day.date.slice(8))}</span></button>)}</div>
        <div className="chart-foot"><span>{new Date(`${a.daily[0].date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}</span><span>Select a day to review its enquiries</span><span>Today</span></div>
      </Panel>
      <Panel title="Lead pipeline" subtitle="Current statuses · all enquiries, not conversion rates">
        <div className="status-chart">{stages.map(({ label, count }) => <button key={label} onClick={() => onNavigate("Leads", { status: label })} aria-label={`${label}: ${count} leads`}><span>{label}</span><span className="status-track"><i className={`pipeline-${statusSlug(label)}`} style={{ width: `${count / maxStage * 100}%` }} /></span><strong>{count}</strong><ChevronRight size={14} /></button>)}</div>
      </Panel>
    </div>
    <div className="overview-lower">
      <Panel title="Recent enquiries" subtitle="Newest captured first · open to review or update" action={link("All leads", "Leads")}>
        {data.leads.length ? data.leads.map((lead) => <button className="record-list-row" key={lead.uuid} onClick={() => onEdit(lead)}><span className="initials mint">{lead.name.slice(0, 2).toUpperCase()}</span><span className="recent-lead-copy"><strong>{lead.name}</strong><small>{lead.campaign_name || lead.source} · {lead.destination}</small><small><Clock3 size={12} /> Captured {timeInIndia(lead.created_at)}</small></span><span className={`stage-pill stage-${statusSlug(lead.status)}`}>{lead.status}</span><ChevronRight size={16} /></button>) : <p className="empty-records">No enquiries captured yet.</p>}
      </Panel>
      <Panel title="Enquiry sources" subtitle="Recorded channels · not inferred ad placements">
        <div className="source-chart">{a.sources.map(({ label, count }) => <button key={label} onClick={() => onNavigate("Leads", { source: label })}><span><strong>{label}</strong><small>{count} {count === 1 ? "enquiry" : "enquiries"}</small></span><span className="source-track"><i style={{ width: `${count / Math.max(1, a.total_leads) * 100}%` }} /></span><ChevronRight size={15} /></button>)}</div>
        {!a.sources.length && <p className="empty-records">Source breakdown appears when enquiries arrive.</p>}
        <div className="overview-links"><button onClick={() => onNavigate("Contacts")}>Manage contacts<ChevronRight size={16} /></button><button onClick={() => onNavigate("Operations", { status: "Overdue" })}>Overdue tasks<strong>{a.overdue_tasks}</strong><ChevronRight size={16} /></button><button onClick={() => onNavigate("Money")}>Manual financial records<ChevronRight size={16} /></button></div>
      </Panel>
    </div>
    <p className="overview-updated">Overview checked {timeInIndia(a.generated_at)}. Financial amounts are manually recorded; no bank feed is connected.</p>
  </div>;
}
