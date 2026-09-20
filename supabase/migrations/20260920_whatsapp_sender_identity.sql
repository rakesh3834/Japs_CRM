-- Keep phone/BSUID continuity using identifiers co-present in signed Meta events.
-- Append-only migration: existing contacts, messages and leads are preserved.
begin;
create table public.whatsapp_sender_aliases (
  organization_id uuid not null references public.organizations(id),
  phone_number_id text not null,
  alias text not null,
  sender_id text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, phone_number_id, alias)
);
alter table public.whatsapp_sender_aliases enable row level security;
revoke all on public.whatsapp_sender_aliases from public, anon, authenticated;
grant all on public.whatsapp_sender_aliases to service_role;

alter function public.crm_ingest_whatsapp_message(jsonb) rename to crm_ingest_whatsapp_message_v1;
revoke all on function public.crm_ingest_whatsapp_message_v1(jsonb) from public, anon, authenticated, service_role;

create function public.crm_ingest_whatsapp_message(p_message jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  connection public.whatsapp_connections;
  aliases text[] := array[]::text[];
  candidates text[];
  canonical text;
  result jsonb;
  bsuid text := p_message->>'user_id';
  sender_phone text := nullif(p_message->>'phone','');
begin
  select * into connection from public.whatsapp_connections
    where phone_number_id = p_message->>'phone_number_id' and waba_id = p_message->>'waba_id' and active;
  if not found then return jsonb_build_object('accepted', false, 'reason', 'unconfigured_account'); end if;
  -- Serializes identity association and intake for this business number.
  perform pg_advisory_xact_lock(hashtextextended('wa-identity:' || connection.organization_id::text || ':' || connection.phone_number_id, 0));
  if sender_phone ~ '^\+[0-9]{7,15}$' then aliases := array_append(aliases, 'phone:' || sender_phone); end if;
  if bsuid ~ '^[A-Z]{2}\.[A-Za-z0-9]{1,128}$' then aliases := array_append(aliases, 'bsuid:' || bsuid); end if;
  select array_agg(distinct sender_id) into candidates from (
    select a.sender_id from public.whatsapp_sender_aliases a
      where a.organization_id = connection.organization_id and a.phone_number_id = connection.phone_number_id and a.alias = any(aliases)
    union
    select l.sender_id from public.whatsapp_contact_links l
      where l.organization_id = connection.organization_id and l.phone_number_id = connection.phone_number_id
        and l.sender_id in (p_message->>'sender_id', 'bsuid:' || bsuid)
  ) known;
  -- Never silently merge two previously independent customer records.
  if cardinality(candidates) > 1 then raise exception 'WhatsApp identity reconciliation required'; end if;
  canonical := coalesce(candidates[1], p_message->>'sender_id');
  result := public.crm_ingest_whatsapp_message_v1(jsonb_set(p_message, '{sender_id}', to_jsonb(canonical)));
  if result->>'lead_id' is not null then
    insert into public.whatsapp_sender_aliases(organization_id, phone_number_id, alias, sender_id)
      select connection.organization_id, connection.phone_number_id, unnest(aliases), canonical on conflict do nothing;
    -- Only fill an absent number, using the actual sender phone supplied by Meta.
    if sender_phone ~ '^\+[0-9]{7,15}$' then
      update public.contacts c set phone = sender_phone
      from public.whatsapp_contact_links l
      where l.organization_id = connection.organization_id and l.phone_number_id = connection.phone_number_id
        and l.sender_id = canonical and c.id = l.contact_id and c.organization_id = connection.organization_id and c.phone is null;
    end if;
  end if;
  return result;
end $$;
revoke all on function public.crm_ingest_whatsapp_message(jsonb) from public, anon, authenticated;
grant execute on function public.crm_ingest_whatsapp_message(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
