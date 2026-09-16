# Staged WhatsApp rollout

## Verified rollout state — 17 September 2026

- The existing Supabase project `surelxrwnkfgtylpwysh` is online. The verified-staff/WhatsApp migration and administrator bootstrap have been applied successfully through its SQL Editor.
- Post-migration checks preserved **4 contacts, 1 lead and 1 trip**; the new inbox view returns the existing lead. Anonymous direct lead reads and authenticated direct execution of the message-ingestion function are denied.
- `pahwajayant26@gmail.com` is confirmed in Supabase, approved as **Admin**, active and bound to its verified identity. Live password authentication and `/api/me` succeeded; logout followed by replay returned 401. The owner approved a temporary password instead of email codes.
- **Existing coexistence is now confirmed by live Meta GET requests.** Phone `1104024252793908` returned `is_on_biz_app: true` and `platform_type: CLOUD_API`. WABA `1728980918069286`'s phone-number listing independently returned the same ID/status, agency number `+91 73035 30355` and verified name `Travel with Japs`. No migration or new coexistence enrollment is needed based on these results.
- The Japs CRM OAuth connection was authorized for **only that current WABA**, not test accounts or future accounts, with `whatsapp_business_management` and `whatsapp_business_messaging`. A temporary setup token was generated for diagnostics; it is not configured as a durable production credential.
- The signed receiver was publicly deployed as Site version 3. The signing secret and verification token are server-only. Anonymous customer reads and unsigned webhook POSTs return 401; the correct verification challenge succeeds. The temporary-password update needs its own deployment.
- Meta accepted the callback and verification token; the `messages` field is subscribed. The exact agency connection in Supabase is now **active**. The WABA subscribed-app list independently confirms both **Japs CRM `1638666324256448`** and the preserved **Business Agent `1143680903703001`**. No existing subscription was removed.
- The follow-up migration `20260917_whatsapp_profile_attribution.sql` was applied and independently checked through SQL: later available profile names fill placeholders; advertised destination remains separate from customer preference.
- Meta app publication and a real incoming-message test are not yet verified. Its configuration explicitly says unpublished apps receive only dashboard test webhooks, not production data. The owner approved privacy/deletion contact `Travel with Japs`, `contactjapstours@gmail.com`, manual deletion requests and a 12-month review policy for unsuccessful enquiries, with no additional promotional or third-party marketing use. Public policy pages are included in this change for deployment before updating Meta.
- **Email-login/sender setup is paused at the user's request.** Custom SMTP remains off and no sender account or paid plan has been created. The provided website is `travelwithjaps.in`; its DNS is managed by someone else. Do not make email setup a prerequisite for the WhatsApp receiver, and do not remove customer-data access protections to skip it.
- A durable campaign-read credential and real ad-originated acceptance test remain required. Successful callback verification, account subscription, mocks or database tests alone do not complete the goal.

## Current priority: intake before staff email setup

The webhook route runs before staff authentication and does not call Supabase Auth or an email provider. Its runtime dependencies are the Meta signing/verification secrets, a reachable Supabase database with the ingestion migration, and an explicitly enabled matching WABA/phone connection. Campaign enrichment separately needs authorized Marketing API access. This permits receiver rollout without completing staff sign-in.

Keep the existing agency number and ads unchanged. Verify supported coexistence first, configure the signed public receiver and account subscription, then prove a real ad-referred enquiry in the CRM database. Do not describe database verification as a completed staff dashboard/login test. Do not publicly expose lead records as a substitute for the postponed sign-in.

The website footer's linked privacy page, `https://travelwithjaps.in/privacy`, currently returns 404 (read-only check on 17 September). A truthful owner-approved accessible policy remains a Meta publication prerequisite, separate from SMTP or CRM login.

Meta Basic settings currently have blank Contact email and Privacy policy URL. Terms of Service and User data deletion point to the generic Facebook homepage; these are not agency-specific policies or deletion instructions. Do not publish with those placeholders as if they describe Japs CRM.

## Agreed scope

Keep the agency WhatsApp Business app number **+91 73035 30355**, its ads and normal app use. The personal number ending **3834** is only a customer-side tester. Do not automatically migrate/disconnect/register numbers, delete accounts, publish ads, become a Tech Provider or buy a provider subscription.

Flow: ad → customer **sends** a WhatsApp message → signed webhook → durable CRM enquiry → campaign lookup.

Ads alone do not reveal the sender’s phone/name at click time. WhatsApp provides the message and available sender/profile/referral data. The ad ID is resolved separately to a campaign. Configured Facebook/Instagram placements do not prove an individual click’s platform.

## 1. Secure the CRM receiver

1. Sign into the Supabase project owning Japs_CRM and confirm its backup/restore plan.
2. Apply `supabase/migrations/20260917_verified_staff_whatsapp.sql` in SQL Editor. For the existing database, do not rerun the old initial schema. No customer records are deleted.
3. Apply `supabase/bootstrap_verified_admin.sql`. The user explicitly approved `pahwajayant26@gmail.com` as first admin. Old self-created profiles do not inherit permission. The business number is staged inactive.
4. Current rollout: use the owner's approved temporary password mode, the existing confirmed administrator and an explicit expiry. Email endpoints stay disabled. For a future explicitly approved email rollout, keep email confirmation required and set the **Magic Link** template to show a code, for example:
   `<h2>Japs_CRM sign-in</h2><p>Your code: <strong>{{ .Token }}</strong></p><p>If you did not request this, ignore this email.</p>`
5. SMTP delivery verification is deferred until email sign-in is resumed. Do not grant database administration to staff to bypass sender restrictions or buy an email service without approval.
6. Set server-only `JAPS_CRM_APP_ORIGIN` to the exact live CRM origin. Verify the selected sign-in method, anonymous/unapproved read denial, logout invalidation and role enforcement.
7. Publish the reviewed commit to the existing public Site. Only sign-in/policy pages and the signature-verified receiver are public; customer APIs require approved staff authentication.

Sources: [Supabase email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp).

## 2. Confirm supported coexistence

“Connected” in WhatsApp Manager alone does not establish API coexistence.

| Asset to verify before activation | ID |
|---|---|
| Meta app | 1638666324256448 |
| Business portfolio | 1249888699249841 |
| Agency WABA | 1728980918069286 |
| Agency phone number | 1104024252793908 |
| Ad account | 1014327913183517 |

1. Obtain authorized read access to the correct WhatsApp account. Store it as `META_WHATSAPP_ACCESS_TOKEN`, never in chat or frontend code.
2. **Completed using Meta Graph API Explorer on 17 September:** authorized GET of `is_on_biz_app,platform_type` returned `true` and `CLOUD_API`; the WABA's `/phone_numbers` edge verified the exact agency number. The CRM Settings check can be used later when staff sign-in and a durable read token are configured. An access failure would not prove coexistence is absent.
3. If onboarding is needed, resolve eligibility for Meta’s supported Embedded Signup coexistence route. Current documentation has provider prerequisites for implementing it. A generic Facebook Login configuration or the API Setup “From” dropdown does not complete this onboarding. Resolve eligibility before any irreversible Tech Provider declaration or provider purchase.
4. If the route is available and approved, connect the **existing Business app account** through Meta’s official verification/QR flow. Keep returned WABA/phone IDs. Do not run the standard phone `/register` step for the coexistence number.
5. Review current companion-device, broadcast and history limitations with the owner first. Complete required contact/history sync initiation within Meta’s onboarding window. Historical/app-sent messages must not create new enquiries.

Source: [Meta coexistence onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/).

## 3. Connect live message delivery and campaign lookup

1. Set `META_APP_SECRET` from the same app and a strong random `META_WEBHOOK_VERIFY_TOKEN`; these are different secrets.
2. Configure callback `https://japs-crm.rakesh-collegedunia.chatgpt.site/api/webhooks/whatsapp` in WhatsApp Configuration; verify it with the matching token.
   Before expecting real messages, complete the Meta app's publication requirements and publish it with the owner's approval. The actual app dashboard currently requires a privacy-policy URL and states production webhooks are unavailable while unpublished. A successful dashboard test does not satisfy this gate. The public policy must accurately describe the agency's data use, service providers and privacy/deletion contact; do not invent owner details or promise unimplemented deletion/retention behavior.
3. Subscribe to `messages` and subscribe this app to the **correct WABA**. Follow Meta’s additional coexistence subscription/sync requirements. History and Business app echoes are intentionally not treated as leads.
4. Confirm the phone/WABA mapping, then enable that exact row in `whatsapp_connections` after supported onboarding. This database switch does not itself connect Meta.
5. Set `META_ADS_ACCESS_TOKEN` with `ads_read` and access to the correct ad account; set `META_AD_ACCOUNT_ID` and a supported `META_GRAPH_VERSION`.
6. The receiver retains `referral.source_id` (ad ID), `ctwa_clid`, referral contents and the actual sent message. Campaign lookup failures stay pending; Settings retries three oldest unresolved ads per action.
7. Optional: map an actual ad ID to an advertised package/destination/agency event. Keep advertised trip context separate from customer preferences. Do not infer travel dates or traveller count from ad targeting or run dates.

Sources: [Meta message webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text), [Meta Ad reference](https://developers.facebook.com/docs/marketing-api/reference/adgroup/).

## 4. Live acceptance test

1. Send a normal enquiry from the owner’s personal tester to the agency number. Confirm the Business app still works and CRM creates one contact/enquiry.
2. Test an actually delivered WhatsApp ad on Facebook/Instagram and **send** an FAQ or typed message. A direct WhatsApp link or chat opening alone does not test ad attribution.
3. In CRM Leads, refresh and verify available phone, WhatsApp display name, sent text, ad ID, campaign and ad-set. Click platform may correctly remain unknown.
4. A follow-up must stay with the same open enquiry. Replaying its message ID must not duplicate contacts/leads. An earlier initial ad message arriving late must correct first-touch attribution.
5. Check original Business app messages when error **131060** or unsupported delivery occurs; reconcile manually when necessary. Do not promise API replay can recover every coexistence message.
6. Only call the goal complete after a real ad-referred enquiry and campaign lookup are proven in the live CRM. Build success, mock tests and a green API Setup screen are not enough.

## Operational notes

- PostgreSQL tests run in a disposable local cluster, not the live database.
- Persistence is transactional per message. If part of a batch fails, Meta gets a retryable response and already-saved messages deduplicate on replay.
- Unknown WABA/phone mappings cannot write to a fallback organization.
- Credentials, cookies and raw database errors must never be logged or exposed to the frontend.
- Email sessions last at most one hour; users sign in again. No browser refresh token is stored.
- No historical import, outbound reply automation, ad-budget changes or template sending is implemented here.
- Later outbound automation needs separate consent/template/pricing checks; this receiver only captures inbound enquiries.
