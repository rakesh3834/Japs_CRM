-- User explicitly approved this first administrator on 17 September 2026.
-- Run AFTER the verified-staff migration. Does not grant an old profile access.
insert into public.crm_staff_access(organization_id, email, role, active)
values ('00000000-0000-4000-8000-000000000001', 'pahwajayant26@gmail.com', 'Admin', true)
on conflict (organization_id, email) do nothing;

-- Known agency asset, staged INACTIVE. This is not coexistence onboarding and
-- does not register, migrate, disconnect or subscribe the phone number.
insert into public.whatsapp_connections(organization_id, phone_number_id, waba_id, display_phone_number, active)
values ('00000000-0000-4000-8000-000000000001', '1104024252793908', '1728980918069286', '+917303530355', false)
on conflict (phone_number_id) do nothing;
