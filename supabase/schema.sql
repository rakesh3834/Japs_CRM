-- Japs_CRM initial Supabase schema.
-- Run in Supabase SQL Editor after creating the project. All business rows are
-- organization-scoped so the FastAPI layer and RLS enforce tenant isolation.

create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_name text not null default 'Japs_CRM',
  default_currency text not null default 'INR',
  tax_rate numeric(5,2) not null default 5.00 check (tax_rate >= 0 and tax_rate <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into organizations (id, name, brand_name, default_currency, tax_rate)
values ('00000000-0000-4000-8000-000000000001', 'Japs Travels', 'Japs_CRM', 'INR', 5.00)
on conflict (id) do update set brand_name = excluded.brand_name, default_currency = excluded.default_currency, tax_rate = excluded.tax_rate;

create table if not exists profiles (
  id uuid primary key,
  name text not null,
  email text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'Sales' check (role in ('Owner','Admin','Sales','Operations','Finance','Supplier coordinator','Read-only')),
  branch text,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  type text not null default 'Customer' check (type in ('Customer','Traveler','Agency partner')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text,
  contact_id uuid references contacts(id),
  source text not null default 'Manual',
  status text not null default 'Inbox' check (status in ('Inbox','Qualified','Discovery','Proposal','Negotiation','Won','Lost','Nurture')),
  owner_id uuid references profiles(id),
  destination text,
  start_date date,
  end_date date,
  travelers int not null default 2 check (travelers > 0),
  budget_minor bigint,
  notes text,
  next_action text,
  next_action_at timestamptz,
  lost_reason text,
  nurture_review_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, code)
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid references leads(id),
  primary_contact_id uuid references contacts(id),
  code text not null,
  stage text not null default 'Plan' check (stage in ('Lead','Plan','Quote','Confirm','Operate','Close')),
  health text not null default 'On track' check (health in ('Ready','On track','At risk','Closed')),
  destination text not null,
  start_date date,
  end_date date,
  travelers int not null default 2 check (travelers > 0),
  total_minor bigint not null default 0,
  customer_due_minor bigint not null default 0,
  progress int not null default 0 check (progress >= 0 and progress <= 100),
  services_summary text not null default 'Services pending',
  owner_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, code)
);

create table if not exists trip_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  day_number int not null check (day_number > 0),
  date date,
  title text,
  notes text,
  unique (trip_id, day_number)
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  capabilities text[] not null default '{}',
  rating numeric(3,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists service_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  supplier_id uuid references suppliers(id),
  type text not null check (type in ('Hotel','Transfer','Activity','Meal','Guide','Ticket','Ferry','Insurance','Custom')),
  name text not null,
  destination text,
  cost_minor bigint not null default 0 check (cost_minor >= 0),
  sell_minor bigint not null default 0 check (sell_minor >= 0),
  currency text not null default 'INR',
  tax_rate numeric(5,2) not null default 5.00,
  cancellation_policy text,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists trip_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  trip_day_id uuid references trip_days(id),
  supplier_id uuid references suppliers(id),
  catalog_service_id uuid references service_catalog(id),
  type text not null,
  name text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  cost_minor bigint not null default 0 check (cost_minor >= 0),
  sell_minor bigint not null default 0 check (sell_minor >= 0),
  tax_rate numeric(5,2) not null default 5.00,
  currency text not null default 'INR',
  status text not null default 'Needs supplier' check (status in ('Needs supplier','Requested','Option held','Confirmed','Voucher sent','Cancelled','Issue')),
  confirmation_due_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quote_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  version_number int not null,
  status text not null default 'Draft' check (status in ('Draft','Shared','Viewed','Accepted','Declined','Expired')),
  currency text not null default 'INR',
  subtotal_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  tax_minor bigint not null default 0,
  fee_minor bigint not null default 0,
  total_minor bigint not null default 0,
  cost_minor bigint not null default 0,
  profit_minor bigint not null default 0,
  margin_percent numeric(8,3) not null default 0,
  shared_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trip_id, version_number)
);

create table if not exists quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_version_id uuid not null references quote_versions(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  service_snapshot jsonb not null,
  quantity numeric(12,2) not null default 1,
  cost_minor bigint not null default 0,
  sell_minor bigint not null default 0,
  tax_rate numeric(5,2) not null default 5.00,
  sort_order int not null default 0
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  trip_service_id uuid references trip_services(id),
  confirmation_code text,
  status text not null default 'Needs supplier',
  voucher_document_id uuid,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  currency text not null default 'INR',
  total_minor bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  payment_plan_id uuid references payment_plans(id),
  direction text not null check (direction in ('in','out')),
  title text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'INR',
  due_date date,
  paid_at timestamptz,
  method text,
  reference text,
  status text not null default 'Scheduled' check (status in ('Scheduled','Due soon','Overdue','Paid','Logged','Cancelled')),
  receipt_document_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid references leads(id),
  trip_id uuid references trips(id),
  trip_service_id uuid references trip_services(id),
  assignee_id uuid references profiles(id),
  title text not null,
  type text not null default 'Follow-up',
  status text not null default 'Open' check (status in ('Open','In progress','Blocked','Done','Cancelled')),
  priority text not null default 'Medium' check (priority in ('Urgent','High','Medium','Low')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  kind text not null,
  storage_path text not null,
  visibility text not null default 'internal' check (visibility in ('internal','customer','supplier')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists activity_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  actor_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists leads_org_status_idx on leads(organization_id, status);
create index if not exists leads_org_next_action_idx on leads(organization_id, next_action_at);
create index if not exists trips_org_stage_idx on trips(organization_id, stage);
create index if not exists services_org_status_idx on trip_services(organization_id, status);
create index if not exists payments_org_due_idx on payments(organization_id, due_date);
create index if not exists activity_org_created_idx on activity_events(organization_id, created_at desc);

-- RLS is still enabled even though FastAPI uses the service role (which bypasses
-- RLS). This prevents accidental exposure if a browser client is added later.
create or replace function public.is_japs_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org and m.profile_id = auth.uid()
  );
$$;

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table organization_memberships enable row level security;
alter table contacts enable row level security;
alter table leads enable row level security;
alter table trips enable row level security;
alter table trip_days enable row level security;
alter table suppliers enable row level security;
alter table service_catalog enable row level security;
alter table trip_services enable row level security;
alter table quote_versions enable row level security;
alter table quote_items enable row level security;
alter table bookings enable row level security;
alter table payment_plans enable row level security;
alter table payments enable row level security;
alter table tasks enable row level security;
alter table documents enable row level security;
alter table activity_events enable row level security;

drop policy if exists japs_org_select on organizations;
create policy japs_org_select on organizations for select using (public.is_japs_org_member(id));
drop policy if exists japs_profile_self on profiles;
create policy japs_profile_self on profiles for all using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists japs_membership_org on organization_memberships;
create policy japs_membership_org on organization_memberships for select using (public.is_japs_org_member(organization_id) or profile_id = auth.uid());

-- All remaining business tables use the same organization boundary.
drop policy if exists japs_contacts_org on contacts;
create policy japs_contacts_org on contacts for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_leads_org on leads;
create policy japs_leads_org on leads for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_trips_org on trips;
create policy japs_trips_org on trips for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_trip_days_org on trip_days;
create policy japs_trip_days_org on trip_days for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_suppliers_org on suppliers;
create policy japs_suppliers_org on suppliers for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_catalog_org on service_catalog;
create policy japs_catalog_org on service_catalog for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_services_org on trip_services;
create policy japs_services_org on trip_services for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_quotes_org on quote_versions;
create policy japs_quotes_org on quote_versions for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_quote_items_org on quote_items;
create policy japs_quote_items_org on quote_items for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_bookings_org on bookings;
create policy japs_bookings_org on bookings for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_payment_plans_org on payment_plans;
create policy japs_payment_plans_org on payment_plans for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_payments_org on payments;
create policy japs_payments_org on payments for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_tasks_org on tasks;
create policy japs_tasks_org on tasks for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));
drop policy if exists japs_documents_org on documents;
create policy japs_documents_org on documents for all using (public.is_japs_org_member(organization_id)) with check (public.is_japs_org_member(organization_id));

drop policy if exists japs_activity_read on activity_events;
create policy japs_activity_read on activity_events for select using (public.is_japs_org_member(organization_id));
drop policy if exists japs_activity_append on activity_events;
create policy japs_activity_append on activity_events for insert with check (public.is_japs_org_member(organization_id));
