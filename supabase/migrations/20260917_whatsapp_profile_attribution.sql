-- Follow-up migration; the previously applied integration migration is unchanged.
-- Keep advertised destination in ad mappings, separate from customer preference.
begin;
create or replace function public.crm_ingest_whatsapp_message(p_message jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  connection public.whatsapp_connections;
  link public.whatsapp_contact_links;
  existing_message public.whatsapp_messages;
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
      -- A later webhook may include the sender's display name. Never replace
      -- a name already entered by staff or previously supplied by the sender.
      update public.contacts set name = trim(p_message->>'profile_name')
      where id = contact_uuid and organization_id = connection.organization_id
        and name = 'WhatsApp enquiry' and nullif(trim(p_message->>'profile_name'),'') is not null;
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
    end if;
    if lead_uuid is null then
      lead_uuid := gen_random_uuid();
      insert into public.leads(id, organization_id, code, contact_id, source, status, destination, travelers, originating_ad_id, first_message, first_message_at, last_message_at, next_action)
      values (lead_uuid, connection.organization_id, 'WA-' || upper(replace(lead_uuid::text,'-','')), contact_uuid,
        case when ad is not null then 'Meta WhatsApp ad' else 'WhatsApp' end, 'Inbox', null, null, ad,
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
notify pgrst, 'reload schema';
commit;

