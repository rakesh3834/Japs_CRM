# WhatsApp rollout and operations

## Delivery audit — 20 September 2026

### Verified repair release — 20 September 2026

- The owner completed Meta verification. The replacement server token now returns granted `ads_read`, `whatsapp_business_management`, and `whatsapp_business_messaging`. It is deployed as the secret `META_WHATSAPP_ACCESS_TOKEN` in Sites environment revision 7. The working ads token was left unchanged. The exact existing WABA subscription was refreshed successfully; no number or ad settings were changed.
- The reviewed `20260920_whatsapp_sender_identity.sql` migration was applied once in production. Postflight matched the tested wrapper/legacy function hashes and server-only grants, and confirmed alias row-level security. Record counts remained **6 contacts, 3 leads, 4 messages and 2 contact links** across the migration.
- Two additional real messages reached production during the repair: an audio message received **13:08:05 UTC** and a text message received **13:11:43 UTC** on 20 September. Both were stored without an error and linked to leads; neither carried ad-referral data. This is evidence of resumed inbound delivery, not proof of all historical or future enquiries or of fresh ad attribution.
- Reviewed application fixes pass 25 automated tests, isolated PostgreSQL migration/identity/concurrency tests, and the production build. [PR 5](https://github.com/rakesh3834/Japs_CRM/pull/5) was reviewed and merged. Sites version 8 deployed commit `d13ab261bea40827af127ebfac04522c6c5338dd` successfully at **13:23:26 UTC**, using environment revision 7.
- **Fresh live capture verified:** seven post-deployment messages were saved across three enquiries by **13:27:28 UTC**, including two ad referrals. Four messages grouped under one enquiry. New ad `120251072384580524` resolved to campaign **Manali Sept 13**, with available name, phone, first message, ad/ad-set details and attribution status `ready`. Exact FB/IG click platform was not supplied and remains unknown. Normal incoming messages without an ad referral were also stored. The authenticated Leads API showed this fresh attribution; no recorded message errors or pending campaign lookups remained at **13:29 UTC**.
- Production administrator sign-in, approved-staff reads and coexistence/permission checks passed. Anonymous customer reads, unsigned webhook POSTs and replay after logout were rejected. The private temporary token-transfer copy was removed after server-secret storage. Owner confirmation of normal Business app use is still requested. These observations establish fresh intake, **not completeness since 17 September or a guarantee against future interruptions**.

### Earlier audit findings (before the repair above)

**Continuous live capture is not verified and must not be described as complete.** Production contained only two WhatsApp messages from one sender, both received early on 17 September IST, and no newer message at the time of this audit. Ads Insights showed conversations after those timestamps, but those aggregate metrics are not a list of identifiable missing leads.

- A real Meta dashboard `messages` test reached the production callback with **HTTP 200 at 2026-09-20T12:06:05.466Z**. Its sample phone is intentionally unmapped, so no sample customer was created. This proves reachability and signature acceptance, not delivery of actual agency enquiries.
- The agency phone returned **CONNECTED**, `is_on_biz_app: true`, `platform_type: CLOUD_API`, and the correct application callback. Existing app/WABA subscriptions remain in place.
- The permanent token's permissions include `ads_read` and `whatsapp_business_management`, but **not `whatsapp_business_messaging`**. Meta documents messaging permission as required for `messages` webhooks. The owner approved adding it; replacement issuance is pending Meta's owner-only authenticity verification. This is an upstream permission gap, not proof that replacing an environment variable alone fixes delivery. Incoming POST authentication uses the app-secret signature, not that token.
- Locally tested repairs add privacy-safe delivery diagnostics, separate saved-message/error health, 15-second visible-dashboard refresh, and business-scoped sender identity/username handling. They are **not yet deployed**. The new `20260920_whatsapp_sender_identity.sql` migration must be applied before the repaired Worker; production database access is currently awaiting the project owner's Supabase login.
- Finish the permission repair, apply the reviewed migration, deploy the reviewed release, and verify a **fresh normal message plus a fresh actual-ad message**. Reconcile the gap against the original WhatsApp conversations separately. No historical completeness claim is justified yet.

Source: [Meta webhook permissions](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/).

## Historical rollout evidence — 17 September 2026

- The existing Supabase project `surelxrwnkfgtylpwysh` is online. The verified-staff/WhatsApp migration and administrator bootstrap have been applied successfully through its SQL Editor.
- Immediate post-migration checks preserved **4 contacts, 1 lead and 1 trip**; these are historical preservation counts, not current totals. Anonymous direct lead reads and authenticated direct execution of the message-ingestion function are denied.
- **Application release verified:** Sites version 6, commit `47c2d48eea0bf4d98d0acfd4b35ea684ec7e1a5b`, environment revision **5**. A later documentation-only release does not change that tested application behavior. The signing secret, verification token and integration credentials are server-only. Anonymous `/api/leads` and unsigned webhook POSTs return 401; the correct verification challenge succeeds.
- `pahwajayant26@gmail.com` is confirmed in Supabase, approved as **Admin**, active and bound to its verified identity. Live temporary-password authentication and `/api/me` succeeded, the session cookie is `Secure` and `HttpOnly`, and logout returned 200; the earlier logout/replay check returned 401. The owner approved a temporary password instead of email codes. Temporary administrator access expires at **`2026-10-01T00:00:00Z`**; email endpoints remain disabled.
- **Existing coexistence is confirmed again on 17 September by live Meta GET requests.** Phone `1104024252793908` returned `is_on_biz_app: true` and `platform_type: CLOUD_API`. WABA `1728980918069286`'s phone-number listing independently returned the same ID/status, agency number `+91 73035 30355` and verified name `Travel with Japs`. No migration or new coexistence enrollment is needed based on these results. Owner confirmation that normal Business app use is unaffected is still pending.
- A persistent **SYSTEM_USER** credential is configured server-only as `META_ADS_ACCESS_TOKEN` and `META_WHATSAPP_ACCESS_TOKEN`. Meta reports **Expires: Never** and scopes **`ads_read` and `whatsapp_business_management`**, not `whatsapp_business_messaging`. The owner approved read-only **View performance** access for system user **Japs** on ad account `1014327913183517`; account and ads GET requests returned 200. No ad, finance or ownership settings were changed. The earlier temporary setup token is not the production credential.
- **Meta app publication is complete**: the success dialog was observed at approximately **21:27 UTC on 16 September** (17 September locally). After publication, the exact saved callback and **`messages` subscription at Graph version `v26.0`** were confirmed. The agency phone/WABA mapping in Supabase is **active**. The WABA subscribed-app list independently confirms both **Japs CRM `1638666324256448`** and the preserved **Business Agent `1143680903703001`**. No existing subscription was removed.
- The follow-up migration `20260917_whatsapp_profile_attribution.sql` was applied and independently checked through SQL: later available profile names fill placeholders; advertised destination remains separate from customer preference.
- **One historical real ad enquiry was captured and attributed.** Initial message timestamp **20:40:19 UTC** and follow-up timestamp **20:45:33 UTC on 16 September** share one lead in Supabase. The authenticated Leads API returned campaign **SP 28 DUPE**, ad **New Leads ad**, ad ID `120250805462520524`, attribution status **ready**, and available phone/display name. Both messages preceded app publication. Exact click platform remains null; no personal customer identifiers are recorded in this runbook.
- Approved public policies are mirrored on existing GitHub Pages at **`/Japs_CRM/privacy/`** and **`/Japs_CRM/data-deletion/`**. Meta Sharing Debugger successfully fetched the mirrored deletion page with a **206 range response**, and both policy URLs were saved in Meta Basic settings with contact `contactjapstours@gmail.com`; the generic Terms URL was removed. The mirror was needed because the actual Meta crawler received 403 on the Sites policy URLs. Policy content remains the owner's approved `Travel with Japs` notice: manual deletion requests, a 12-month review policy for unsuccessful enquiries, and no additional promotional or third-party marketing use.
- **Email-login/sender setup is paused at the user's request.** Custom SMTP remains off and no sender account or paid plan has been created. The provided website is `travelwithjaps.in`; its DNS is managed by someone else. Do not make email setup a prerequisite for the WhatsApp receiver, and do not remove customer-data access protections to skip it.
- **Was pending at that stage:** upstream permission repair and fresh acceptance checks. Permission repair and fresh intake were subsequently verified as recorded above; the historical enquiry alone did not prove continued delivery.

## Current priority: reconcile the historical gap; keep email setup paused

The webhook route runs before staff authentication and does not call Supabase Auth or an email provider. Its runtime dependencies are the Meta signing/verification secrets, a reachable Supabase database with the ingestion migration, and an explicitly enabled matching WABA/phone connection. Campaign enrichment separately needs authorized Marketing API access. This permits receiver rollout without completing staff sign-in.

Keep the existing agency number and ads unchanged. Coexistence, callback reachability, messaging permission, account subscription and authenticated CRM reads have been verified. Fresh normal and ad-message delivery is demonstrated above. Reconcile the earlier gap from the original Business app conversations; current delivery does not retroactively recover missed messages. Keep staff authentication and customer-data protections in place.

The website footer's linked privacy page, `https://travelwithjaps.in/privacy`, returned 404 in the 17 September read-only check. That separate website issue was not changed; Meta now uses the approved GitHub Pages mirror, which passed its crawler check.

Meta Basic settings no longer use the blank contact/privacy fields or generic Facebook deletion/Terms placeholders. Preserve the approved contact and policy URLs; do not substitute unrelated policies or promise unimplemented deletion/retention behavior.

## Agreed scope

Keep the agency WhatsApp Business app number **+91 73035 30355**, its ads and normal app use. The owner's personal tester is only a customer-side tester. Do not automatically migrate/disconnect/register numbers, delete accounts, publish ads, become a Tech Provider or buy a provider subscription.

Flow: ad → customer **sends** a WhatsApp message → signed webhook → durable CRM enquiry → campaign lookup.

Ads alone do not reveal the sender’s phone/name at click time. WhatsApp provides the message and available sender/profile/referral data. The ad ID is resolved separately to a campaign. Configured Facebook/Instagram placements do not prove an individual click’s platform.

## 1. Secure the CRM receiver

1. Sign into the Supabase project owning Japs_CRM and confirm its backup/restore plan.
2. **Completed:** apply `supabase/migrations/20260917_verified_staff_whatsapp.sql` and `supabase/migrations/20260917_whatsapp_profile_attribution.sql`. For the existing database, do not rerun the old initial schema. No customer records were deleted.
   **Completed repair migration (20 September):** `supabase/migrations/20260920_whatsapp_sender_identity.sql` was applied once and verified. Do not reapply it. It adds service-only sender aliases and wraps the existing ingestion function transactionally. Phone-only ingestion remains compatible; alias conflicts fail without merging independently established contacts.
3. **Completed:** apply `supabase/bootstrap_verified_admin.sql`. The user explicitly approved `pahwajayant26@gmail.com` as first admin. Old self-created profiles do not inherit permission. Bootstrap stages the business number inactive; the verified exact mapping was subsequently enabled for this rollout.
4. **Completed for this rollout:** use the owner's approved temporary password mode, the existing confirmed administrator and expiry **`2026-10-01T00:00:00Z`**. Email endpoints stay disabled. For a future explicitly approved email rollout, keep email confirmation required and set the **Magic Link** template to show a code, for example:
   `<h2>Japs_CRM sign-in</h2><p>Your code: <strong>{{ .Token }}</strong></p><p>If you did not request this, ignore this email.</p>`
5. SMTP delivery verification is deferred until email sign-in is resumed. Do not grant database administration to staff to bypass sender restrictions or buy an email service without approval.
6. **Completed and required after access changes:** set server-only `JAPS_CRM_APP_ORIGIN` to the exact live CRM origin. Verify the selected sign-in method, anonymous/unapproved read denial, logout invalidation and role enforcement.
7. **Completed:** publish the reviewed commit to the existing public Site; the current release is recorded above. Only sign-in/policy pages and the signature-verified receiver are public; customer APIs require approved staff authentication.

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

1. **Permission repair completed (20 September):** the owner-approved replacement has `whatsapp_business_messaging` plus the existing authorized management and ads-read grants. It also bundles send/media capabilities; no outbound customer messaging is authorized by this rollout. The replacement is deployed as `META_WHATSAPP_ACCESS_TOKEN`, never in chat or frontend code. Account access and granted scopes were checked again through the live CRM.
2. **Completed and rechecked on 17 September:** authorized GET of `is_on_biz_app,platform_type` returned `true` and `CLOUD_API`; the WABA's `/phone_numbers` edge verified the exact agency number. Staff sign-in and the persistent read credential are now configured, so CRM Settings can repeat the read-only check. An access failure would not prove coexistence is absent.
3. **Not needed for the current, already confirmed connection.** If future onboarding is needed, resolve eligibility for Meta’s supported Embedded Signup coexistence route. Current documentation has provider prerequisites for implementing it. A generic Facebook Login configuration or the API Setup “From” dropdown does not complete this onboarding. Resolve eligibility before any irreversible Tech Provider declaration or provider purchase.
4. If the route is available and approved, connect the **existing Business app account** through Meta’s official verification/QR flow. Keep returned WABA/phone IDs. Do not run the standard phone `/register` step for the coexistence number.
5. Review current companion-device, broadcast and history limitations with the owner first. Complete required contact/history sync initiation within Meta’s onboarding window. Historical/app-sent messages must not create new enquiries.

Source: [Meta coexistence onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/).

## 3. Connect live message delivery and campaign lookup

1. **Completed:** set `META_APP_SECRET` from the same app and a strong random `META_WEBHOOK_VERIFY_TOKEN`; these are different secrets.
2. **Completed:** configure callback `https://japs-crm.rakesh-collegedunia.chatgpt.site/api/webhooks/whatsapp` in WhatsApp Configuration and verify it with the matching token. Meta app publication is also complete, using the owner-approved crawler-accessible policy mirror. A dashboard test alone does not prove real delivery. Preserve the policy's accurate agency details and implemented manual deletion/retention process.
3. **Completed and checked after publication:** subscribe to `messages` at `v26.0` and subscribe this app to the **correct WABA**, preserving the existing Business Agent subscription. Follow Meta’s additional coexistence subscription/sync requirements when applicable. History and Business app echoes are intentionally not treated as leads.
   Recheck the app's permission grant and subscription after token replacement; a checked subscription alone did not establish continuous delivery in the 20 September audit.
4. **Completed:** confirm the phone/WABA mapping, then enable that exact row in `whatsapp_connections` after supported onboarding. This database switch does not itself connect Meta.
5. **Completed:** set `META_ADS_ACCESS_TOKEN` with `ads_read` and read-only View performance access to ad account `1014327913183517`; set `META_AD_ACCOUNT_ID` and `META_GRAPH_VERSION` (`v26.0` for this release). Authorized account/ads GET requests and live campaign enrichment succeeded. The current SYSTEM_USER token reports Expires: Never, but access can still be revoked; do not treat this as a guarantee of permanent access.
6. The receiver retains `referral.source_id` (ad ID), `ctwa_clid`, referral contents and the actual sent message. Campaign lookup failures remain unresolved for **manual recovery**: Settings retries three oldest unresolved ads per action. There is no scheduled automatic retry service.
7. Optional: map an actual ad ID to an advertised package/destination/agency event. Keep advertised trip context separate from customer preferences. Do not infer travel dates or traveller count from ad targeting or run dates.

Sources: [Meta message webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text), [Meta Ad reference](https://developers.facebook.com/docs/marketing-api/reference/adgroup/).

## 4. Live acceptance test

1. **Fresh normal-message capture verified on 20 September:** incoming messages without referrals were saved after deployment. The owner was also asked for a uniquely labelled personal-phone test and confirmation that normal WhatsApp Business app use still works; that confirmation remains pending. An existing sender's follow-up should reuse its open enquiry, not necessarily create another lead.
2. **Fresh ad capture verified on 20 September:** new post-deployment messages included ad referrals, and campaign enrichment completed. For future repeat tests, use an actually delivered WhatsApp ad on Facebook/Instagram and **send** an FAQ or typed message. Verify its newly stored message and referral, not an old example. A direct WhatsApp link or chat opening alone does not test ad attribution.
3. Check the authenticated Leads API and visible dashboard for available phone/display name (or WhatsApp username), sent text, ad ID, campaign and ad-set. Missing phone numbers remain null when Meta withholds them. Exact click platform may correctly remain unknown; do not infer Facebook/Instagram from campaign placements or a WhatsApp display name.
4. **Follow-up grouping verified on the real enquiry; replay/concurrency and out-of-order behavior covered by isolated tests.** A follow-up must stay with the same open enquiry. Replaying its message ID must not duplicate contacts/leads. An earlier initial ad message arriving late must correct first-touch attribution.
5. Check original Business app messages when error **131060** or unsupported delivery occurs; reconcile manually when necessary. Do not promise API replay can recover every coexistence message.
6. **Do not call live capture repaired or acceptance complete** until fresh normal/ad enquiries reach the production database and CRM after the repair and normal Business app use is confirmed. Build success, mock tests and a green API Setup screen alone are not enough. A recent-message health indicator is not a completeness check.

## Operational notes

- PostgreSQL tests run in a disposable local cluster, not the live database.
- Persistence is transactional per message. If part of a batch fails, Meta gets a retryable response and already-saved messages deduplicate on replay.
- The repaired receiver accepts a valid business-scoped sender ID when a phone is withheld, uses an available WhatsApp username as a name fallback, and links aliases only from observed message identities. Never infer an Instagram/Facebook username or fabricate a phone number. See [Meta business-scoped user IDs](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/).
- Diagnostic application logs contain request IDs and counts only, not message text, phones, profile names or tokens. Hosting access logs can still contain sensitive headers; redact them before sharing.
- Unknown WABA/phone mappings cannot write to a fallback organization.
- Credentials, cookies and raw database errors must never be logged or exposed to the frontend.
- Staff sessions last at most one hour; users sign in again. No browser refresh token is stored. Temporary administrator mode expires at `2026-10-01T00:00:00Z`; arrange the owner's next approved access method before then. Expiry pauses staff access, not signed webhook ingestion.
- Campaign lookup recovery is manual through Settings; monitor unresolved lookups and repeat in batches of three when needed. The configured SYSTEM_USER credential has no scheduled expiry according to Meta, but permissions and credentials remain revocable.
- No historical import, outbound reply automation, ad-budget changes or template sending is implemented here.
- Meta retries some failed webhook deliveries, but there is no general API to fetch all previously missed messages. Ads Insights cannot reconstruct individual enquiries. Compare the original Business app conversations for the 17 September onward gap; any controlled import requires a separate reviewed reconciliation. Do not disconnect/re-onboard coexistence to try to force history sync.
- Later outbound automation needs separate consent/template/pricing checks; this receiver only captures inbound enquiries.
