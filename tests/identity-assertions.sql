\set ON_ERROR_STOP on
begin;
insert into public.whatsapp_connections(organization_id,phone_number_id,waba_id,active)
values ('00000000-0000-4000-8000-000000000001','987654','123456',true);
do $$ declare msg jsonb; result jsonb; original uuid; other uuid; begin
  assert not has_table_privilege('authenticated','public.whatsapp_sender_aliases','select');
  assert not has_function_privilege('service_role','public.crm_ingest_whatsapp_message_v1(jsonb)','execute');
  msg := '{"phone_number_id":"987654","waba_id":"123456","message_id":"identity-1","sender_id":"919999000001","phone":"+919999000001","user_id":"IN.ABC123","profile_name":"Guest","message_type":"text","message_text":"Travel enquiry"}';
  result := public.crm_ingest_whatsapp_message(msg); original := (result->>'lead_id')::uuid;
  result := public.crm_ingest_whatsapp_message(msg || '{"message_id":"identity-2","sender_id":"bsuid:IN.ABC123","phone":null}');
  assert (result->>'lead_id')::uuid = original, 'Number hidden split one customer';
  result := public.crm_ingest_whatsapp_message(msg || '{"message_id":"identity-3","user_id":null}');
  assert (result->>'lead_id')::uuid = original, 'Phone-only follow-up lost continuity';
  assert (select count(*)=1 from public.contacts), 'One identity made extra contacts';
  msg := msg || '{"message_id":"identity-4","sender_id":"bsuid:IN.OTHER456","user_id":"IN.OTHER456","phone":null,"profile_name":"travel_username"}';
  result := public.crm_ingest_whatsapp_message(msg); other := (result->>'lead_id')::uuid;
  assert other <> original;
  assert (select contact_phone is null and contact_name='travel_username' from public.crm_lead_inbox where id=other), 'Invented private phone or dropped username';
  result := public.crm_ingest_whatsapp_message(msg || '{"message_id":"identity-5","sender_id":"919999000002","phone":"+919999000002"}');
  assert (result->>'lead_id')::uuid = other, 'Revealing number split customer';
  assert (select contact_phone='+919999000002' from public.crm_lead_inbox where id=other), 'Actual sender phone not filled';
  result := public.crm_ingest_whatsapp_message(msg || '{"message_id":"identity-6","sender_id":"919999000002","phone":"+919999000002","user_id":null}');
  assert (result->>'lead_id')::uuid = other;
  -- Two established independent identities cannot be silently merged.
  begin
    perform public.crm_ingest_whatsapp_message(msg || '{"message_id":"identity-conflict","sender_id":"919999000001","phone":"+919999000001"}');
    raise exception 'Conflict was not rejected';
  exception when raise_exception then
    assert sqlerrm='WhatsApp identity reconciliation required';
  end;
  assert (select count(*)=2 from public.contacts);
  assert (select count(*)=6 from public.whatsapp_messages), 'Conflict partially persisted';
  -- Existing pre-migration customers have contact links but no alias rows.
  msg := '{"phone_number_id":"987654","waba_id":"123456","message_id":"legacy-phone-1","sender_id":"919999000003","phone":"+919999000003","profile_name":"Legacy guest","message_type":"text","message_text":"Existing enquiry"}';
  result := public.crm_ingest_whatsapp_message_v1(msg); original := (result->>'lead_id')::uuid;
  assert not exists(select 1 from public.whatsapp_sender_aliases where sender_id='919999000003');
  result := public.crm_ingest_whatsapp_message(msg || '{"message_id":"legacy-phone-2","user_id":"IN.LEGACY789"}');
  assert (result->>'lead_id')::uuid = original, 'Legacy phone link split when associating BSUID';
  result := public.crm_ingest_whatsapp_message(msg || '{"message_id":"legacy-phone-3","sender_id":"bsuid:IN.LEGACY789","user_id":"IN.LEGACY789","phone":null}');
  assert (result->>'lead_id')::uuid = original, 'Legacy customer split when phone became hidden';
  assert (select count(*)=3 from public.contacts);
  assert (select count(*)=9 from public.whatsapp_messages);
end $$;
rollback;
\echo Sender identity assertions passed
