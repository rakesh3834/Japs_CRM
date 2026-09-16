\set ON_ERROR_STOP on
begin;
insert into auth.users values ('10000000-0000-4000-8000-000000000001','approved@example.com', now()), ('10000000-0000-4000-8000-000000000002','outsider@example.com', now());
insert into public.crm_staff_access(organization_id,email,role,active) values ('00000000-0000-4000-8000-000000000001','approved@example.com','Read-only',true);
do $$ declare staff jsonb; begin
  staff := public.crm_bind_verified_staff('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
  assert staff->>'role' = 'Read-only', 'Server role must come from approved staff';
  assert public.crm_bind_verified_staff('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001') is null, 'Unapproved account bound';
  assert not has_function_privilege('anon','public.crm_ingest_whatsapp_message(jsonb)','execute'), 'Anon ingestion allowed';
  assert not has_function_privilege('authenticated','public.crm_bind_verified_staff(uuid,uuid)','execute'), 'Authenticated staff binding allowed';
  assert not has_table_privilege('authenticated','public.crm_staff_access','insert'), 'Staff promotion allowed';
  assert not has_table_privilege('authenticated','public.leads','insert'), 'Direct lead write allowed';
end $$;
insert into public.whatsapp_connections(organization_id,phone_number_id,waba_id,active) values ('00000000-0000-4000-8000-000000000001','987654','123456',true);
insert into public.meta_ad_mappings(organization_id,ad_id,offering_name,destination) values ('00000000-0000-4000-8000-000000000001','12345678','Manali package','Manali');
do $$ declare msg jsonb; result jsonb; lead_uuid uuid; begin
  msg := '{"phone_number_id":"987654","waba_id":"123456","message_id":"wamid.1","sender_id":"customer-1","phone":"+919999000001","profile_name":"Guest","message_type":"text","message_text":"Interested in Manali","timestamp":1789600000,"ad_id":"12345678","referral":{"source_id":"12345678","ctwa_clid":"click-test"}}';
  result := public.crm_ingest_whatsapp_message(msg); lead_uuid := (result->>'lead_id')::uuid;
  assert result->>'accepted' = 'true';
  assert (public.crm_ingest_whatsapp_message(msg)->>'duplicate') = 'true';
  assert (select count(*) = 1 from public.leads where source = 'Meta WhatsApp ad'), 'Duplicate lead';
  assert (select travelers is null and destination is null and source_platform is null from public.leads where id=lead_uuid), 'Invented customer details';
  assert (select advertised_destination = 'Manali' from public.crm_lead_inbox where id=lead_uuid), 'Advertised destination missing';
  assert (select enrichment_status = 'pending' from public.meta_ad_attribution where ad_id='12345678'), 'Retry row not durable';
  msg := msg || '{"message_id":"wamid.2","message_text":"Actually a custom Himachal trip","ad_id":"99999999"}';
  result := public.crm_ingest_whatsapp_message(msg);
  assert (result->>'lead_id')::uuid = lead_uuid, 'Follow-up created duplicate enquiry';
  assert (select originating_ad_id = '12345678' from public.leads where id=lead_uuid), 'Original attribution overwritten';
  assert (select count(*) = 2 from public.whatsapp_messages), 'Follow-up lost';
  result := public.crm_ingest_whatsapp_message(msg || '{"message_id":"wamid.wrong","waba_id":"999999"}');
  assert result->>'accepted' = 'false', 'Wrong WABA accepted';
  result := public.crm_ingest_whatsapp_message(msg || '{"message_id":"wamid.error","sender_id":"customer-error","error_code":"131060"}');
  assert (select count(*) = 1 from public.contacts), 'Error created fake contact';
  assert (select count(*) = 1 from public.whatsapp_messages where error_code = '131060'), 'Error was lost';
  update public.leads set status='Lost' where id=lead_uuid;
  result := public.crm_ingest_whatsapp_message(msg || '{"message_id":"wamid.return"}');
  assert (result->>'lead_id')::uuid <> lead_uuid, 'Closed enquiry reused';
end $$;
insert into public.meta_ad_mappings(organization_id,ad_id,destination) values ('00000000-0000-4000-8000-000000000001','99999999','Spiti');
do $$ declare later jsonb; first jsonb; result jsonb; begin
  later := '{"phone_number_id":"987654","waba_id":"123456","message_id":"out-of-order-later","sender_id":"out-of-order-customer","message_type":"text","message_text":"Following up","timestamp":1789600010,"ad_id":"99999999"}';
  first := later || '{"message_id":"out-of-order-first","message_text":"My ad enquiry","timestamp":1789600000,"ad_id":"12345678","profile_name":"Later available name"}';
  perform public.crm_ingest_whatsapp_message(later);
  result := public.crm_ingest_whatsapp_message(first);
  assert (select originating_ad_id = '12345678' and first_message = 'My ad enquiry' and destination is null and advertised_destination='Manali' and contact_name='Later available name' from public.crm_lead_inbox where id=(result->>'lead_id')::uuid), 'Out-of-order attribution or later profile name was lost';
  update public.contacts set name='Staff-entered name' where id=(select contact_id from public.leads where id=(result->>'lead_id')::uuid);
  perform public.crm_ingest_whatsapp_message(first || '{"message_id":"out-of-order-followup","timestamp":1789600020,"profile_name":"New profile name"}');
  assert (select contact_name='Staff-entered name' from public.crm_lead_inbox where id=(result->>'lead_id')::uuid), 'Staff-entered name was overwritten';
end $$;
-- Confirm RLS uses verified identities, not old self-created memberships.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin assert (select count(*) = 0 from public.leads), 'Outsider can read leads'; end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin assert (select count(*) = 3 from public.leads), 'Approved staff cannot read'; end $$;
reset role;
rollback;
\echo Database assertions passed
