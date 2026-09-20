import { useEffect, useMemo, useRef, useState } from "react";
import { LoginScreen, IntegrationSettings } from "./VerifiedAccess.jsx";
import { DashboardLive, LeadEditor, ContactsManager, MoneyManager, ReportsLive, leadStatuses, canManage } from "./Management.jsx";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Compass,
  ContactRound,
  FileText,
  Filter,
  Headphones,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";

const navItems = [
  { label: "Command center", icon: LayoutDashboard },
  { label: "Leads", icon: ContactRound },
  { label: "Trips", icon: Compass },
  { label: "Operations", icon: CalendarDays },
  { label: "Money", icon: CircleDollarSign },
  { label: "Contacts", icon: UsersRound },
  { label: "Suppliers", icon: ShieldCheck },
  { label: "Reports", icon: TrendingUp },
  { label: "Library", icon: FileText },
];

const formatINR = (value) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)}`;
// The same Worker handles production and Vite's local /api proxy.
const API_BASE = "";
let sessionEpoch = 0;

async function apiRequest(path, options = {}) {
  const epoch = sessionEpoch;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (epoch === sessionEpoch && (response.status === 401 || result.code === "STAFF_ACCESS_DENIED") && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event("crm-session-expired"));
    const error = new Error(result.error || result.detail || `API request failed (${response.status})`);
    error.status = response.status; throw error;
  }
  return result;
}

function App() {
  const [active, setActive] = useState("Command center");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authMode, setAuthMode] = useState("paused");
  const generation = useRef(0);
  const [dashboardData, setDashboardData] = useState(null);
  const [contactsData, setContactsData] = useState([]);
  const [suppliersData, setSuppliersData] = useState([]);
  const [leadsData, setLeadsData] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const leadPages = useRef(1);
  const workspaceLoading = useRef(false);
  const [dataStatus, setDataStatus] = useState("Waiting for sign-in");
  const effectiveDataStatus = dataStatus;

  const loadDashboard = async () => {
    if (workspaceLoading.current) return;
    workspaceLoading.current = true;
    const session = generation.current;
    try {
      const [result, leads] = await Promise.all([apiRequest("/api/dashboard"), apiRequest("/api/leads")]);
      let items = leads.items; let offset = leads.next_offset;
      for (let page = 1; page < leadPages.current && offset !== null; page++) {
        if (session !== generation.current) return;
        const more = await apiRequest(`/api/leads?offset=${offset}`);
        items = [...items, ...more.items]; offset = more.next_offset;
      }
      if (session !== generation.current) return;
      setDashboardData(result);
      setLeadsData([...new Map(items.map((lead) => [lead.uuid, lead])).values()]); setNextOffset(offset);
      setDataStatus(`Supabase connected · checked ${new Date().toLocaleTimeString()} · refreshes every 15s`);
    } catch (error) {
      if (session === generation.current) setDataStatus(error.message);
    } finally { workspaceLoading.current = false; }
  };

  const loadWorkspaceModules = async () => {
    const session = generation.current;
    try {
      const [contacts, suppliers] = await Promise.all([apiRequest("/api/contacts"), apiRequest("/api/suppliers")]);
      if (session !== generation.current) return;
      setContactsData(contacts.items || []); setSuppliersData(suppliers.items || []);
    } catch (error) { if (session === generation.current) setDataStatus(error.message); }
  };

  const [selectedTrip, setSelectedTrip] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [toast, setToast] = useState("");
  function clearSession() {
    sessionEpoch++; generation.current++; setCurrentUser(null); setDashboardData(null); setLeadsData([]);
    leadPages.current = 1;
    setContactsData([]); setSuppliersData([]); setNextOffset(null); setSelectedTrip(null);
    setEditingLead(null);
    setShowQuickAdd(false); setShowProfile(false); setSearch(""); setToast(""); setActive("Command center");
    setDataStatus("Please sign in");
  }
  async function signOut() {
    setCheckingAuth(true); clearSession();
    try { await apiRequest("/api/auth/logout", { method: "POST", body: "{}" }); }
    catch { setAuthError("Could not contact sign-out service. Close this browser session if you are on a shared device."); }
    finally { setCheckingAuth(false); }
  }
  useEffect(() => {
    const expired = () => {
      clearSession(); setAuthError("Your session expired. Please sign in again.");
      void apiRequest("/api/config").then((config) => setAuthMode(config.auth_mode || "paused")).catch(() => setAuthMode("paused"));
    };
    window.addEventListener("crm-session-expired", expired);
    let cancelled = false;
    apiRequest("/api/config").then((config) => {
      if (!cancelled) setAuthMode(config.auth_mode || "paused");
      return apiRequest("/api/me");
    }).then((result) => { if (!cancelled) { setCurrentUser(result.user); setAuthError(""); } })
      .catch((error) => { if (!cancelled) setAuthError(error.status === 401 ? "" : error.message); })
      .finally(() => { if (!cancelled) setCheckingAuth(false); });
    return () => { cancelled = true; window.removeEventListener("crm-session-expired", expired); };
  }, []);
  useEffect(() => {
    if (!currentUser) return;
    void loadDashboard(); void loadWorkspaceModules();
    const check = () => { if (!document.hidden) void apiRequest("/api/me").catch(() => {}); };
    const interval = window.setInterval(check, 60000);
    const refresh = () => { if (!document.hidden) { void loadDashboard(); void loadWorkspaceModules(); } };
    const refreshInterval = window.setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", check);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); window.clearInterval(refreshInterval); document.removeEventListener("visibilitychange", check); document.removeEventListener("visibilitychange", refresh); };
  }, [currentUser]);
  async function loadMoreLeads() {
    if (workspaceLoading.current || nextOffset === null) return;
    workspaceLoading.current = true;
    const session = generation.current;
    try {
      const result = await apiRequest(`/api/leads?offset=${nextOffset}`);
      if (session !== generation.current) return;
      setLeadsData((current) => [...new Map([...current, ...result.items].map((lead) => [lead.uuid, lead])).values()]);
      setNextOffset(result.next_offset);
      leadPages.current++;
    } catch (error) { if (session === generation.current) setToast(error.message); }
    finally { workspaceLoading.current = false; }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredLeads = useMemo(() => {
    const leadSource = leadsData;
    const query = search.trim().toLowerCase();
    if (!query) return leadSource;
    return leadSource.filter((lead) => `${lead.name} ${lead.phone} ${lead.destination} ${lead.source} ${lead.id} ${lead.campaign_name || ""} ${lead.first_message || ""}`.toLowerCase().includes(query));
  }, [leadsData, search]);

  const navigate = (label) => {
    setActive(label);
    setSidebarOpen(false);
    setSelectedTrip(null);
    setSearch("");
  };
  const refreshRecords = async () => { await Promise.all([loadDashboard(), loadWorkspaceModules()]); setToast("Changes saved to Supabase."); };

  if (!currentUser) return <LoginScreen api={apiRequest} mode={authMode} checking={checkingAuth} initialError={authError} onSignedIn={(user) => { sessionEpoch++; generation.current++; setCurrentUser(user); setAuthError(""); }} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Compass size={22} strokeWidth={2.4} /></div>
          <div><div className="brand-name">Japs_CRM</div><div className="brand-subtitle">Travel command center</div></div>
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">JP</div>
          <div className="workspace-copy"><span>Japs Travels</span><small>Primary workspace</small></div>
          <ChevronDown size={15} className="muted-icon" />
        </div>

        <div className="nav-section-label">Workspace</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map(({ label, icon: Icon, badge }) => (
            <button key={label} className={`nav-item ${active === label ? "nav-item-active" : ""}`} onClick={() => navigate(label)}>
              <Icon size={18} strokeWidth={active === label ? 2.35 : 1.9} />
              <span>{label}</span>
              {badge && <span className="nav-badge">{badge}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="nav-section-label">Workspace tools</div>
        <button className={`nav-item ${active === "Settings" ? "nav-item-active" : ""}`} onClick={() => navigate("Settings")}><Settings size={18} /><span>Settings</span></button>
        <button className="nav-item help-item" onClick={() => setToast("Support center is coming in the next release.")}><LifeBuoy size={18} /><span>Help & support</span></button>
        <div className="sidebar-footer">
          <div className="footer-spark"><Sparkles size={16} /></div>
          <div><strong>Make every trip count.</strong><span>Japs_CRM early access</span></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumbs"><span className="crumb-muted">Workspace</span><ChevronRight size={14} /><strong>{active}</strong></div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search trips, people, or IDs" /><kbd>⌘ K</kbd></label>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => navigate("Leads")}><Bell size={18} /><span className="notification-dot" /></button>
            <div className="profile-wrap">
              <button className="profile-chip" onClick={() => setShowProfile((value) => !value)}><span className="profile-avatar">{currentUser.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span className="profile-text"><strong>{currentUser.name}</strong><small>{currentUser.role}</small></span><ChevronDown size={14} /></button>
              {showProfile && <div className="profile-menu"><div className="profile-menu-head"><span className="profile-avatar large"><ShieldCheck size={22} /></span><div><strong>{currentUser.name}</strong><small>{currentUser.email}</small></div></div><div className="profile-menu-line"><span className="status-dot green" /> Verified staff · Japs Travels</div><button onClick={signOut}><LogOut size={15} /> Sign out / switch account</button></div>}
            </div>
          </div>
        </header>

        <div className="page-content">
          {active === "Command center" && <DashboardLive data={dashboardData} currentUser={currentUser} onQuickAdd={() => setShowQuickAdd(true)} onEdit={setEditingLead} onNavigate={navigate} />}
          {active === "Leads" && <LeadsView leads={filteredLeads} onQuickAdd={canManage(currentUser) ? () => setShowQuickAdd(true) : null} onEdit={setEditingLead} onRefresh={loadDashboard} onMore={nextOffset !== null ? loadMoreLeads : null} />}
          {active === "Trips" && <TripsView trips={dashboardData?.trips || []} onTrip={setSelectedTrip} />}
          {active === "Operations" && <TripsView trips={dashboardData?.trips || []} onTrip={setSelectedTrip} />}
          {active === "Money" && <MoneyManager payments={dashboardData?.payments || []} trips={dashboardData?.trips || []} api={apiRequest} user={currentUser} onSaved={refreshRecords} />}
          {active === "Contacts" && <ContactsManager contacts={contactsData} api={apiRequest} user={currentUser} onSaved={refreshRecords} onEditLead={setEditingLead} />}
          {active === "Suppliers" && <SuppliersView suppliers={suppliersData} onToast={setToast} />}
          {active === "Reports" && <ReportsLive data={dashboardData} onNavigate={navigate} />}
          {active === "Library" && <LibraryView onToast={setToast} />}
          {active === "Settings" && <><PageHeading eyebrow="Workspace controls" title="Settings" description="Verified staff access and WhatsApp integration readiness." /><IntegrationSettings api={apiRequest} user={currentUser} /></>}
        </div>
        <footer className="page-footer"><span><span className={`status-dot ${effectiveDataStatus.includes("connected") ? "green" : "amber"}`} /> {effectiveDataStatus}</span><span>INR · 5% tax default</span><span>Japs_CRM v0.1</span></footer>
      </main>

      <div className="mobile-bottom-nav">
        {navItems.slice(0, 5).map(({ label, icon: Icon }) => <button key={label} className={active === label ? "active" : ""} onClick={() => navigate(label)}><Icon size={19} /><span>{label === "Command center" ? "Home" : label}</span></button>)}
      </div>

      {showQuickAdd && <QuickAddModal onClose={() => setShowQuickAdd(false)} onSave={async (form) => { try { await apiRequest("/api/leads", { method: "POST", body: JSON.stringify({ name: form.name, phone: form.phone, email: form.email || null, destination: form.destination, source: form.source, start_date: form.startDate || null, travelers: Number(form.travelers || 2), notes: form.notes }) }); await loadDashboard(); setToast("New lead saved to Supabase."); setShowQuickAdd(false); } catch (error) { setToast(`Not saved: ${error.message}`); } }} />}
      {selectedTrip && <TripDrawer trip={selectedTrip} onClose={() => setSelectedTrip(null)} onNavigate={navigate} />}
      {editingLead && <LeadEditor key={editingLead.uuid} lead={editingLead} api={apiRequest} user={currentUser} onClose={() => setEditingLead(null)} onSaved={refreshRecords} />}
      {toast && <div className="toast"><CircleCheck size={17} /> {toast}</div>}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action, actionLabel = "New lead" }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <button className="primary-button" onClick={action}><Plus size={17} /> {actionLabel}</button>}</div>;
}

function LeadsView({ leads, onQuickAdd, onEdit, onRefresh, onMore }) {
  const [filter, setFilter] = useState("All leads");
  const visible = filter === "All leads" ? leads : leads.filter((lead) => lead.status === filter);
  return <>
    <PageHeading eyebrow="Sales workspace" title="Leads" description="Turn every enquiry into a clear next step." action={onQuickAdd} actionLabel="Add lead" />
    <div className="filter-row"><label>Lead status <select aria-label="Filter lead status" value={filter} onChange={(e) => setFilter(e.target.value)}>{["All leads", ...leadStatuses].map((item) => <option key={item}>{item}</option>)}</select></label><button className="secondary-button" onClick={onRefresh}>Refresh enquiries</button></div>
    <section className="card leads-page-card"><div className="list-toolbar"><div><strong>{visible.length} loaded leads</strong><span> · newest first · search filters loaded records</span></div></div><div className="lead-table desktop-table"><div className="table-head"><span>Lead</span><span>Trip plan</span><span>Budget</span><span>Stage</span><span>Next action</span><span /></div>{visible.map((lead) => <LeadRow key={lead.id} lead={lead} onEdit={onEdit} />)}</div><div className="mobile-stack">{visible.map((lead) => <LeadCard key={lead.id} lead={lead} onEdit={onEdit} />)}</div>{visible.length === 0 && <p className="integration-notice">No matching enquiries loaded. Check Settings for WhatsApp connection readiness.</p>}{onMore && <button className="secondary-button" onClick={onMore}>Load older leads</button>}</section>
  </>;
}

function TripsView({ trips: tripData, onTrip }) {
  const trips = tripData || [];
  const [filter, setFilter] = useState("All trips");
  const visible = filter === "All trips" ? trips : trips.filter((trip) => trip.stage === filter);
  return <><PageHeading eyebrow="Trip workspaces" title="Trips" description="See every customer journey, its health, and the next handoff." action={trips.length ? () => onTrip(trips[0]) : null} actionLabel="Open trip" /><div className="filter-row"><div className="segmented-control">{["All trips", "Plan", "Quote", "Confirm", "Operate"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div><section className="trip-grid">{visible.map((trip) => <TripCard key={trip.id} trip={trip} onClick={() => onTrip(trip)} />)}</section></>;
}

function SuppliersView({ suppliers: supplierData, onToast }) {
  const suppliers = (supplierData || []).map((supplier) => ({ ...supplier, type: supplier.type || "Travel supplier", contact: supplier.contact || "Contact not added", status: supplier.status || "Active", tone: supplier.tone || (supplier.status === "Needs attention" ? "warning" : "success") }));
  return <><PageHeading eyebrow="Partner network" title="Suppliers" description="Keep supplier contacts, response risk, and service coverage in one place." action={() => onToast("Supplier onboarding is ready for the next release.")} actionLabel="Add supplier" /><div className="supplier-summary"><div><strong>{suppliers.length}</strong><span>active partners</span></div><div><strong>—</strong><span>confirmations not connected</span></div><div><strong>—</strong><span>response tracking not connected</span></div></div><section className="module-grid">{suppliers.map((supplier) => <article className="module-card supplier-card" key={supplier.id || supplier.name}><div className="supplier-icon"><ShieldCheck size={18} /></div><div className="module-card-copy"><strong>{supplier.name}</strong><small>{supplier.type}{supplier.destination ? ` · ${supplier.destination}` : ""}</small><span>{supplier.contact}</span></div><span className={`supplier-status ${supplier.tone}`}><i />{supplier.status}</span><button className="row-more" aria-label={`Open ${supplier.name}`} onClick={() => onToast(`${supplier.name} profile opened.`)}><ChevronRight size={16} /></button></article>)}</section></>;
}

function LibraryView({ onToast }) {
  const files = [{ icon: FileText, title: "Bali quote · v3", meta: "Shared with Nisha Kapoor · 2h ago", kind: "Quote" }, { icon: TicketCheck, title: "Kerala vouchers", meta: "TRP-241 · 6 documents", kind: "Trip pack" }, { icon: ClipboardList, title: "Supplier request templates", meta: "4 ready-to-send messages", kind: "Template" }, { icon: Send, title: "Customer itinerary cover", meta: "Japs Travels · branded asset", kind: "Brand asset" }];
  return <><PageHeading eyebrow="Files & templates" title="Library" description="Keep the documents your team sends most often close to the work." action={() => onToast("Upload will connect to Supabase Storage in the next release.")} actionLabel="Upload file" /><section className="module-grid library-grid">{files.map(({ icon: Icon, title, meta, kind }) => <button className="module-card library-card" key={title} onClick={() => onToast(`${title} opened.`)}><span className="library-icon"><Icon size={18} /></span><span className="module-card-copy"><strong>{title}</strong><small>{meta}</small></span><span className="library-kind">{kind}</span><ChevronRight size={16} /></button>)}</section><section className="card library-note"><Sparkles size={17} /><div><strong>Keep every handoff polished.</strong><span>Quote, voucher, receipt, and itinerary files will share the same trip timeline.</span></div></section></>;
}


function LeadRow({ lead, onEdit }) {
  return <><div className="table-row actionable-row" role="button" tabIndex={0} aria-label={`Review lead ${lead.name}`} onClick={() => onEdit(lead)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(lead); } }}><span className="lead-person"><span className={`initials ${lead.color || "mint"}`}>{lead.initials || lead.name.slice(0, 2).toUpperCase()}</span><span><strong>{lead.name}</strong><small>{lead.phone || "Phone not supplied"} · {lead.source}</small></span></span><span className="trip-plan"><strong>{lead.destination}</strong><small>{lead.dates} · {lead.travelers}</small></span><span className="lead-value">{lead.budget == null ? "Not supplied" : formatINR(lead.value)}</span><span><span className={`stage-pill stage-${lead.status.toLowerCase()}`}>{lead.status}</span></span><span className="next-action"><strong>{lead.next}</strong><small>{lead.owner}</small></span><ChevronRight size={17} /></div><LeadAttribution lead={lead} /></>;
}

function LeadCard({ lead, onEdit }) {
  return <article className="lead-card"><button className="secondary-button lead-review-button" onClick={() => onEdit(lead)}>Review / edit lead</button><div className="lead-card-top"><span className={`initials ${lead.color || "mint"}`}>{lead.initials || lead.name.slice(0, 2).toUpperCase()}</span><div><strong>{lead.name}</strong><small>{lead.phone || "Phone not supplied"} · {lead.source}</small></div><span className={`stage-pill stage-${lead.status.toLowerCase()}`}>{lead.status}</span></div><div className="lead-card-details"><span><Compass size={14} /> {lead.destination}</span><span><CalendarDays size={14} /> {lead.dates}</span><strong>{lead.budget == null ? "Budget not supplied" : formatINR(lead.value)}</strong></div><LeadAttribution lead={lead} /><div className="lead-card-foot"><span>Next: {lead.next}</span><span>{lead.owner}</span></div></article>;
}

function LeadAttribution({ lead }) {
  if (!lead.ad_id && !lead.first_message) return null;
  return <details className="lead-attribution"><summary>{lead.campaign_name || (lead.ad_id ? "Campaign lookup pending" : "WhatsApp enquiry")} · {lead.source_platform || "Click platform unknown"}</summary>
    <dl><dt>Customer’s first message</dt><dd>{lead.first_message || "Non-text message — check WhatsApp"}</dd>
      <dt>Ad</dt><dd>{lead.ad_name || "Not yet available"}{lead.ad_id ? ` · ${lead.ad_id}` : ""}</dd>
      <dt>Campaign / ad set</dt><dd>{lead.campaign_name || "Not yet available"} / {lead.adset_name || "Not yet available"}</dd>
      <dt>Advertised package / event</dt><dd>{lead.offering_name || "Not mapped"} / {lead.event_reference || "Not mapped"}</dd>
      <dt>Lead ID</dt><dd>{lead.id}</dd></dl>
    <small>The WhatsApp display name is not a verified legal name or an Instagram username. Missing click platform is not inferred from ad placements.</small>
  </details>;
}

function TripCard({ trip, onClick }) {
  return <button className="trip-card" onClick={onClick}><div className="trip-card-top"><span className="trip-code">{trip.id}</span><span className={`health-pill ${trip.healthTone}`}><i /> {trip.health}</span></div><div className="trip-destination"><strong>{trip.destination}</strong><span>{trip.guest}</span></div><div className="trip-dates"><CalendarDays size={14} /> {trip.dates} · {trip.days} days <span>·</span> {trip.travelers} travelers</div><div className="trip-progress-label"><span>{trip.stage}</span><strong>{trip.progress}% ready</strong></div><div className="progress-track"><span className={`progress-fill ${trip.healthTone === "warning" ? "orange" : "green"}`} style={{ width: `${trip.progress}%` }} /></div><div className="trip-card-foot"><span>{trip.services}</span><span>{formatINR(trip.amount)}</span><ChevronRight size={15} /></div></button>;
}

function OperationPill({ top, tone, title, detail, onClick }) {
  return <button className={`operation-pill ${tone}`} style={{ top }} onClick={onClick}><strong>{title}</strong><span>{detail}</span></button>;
}

function LedgerRow({ type, title, meta, amount, status, warning }) {
  return <div className="ledger-row"><span className={`ledger-icon ${type}`}><ArrowUpRight size={15} /></span><span><strong>{title}</strong><small>{meta}</small></span><strong className="ledger-amount">{amount}</strong><span className={`ledger-status ${warning ? "warning" : ""}`}>{status}</span><MoreHorizontal size={16} className="muted-icon" /></div>;
}

function MarginRow({ trip, amount, margin, reason, tone }) {
  return <div className="margin-row"><span><strong>{trip}</strong><small>{amount} · {reason}</small></span><span className={`margin-value ${tone}`}>{margin}</span><ChevronRight size={15} /></div>;
}

function QuickAddModal({ onClose, onSave }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", phone: "", email: "", destination: "", startDate: "", travelers: "2", source: "Website form", notes: "" });
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal quick-add-modal" role="dialog" aria-modal="true" aria-labelledby="quick-add-title"><div className="modal-head"><div><div className="eyebrow">New opportunity</div><h2 id="quick-add-title">Add a lead</h2><p>Capture the trip brief now. You can enrich it later.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div><div className="stepper"><span className="step active"><b>1</b> Contact</span><i /><span className={`step ${step === 2 ? "active" : ""}`}><b>2</b> Trip brief</span></div>{step === 1 ? <div className="modal-form"><Field label="Customer name" required><input autoFocus value={form.name} onChange={update("name")} placeholder="e.g. Nisha Kapoor" /></Field><div className="form-two"><Field label="Phone number" required><input value={form.phone} onChange={update("phone")} placeholder="+91 98765 43210" /></Field><Field label="Email address"><input value={form.email} onChange={update("email")} placeholder="name@example.com" /></Field></div><div className="form-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!form.name || !form.phone} onClick={() => setStep(2)}>Continue <ChevronRight size={16} /></button></div></div> : <div className="modal-form"><div className="form-two"><Field label="Destination" required><input autoFocus value={form.destination} onChange={update("destination")} placeholder="e.g. Bali" /></Field><Field label="Source"><select value={form.source} onChange={update("source")}><option>Website form</option><option>WhatsApp</option><option>Email</option><option>Instagram</option><option>Meta lead</option><option>Referral</option></select></Field></div><div className="form-two"><Field label="Travel start"><input type="date" value={form.startDate} onChange={update("startDate")} /></Field><Field label="Travelers"><input type="number" min="1" value={form.travelers} onChange={update("travelers")} /></Field></div><Field label="First note"><textarea value={form.notes} onChange={update("notes")} placeholder="What did the customer ask for?" rows="3" /></Field><div className="form-callout"><Sparkles size={16} /><span>Japs_CRM will create the follow-up task automatically after saving.</span></div><div className="form-actions"><button className="secondary-button" onClick={() => setStep(1)}>Back</button><button className="primary-button" disabled={!form.destination} onClick={() => onSave(form)}><Check size={16} /> Save lead</button></div></div>}</section></div>;
}

function Field({ label, required, children }) { return <label className="field"><span>{label}{required && <em> *</em>}</span>{children}</label>; }


function TripDrawer({ trip, onClose, onNavigate }) {
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><aside className="trip-drawer" role="dialog" aria-modal="true" aria-label="Trip details"><div className="drawer-top"><div><span className="trip-code">{trip.id}</span><h2>{trip.destination}</h2><p>{trip.guest} · {trip.dates}</p></div><button className="icon-button" onClick={onClose} aria-label="Close trip"><X size={18} /></button></div><p>Stage: {trip.stage} · {trip.health}</p><p>{trip.travelers} travelers · {trip.services}</p><div className="money-snapshot"><div><span>Package value</span><strong>{formatINR(trip.amount)}</strong></div><div><span>Manual trip balance</span><strong>{formatINR(trip.due)}</strong></div></div><p className="record-help">Trip amounts are maintained manually, separately from recorded payments.</p><button className="primary-button" onClick={() => onNavigate("Money")}>Manage trip amounts & payments <ChevronRight size={16} /></button></aside></div>;
}

export default App;
