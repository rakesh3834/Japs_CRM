# Travel agency CRM - product blueprint

Working name: **Japs_CRM**. It is designed for travel agencies that take a customer's trip plan from enquiry through operations and payment tracking.

## 1. What the reference tells us

The attached Sembark presentation is reference material, not a set of instructions. It describes a travel DMC/tour-operator back office with:

- lead capture/API intake, distribution rules, follow-ups, tags, lifecycle states, filters, sorting, and reports;
- custom package and itinerary creation, multiple hotel categories, markup/tax calculations, quotation revisions, and PDF/Word/email/WhatsApp sharing;
- hotel and service reservations, supplier assignment, driver/coordinator/guest sharing, vouchers, and an operations calendar;
- customer and supplier payment logs, receipts, profit analysis, sales/profit/source/destination/team reports;
- a service repository, user roles, security, onboarding, support, and updates.

The useful product lesson is that sales, reservations, operations, and finance must use one trip record. The opportunity is to make that system easier to learn and more transparent: fewer dense tables, fewer hidden states, and a visible next action for every trip.

## 2. Product promise

Wayfinder gives a travel agency one calm workspace from first enquiry to post-trip review. Every lead becomes a trip workspace; every trip shows its next action, customer promise, supplier commitments, money position, and documents in one place.

### Problems solved

| Agency problem | Product response | Measurable outcome |
|---|---|---|
| Leads live in WhatsApp, spreadsheets, and inboxes | Capture, deduplicate, assign, and timeline every enquiry | Faster first response; fewer lost leads |
| Quotations are copied and recalculated manually | Reusable service catalog, versioned quotes, live cost/margin guardrail, branded share link | Shorter quote turnaround; fewer pricing errors |
| Sales and operations lose context at handoff | One trip workspace with owners, checklist, comments, and audit trail | Fewer missed handoffs |
| Supplier confirmations are chased in scattered chats | Supplier request board, due dates, templates, and confirmation status | Higher confirmation rate before travel |
| Customer payments and supplier dues are unclear | Installment schedule, reminders, incoming/outgoing ledger, and trip profitability | Better cash visibility and margin control |
| Staff cannot find what matters today | Role-specific command center and action queue | Less searching; clearer daily priorities |
| Existing systems are difficult to learn on a phone | Progressive disclosure, plain labels, keyboard shortcuts, and responsive layouts | Faster onboarding and mobile usability |

## 3. Experience direction - deliberately different UI

Sembark's reference screens are dense, table-first, dark-header admin screens. Wayfinder should feel like a modern operations cockpit:

- **Shell:** slim charcoal left rail on desktop, bottom navigation on mobile, persistent global search/command bar, and an alert tray for overdue work.
- **Canvas:** warm off-white background, white cards, soft borders, generous spacing, and a single accent color per state. Use deep ink, sea-glass green, and coral for warnings rather than a blue-heavy interface.
- **Home:** a Today command center: revenue pipeline, trips departing soon, overdue follow-ups, unconfirmed suppliers, outstanding customer payments, and a prioritized action queue.
- **Trip workspace:** a horizontal stage rail (`Lead -> Plan -> Quote -> Confirm -> Operate -> Close`) with a trip health strip showing customer, dates, owner, margin, payment, and confirmation risk. The page is a timeline/workbench, not a set of disconnected admin tabs.
- **Lists:** saved views and compact cards by default; tables are available for finance/export work. Every row has a clear status, owner, next action, and due date.
- **Creation:** a guided “trip brief” drawer accepts natural language or a short form, then proposes dates, destinations, travelers, and a first checklist. Staff can always edit the result.
- **Sharing:** branded customer portal and supplier request links are first-class outputs, with PDF fallback. The recipient never needs an internal account for a secure, expiring link.

The design rule is **show the next decision, hide the complexity until it is needed**.

## 4. Roles and navigation

Roles are organization-scoped and permission based, not hard-coded to screens.

- **Owner/Admin:** organization settings, users, templates, pricing, integrations, audit, all reports.
- **Sales:** leads, contacts, trip briefs, quotes, customer communication, own pipeline.
- **Operations:** confirmed trips, supplier requests, service bookings, documents, daily calendar.
- **Finance:** invoices, receipts, customer installments, supplier dues, margins, exports.
- **Supplier coordinator:** supplier directory, contracts/rates, request and confirmation queue.
- **Read-only/partner:** explicitly shared trips or reports only.

Primary navigation:

`Command center` | `Leads` | `Trips` | `Operations` | `Money` | `Contacts` | `Suppliers` | `Reports` | `Library` | `Settings`

Navigation is filtered by permissions. A role can still open a linked trip from a notification even when a module is hidden.

## 5. End-to-end workflow and business logic

### A. Lead capture and qualification

1. A lead arrives via manual entry, import, form/webhook, email parser, or future channel adapter.
2. Normalize phone/email and search for likely duplicates. Never silently merge; show a merge suggestion.
3. Create or link a contact and create a trip brief with source, destination(s), dates/flexibility, traveler counts, budget, interests, and notes.
4. Apply routing rules: branch, destination, source, language, load, and working hours. Assign an owner and SLA.
5. Create the first follow-up task. The command center highlights overdue and unassigned work.
6. Sales moves the lead through `Inbox`, `Qualified`, `Discovery`, `Proposal`, `Negotiation`, `Won`, `Lost`, or `Nurture`.

Rules:

- A lead cannot enter `Proposal` without a trip brief and an owner.
- A lead cannot enter `Won` without a confirmed quote and primary contact.
- `Lost` requires a reason; `Nurture` requires a next-review date.
- Every state change writes an immutable activity event.

### B. Trip planning and quote versions

1. A trip brief creates an editable itinerary skeleton by day.
2. Staff add catalog services: hotel nights, transfers, activities, meals, guides, tickets, ferries, insurance, and custom items.
3. Each service has supplier, net cost, selling price, tax, currency, cancellation policy, and confirmation requirement.
4. Quote versions are immutable snapshots after sharing. A new revision is created for changes; the old version remains auditable.
5. The price engine calculates line totals, taxes, discounts, rounding, FX conversion, payment schedule, gross profit, and margin percentage.
6. A margin guardrail warns when the quote falls below the organization's target; permission can be required to override.
7. Generate a branded share link plus PDF. Record viewed, accepted, declined, and expired events.

Core calculation:

`selling_total = sum(service selling prices) - discount + tax + fee`

`gross_profit = selling_total - sum(supplier net costs) - commission_costs`

`margin_percent = gross_profit / selling_total * 100` (zero-safe and calculated from the stored base currency).

### C. Conversion, reservations, and supplier coordination

1. Quote acceptance converts the lead into a trip and creates booking items from the accepted version.
2. Each booking item moves independently through `Needs supplier`, `Requested`, `Option held`, `Confirmed`, `Voucher sent`, `Cancelled`, or `Issue`.
3. A supplier request contains only the details that supplier needs. The internal trip remains the source of truth.
4. Supplier links are expiring and scoped; a supplier cannot see unrelated customer or margin data.
5. Confirmation deadlines generate tasks and escalate to the operations lead.
6. Confirmed bookings generate customer vouchers, supplier confirmations, driver/coordinator sheets, and a live operations checklist.

### D. Operations and in-trip care

- Calendar views: month, week, day, and list. Filter by destination, trip, service type, supplier, owner, and risk.
- Day-of operations surface pickup time/location, guest count, driver, contact, vouchers, notes, and emergency flag.
- A trip health score combines missing confirmations, overdue tasks, unpaid balance, margin risk, and travel start proximity. It explains the score; it is never a mysterious number.
- Staff can log a change or incident from mobile in under 30 seconds. Customer-facing updates are separated from internal notes.

### E. Money and closeout

1. Quote acceptance creates an invoice/payment plan: deposit, milestone(s), and balance.
2. Log customer payments with method, date, currency, reference, receipt, and verification state.
3. Log supplier bills/payments against booking items and due dates.
4. Dashboard shows collected, due, overdue, committed supplier cost, expected profit, and realized profit.
5. Cancellation/refund rules create adjustments instead of deleting history.
6. Post-trip closeout captures final costs, margin variance, feedback, repeat/follow-up date, and source attribution.

## 6. Data model in Supabase

Every business table includes `organization_id`, `created_at`, `updated_at`, and (where relevant) `created_by`/`updated_by`. Use UUIDs, foreign keys, soft deletion for business records, and database constraints for money and status values.

Core tables:

```text
organizations
profiles
organization_memberships (role, branch, permissions)
contacts (customer, agency partner, traveler)
leads (source, status, owner, SLA, brief fields)
trips (contact, dates, destinations, stage, health, owners)
trip_travelers (trip, name, age band, passport-safe metadata)
trip_days (trip, day number, date, title, notes)
service_catalog (type, destination, default supplier, cost, sell price, tax)
suppliers (contacts, capabilities, currencies, SLA, rating)
supplier_rates (service, valid dates, net cost, cancellation policy)
trip_services (trip/day, type, supplier, cost, sell, status, confirmation due)
quote_versions (trip, number, status, totals, shared_at, accepted_at)
quote_items (quote version, service snapshot, quantity, tax, pricing)
bookings (trip service, confirmation code, status, voucher)
payment_plans (trip, currency, total, due rules)
payments (plan, direction, amount, method, status, reference)
tasks (trip/lead/service, assignee, type, due_at, status, priority)
messages (trip, channel, direction, template, delivery state)
documents (trip/booking, storage path, kind, visibility, expires_at)
activity_events (entity, action, before/after JSON, actor, timestamp)
saved_views, notification_preferences, templates, branches, currencies
```

Security and integrity:

- Enable RLS on every exposed table and scope all reads/writes to an organization membership.
- Keep the Supabase service-role key server-side only. The browser calls an application API.
- Validate status transitions, totals, currency codes, and organization ownership in API handlers and database constraints.
- Store files in Supabase Storage with private buckets and signed URLs; never expose a raw path.
- Keep audit events append-only. Do not allow a normal user to edit or delete them.
- Add indexes for `(organization_id, status)`, `(organization_id, due_at)`, `(trip_id)`, and full-text search fields.

### Reusing the existing Daily Task Hub login

The earlier OfficeFlow Task Hub uses a server-side worker and authenticated ChatGPT headers (`oai-authenticated-user-id`, email, and full name) before calling Supabase with a server-only service key. Japs_CRM can reuse the header parsing logic, but its application API is now FastAPI. The FastAPI dependency should resolve the current user, map them to `organization_memberships`, and add `organization_id` to every query. If deployed outside that host, swap only the auth adapter for Supabase Auth (email/Google/magic link); the domain model and UI do not change.

## 7. Framework and implementation layout

Use the same proven baseline as the existing task hub so login and deployment knowledge carry over:

- **Frontend:** React 19 + TypeScript, Vinext/Vite app router, accessible semantic HTML, Lucide icons, and a small token-based CSS layer. Use URL state for filters and saved views.
- **Backend:** FastAPI with typed Pydantic request/response schemas, dependency-based auth and organization scoping, and a server-only Supabase REST/JS client. Background work can use a task queue or scheduled worker when needed.
- **Database/files:** Supabase Postgres, RLS, SQL migrations, Supabase Storage, and realtime only for collaboration where it adds value.
- **Client data:** query cache with optimistic UI only for safe updates; show a visible sync/error state and refresh path.
- **Documents:** HTML templates rendered to PDF server-side; share links use a signed token and expiry.
- **Testing:** unit tests for price/status rules, API authorization tests, component tests for responsive states, and browser smoke tests for lead-to-quote-to-booking.

Suggested project layout:

```text
app/
  (auth)/
  dashboard/
  leads/
  trips/[tripId]/
  operations/
  money/
  settings/
components/
  shell/  trip/  quote/  forms/  tables/  mobile/
lib/
  auth/  api/  pricing/  workflows/  formatters/  permissions/
worker/
  index.ts  routes/  supabase/  documents/
supabase/
  migrations/  seed/  functions/
tests/
  unit/  api/  browser/
```

## 8. Screens to build

### Command center

Top: global search, quick add, notifications, user/organization switcher. Main: KPI cards, pipeline, “your next 5 actions,” departing trips, supplier risk, payment risk. Right side: activity stream. Mobile turns cards into a vertical priority feed.

### Leads

Pipeline board and saved-list views. A lead card shows contact, trip dates/destination, value, owner, next action, and SLA. The detail drawer shows the timeline and lets the user schedule the next action without leaving the list.

### Trip workspace

Header health strip, stage rail, and tabs: `Overview`, `Itinerary`, `Quotes`, `Bookings`, `Suppliers`, `Money`, `Documents`, `Messages`, `Activity`. The “Overview” tab is the default and tells a new user what needs attention.

### Quote builder

Three-pane desktop layout: itinerary outline, service editor, and live price/share preview. On mobile, panes become steps with sticky total and Save/Share actions. Include duplicate day/service, multi-select, templates, and version compare.

### Operations

Calendar/list toggle with a risk filter. Each card can confirm, message supplier, upload proof, assign owner, or open the trip. Day view is optimized for a phone held by a coordinator.

### Money

Cash-in/cash-out summary, receivables/payables, installment timeline, trip margin table, and export. Use plain-language labels (“Customer due” instead of only “AR”).

## 9. Responsive and usability rules

- Test at 360, 390, 768, 1024, and 1440px widths.
- Desktop uses rail + two/three-column workspaces; tablet collapses the rail and removes secondary columns; mobile uses bottom navigation and full-screen drawers.
- Never require horizontal scrolling for core actions. Wide financial tables may scroll within a labeled region.
- All actions have visible text or accessible labels, 44px touch targets, keyboard focus, and a non-color status indicator.
- Autosave drafts, show “Saved just now,” and preserve unsent form data after a network error.
- Empty states explain what the user can do next. Destructive actions require confirmation and state what will be preserved.
- Use local date/currency formatting but store ISO timestamps and minor-unit money values with currency codes.

## 10. Differentiators to phase in

MVP should be reliable before it is clever. Prioritized differentiators:

1. **Trip workspace and action queue** - the core “one source of truth” experience.
2. **Quote version compare and margin guardrail** - prevents invisible pricing mistakes.
3. **Customer mini-portal** - quote acceptance, payment status, itinerary, and documents in one link.
4. **Supplier chase board** - due dates, templated requests, expiring links, and escalation.
5. **Conversation-to-CRM capture** - paste/email/webhook intake with a review step before saving.
6. **Operational risk score** - explainable warnings for missing confirmations, payment gaps, or margin risk.
7. **AI assist (optional/feature flag)** - extract a trip brief, suggest an itinerary outline, summarize the timeline, and draft a follow-up. A human approves every write or external message.
8. **Agency benchmarking** - only after enough data and explicit consent; compare response time, conversion, margin, and on-time confirmations anonymously.

## 11. Delivery plan

### Phase 0 - foundation

Confirm agency terminology, roles, currencies, branches, document branding, and the existing auth/hosting target. Create Supabase migrations, seed data, API auth guard, and design tokens.

### Phase 1 - sellable MVP

Command center, contacts, leads, trip workspace, itinerary, quote versions and pricing, customer share link/PDF, tasks/activity, basic memberships, and responsive UI.

### Phase 2 - operate and collect

Service catalog, suppliers, booking status, supplier links, vouchers, operations calendar, payment plan, receipts, customer/supplier ledgers, and margin report.

### Phase 3 - scale

Channel adapters, workflow rules builder, portals, integrations, advanced analytics, automation, and optional AI assist.

Definition of done for Phase 1:

- A new staff member can create a lead, qualify it, build a 3-day quote, share a branded link, revise it, mark it accepted, and see the resulting trip in under 10 minutes of guided use.
- Two roles cannot access each other’s organization records.
- A quote total and margin can be reproduced from stored line items.
- Every critical change appears in activity history.
- The same journey works at mobile width without losing data or actions.

## 12. Confirmed initial scope

The first release decisions are now fixed:

1. **Customer:** a travel agency that plans and operates customer trips.
2. **Lead channels:** all planned intake paths are in scope - manual entry, web form/API, email, WhatsApp, and Meta lead imports. Adapters can be phased in, but the data model supports them from day one.
3. **Money:** INR is the default currency and tax is 5%. Keep the tax rate configurable for future changes, but seed the organization with 5%.
4. **Login:** collect name, email, and phone with no OTP for this internal MVP. This is a trusted-login mode and must be replaced with verified Supabase Auth before external/production use because unverified identifiers can be impersonated.
5. **Payments:** track customer and supplier payments, receipts, due dates, and balances. Do not collect payments through a gateway yet.
6. **Brand:** Japs_CRM.
7. **API:** FastAPI is the backend API. It owns auth/session checks, organization scoping, pricing rules, and Supabase access.

Default implementation assumptions: one organization and one primary branch initially; customer-facing share links are expiring no-login links; payments are manually logged; the first API adapters can run in demo mode until channel credentials are supplied.
