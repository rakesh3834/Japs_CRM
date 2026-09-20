import { useEffect, useRef, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Editor, canManage } from "./Management.jsx";
import { indiaInput, timeInIndia } from "./record-time.js";

const statuses = ["Open", "In progress", "Blocked", "Done", "Cancelled"];
const types = ["Follow-up", "Booking", "Documents", "Transport", "Accommodation", "Trip handoff", "Other"];
const open = (task) => !["Done", "Cancelled"].includes(task.status);
const overdue = (task) => open(task) && task.due_at && Date.parse(task.due_at) < Date.now();
const field = (name, control) => <label className="field"><span>{name}</span>{control}</label>;

function TaskEditor({ task, people, trips, leads, api, onSaved, onClose, user }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ title: task.title || "", type: task.type || "Follow-up", status: task.status || "Open", priority: task.priority || "Medium", assignee_id: task.assignee_id || "", lead_id: task.lead_id || "", trip_id: task.trip_id || "", due_at: indiaInput(task.due_at) });
  const change = (key) => (e) => setForm((old) => ({ ...old, [key]: e.target.value }));
  const options = (items, selected, render) => <>{selected && !items.some((i) => (i.uuid || i.id) === selected) && <option value={selected}>Current linked record · {selected.slice(0, 8)}</option>}{items.map((item) => <option key={item.uuid || item.id} value={item.uuid || item.id}>{render(item)}</option>)}</>;
  return <Editor title={task.id ? "Update operations task" : "Add operations task"} readOnly={!canManage(user)} onClose={onClose} onSave={async () => {
    const body = { ...form, due_at: form.due_at ? new Date(`${form.due_at}:00+05:30`).toISOString() : null, assignee_id: form.assignee_id || null, lead_id: form.lead_id || null, trip_id: form.trip_id || null, ...(task.id ? { updated_at: task.updated_at } : { request_id: requestId }) };
    await api(`/api/tasks${task.id ? `/${task.id}` : ""}`, { method: task.id ? "PATCH" : "POST", body: JSON.stringify(body) }); await onSaved(); onClose();
  }}>
    {field("Task title", <input required maxLength={200} placeholder="e.g. Confirm airport transfer with driver" value={form.title} onChange={change("title")} />)}
    <div className="form-two">{field("Work type", <select value={form.type} onChange={change("type")}>{options(types.map((id) => ({ id })), form.type, (i) => i.id)}</select>)}{field("Task status", <select value={form.status} onChange={change("status")}>{statuses.map((s) => <option key={s}>{s}</option>)}</select>)}</div>
    <div className="form-two">{field("Priority", <select value={form.priority} onChange={change("priority")}>{["Urgent", "High", "Medium", "Low"].map((s) => <option key={s}>{s}</option>)}</select>)}{field("Due date & time (IST)", <input type="datetime-local" value={form.due_at} onChange={change("due_at")} />)}</div>
    {field("Assigned to", <select value={form.assignee_id} onChange={change("assignee_id")}><option value="">Unassigned</option>{options(people, form.assignee_id, (p) => `${p.name} · ${p.role}`)}</select>)}
    <div className="form-two">{field("Linked trip (optional)", <select value={form.trip_id} onChange={change("trip_id")}><option value="">No linked trip</option>{options(trips, form.trip_id, (t) => `${t.destination} · ${t.id}`)}</select>)}{field("Linked lead (optional)", <select value={form.lead_id} onChange={change("lead_id")}><option value="">No linked lead</option>{options(leads, form.lead_id, (l) => `${l.name} · ${l.destination}`)}</select>)}</div>
    <p className="record-help">Tasks organise your team’s work; they do not send messages, place bookings or transfer money. If both links are selected, the trip must belong to that lead. Cancelled tasks remain available.</p>
    {task.id && <dl className="record-facts"><div><dt>Created</dt><dd>{timeInIndia(task.created_at)}</dd></div><div><dt>Updated</dt><dd>{timeInIndia(task.updated_at)}</dd></div>{task.completed_at && <div><dt>Completed</dt><dd>{timeInIndia(task.completed_at)}</dd></div>}</dl>}
  </Editor>;
}

export function Operations({ api, user, trips, leads, onSaved, initialFilter = "Open tasks" }) {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState(initialFilter); const [query, setQuery] = useState(""); const revision = useRef(0);
  async function refresh() { const seq = ++revision.current; try { const next = await api("/api/operations"); if (seq === revision.current) { setData(next); setError(""); } return true; } catch (e) { if (seq === revision.current) setError(e.message); return false; } }
  useEffect(() => { void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 15000); return () => { clearInterval(timer); revision.current++; }; }, []);
  const items = data?.items || [];
  const visible = items.filter((task) => (filter === "All tasks" || filter === "Open tasks" && open(task) || filter === "Overdue" && overdue(task) || task.status === filter) && `${task.title} ${task.type} ${task.priority}`.toLowerCase().includes(query.toLowerCase()));
  return <><div className="page-heading"><div><div className="eyebrow">Delivery workspace</div><h1>Operations</h1><p>Manage follow-ups, bookings, documents and trip handoffs.</p></div>{canManage(user) && <button className="primary-button" onClick={() => setEditing({})}><Plus size={18} />Add task</button>}</div>
    <div className="task-summary">{[["Open tasks", items.filter(open).length], ["Overdue", items.filter(overdue).length], ["Blocked", items.filter((t) => t.status === "Blocked").length], ["Done", items.filter((t) => t.status === "Done").length]].map(([label, count]) => <button key={label} className={filter === label ? "selected" : ""} onClick={() => setFilter(label)}><span>{label}</span><strong>{data ? count : "—"}</strong></button>)}</div>
    <div className="workspace-toolbar"><label>Task view<select value={filter} onChange={(e) => setFilter(e.target.value)}>{["All tasks", "Open tasks", "Overdue", ...statuses].map((s) => <option key={s}>{s}</option>)}</select></label><label className="toolbar-search">Search tasks<input placeholder="Task, type or priority" value={query} onChange={(e) => setQuery(e.target.value)} /></label><button className="secondary-button" onClick={refresh}>Refresh tasks</button></div>
    {error && <p className="integration-notice" role="alert">{error} Existing records remain unchanged.</p>}
    <section className="card task-list" aria-label="Operations tasks"><header className="card-header"><div><h2>{filter}</h2><p>{visible.length} {visible.length === 1 ? "task" : "tasks"} · all deadlines in IST</p></div></header>
      {!data ? <p className="empty-records">{error ? "Tasks could not be loaded. Please retry." : "Loading operations…"}</p> : visible.length ? visible.map((task) => <button className="operation-record" key={task.id} onClick={() => setEditing(task)} aria-label={`Review task ${task.title}`}>
        <span className="operation-title"><span className={`task-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span><strong>{task.title}</strong><small>{task.type}{task.trip_id ? ` · ${trips.find((t) => t.uuid === task.trip_id)?.destination || "Linked trip"}` : ""}{task.lead_id ? ` · ${leads.find((l) => l.uuid === task.lead_id)?.name || "Linked lead"}` : ""}</small></span>
        <span className={overdue(task) ? "task-overdue" : ""}><small>{overdue(task) ? "Overdue" : "Due"}</small><span>{task.due_at ? timeInIndia(task.due_at) : "No deadline"}</span></span>
        <span><small>Assignee</small><span>{data.assignees.find((p) => p.id === task.assignee_id)?.name || (task.assignee_id ? "Previously assigned staff" : "Unassigned")}</span></span>
        <span className={`task-status status-${task.status.toLowerCase().replaceAll(" ", "-")}`}>{task.status}</span><ChevronRight size={18} />
      </button>) : <div className="operations-empty"><h3>No {filter === "All tasks" ? "tasks" : filter.toLowerCase()} here</h3><p>Add the next action your team needs to complete, with an owner and a deadline.</p>{canManage(user) && <button className="secondary-button" onClick={() => setEditing({})}><Plus size={17} />Add task</button>}</div>}
    </section>
    {editing && <TaskEditor key={editing.id || "new"} task={editing} people={data?.assignees || []} trips={trips} leads={leads} api={api} user={user} onClose={() => setEditing(null)} onSaved={async () => { const fresh = await refresh(); await onSaved(); if (!fresh) setError("Task saved, but the list could not be refreshed. Use Refresh tasks."); }} />}
  </>;
}
