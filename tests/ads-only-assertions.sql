\set ON_ERROR_STOP on
begin;
do $$ begin
 assert (select count(*)=1 from public.leads where intake_campaign_id='77770000' and deleted_at is null), 'Repair did not deduplicate mixed-source history';
 assert (select notes='Keep reviewed note' and status='Lost' and first_message='Actual ad first' from public.leads where intake_campaign_id='77770000' and deleted_at is null), 'Repair lost reviewed data or ad first touch';
 assert (select count(distinct lead_id)=1 from public.whatsapp_messages where message_id in('repair-ad','repair-duplicate')), 'Duplicate history not relinked';
 assert (select lead_id is null from public.whatsapp_messages where message_id='repair-organic'), 'Earlier organic message attributed to later ad';
 assert (select count(*)=2 and bool_and(deleted_at is not null) from public.leads where intake_phone='+919800000088'), 'Repair resurrected part of a deleted multi-campaign enquiry';
end $$;
insert into public.whatsapp_connections(organization_id,phone_number_id,waba_id,active) values
 ('00000000-0000-4000-8000-000000000001','987654','123456',true),
 ('00000000-0000-4000-8000-000000000001','987655','123456',true);
insert into public.meta_ad_attribution(organization_id,ad_id,campaign_id,enrichment_status) values
 ('00000000-0000-4000-8000-000000000001','12345678','11111111','ready'),
 ('00000000-0000-4000-8000-000000000001','12345679','11111111','ready'),
 ('00000000-0000-4000-8000-000000000001','22345678','22222222','ready');
do $$ declare msg jsonb; result jsonb; first_lead uuid; other_lead uuid; before_count integer; begin
  select count(*) into before_count from public.leads;
  assert not has_function_privilege('authenticated','public.crm_reconcile_ad_messages(uuid)','execute');
  assert not has_table_privilege('authenticated','public.crm_intake_repair_journal','select');
  msg:='{"phone_number_id":"987654","waba_id":"123456","message_id":"organic-1","sender_id":"919800000001","phone":"+919800000001","profile_name":"Guest","message_type":"text","message_text":"Ordinary chat","timestamp":1789600000}';
  result:=public.crm_ingest_whatsapp_message(msg);
  assert result->>'ignored'='true';
  assert not exists(select 1 from public.whatsapp_messages where message_id='organic-1'), 'Organic content retained';
  assert (select count(*)=before_count from public.leads), 'Organic lead created';
  perform public.crm_ingest_whatsapp_message(msg||'{"message_id":"post-1","referral":{"source_type":"post","source_id":"12345678"},"ad_id":"12345678"}');
  assert (select count(*)=before_count from public.leads), 'Post or loose ad_id treated as proof';
  msg:=msg||'{"message_id":"ad-1","message_text":"Ad enquiry","referral":{"source_type":"ad","source_id":"12345678"},"user_id":"IN.ADS123"}';
  result:=public.crm_ingest_whatsapp_message(msg); first_lead:=(result->>'lead_id')::uuid;
  assert first_lead is not null;
  assert (public.crm_ingest_whatsapp_message(msg)->>'duplicate')='true';
  update public.leads set status='Won',notes='Staff review',destination='Custom trip' where id=first_lead;
  update public.contacts set phone='+919800009999',name='Staff name' where id=(select contact_id from public.leads where id=first_lead);
  result:=public.crm_ingest_whatsapp_message(msg||'{"message_id":"ad-2","timestamp":1789600020,"referral":{"source_type":"ad","source_id":"12345679"}}');
  assert (result->>'lead_id')::uuid=first_lead, 'Same campaign other ad duplicated';
  result:=public.crm_ingest_whatsapp_message(msg||'{"message_id":"cross-number","phone_number_id":"987655","timestamp":1789600021}');
  assert (result->>'lead_id')::uuid=first_lead, 'Business number incorrectly in dedup key';
  assert (select status='Won' and notes='Staff review' and destination='Custom trip' from public.leads where id=first_lead), 'Staff edits lost';
  result:=public.crm_ingest_whatsapp_message(msg||'{"message_id":"other-campaign","timestamp":1789600040,"referral":{"source_type":"ad","source_id":"22345678"}}');
  other_lead:=(result->>'lead_id')::uuid;
  assert other_lead<>first_lead, 'Different campaigns combined';
  result:=public.crm_ingest_whatsapp_message(msg||'{"message_id":"late-followup","timestamp":1789600030,"referral":{},"phone":null,"sender_id":"bsuid:IN.ADS123"}');
  assert (result->>'lead_id')::uuid=first_lead, 'Delivery order replaced event time context';
  result:=public.crm_ingest_whatsapp_message(msg||'{"message_id":"followup","timestamp":1789600050,"referral":{}}');
  assert (result->>'lead_id')::uuid=other_lead;
  result:=public.crm_ingest_whatsapp_message(msg||'{"message_id":"earlier-organic","timestamp":1789590000,"referral":{}}');
  assert result->>'lead_id' is null;
  assert (select first_message='Ad enquiry' and first_message_at=to_timestamp(1789600000) from public.leads where id=first_lead), 'Earlier organic replaced ad first touch';
  -- A late same-second ad touch makes a previous follow-up ambiguous, so undo that assignment.
  perform public.crm_ingest_whatsapp_message(msg||'{"message_id":"same-second-ad","timestamp":1789600040,"referral":{"source_type":"ad","source_id":"12345678"}}');
  assert (select lead_id is null from public.whatsapp_messages where message_id='followup'), 'Ambiguous follow-up stayed linked';
  assert (select last_message_at=to_timestamp(1789600040) from public.leads where id=other_lead), 'Old campaign last-message time was not repaired';
  result:=public.crm_ingest_whatsapp_message(msg||'{"message_id":"ad-error","sender_id":"919800000099","phone":"+919800000099","user_id":null,"error_code":"131060"}');
  assert result->>'lead_id' is null, 'Error generated lead';
  result:=public.crm_ingest_whatsapp_message(msg||'{"message_id":"wrong-waba","waba_id":"000000"}');
  assert result->>'accepted'='false';
end $$;
do $$ declare msg jsonb; result jsonb; promoted uuid; begin
  msg:='{"phone_number_id":"987654","waba_id":"123456","message_id":"pending-ad","sender_id":"bsuid:IN.HIDDEN789","user_id":"IN.HIDDEN789","profile_name":"Username","message_type":"text","message_text":"Pending enquiry","timestamp":1789600000,"referral":{"source_type":"ad","source_id":"33333333"}}';
  result:=public.crm_ingest_whatsapp_message(msg);
  assert result->>'lead_id' is null and result->>'pending'='true';
  update public.meta_ad_attribution set campaign_id='33333300',enrichment_status='ready' where ad_id='33333333';
  perform public.crm_reconcile_ad_messages('00000000-0000-4000-8000-000000000001');
  assert not exists(select 1 from public.leads where intake_campaign_id='33333300'), 'Hidden phone invented';
  result:=public.crm_ingest_whatsapp_message(msg||'{"message_id":"phone-association","sender_id":"919800000003","phone":"+919800000003","referral":{},"timestamp":1789600010}');
  promoted:=(result->>'lead_id')::uuid;
  assert promoted is not null;
  assert (select intake_phone='+919800000003' and first_message='Pending enquiry' from public.leads where id=promoted);
  assert (select count(*)=1 from public.leads where intake_campaign_id='33333300');
  perform public.crm_reconcile_ad_messages('00000000-0000-4000-8000-000000000001');
  assert (select count(*)=1 from public.leads where intake_campaign_id='33333300'), 'Reconciliation non-idempotent';
  update public.leads set status='Lost' where id=promoted;
  result:=public.crm_ingest_whatsapp_message(msg||'{"message_id":"lost-revisit","sender_id":"919800000003","phone":"+919800000003","timestamp":1789600015}');
  assert (result->>'lead_id')::uuid=promoted;
  assert (select status='Lost' from public.leads where id=promoted);
end $$;
rollback;
\echo Ads-only assertions passed
