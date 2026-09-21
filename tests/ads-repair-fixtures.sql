-- Seed historical mixed organic/ad intake under the OLD implementation.
insert into public.whatsapp_connections(organization_id,phone_number_id,waba_id,active)
 values('00000000-0000-4000-8000-000000000001','999998','999997',true);
insert into public.meta_ad_attribution(organization_id,ad_id,campaign_id,enrichment_status)
 values('00000000-0000-4000-8000-000000000001','77777777','77770000','ready');
do $$ declare msg jsonb; result jsonb; begin
 msg:='{"phone_number_id":"999998","waba_id":"999997","message_id":"repair-organic","sender_id":"919800000077","phone":"+919800000077","profile_name":"Reviewed guest","message_type":"text","message_text":"Ordinary first","timestamp":1789600000}';
 result:=public.crm_ingest_whatsapp_message(msg);
 perform public.crm_ingest_whatsapp_message(msg||'{"message_id":"repair-ad","message_text":"Actual ad first","timestamp":1789600010,"ad_id":"77777777","referral":{"source_type":"ad","source_id":"77777777"}}');
 update public.leads set status='Lost',notes='Keep reviewed note' where id=(result->>'lead_id')::uuid;
 perform public.crm_ingest_whatsapp_message(msg||'{"message_id":"repair-duplicate","timestamp":1789600020,"ad_id":"77777777","referral":{"source_type":"ad","source_id":"77777777"}}');
end $$;
insert into public.meta_ad_attribution(organization_id,ad_id,campaign_id,enrichment_status)
 values('00000000-0000-4000-8000-000000000001','88888888','88880000','ready');
do $$ declare msg jsonb; result jsonb; begin
 msg:='{"phone_number_id":"999998","waba_id":"999997","message_id":"deleted-first","sender_id":"919800000088","phone":"+919800000088","profile_name":"Deleted guest","message_type":"text","message_text":"Ad A","timestamp":1789600000,"ad_id":"77777777","referral":{"source_type":"ad","source_id":"77777777"}}';
 result:=public.crm_ingest_whatsapp_message(msg);
 perform public.crm_ingest_whatsapp_message(msg||'{"message_id":"deleted-second","timestamp":1789600020,"ad_id":"88888888","referral":{"source_type":"ad","source_id":"88888888"}}');
 update public.leads set deleted_at=now() where id=(result->>'lead_id')::uuid;
end $$;
