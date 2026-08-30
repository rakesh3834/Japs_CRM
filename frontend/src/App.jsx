import { useEffect, useMemo, useState } from "react";
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
  { label: "Leads", icon: ContactRound, badge: "42" },
  { label: "Trips", icon: Compass },
  { label: "Operations", icon: CalendarDays },
  { label: "Money", icon: CircleDollarSign },
  { label: "Contacts", icon: UsersRound },
  { label: "Suppliers", icon: ShieldCheck },
  { label: "Reports", icon: TrendingUp },
  { label: "Library", icon: FileText },
];

const sampleLeads = [
  { id: "JAP-1042", name: "Nisha Kapoor", source: "Website form", destination: "Bali", dates: "18-23 Oct", travelers: "2 adults", value: 68000, owner: "Aarav", status: "Proposal", next: "Follow up today", initials: "NK", color: "lilac" },
  { id: "JAP-1041", name: "Mohan & family", source: "WhatsApp", destination: "Kashmir", dates: "02-08 Nov", travelers: "4 adults · 1 child", value: 125000, owner: "Priya", status: "Qualified", next: "Build itinerary", initials: "MF", color: "mint" },
  { id: "JAP-1038", name: "Rhea Shah", source: "Instagram", destination: "Dubai", dates: "14-18 Sep", travelers: "2 adults", value: 74000, owner: "Aarav", status: "Negotiation", next: "Send revised quote", initials: "RS", color: "peach" },
  { id: "JAP-1035", name: "Northstar Pvt. Ltd.", source: "Referral", destination: "Vietnam", dates: "21-28 Dec", travelers: "12 adults", value: 420000, owner: "Vikram", status: "Discovery", next: "Schedule call", initials: "NP", color: "sky" },
  { id: "JAP-1032", name: "Ananya Menon", source: "Meta lead", destination: "Kerala", dates: "09-13 Oct", travelers: "2 adults · 2 children", value: 92000, owner: "Priya", status: "Nurture", next: "Review on 12 Sep", initials: "AM", color: "rose" },
];

const sampleTrips = [
  { id: "TRP-248", guest: "Rhea Shah", destination: "Dubai", dates: "14-18 Sep", days: 5, travelers: 2, stage: "Confirm", health: "At risk", healthTone: "warning", progress: 72, amount: 74000, due: 24000, owner: "Aarav", services: "4/6 confirmed" },
  { id: "TRP-247", guest: "Mohan & family", destination: "Kashmir", dates: "02-08 Nov", days: 7, travelers: 5, stage: "Plan", health: "On track", healthTone: "success", progress: 40, amount: 125000, due: 62500, owner: "Priya", services: "2/8 confirmed" },
  { id: "TRP-246", guest: "Northstar Pvt. Ltd.", destination: "Vietnam", dates: "21-28 Dec", days: 8, travelers: 12, stage: "Quote", health: "On track", healthTone: "success", progress: 55, amount: 420000, due: 420000, owner: "Vikram", services: "Quote draft" },
  { id: "TRP-241", guest: "Kabir Jain", destination: "Kerala", dates: "07-11 Sep", days: 5, travelers: 2, stage: "Operate", health: "Ready", healthTone: "success", progress: 94, amount: 58000, due: 0, owner: "Aarav", services: "All confirmed" },
];

const sampleContacts = [
  { name: "Rhea Shah", detail: "rhea.shah@email.com · +91 98200 11223", trips: 2, lastSeen: "Quote viewed 2h ago", tone: "peach" },
  { name: "Mohan & family", detail: "mohan@example.com · +91 98765 22018", trips: 1, lastSeen: "Lead qualified yesterday", tone: "mint" },
  { name: "Northstar Pvt. Ltd.", detail: "travel@northstar.in · +91 98111 88442", trips: 3, lastSeen: "Group quote in progress", tone: "sky" },
  { name: "Kabir Jain", detail: "kabir.jain@email.com · +91 98990 44556", trips: 1, lastSeen: "Payment logged today", tone: "lilac" },
];

const sampleSuppliers = [
  { name: "ABC Cars", type: "Transfers · Dubai", contact: "Ahmed Khan · +971 50 112 3344", status: "2 confirmations due", tone: "warning" },
  { name: "SnowPeak Stays", type: "Hotels · Kashmir", contact: "reservations@snowpeak.in", status: "On time", tone: "success" },
  { name: "Kerala Trails", type: "Guides · Experiences", contact: "Anu Menon · +91 98470 22110", status: "On time", tone: "success" },
  { name: "Lotus DMC", type: "Ground handling · Vietnam", contact: "ops@lotusdmc.vn", status: "Rate card expires in 8d", tone: "neutral" },
];

const actionItems = [
  { icon: MessageCircle, tone: "coral", title: "Reply to Nisha Kapoor", meta: "Lead JAP-1042 · website form", due: "Due today", tag: "Sales" },
  { icon: CircleAlert, tone: "amber", title: "Chase Dubai airport transfer", meta: "TRP-248 · ABC Cars", due: "Due in 3h", tag: "Supplier" },
  { icon: CircleDollarSign, tone: "green", title: "Log balance payment", meta: "Kabir Jain · ₹18,000 expected", due: "Due today", tag: "Money" },
  { icon: ClipboardList, tone: "blue", title: "Build Kashmir itinerary", meta: "Mohan & family · 5 travelers", due: "Tomorrow", tag: "Planning" },
];

const departures = [
  { date: "07", month: "SEP", destination: "Kerala", guest: "Kabir Jain", label: "Ready to travel", tone: "green", services: "6 services" },
  { date: "14", month: "SEP", destination: "Dubai", guest: "Rhea Shah", label: "2 confirmations pending", tone: "amber", services: "4 services" },
  { date: "02", month: "NOV", destination: "Kashmir", guest: "Mohan & family", label: "Planning in progress", tone: "blue", services: "8 services" },
];

const formatINR = (value) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
// Local development keeps the separate FastAPI port. In a hosted build the
// worker serves both the static app and /api/*, so use same-origin requests.
const API_BASE = import.meta.env.VITE_API_BASE_URL || (
  typeof window !== "undefined" && window.location.port === "5173" ? "http://localhost:8000" : ""
);

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json();
}

function App() {
  const [active, setActive] = useState("Command center");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [currentUser, setCurrentUser] = useState({ name: "Aarav Mehta", email: "ops@japstravels.in", phone: "+91 98765 43210", role: "Admin" });
  const [dashboardData, setDashboardData] = useState(null);
  const [contactsData, setContactsData] = useState(null);
  const [suppliersData, setSuppliersData] = useState(null);
  const [dataStatus, setDataStatus] = useState("Connecting to FastAPI");
  const effectiveDataStatus = dashboardData?.source === "supabase" ? "Supabase connected" : dataStatus;

  const loadDashboard = async () => {
    try {
      const result = await apiRequest("/api/dashboard");
      setDashboardData(result);
      setDataStatus(result.source === "supabase" ? "Supabase connected" : "Demo data · Supabase not configured");
    } catch {
      setDataStatus("Demo data · FastAPI offline");
    }
  };

  const loadWorkspaceModules = async () => {
    try {
      const [contacts, suppliers] = await Promise.all([apiRequest("/api/contacts"), apiRequest("/api/suppliers")]);
      setContactsData(contacts.source === "supabase" ? contacts.items : null);
      setSuppliersData(suppliers.source === "supabase" ? suppliers.items : null);
    } catch {
      // Dashboard status already communicates when FastAPI is offline.
    }
  };

  useEffect(() => { void loadDashboard(); void loadWorkspaceModules(); }, []);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredLeads = useMemo(() => {
    const leadSource = dashboardData?.leads || sampleLeads;
    const query = search.trim().toLowerCase();
    if (!query) return leadSource;
    return leadSource.filter((lead) => `${lead.name} ${lead.destination} ${lead.source} ${lead.id}`.toLowerCase().includes(query));
  }, [dashboardData, search]);

  const navigate = (label) => {
    setActive(label);
    setSidebarOpen(false);
    setSelectedTrip(null);
  };

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
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setToast("You have 4 actions waiting for you.")}><Bell size={18} /><span className="notification-dot" /></button>
            <div className="profile-wrap">
              <button className="profile-chip" onClick={() => setShowProfile((value) => !value)}><span className="profile-avatar">{currentUser.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span className="profile-text"><strong>{currentUser.name}</strong><small>{currentUser.role}</small></span><ChevronDown size={14} /></button>
              {showProfile && <div className="profile-menu"><div className="profile-menu-head"><span className="profile-avatar large">{currentUser.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><strong>{currentUser.name}</strong><small>{currentUser.email}</small></div></div><div className="profile-menu-line"><span className="status-dot green" /> Trusted login · Japs Travels</div><button onClick={() => { setShowProfile(false); setShowLogin(true); }}><UsersRound size={15} /> Switch profile</button><button onClick={() => setToast("Sign out will be enabled after verified Supabase Auth is connected.")}><LogOut size={15} /> Sign out</button></div>}
            </div>
          </div>
        </header>

        <div className="page-content">
          {active === "Command center" && <Dashboard data={dashboardData} currentUser={currentUser} onQuickAdd={() => setShowQuickAdd(true)} onTrip={setSelectedTrip} onNavigate={navigate} />}
          {active === "Leads" && <LeadsView leads={filteredLeads} onQuickAdd={() => setShowQuickAdd(true)} onToast={setToast} />}
          {active === "Trips" && <TripsView trips={dashboardData?.trips} onTrip={setSelectedTrip} />}
          {active === "Operations" && <OperationsView onTrip={setSelectedTrip} />}
          {active === "Money" && <MoneyView payments={dashboardData?.payments} onToast={setToast} onSaved={loadDashboard} />}
          {active === "Contacts" && <ContactsView contacts={contactsData} onToast={setToast} />}
          {active === "Suppliers" && <SuppliersView suppliers={suppliersData} onToast={setToast} />}
          {active === "Reports" && <ReportsView onToast={setToast} />}
          {active === "Library" && <LibraryView onToast={setToast} />}
          {active === "Settings" && <SettingsView dataStatus={effectiveDataStatus} onToast={setToast} />}
        </div>
        <footer className="page-footer"><span><span className={`status-dot ${effectiveDataStatus.includes("connected") ? "green" : "amber"}`} /> {effectiveDataStatus}</span><span>INR · 5% tax default</span><span>Japs_CRM v0.1</span></footer>
      </main>

      <div className="mobile-bottom-nav">
        {navItems.slice(0, 5).map(({ label, icon: Icon }) => <button key={label} className={active === label ? "active" : ""} onClick={() => navigate(label)}><Icon size={19} /><span>{label === "Command center" ? "Home" : label}</span></button>)}
      </div>

      {showQuickAdd && <QuickAddModal onClose={() => setShowQuickAdd(false)} onSave={async (form) => { try { const result = await apiRequest("/api/leads", { method: "POST", body: JSON.stringify({ name: form.name, phone: form.phone, email: form.email || null, destination: form.destination, source: form.source, start_date: form.startDate || null, travelers: Number(form.travelers || 2), notes: form.notes }) }); await loadDashboard(); setToast(result.synced ? "New lead saved to Supabase." : "New lead saved to your workspace."); } catch { setToast("Demo lead saved locally. Connect FastAPI to sync it."); } finally { setShowQuickAdd(false); } }} />}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onSave={(user) => { setCurrentUser(user); setShowLogin(false); void loadDashboard(); void loadWorkspaceModules(); setToast(`Welcome, ${user.name.split(" ")[0]}.`); }} />}
      {selectedTrip && <TripDrawer trip={selectedTrip} onClose={() => setSelectedTrip(null)} onToast={setToast} />}
      {toast && <div className="toast"><CircleCheck size={17} /> {toast}</div>}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action, actionLabel = "New lead" }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <button className="primary-button" onClick={action}><Plus size={17} /> {actionLabel}</button>}</div>;
}

function Dashboard({ data, currentUser, onQuickAdd, onTrip, onNavigate }) {
  const leads = data?.leads || sampleLeads;
  const trips = data?.trips || sampleTrips;
  const stats = data?.stats || { open_enquiries: 42, active_trips: 18, customer_due: 240000, margin_at_risk: 3 };
  return <>
    <PageHeading eyebrow="Sunday, 30 August 2026" title={`Good morning, ${(currentUser?.name || "Aarav Mehta").split(" ")[0]}`} description="Here is what needs your attention across Japs Travels today." action={onQuickAdd} actionLabel="Add lead" />
    <div className="insight-banner"><div className="insight-icon"><Sparkles size={18} /></div><div><strong>Your team is 18% faster this week.</strong><span>Response time is down and 6 more enquiries reached proposal stage.</span></div><button onClick={() => onNavigate("Reports")}>View insight <ArrowUpRight size={15} /></button></div>
    <section className="metric-grid">
      <MetricCard label="Open enquiries" value={stats.open_enquiries} change="12%" direction="up" hint="vs last week" icon={ContactRound} tone="lilac" />
      <MetricCard label="Active trips" value={stats.active_trips} change="4" direction="up" hint="this month" icon={Compass} tone="mint" />
      <MetricCard label="Customer due" value={formatINR(stats.customer_due)} change="3 overdue" direction="down" hint="needs attention" icon={CircleDollarSign} tone="peach" />
      <MetricCard label="Margin at risk" value={`${stats.margin_at_risk} trips`} change="Review" direction="down" hint="before confirming" icon={CircleAlert} tone="rose" />
    </section>
    <div className="dashboard-grid">
      <section className="card action-card"><CardHeader title="Your next actions" subtitle="Small moves that keep every trip on track" action="See all" onAction={() => onNavigate("Leads")} /><div className="action-list">{actionItems.map((item) => <ActionRow key={item.title} {...item} />)}</div></section>
      <section className="card departures-card"><CardHeader title="Upcoming departures" subtitle="The next 14 days" action="Open calendar" onAction={() => onNavigate("Operations")} /><div className="departure-list">{departures.map((departure) => <DepartureRow key={departure.destination + departure.date} {...departure} onClick={() => onTrip(trips.find((trip) => trip.destination === departure.destination) || sampleTrips.find((trip) => trip.destination === departure.destination))} />)}</div></section>
    </div>
    <div className="dashboard-grid lower-grid">
      <section className="card pipeline-card"><CardHeader title="Pipeline pulse" subtitle="Expected value by stage" action="Open leads" onAction={() => onNavigate("Leads")} /><div className="pipeline-total"><div><span>Weighted pipeline</span><strong>₹18.6L</strong></div><span className="positive-change"><ArrowUpRight size={15} /> 8.4%</span></div><div className="pipeline-bars"><PipelineBar label="Proposal" value="₹6.8L" percent={78} tone="violet" count="8 leads" /><PipelineBar label="Qualified" value="₹4.1L" percent={54} tone="green" count="13 leads" /><PipelineBar label="Discovery" value="₹3.5L" percent={42} tone="orange" count="9 leads" /><PipelineBar label="Nurture" value="₹4.2L" percent={33} tone="blue" count="12 leads" /></div></section>
      <section className="card trip-health-card"><CardHeader title="Trip health" subtitle="A quick read of live work" action="View trips" onAction={() => onNavigate("Trips")} /><div className="health-ring-row"><div className="health-ring"><div><strong>86%</strong><span>healthy</span></div></div><div className="health-copy"><div><span className="health-number green-text">14</span><span>On track</span></div><div><span className="health-number amber-text">3</span><span>Needs attention</span></div><div><span className="health-number coral-text">1</span><span>At risk</span></div></div></div><div className="health-note"><CircleAlert size={15} /> 2 supplier confirmations are due today.</div></section>
    </div>
    <section className="card recent-card"><CardHeader title="Recent leads" subtitle="The latest movement in your pipeline" action="Manage leads" onAction={() => onNavigate("Leads")} /><div className="lead-table desktop-table"><div className="table-head"><span>Lead</span><span>Trip plan</span><span>Value</span><span>Stage</span><span>Next action</span><span /></div>{leads.slice(0, 4).map((lead) => <LeadRow key={lead.id} lead={lead} />)}</div><div className="mobile-stack">{leads.slice(0, 3).map((lead) => <LeadCard key={lead.id} lead={lead} />)}</div></section>
  </>;
}

function LeadsView({ leads, onQuickAdd, onToast }) {
  const [filter, setFilter] = useState("All leads");
  const visible = filter === "All leads" ? leads : leads.filter((lead) => lead.status === filter);
  return <>
    <PageHeading eyebrow="Sales workspace" title="Leads" description="Turn every enquiry into a clear next step." action={onQuickAdd} actionLabel="Add lead" />
    <div className="filter-row"><div className="segmented-control">{["All leads", "Proposal", "Qualified", "Negotiation", "Nurture"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}{item === "All leads" && <span>42</span>}</button>)}</div><button className="secondary-button"><Filter size={15} /> Filters</button><button className="secondary-button hide-mobile"><ClipboardList size={15} /> Saved views</button></div>
    <section className="card leads-page-card"><div className="list-toolbar"><div><strong>{visible.length} leads</strong><span> · sorted by next action</span></div><button className="text-button" onClick={() => onToast("Lead distribution rules are ready to configure.")}><Sparkles size={15} /> Smart assignment</button></div><div className="lead-table desktop-table"><div className="table-head"><span>Lead</span><span>Trip plan</span><span>Value</span><span>Stage</span><span>Next action</span><span /></div>{visible.map((lead) => <LeadRow key={lead.id} lead={lead} />)}</div><div className="mobile-stack">{visible.map((lead) => <LeadCard key={lead.id} lead={lead} />)}</div></section>
  </>;
}

function TripsView({ trips: tripData, onTrip }) {
  const trips = tripData || sampleTrips;
  const [filter, setFilter] = useState("All trips");
  const visible = filter === "All trips" ? trips : trips.filter((trip) => trip.stage === filter);
  return <><PageHeading eyebrow="Trip workspaces" title="Trips" description="See every customer journey, its health, and the next handoff." action={() => onTrip(trips[0] || sampleTrips[0])} actionLabel="Open trip" /><div className="filter-row"><div className="segmented-control">{["All trips", "Plan", "Quote", "Confirm", "Operate"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><button className="secondary-button"><Filter size={15} /> Filter</button></div><section className="trip-grid">{visible.map((trip) => <TripCard key={trip.id} trip={trip} onClick={() => onTrip(trip)} />)}</section></>;
}

function OperationsView({ onTrip }) {
  const days = ["Sun 30", "Mon 31", "Tue 01", "Wed 02", "Thu 03", "Fri 04", "Sat 05"];
  return <><PageHeading eyebrow="Operations desk" title="Operations calendar" description="A shared view of pickups, stays, confirmations, and trip risks." action={() => onTrip(sampleTrips[0])} actionLabel="Open today" /><div className="filter-row operations-filter"><div className="date-switcher"><button><ChevronRight size={16} className="rotate-180" /></button><strong>30 Aug - 05 Sep 2026</strong><button><ChevronRight size={16} /></button></div><div className="segmented-control small"><button className="selected">Week</button><button>List</button><button>Day</button></div><button className="secondary-button"><Filter size={15} /> Risk filter</button></div><section className="card calendar-card"><div className="calendar-grid-head"><span />{days.map((day, index) => <div key={day} className={index === 0 ? "today-column" : ""}><small>{day.split(" ")[0]}</small><strong>{day.split(" ")[1]}</strong></div>)}</div><div className="calendar-body"><div className="time-axis"><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span></div><div className="calendar-columns">{days.map((day, index) => <div key={day} className={`calendar-column ${index === 0 ? "today-column" : ""}`}><div className="calendar-line" /><div className="calendar-line" /><div className="calendar-line" />{index === 0 && <OperationPill top="18%" tone="green" title="Kabir Jain" detail="Airport pickup · Kerala" onClick={() => onTrip(sampleTrips[3])} />}{index === 1 && <OperationPill top="48%" tone="amber" title="Rhea Shah" detail="Dubai transfer · chase" onClick={() => onTrip(sampleTrips[0])} />}{index === 3 && <OperationPill top="28%" tone="blue" title="Mohan & family" detail="Kashmir hotel hold" onClick={() => onTrip(sampleTrips[1])} />}{index === 4 && <OperationPill top="61%" tone="violet" title="Northstar group" detail="Vietnam quote review" onClick={() => onTrip(sampleTrips[2])} />}</div>)}</div></div><div className="calendar-legend"><span><i className="legend-dot green" /> Confirmed</span><span><i className="legend-dot amber" /> Needs action</span><span><i className="legend-dot blue" /> Planning</span><span><i className="legend-dot violet" /> Sales</span></div></section></>;
}

function MoneyView({ payments: paymentData, onToast, onSaved }) {
  const [showPayment, setShowPayment] = useState(false);
  const payments = paymentData || [
    { id: "PAY-1", trip_id: "TRP-248", title: "Deposit · Rhea Shah", meta: "TRP-248 · due 14 Sep", direction: "in", amount: 24000, status: "Due soon" },
    { id: "PAY-2", trip_id: "TRP-241", title: "Balance · Kabir Jain", meta: "TRP-241 · due today", direction: "in", amount: 18000, status: "Overdue" },
    { id: "PAY-3", trip_id: "TRP-248", title: "ABC Cars · Dubai transfer", meta: "TRP-248 · supplier bill", direction: "out", amount: 8500, status: "Due 12 Sep" },
    { id: "PAY-4", trip_id: "TRP-246", title: "Deposit · Northstar Pvt. Ltd.", meta: "TRP-246 · due 21 Sep", direction: "in", amount: 126000, status: "Scheduled" },
  ];
  return <><PageHeading eyebrow="Finance workspace" title="Money" description="Track what customers owe, what suppliers need, and where margin is moving." action={() => setShowPayment(true)} actionLabel="Log payment" /><section className="metric-grid money-metrics"><MetricCard label="Collected this month" value="₹4.82L" change="18%" direction="up" hint="vs last month" icon={CircleCheck} tone="mint" /><MetricCard label="Customer due" value="₹2.4L" change="7 invoices" direction="down" hint="next 14 days" icon={Clock3} tone="peach" /><MetricCard label="Supplier payable" value="₹1.16L" change="4 bills" direction="down" hint="next 14 days" icon={Send} tone="lilac" /><MetricCard label="Expected profit" value="₹3.72L" change="22.8%" direction="up" hint="active trips" icon={TrendingUp} tone="sky" /></section><div className="money-grid"><section className="card ledger-card"><CardHeader title="Payment timeline" subtitle="Customer collections and supplier dues" action="Export" onAction={() => onToast("CSV export will be available after your Supabase export policy is configured.")} /><div className="ledger-list">{payments.map((payment) => <LedgerRow key={payment.id} type={payment.direction} title={payment.title} meta={payment.meta || `${payment.trip_id} · ${payment.status}`} amount={formatINR(payment.amount)} status={payment.status} warning={payment.status === "Overdue"} />)}</div></section><section className="card margin-card"><CardHeader title="Margin watch" subtitle="Trips needing a pricing decision" action="View report" onAction={() => onToast("Margin report is coming soon.")} /><div className="margin-list"><MarginRow trip="Rhea Shah · Dubai" amount="₹74,000" margin="11.4%" reason="Transfer cost increased" tone="warning" /><MarginRow trip="Mohan & family · Kashmir" amount="₹1,25,000" margin="24.1%" reason="Healthy margin" tone="success" /><MarginRow trip="Northstar group · Vietnam" amount="₹4,20,000" margin="18.2%" reason="Quote not accepted" tone="neutral" /></div></section></div>{showPayment && <PaymentModal onClose={() => setShowPayment(false)} onToast={onToast} onSaved={async () => { setShowPayment(false); await onSaved?.(); }} />}</>;
}

function ContactsView({ contacts: contactData, onToast }) {
  const [query, setQuery] = useState("");
  const contacts = (contactData || sampleContacts).map((contact, index) => ({ ...contact, detail: contact.detail || [contact.email, contact.phone].filter(Boolean).join(" · "), lastSeen: contact.lastSeen || contact.last_seen || "Profile ready", trips: contact.trips ?? 0, tone: contact.tone || ["peach", "mint", "sky", "lilac"][index % 4] }));
  const visible = contacts.filter((contact) => `${contact.name} ${contact.detail}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <><PageHeading eyebrow="Customer directory" title="Contacts" description="One clean profile for every traveler, family, and agency partner." action={() => onToast("Contact capture is available from Add lead.")} actionLabel="Add contact" /><div className="module-toolbar"><label className="module-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contacts" /></label><span>{visible.length} contacts</span><button className="secondary-button" onClick={() => onToast("CSV import will be enabled after the import policy is configured.")}>Import CSV</button></div><section className="module-grid contacts-grid">{visible.map((contact) => <article className="module-card contact-card" key={contact.id || contact.name}><div className={`initials ${contact.tone}`}>{contact.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div className="module-card-copy"><strong>{contact.name}</strong><small>{contact.detail}</small><span>{contact.lastSeen}</span></div><div className="module-card-meta"><strong>{contact.trips}</strong><small>{contact.trips === 1 ? "trip" : "trips"}</small></div></article>)}</section></>;
}

function SuppliersView({ suppliers: supplierData, onToast }) {
  const suppliers = (supplierData || sampleSuppliers).map((supplier) => ({ ...supplier, type: supplier.type || "Travel supplier", contact: supplier.contact || "Contact not added", status: supplier.status || "Active", tone: supplier.tone || (supplier.status === "Needs attention" ? "warning" : "success") }));
  return <><PageHeading eyebrow="Partner network" title="Suppliers" description="Keep supplier contacts, response risk, and service coverage in one place." action={() => onToast("Supplier onboarding is ready for the next release.")} actionLabel="Add supplier" /><div className="supplier-summary"><div><strong>{suppliers.length}</strong><span>active partners</span></div><div><strong>2</strong><span>confirmations due</span></div><div><strong>94%</strong><span>on-time replies</span></div></div><section className="module-grid">{suppliers.map((supplier) => <article className="module-card supplier-card" key={supplier.id || supplier.name}><div className="supplier-icon"><ShieldCheck size={18} /></div><div className="module-card-copy"><strong>{supplier.name}</strong><small>{supplier.type}{supplier.destination ? ` · ${supplier.destination}` : ""}</small><span>{supplier.contact}</span></div><span className={`supplier-status ${supplier.tone}`}><i />{supplier.status}</span><button className="row-more" aria-label={`Open ${supplier.name}`} onClick={() => onToast(`${supplier.name} profile opened.`)}><ChevronRight size={16} /></button></article>)}</section></>;
}

function ReportsView({ onToast }) {
  return <><PageHeading eyebrow="Agency intelligence" title="Reports" description="Readable numbers for conversion, response time, money, and trip health." action={() => onToast("Report export will be available after your Supabase export policy is configured.")} actionLabel="Export report" /><section className="metric-grid"><MetricCard label="Lead to quote" value="38%" change="6.2%" direction="up" hint="this month" icon={TrendingUp} tone="mint" /><MetricCard label="Avg. response" value="24m" change="11m faster" direction="up" hint="vs last month" icon={Clock3} tone="lilac" /><MetricCard label="Trips completed" value="16" change="4" direction="up" hint="this quarter" icon={TicketCheck} tone="sky" /><MetricCard label="Gross margin" value="22.8%" change="2.1%" direction="up" hint="active trips" icon={CircleDollarSign} tone="peach" /></section><div className="report-grid"><section className="card report-card"><CardHeader title="Lead sources" subtitle="Where your next trips come from" action="View leads" onAction={() => onToast("Lead source detail is visible in Leads filters.")} /><div className="report-bars"><ReportBar label="Website form" value="34 leads" width={78} tone="violet" /><ReportBar label="WhatsApp" value="26 leads" width={62} tone="green" /><ReportBar label="Referral" value="18 leads" width={46} tone="orange" /><ReportBar label="Meta lead" value="12 leads" width={31} tone="blue" /></div></section><section className="card report-card"><CardHeader title="This week" subtitle="A calm pulse for the team" /><div className="report-callouts"><div><CircleCheck size={16} /><span><strong>92%</strong> actions completed on time</span></div><div><CircleAlert size={16} /><span><strong>3</strong> trips need a margin review</span></div><div><CircleDollarSign size={16} /><span><strong>₹2.4L</strong> customer due next 14 days</span></div></div></section></div></>;
}

function ReportBar({ label, value, width, tone }) { return <div className="report-bar"><div><span>{label}</span><strong>{value}</strong></div><div className="progress-track"><span className={`progress-fill ${tone}`} style={{ width: `${width}%` }} /></div></div>; }

function LibraryView({ onToast }) {
  const files = [{ icon: FileText, title: "Bali quote · v3", meta: "Shared with Nisha Kapoor · 2h ago", kind: "Quote" }, { icon: TicketCheck, title: "Kerala vouchers", meta: "TRP-241 · 6 documents", kind: "Trip pack" }, { icon: ClipboardList, title: "Supplier request templates", meta: "4 ready-to-send messages", kind: "Template" }, { icon: Send, title: "Customer itinerary cover", meta: "Japs Travels · branded asset", kind: "Brand asset" }];
  return <><PageHeading eyebrow="Files & templates" title="Library" description="Keep the documents your team sends most often close to the work." action={() => onToast("Upload will connect to Supabase Storage in the next release.")} actionLabel="Upload file" /><section className="module-grid library-grid">{files.map(({ icon: Icon, title, meta, kind }) => <button className="module-card library-card" key={title} onClick={() => onToast(`${title} opened.`)}><span className="library-icon"><Icon size={18} /></span><span className="module-card-copy"><strong>{title}</strong><small>{meta}</small></span><span className="library-kind">{kind}</span><ChevronRight size={16} /></button>)}</section><section className="card library-note"><Sparkles size={17} /><div><strong>Keep every handoff polished.</strong><span>Quote, voucher, receipt, and itinerary files will share the same trip timeline.</span></div></section></>;
}

function SettingsView({ dataStatus, onToast }) {
  return <><PageHeading eyebrow="Workspace controls" title="Settings" description="Japs_CRM defaults are visible here so the team knows how money and access work." /><div className="settings-grid"><section className="card settings-card"><CardHeader title="Workspace defaults" subtitle="Applied to new quotes and payment records" /><div className="settings-list"><div><span>Brand</span><strong>Japs_CRM · Japs Travels</strong></div><div><span>Currency</span><strong>INR · Indian Rupee</strong></div><div><span>Tax rate</span><strong>5% GST default</strong></div><div><span>Payment mode</span><strong>Tracking only · no gateway</strong></div></div><button className="secondary-button" onClick={() => onToast("Workspace defaults are ready for admin editing.")}>Edit defaults</button></section><section className="card settings-card"><CardHeader title="Connection & access" subtitle="Current local environment status" /><div className="settings-status"><span className={`status-dot ${dataStatus.includes("connected") ? "green" : "amber"}`} /><strong>{dataStatus}</strong></div><p className="settings-copy">The FastAPI service owns sessions and talks to Supabase with a server-only service key. This internal MVP accepts name, email, and phone without OTP.</p><button className="secondary-button" onClick={() => onToast("Use the profile menu to switch trusted team profiles.")}><ShieldCheck size={15} /> Review access note</button></section></div></>;
}

function PlaceholderView({ title, onToast }) {
  return <div className="placeholder-view"><div className="placeholder-art"><Compass size={30} /></div><div className="eyebrow">Japs_CRM workspace</div><h1>{title}</h1><p>This workspace is mapped in the product blueprint and will connect to the same trip record. Start with the live command center while we wire the next module.</p><button className="primary-button" onClick={() => onToast(`${title} is queued for the next build slice.`)}><Sparkles size={16} /> Show me the next release</button></div>;
}

function MetricCard({ label, value, change, direction, hint, icon: Icon, tone }) {
  return <div className={`metric-card tone-${tone}`}><div className="metric-top"><div className="metric-icon"><Icon size={18} /></div><span className={direction === "up" ? "metric-positive" : "metric-warning"}>{direction === "up" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}</span></div><div className="metric-value">{value}</div><div className="metric-label">{label}<span>{hint}</span></div></div>;
}

function CardHeader({ title, subtitle, action, onAction }) {
  return <div className="card-header"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && <button className="card-action" onClick={onAction}>{action}<ChevronRight size={14} /></button>}</div>;
}

function ActionRow({ icon: Icon, tone, title, meta, due, tag }) {
  return <button className="action-row" onClick={() => undefined}><span className={`action-icon ${tone}`}><Icon size={16} /></span><span className="action-copy"><strong>{title}</strong><small>{meta}</small></span><span className="action-meta"><em className={`tag tag-${tone}`}>{tag}</em><small>{due}</small></span><ChevronRight size={15} className="action-chevron" /></button>;
}

function DepartureRow({ date, month, destination, guest, label, tone, services, onClick }) {
  return <button className="departure-row" onClick={onClick}><span className={`date-block ${tone}`}><strong>{date}</strong><small>{month}</small></span><span className="departure-copy"><strong>{destination}</strong><small>{guest} · {services}</small></span><span className={`departure-status ${tone}`}><i />{label}</span><ChevronRight size={16} /></button>;
}

function PipelineBar({ label, value, percent, tone, count }) {
  return <div className="pipeline-row"><div><span>{label}</span><small>{count}</small><strong>{value}</strong></div><div className="progress-track"><span className={`progress-fill ${tone}`} style={{ width: `${percent}%` }} /></div></div>;
}

function LeadRow({ lead }) {
  return <div className="table-row"><span className="lead-person"><span className={`initials ${lead.color}`}>{lead.initials}</span><span><strong>{lead.name}</strong><small>{lead.id} · {lead.source}</small></span></span><span className="trip-plan"><strong>{lead.destination}</strong><small>{lead.dates} · {lead.travelers}</small></span><span className="lead-value">{formatINR(lead.value)}</span><span><span className={`stage-pill stage-${lead.status.toLowerCase()}`}>{lead.status}</span></span><span className="next-action"><strong>{lead.next}</strong><small>{lead.owner}</small></span><button className="row-more" aria-label={`More options for ${lead.name}`}><MoreHorizontal size={17} /></button></div>;
}

function LeadCard({ lead }) {
  return <article className="lead-card"><div className="lead-card-top"><span className={`initials ${lead.color}`}>{lead.initials}</span><div><strong>{lead.name}</strong><small>{lead.id} · {lead.source}</small></div><span className={`stage-pill stage-${lead.status.toLowerCase()}`}>{lead.status}</span></div><div className="lead-card-details"><span><Compass size={14} /> {lead.destination}</span><span><CalendarDays size={14} /> {lead.dates}</span><strong>{formatINR(lead.value)}</strong></div><div className="lead-card-foot"><span>Next: {lead.next}</span><span>{lead.owner}</span></div></article>;
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

function LoginModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async () => {
    setBusy(true);
    try {
      const result = await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify(form) });
      onSave(result.user);
    } catch {
      onSave({ ...form, role: "Team member" });
    } finally {
      setBusy(false);
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal quick-add-modal" role="dialog" aria-modal="true" aria-labelledby="login-title"><div className="modal-head"><div><div className="eyebrow">Japs_CRM workspace</div><h2 id="login-title">Switch profile</h2><p>Use your name, email, and phone to enter this trusted internal workspace.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div><div className="modal-form"><Field label="Your name" required><input autoFocus value={form.name} onChange={update("name")} placeholder="e.g. Priya Sharma" /></Field><Field label="Work email" required><input type="email" value={form.email} onChange={update("email")} placeholder="you@agency.com" /></Field><Field label="Phone number" required><input value={form.phone} onChange={update("phone")} placeholder="+91 98765 43210" /></Field><div className="form-callout"><ShieldCheck size={16} /><span>No OTP is requested in this MVP. Use this only for your trusted internal team.</span></div><div className="form-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !form.name || !form.email || !form.phone} onClick={submit}>{busy ? "Connecting..." : "Continue"} <ChevronRight size={16} /></button></div></div></section></div>;
}

function PaymentModal({ onClose, onToast, onSaved }) {
  const [form, setForm] = useState({ trip_id: "TRP-248", title: "", direction: "in", amount: "", due_date: "", method: "Bank transfer", reference: "" });
  const [busy, setBusy] = useState(false);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async () => {
    setBusy(true);
    try {
      const result = await apiRequest("/api/payments", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount), due_date: form.due_date }) });
      onToast(result.synced === true ? "Payment logged to Supabase." : "Payment logged to your workspace.");
      await onSaved();
    } catch {
      onToast("Payment could not sync. Check FastAPI and Supabase connection.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal quick-add-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title"><div className="modal-head"><div><div className="eyebrow">Manual payment tracking</div><h2 id="payment-title">Log a payment</h2><p>Record incoming customer money or an outgoing supplier payment.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div><div className="modal-form"><div className="form-two"><Field label="Trip code" required><input value={form.trip_id} onChange={update("trip_id")} placeholder="e.g. TRP-248" /></Field><Field label="Direction" required><select value={form.direction} onChange={update("direction")}><option value="in">Incoming · customer</option><option value="out">Outgoing · supplier</option></select></Field></div><Field label="Payment title" required><input autoFocus value={form.title} onChange={update("title")} placeholder="e.g. Deposit · Rhea Shah" /></Field><div className="form-two"><Field label="Amount (INR)" required><input type="number" min="1" value={form.amount} onChange={update("amount")} placeholder="24000" /></Field><Field label="Due date" required><input type="date" value={form.due_date} onChange={update("due_date")} /></Field></div><div className="form-two"><Field label="Method"><select value={form.method} onChange={update("method")}><option>Bank transfer</option><option>Cash</option><option>UPI</option><option>Card</option><option>Other</option></select></Field><Field label="Reference"><input value={form.reference} onChange={update("reference")} placeholder="UTR / invoice reference" /></Field></div><div className="form-callout"><CircleDollarSign size={16} /><span>Payments are tracked only. No gateway collection is enabled in this release.</span></div><div className="form-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !form.title || !form.amount || !form.due_date} onClick={submit}>{busy ? "Saving..." : "Save payment"} <Check size={16} /></button></div></div></section></div>;
}

function TripDrawer({ trip, onClose, onToast }) {
  if (!trip) return null;
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="trip-drawer" role="dialog" aria-modal="true"><div className="drawer-top"><div><span className="trip-code">{trip.id}</span><h2>{trip.guest}</h2><p>{trip.destination} · {trip.dates}</p></div><button className="icon-button" onClick={onClose} aria-label="Close trip"><X size={18} /></button></div><div className="drawer-health"><div><span>Trip health</span><strong className={trip.healthTone === "warning" ? "amber-text" : "green-text"}>{trip.health}</strong></div><div className="drawer-progress"><span style={{ width: `${trip.progress}%` }} /></div><small>{trip.progress}% ready · {trip.services}</small></div><div className="drawer-section"><div className="drawer-section-head"><h3>Next actions</h3><button className="text-button" onClick={() => onToast("Action added to the trip timeline.")}><Plus size={14} /> Add</button></div><div className="drawer-task"><span className="task-check" /><div><strong>Chase airport transfer confirmation</strong><small>Supplier · due today</small></div><ChevronRight size={15} /></div><div className="drawer-task"><span className="task-check checked"><Check size={12} /></span><div><strong>Send customer itinerary preview</strong><small>Sales · completed yesterday</small></div><ChevronRight size={15} /></div></div><div className="drawer-section"><div className="drawer-section-head"><h3>Journey</h3><button className="text-button" onClick={() => onToast("Trip stage updated.")}>Edit</button></div><div className="stage-rail"><span className="done">Lead</span><span className="done">Plan</span><span className="current">Quote</span><span>Confirm</span><span>Operate</span><span>Close</span></div></div><div className="drawer-section"><div className="drawer-section-head"><h3>Money snapshot</h3><button className="text-button" onClick={() => onToast("Payment tracker opened.")}>Open</button></div><div className="money-snapshot"><div><span>Package value</span><strong>{formatINR(trip.amount)}</strong></div><div><span>Customer due</span><strong>{formatINR(trip.due)}</strong></div><div><span>Tax</span><strong>5%</strong></div></div></div><div className="drawer-footer"><button className="secondary-button" onClick={() => onToast("Share link generation is ready to connect.")}><Send size={15} /> Share trip</button><button className="primary-button" onClick={() => onToast("Quote builder opened.")}><FileText size={15} /> Open workspace</button></div></aside></div>;
}

export default App;
