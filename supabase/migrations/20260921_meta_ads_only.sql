-- Ads-only intake. No customer, message, trip or financial record is deleted.
begin;
alter table public.leads add column intake_campaign_id text;
alter table public.leads add column intake_phone text;
alter table public.leads add column intake_archive_reason text;
create unique index leads_campaign_phone_unique on public.leads(organization_id,intake_campaign_id,intake_phone)
  where intake_campaign_id is not null and intake_phone is not null;
alter table public.whatsapp_messages add column sender_phone text;
alter table public.whatsapp_messages add column profile_name text;
alter table public.whatsapp_messages add column disposition text not null default 'legacy';

-- Immutable pre-change snapshots permit administrative recovery without losing staff work.
create table public.crm_intake_repair_journal (
  organization_id uuid not null references public.organizations(id),
  table_name text not null, record_key text not null, previous_row jsonb not null,
  recorded_at timestamptz not null default now(), primary key(organization_id,table_name,record_key)
);
alter table public.crm_intake_repair_journal enable row level security;
revoke all on public.crm_intake_repair_journal from public,anon,authenticated;
grant all on public.crm_intake_repair_journal to service_role;
insert into public.crm_intake_repair_journal select organization_id,'leads',id::text,to_jsonb(l),now() from public.leads l;
insert into public.crm_intake_repair_journal select organization_id,'whatsapp_messages',id::text,to_jsonb(m),now() from public.whatsapp_messages m;
insert into public.crm_intake_repair_journal select organization_id,'whatsapp_contact_links',phone_number_id||':'||sender_id,to_jsonb(w),now() from public.whatsapp_contact_links w;

alter table public.leads drop constraint leads_status_check;
update public.leads set status=case status when 'Qualified' then 'Requirement_Captured' when 'Discovery' then 'Requirement_Captured'
  when 'Proposal' then 'Quotation Sent' when 'Negotiation' then 'Payment / Negotiation' when 'Nurture' then 'Travel Later' else status end;
alter table public.leads add constraint leads_status_check check(status in
  ('Inbox','Requirement_Captured','Travel Later','Quotation Sent','Call Later','Follow_Up','Won','Payment / Negotiation','No_Response','Lost'));

-- Recover only phone identifiers actually supplied by Meta, never staff-editable contact.phone.
update public.whatsapp_messages m set sender_phone=case when sender_id ~ '^[0-9]{7,15}$' then '+'||sender_id else
  (select substring(a.alias from 7) from public.whatsapp_sender_aliases a where a.organization_id=m.organization_id
    and a.phone_number_id=m.phone_number_id and a.sender_id=m.sender_id and a.alias ~ '^phone:\+[0-9]{7,15}$' limit 1) end;
update public.whatsapp_messages set disposition=case when error_code is not null then 'error'
  when referral->>'source_type'='ad' and referral->>'source_id' ~ '^[0-9]{5,30}$' then 'pending' else 'organic' end;
-- Archive only webhook-generated leads. Valid ad records are restored by reconciliation below.
update public.leads set deleted_at=now(),intake_archive_reason='ads_only_reconciliation'
  where deleted_at is null and code like 'WA-%' and source in ('WhatsApp','Meta WhatsApp ad');
update public.leads set intake_archive_reason='previously_deleted'
  where deleted_at is not null and intake_archive_reason is null and code like 'WA-%' and source in ('WhatsApp','Meta WhatsApp ad');

create function public.crm_reconcile_ad_messages(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  msg record; target public.leads; link public.whatsapp_contact_links; contact_uuid uuid;
  promoted integer := 0;
begin
  -- Shared lock order for webhook receipt, enrichment and cross-business-number deduplication.
  perform pg_advisory_xact_lock(hashtextextended('wa-org:'||p_organization_id::text,0));
  for msg in select m.*,a.campaign_id from public.whatsapp_messages m
    join public.meta_ad_attribution a on a.organization_id=m.organization_id and a.ad_id=m.referral->>'source_id'
    where m.organization_id=p_organization_id and m.error_code is null
      and m.referral->>'source_type'='ad' and m.referral->>'source_id' ~ '^[0-9]{5,30}$'
      and m.sender_phone ~ '^\+[0-9]{7,15}$' and a.enrichment_status='ready' and a.campaign_id ~ '^[0-9]{5,30}$'
      and m.disposition <> 'linked_ad'
    order by m.sent_at,m.id
  loop
    select * into target from public.leads where organization_id=p_organization_id
      and intake_campaign_id=msg.campaign_id and intake_phone=msg.sender_phone;
    if not found then
      -- Reuse an original record once during repair, preserving notes, owner, travel details and status.
      select * into target from public.leads where id=msg.lead_id and organization_id=p_organization_id
        and intake_campaign_id is null and intake_archive_reason in ('ads_only_reconciliation','duplicate_or_pending_ad','previously_deleted');
      if found then
        update public.leads set intake_campaign_id=msg.campaign_id,intake_phone=msg.sender_phone,
          deleted_at=case when intake_archive_reason='previously_deleted' then deleted_at else null end,
          intake_archive_reason=case when intake_archive_reason='previously_deleted' then intake_archive_reason else null end,
          source='Meta WhatsApp ad',originating_ad_id=msg.referral->>'source_id',
          first_message=msg.message_text,first_message_at=msg.sent_at,last_message_at=msg.sent_at
          where id=target.id returning * into target;
      else
        select contact_id into contact_uuid from public.leads where organization_id=p_organization_id
          and intake_phone=msg.sender_phone order by created_at,id limit 1;
        if contact_uuid is null then
          select contact_id into contact_uuid from public.whatsapp_contact_links where organization_id=p_organization_id
            and phone_number_id=msg.phone_number_id and sender_id=msg.sender_id;
        end if;
        if contact_uuid is null then
          insert into public.contacts(organization_id,name,phone,type) values(p_organization_id,
            coalesce(nullif(trim(msg.profile_name),''),'WhatsApp enquiry'),msg.sender_phone,'Customer') returning id into contact_uuid;
        end if;
        insert into public.leads(organization_id,code,contact_id,source,status,originating_ad_id,first_message,first_message_at,
          last_message_at,next_action,intake_campaign_id,intake_phone,created_at,deleted_at)
          values(p_organization_id,'WA-'||upper(replace(gen_random_uuid()::text,'-','')),contact_uuid,'Meta WhatsApp ad','Inbox',
          msg.referral->>'source_id',msg.message_text,msg.sent_at,msg.sent_at,'Review Meta ad enquiry',msg.campaign_id,msg.sender_phone,msg.received_at,
          (select (j.previous_row->>'deleted_at')::timestamptz from public.crm_intake_repair_journal j
            where j.organization_id=p_organization_id and j.table_name='leads' and j.record_key=msg.lead_id::text))
          returning * into target;
      end if;
    end if;
    -- Deleted leads retain their immutable key; incoming messages never resurrect a staff-deleted record.
    update public.leads set last_message_at=greatest(last_message_at,msg.sent_at),
      first_message=case when msg.sent_at<first_message_at then msg.message_text else first_message end,
      originating_ad_id=case when msg.sent_at<first_message_at then msg.referral->>'source_id' else originating_ad_id end,
      first_message_at=least(first_message_at,msg.sent_at),updated_at=now() where id=target.id;
    update public.contacts set name=case when name='WhatsApp enquiry' then coalesce(nullif(trim(msg.profile_name),''),name) else name end,
      phone=coalesce(phone,msg.sender_phone) where id=target.contact_id and organization_id=p_organization_id;
    update public.whatsapp_messages set lead_id=target.id,contact_id=target.contact_id,disposition='linked_ad' where id=msg.id;
    insert into public.whatsapp_contact_links(organization_id,phone_number_id,sender_id,contact_id,active_lead_id)
      values(p_organization_id,msg.phone_number_id,msg.sender_id,target.contact_id,target.id)
      on conflict(organization_id,phone_number_id,sender_id) do update set active_lead_id=excluded.active_lead_id;
    promoted:=promoted+1;
  end loop;
  -- Follow-ups attach by event-time context, never delivery order; an earlier organic chat cannot become first touch.
  -- Ambiguous same-second ad touches are deliberately left unassigned.
  for msg in select m.*,case when exists(select 1 from public.whatsapp_messages other
        where other.organization_id=m.organization_id and other.phone_number_id=m.phone_number_id and other.sender_id=m.sender_id
          and other.referral->>'source_type'='ad' and other.error_code is null and other.sent_at=context.sent_at
          and (case when other.disposition='linked_ad' then other.lead_id else null end) is distinct from context.lead_id)
        then null else context.lead_id end as context_lead from public.whatsapp_messages m
    left join lateral (select case when a.disposition='linked_ad' then a.lead_id else null end as lead_id,a.sent_at from public.whatsapp_messages a
      where a.organization_id=m.organization_id and a.phone_number_id=m.phone_number_id and a.sender_id=m.sender_id
        and a.referral->>'source_type'='ad' and a.error_code is null and a.sent_at<=m.sent_at
      order by a.sent_at desc,a.id desc limit 1) context on true
    where m.organization_id=p_organization_id and m.error_code is null and coalesce(m.referral->>'source_type','')<>'ad'
  loop
    select * into target from public.leads where id=msg.context_lead and intake_campaign_id is not null;
    if found then
      update public.whatsapp_messages set lead_id=target.id,contact_id=target.contact_id,disposition='linked_followup' where id=msg.id
        and (lead_id is distinct from target.id or disposition<>'linked_followup');
    else
      update public.whatsapp_messages set lead_id=null,disposition='unassigned_followup' where id=msg.id
        and (lead_id is not null or disposition<>'unassigned_followup');
    end if;
  end loop;
  update public.leads l set last_message_at=latest.sent_at,updated_at=now() from
    (select lead_id,max(sent_at) as sent_at from public.whatsapp_messages where organization_id=p_organization_id
      and error_code is null and lead_id is not null group by lead_id) latest
    where l.id=latest.lead_id and l.organization_id=p_organization_id and l.intake_campaign_id is not null
      and l.last_message_at is distinct from latest.sent_at;
  return jsonb_build_object('promoted',promoted);
end $$;
revoke all on function public.crm_reconcile_ad_messages(uuid) from public,anon,authenticated;
grant execute on function public.crm_reconcile_ad_messages(uuid) to service_role;

-- Replace the identity wrapper and obsolete intake body together. Alias continuity is retained for pending ad events.
create or replace function public.crm_ingest_whatsapp_message(p_message jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  connection public.whatsapp_connections; aliases text[]:=array[]::text[]; candidates text[]; canonical text;
  phone text:=nullif(p_message->>'phone',''); bsuid text:=p_message->>'user_id'; existing public.whatsapp_messages;
  ref jsonb:=coalesce(p_message->'referral','{}'::jsonb); ad text; sent_time timestamptz; is_duplicate boolean:=false;
begin
  select * into connection from public.whatsapp_connections where phone_number_id=p_message->>'phone_number_id'
    and waba_id=p_message->>'waba_id' and active;
  if not found then return jsonb_build_object('accepted',false,'reason','unconfigured_account'); end if;
  if coalesce(length(p_message->>'message_id'),0)=0 or coalesce(length(p_message->>'sender_id'),0)=0 then raise exception 'Message identity required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wa-org:'||connection.organization_id::text,0));
  if phone ~ '^\+[0-9]{7,15}$' then aliases:=array_append(aliases,'phone:'||phone); else phone:=null; end if;
  if bsuid ~ '^[A-Z]{2}\.[A-Za-z0-9]{1,128}$' then aliases:=array_append(aliases,'bsuid:'||bsuid); end if;
  select array_agg(distinct sender_id) into candidates from (
    select a.sender_id from public.whatsapp_sender_aliases a where a.organization_id=connection.organization_id
      and a.phone_number_id=connection.phone_number_id and a.alias=any(aliases)
    union select l.sender_id from public.whatsapp_contact_links l where l.organization_id=connection.organization_id
      and l.phone_number_id=connection.phone_number_id and l.sender_id in(p_message->>'sender_id','bsuid:'||bsuid)
  ) known;
  if cardinality(candidates)>1 then raise exception 'WhatsApp identity reconciliation required'; end if;
  canonical:=coalesce(candidates[1],p_message->>'sender_id');
  -- Retain minimal signed identity association even when ordinary chat content is discarded.
  insert into public.whatsapp_sender_aliases(organization_id,phone_number_id,alias,sender_id)
    select connection.organization_id,connection.phone_number_id,unnest(aliases),canonical on conflict do nothing;
  if ref->>'source_type'='ad' and ref->>'source_id' ~ '^[0-9]{5,30}$' then ad:=ref->>'source_id'; end if;
  if (p_message->>'timestamp') ~ '^[0-9]{1,11}$' then sent_time:=to_timestamp((p_message->>'timestamp')::double precision); end if;
  sent_time:=coalesce(sent_time,now());
  select * into existing from public.whatsapp_messages where organization_id=connection.organization_id
    and phone_number_id=connection.phone_number_id and message_id=p_message->>'message_id';
  is_duplicate:=found;
  -- Do not persist unsolicited organic conversations, even when an old organic contact link exists.
  if ad is null and not is_duplicate and not exists(select 1 from public.whatsapp_messages m where m.organization_id=connection.organization_id
    and m.phone_number_id=connection.phone_number_id and m.sender_id=canonical and m.referral->>'source_type'='ad'
    and m.referral->>'source_id' ~ '^[0-9]{5,30}$' and m.error_code is null) then
    return jsonb_build_object('accepted',true,'ignored',true,'reason','not_an_ad_enquiry');
  end if;
  if phone is null then select substring(alias from 7) into phone from public.whatsapp_sender_aliases
    where organization_id=connection.organization_id and phone_number_id=connection.phone_number_id and sender_id=canonical
      and alias ~ '^phone:\+[0-9]{7,15}$' limit 1; end if;
  update public.whatsapp_messages set sender_phone=phone where organization_id=connection.organization_id
    and phone_number_id=connection.phone_number_id and sender_id=canonical and sender_phone is null and phone is not null;
  if is_duplicate then
    -- Fill missing evidence on a redelivery but never change an already identified ad.
    update public.whatsapp_messages set referral=case when coalesce(referral->>'source_type','')<>'ad' and ad is not null then ref else referral end,
      disposition=case when coalesce(referral->>'source_type','')<>'ad' and ad is not null then 'pending' else disposition end,
      sender_phone=coalesce(sender_phone,phone),profile_name=coalesce(profile_name,p_message->>'profile_name') where id=existing.id;
  else
    insert into public.whatsapp_messages(organization_id,phone_number_id,message_id,sender_id,sender_phone,profile_name,
      message_type,message_text,referral,error_code,sent_at,disposition)
      values(connection.organization_id,connection.phone_number_id,p_message->>'message_id',canonical,phone,p_message->>'profile_name',
        p_message->>'message_type',p_message->>'message_text',ref,nullif(p_message->>'error_code',''),sent_time,
        case when nullif(p_message->>'error_code','') is not null then 'error' when ad is not null then 'pending' else 'followup' end)
      returning * into existing;
  end if;
  if ad is not null then insert into public.meta_ad_attribution(organization_id,ad_id) values(connection.organization_id,ad) on conflict do nothing; end if;
  perform public.crm_reconcile_ad_messages(connection.organization_id);
  update public.whatsapp_connections set last_message_at=now() where phone_number_id=connection.phone_number_id;
  select * into existing from public.whatsapp_messages where id=existing.id;
  return jsonb_build_object('accepted',true,'duplicate',is_duplicate,'organization_id',connection.organization_id,
    'lead_id',existing.lead_id,'pending',existing.lead_id is null);
end $$;
revoke all on function public.crm_ingest_whatsapp_message(jsonb) from public,anon,authenticated;
grant execute on function public.crm_ingest_whatsapp_message(jsonb) to service_role;
-- The old body is no longer reachable, including by the service role.
revoke all on function public.crm_ingest_whatsapp_message_v1(jsonb) from public,anon,authenticated,service_role;

do $$ declare org record; begin
  for org in select distinct organization_id from public.whatsapp_messages loop
    perform public.crm_reconcile_ad_messages(org.organization_id);
  end loop;
end $$;
update public.leads l set intake_archive_reason=case when exists(select 1 from public.crm_intake_repair_journal j
  where j.organization_id=l.organization_id and j.table_name='whatsapp_messages' and j.previous_row->>'lead_id'=l.id::text
    and j.previous_row->'referral'->>'source_type'='ad') then 'duplicate_or_pending_ad' else 'ordinary_whatsapp_chat' end
  where intake_archive_reason='ads_only_reconciliation';
notify pgrst,'reload schema';
commit;
