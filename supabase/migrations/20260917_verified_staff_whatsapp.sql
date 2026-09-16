-- Apply once in Supabase SQL Editor AFTER schema.sql. No records are deleted.
-- Existing self-created memberships do NOT authorize access. Approve staff in
-- crm_staff_access separately; old profile IDs and their business references stay.
begin;

create table if not exists public.crm_staff_access (
  organization_id uuid not null references public.organizations(id),
  email text not null check (email = lower(trim(email))),
  role text not null check (role in ('Owner','Admin','Sales','Operations','Finance','Supplier coordinator','Read-only')),
  active boolean not null default false,
  profile_id uuid references public.profiles(id),
  auth_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (organization_id, email),
  unique (organization_id, auth_user_id)
);
alter table public.crm_staff_access enable row level security;
revoke all on public.crm_staff_access from anon, authenticated;
grant all on public.crm_staff_access to service_role;

create or replace function public.crm_bind_verified_staff(p_auth_user_id uuid, p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  verified_email text;
  approved public.crm_staff_access;
  staff_profile public.profiles;
begin
  select lower(email) into verified_email from auth.users
  where id = p_auth_user_id and email_confirmed_at is not null;
  if verified_email is null then return null; end if;
  select * into approved from public.crm_staff_access
  where organization_id = p_organization_id and email = verified_email and active for update;
  if not found or (approved.auth_user_id is not null and approved.auth_user_id <> p_auth_user_id) then return null; end if;
  if approved.profile_id is null then
    insert into public.profiles(id, name, email, phone)
    values (gen_random_uuid(), split_part(verified_email, '@', 1), verified_email, '') returning * into staff_profile;
  else
    select * into staff_profile from public.profiles where id = approved.profile_id;
  end if;
  update public.crm_staff_access set auth_user_id = p_auth_user_id, profile_id = staff_profile.id
  where organization_id = p_organization_id and email = verified_email;
  insert into public.organization_memberships(organization_id, profile_id, role)
  values (p_organization_id, staff_profile.id, approved.role)
  on conflict (organization_id, profile_id) do update set role = excluded.role;
  return jsonb_build_object('id', staff_profile.id, 'name', staff_profile.name,
    'email', verified_email, 'phone', staff_profile.phone, 'role', approved.role, 'organization_id', p_organization_id);
end $$;
revoke all on function public.crm_bind_verified_staff(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_bind_verified_staff(uuid, uuid) to service_role;

create or replace function public.is_japs_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.crm_staff_access
    where organization_id = target_org and auth_user_id = auth.uid() and active);
$$;
-- Business writes go through the role-checked worker only. Authenticated browsers
-- cannot promote staff or bypass worker checks through the Supabase REST API.
do $$
declare item record;
begin
  for item in select * from (values
    ('contacts','japs_contacts_org'), ('leads','japs_leads_org'), ('trips','japs_trips_org'),
    ('trip_days','japs_trip_days_org'), ('suppliers','japs_suppliers_org'), ('service_catalog','japs_catalog_org'),
    ('trip_services','japs_services_org'), ('quote_versions','japs_quotes_org'), ('quote_items','japs_quote_items_org'),
    ('bookings','japs_bookings_org'), ('payment_plans','japs_payment_plans_org'), ('payments','japs_payments_org'),
    ('tasks','japs_tasks_org'), ('documents','japs_documents_org')
  ) as policies(table_name, policy_name) loop
    execute format('drop policy if exists %I on public.%I', item.policy_name, item.table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_japs_org_member(organization_id))', item.policy_name, item.table_name);
    execute format('revoke all on public.%I from anon, authenticated', item.table_name);
    execute format('grant select on public.%I to authenticated', item.table_name);
    execute format('grant all on public.%I to service_role', item.table_name);
  end loop;
end $$;
drop policy if exists japs_profile_self on public.profiles;
create policy japs_profile_self on public.profiles for select to authenticated using (
  exists(select 1 from public.organization_memberships m where m.profile_id = profiles.id and public.is_japs_org_member(m.organization_id))
);
drop policy if exists japs_membership_org on public.organization_memberships;
create policy japs_membership_org on public.organization_memberships for select to authenticated using (public.is_japs_org_member(organization_id));
drop policy if exists japs_activity_append on public.activity_events;
revoke all on public.profiles, public.organization_memberships, public.organizations, public.activity_events from anon, authenticated;
grant select on public.profiles, public.organization_memberships, public.organizations, public.activity_events to authenticated;
grant all on public.profiles, public.organization_memberships, public.organizations, public.activity_events to service_role;

create table if not exists public.whatsapp_connections (
  phone_number_id text primary key check (phone_number_id ~ '^[0-9]{5,30}$'),
  organization_id uuid not null references public.organizations(id),
  waba_id text not null check (waba_id ~ '^[0-9]{5,30}$'),
  display_phone_number text,
  active boolean not null default false,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.meta_ad_attribution (
  organization_id uuid not null references public.organizations(id), ad_id text not null,
  ad_name text, campaign_id text, campaign_name text, adset_id text, adset_name text,
  enrichment_status text not null default 'pending' check (enrichment_status in ('pending','needs_access','retry','ready')),
  last_error text, enriched_at timestamptz, last_attempt_at timestamptz, primary key (organization_id, ad_id)
);
create table if not exists public.meta_ad_mappings (
  organization_id uuid not null references public.organizations(id), ad_id text not null,
  offering_name text, destination text, event_reference text,
  primary key (organization_id, ad_id)
);
alter table public.leads alter column travelers drop not null;
alter table public.leads alter column travelers drop default;
alter table public.leads add column if not exists originating_ad_id text;
alter table public.leads add column if not exists first_message text;
alter table public.leads add column if not exists first_message_at timestamptz;
alter table public.leads add column if not exists last_message_at timestamptz;
-- source_platform is intentionally nullable: a multi-placement ad is NOT proof
-- of the platform on which this individual clicked.
alter table public.leads add column if not exists source_platform text;

create table if not exists public.whatsapp_contact_links (
  organization_id uuid not null references public.organizations(id),
  phone_number_id text not null references public.whatsapp_connections(phone_number_id),
  sender_id text not null, contact_id uuid not null references public.contacts(id),
  active_lead_id uuid references public.leads(id),
  primary key (organization_id, phone_number_id, sender_id)
);
create table if not exists public.whatsapp_messages (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  phone_number_id text not null references public.whatsapp_connections(phone_number_id),
  message_id text not null, sender_id text not null,
  contact_id uuid references public.contacts(id), lead_id uuid references public.leads(id),
  message_type text, message_text text, referral jsonb not null default '{}',
  error_code text, sent_at timestamptz, received_at timestamptz not null default now(),
  unique (organization_id, phone_number_id, message_id)
);
create index if not exists whatsapp_messages_recent on public.whatsapp_messages(organization_id, received_at desc);
create index if not exists leads_recent_message on public.leads(organization_id, last_message_at desc);
do $$
declare table_name text;
begin
  foreach table_name in array array['whatsapp_connections','meta_ad_attribution','meta_ad_mappings','whatsapp_contact_links','whatsapp_messages'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;
grant usage, select on sequence public.whatsapp_messages_id_seq to service_role;

create or replace function public.crm_ingest_whatsapp_message(p_message jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  connection public.whatsapp_connections;
  link public.whatsapp_contact_links;
  existing_message public.whatsapp_messages;
  mapped public.meta_ad_mappings;
  contact_uuid uuid;
  lead_uuid uuid;
  sent_time timestamptz;
  ad text := nullif(p_message->>'ad_id','');
  error_code text := nullif(p_message->>'error_code','');
begin
  select * into connection from public.whatsapp_connections
  where phone_number_id = p_message->>'phone_number_id' and waba_id = p_message->>'waba_id' and active;
  if not found then return jsonb_build_object('accepted', false, 'reason', 'unconfigured_account'); end if;
  if coalesce(length(p_message->>'message_id'),0) = 0 or coalesce(length(p_message->>'sender_id'),0) = 0 then
    raise exception 'Message identity required';
  end if;
  -- Serializes both redelivery and different simultaneous messages from one sender.
  perform pg_advisory_xact_lock(hashtextextended(connection.organization_id::text || ':' || connection.phone_number_id || ':' || (p_message->>'sender_id'), 0));
  select * into existing_message from public.whatsapp_messages where organization_id = connection.organization_id
    and phone_number_id = connection.phone_number_id and message_id = p_message->>'message_id';
  if found then return jsonb_build_object('accepted', true, 'duplicate', true, 'organization_id', connection.organization_id, 'lead_id', existing_message.lead_id); end if;
  if (p_message->>'timestamp') ~ '^[0-9]{1,11}$' then sent_time := to_timestamp((p_message->>'timestamp')::double precision); end if;
  sent_time := coalesce(sent_time, now());
  if error_code is null then
    select * into link from public.whatsapp_contact_links where organization_id = connection.organization_id
      and phone_number_id = connection.phone_number_id and sender_id = p_message->>'sender_id';
    if found then
      contact_uuid := link.contact_id;
      select id into lead_uuid from public.leads where id = link.active_lead_id and organization_id = connection.organization_id
        and deleted_at is null and status not in ('Won','Lost');
    else
      insert into public.contacts(organization_id, name, phone, type)
      values (connection.organization_id, coalesce(nullif(trim(p_message->>'profile_name'),''),'WhatsApp enquiry'), nullif(p_message->>'phone',''), 'Customer') returning id into contact_uuid;
      insert into public.whatsapp_contact_links(organization_id, phone_number_id, sender_id, contact_id)
      values (connection.organization_id, connection.phone_number_id, p_message->>'sender_id', contact_uuid);
    end if;
    if ad is not null then
      insert into public.meta_ad_attribution(organization_id,ad_id) values(connection.organization_id,ad) on conflict do nothing;
      select * into mapped from public.meta_ad_mappings where organization_id = connection.organization_id and ad_id = ad;
    end if;
    if lead_uuid is null then
      lead_uuid := gen_random_uuid();
      insert into public.leads(id, organization_id, code, contact_id, source, status, destination, travelers, originating_ad_id, first_message, first_message_at, last_message_at, next_action)
      values (lead_uuid, connection.organization_id, 'WA-' || upper(replace(lead_uuid::text,'-','')), contact_uuid,
        case when ad is not null then 'Meta WhatsApp ad' else 'WhatsApp' end, 'Inbox', mapped.destination, null, ad,
        p_message->>'message_text', sent_time, sent_time, 'Review WhatsApp enquiry');
      update public.whatsapp_contact_links set active_lead_id = lead_uuid where organization_id = connection.organization_id
        and phone_number_id = connection.phone_number_id and sender_id = p_message->>'sender_id';
    else
      -- Correct first-touch when delivery is out of order. Later referrals remain
      -- on their message and do not overwrite the first enquiry's attribution.
      update public.leads set last_message_at = greatest(last_message_at, sent_time), updated_at = now(),
        first_message = case when sent_time < first_message_at then p_message->>'message_text' else first_message end,
        originating_ad_id = case when sent_time < first_message_at then ad else originating_ad_id end,
        source = case when sent_time < first_message_at then case when ad is not null then 'Meta WhatsApp ad' else 'WhatsApp' end else source end,
        destination = case when sent_time < first_message_at and destination is null then mapped.destination else destination end,
        first_message_at = least(first_message_at, sent_time)
      where id = lead_uuid;
    end if;
  end if;
  insert into public.whatsapp_messages(organization_id, phone_number_id, message_id, sender_id, contact_id, lead_id, message_type, message_text, referral, error_code, sent_at)
  values(connection.organization_id, connection.phone_number_id, p_message->>'message_id', p_message->>'sender_id', contact_uuid, lead_uuid,
    p_message->>'message_type', p_message->>'message_text', coalesce(p_message->'referral','{}'::jsonb), error_code, sent_time);
  update public.whatsapp_connections set last_message_at = greatest(last_message_at, now()) where phone_number_id = connection.phone_number_id;
  return jsonb_build_object('accepted', true, 'duplicate', false, 'organization_id', connection.organization_id, 'lead_id', lead_uuid);
end $$;
revoke all on function public.crm_ingest_whatsapp_message(jsonb) from public, anon, authenticated;
grant execute on function public.crm_ingest_whatsapp_message(jsonb) to service_role;

create or replace view public.crm_lead_inbox with (security_invoker = true) as
select l.*, c.name as contact_name, c.phone as contact_phone, c.email as contact_email, p.name as owner_name,
  a.ad_name, a.campaign_id, a.campaign_name, a.adset_name, a.enrichment_status,
  m.offering_name, m.event_reference, m.destination as advertised_destination
from public.leads l left join public.contacts c on c.id = l.contact_id and c.organization_id = l.organization_id
left join public.profiles p on p.id = l.owner_id
left join public.meta_ad_attribution a on a.organization_id = l.organization_id and a.ad_id = l.originating_ad_id
left join public.meta_ad_mappings m on m.organization_id = l.organization_id and m.ad_id = l.originating_ad_id;
revoke all on public.crm_lead_inbox from anon, authenticated;
grant select on public.crm_lead_inbox to service_role;
notify pgrst, 'reload schema';
commit;
