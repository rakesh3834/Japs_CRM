# WhatsApp rollout and operations

## Verified rollout state — 17 September 2026

- The existing Supabase project `surelxrwnkfgtylpwysh` is online. The verified-staff/WhatsApp migration and administrator bootstrap have been applied successfully through its SQL Editor.
- Immediate post-migration checks preserved **4 contacts, 1 lead and 1 trip**; these are historical preservation counts, not current totals. Anonymous direct lead reads and authenticated direct execution of the message-ingestion function are denied.
- **Application release verified:** Sites version 6, commit `47c2d48eea0bf4d98d0acfd4b35ea684ec7e1a5b`, environment revision **5**. A later documentation-only release does not change that tested application behavior. The signing secret, verification token and integration credentials are server-only. Anonymous `/api/leads` and unsigned webhook POSTs return 401; the correct verification challenge succeeds.
- `pahwajayant26@gmail.com` is confirmed in Supabase, approved as **Admin**, active and bound to its verified identity. Live temporary-password authentication and `/api/me` succeeded, the session cookie is `Secure` and `HttpOnly`, and logout returned 200; the earlier logout/replay check returned 401. The owner approved a temporary password instead of email codes. Temporary administrator access expires at **`2026-10-01T00:00:00Z`**; email endpoints remain disabled.
- **Existing coexistence is confirmed again on 17 September by live Meta GET requests.** Phone `1104024252793908` returned `is_on_biz_app: true` and `platform_type: CLOUD_API`. WABA `1728980918069286`'s phone-number listing independently returned the same ID/status, agency number `+91 73035 30355` and verified name `Travel with Japs`. No migration or new coexistence enrollment is needed based on these results. Owner confirmation that normal Business app use is unaffected is still pending.
- A persistent **SYSTEM_USER** credential is configured server-only as `META_ADS_ACCESS_TOKEN` and `META_WHATSAPP_ACCESS_TOKEN`. Meta reports **Expires: Never** and scopes **`ads_read` and `whatsapp_business_management`**, not `whatsapp_business_messaging`. The owner approved read-only **View performance** access for system user **Japs** on ad account `1014327913183517`; account and ads GET requests returned 200. No ad, finance or ownership settings were changed. The earlier temporary setup token is not the production credential.
- **Meta app publication is complete**: the success dialog was observed at approximately **21:27 UTC on 16 September** (17 September locally). After publication, the exact saved callback and **`messages` subscription at Graph version `v26.0`** were confirmed. The agency phone/WABA mapping in Supabase is **active**. The WABA subscribed-app list independently confirms both **Japs CRM `1638666324256448`** and the preserved **Business Agent `1143680903703001`**. No existing subscription was removed.
- The follow-up migration `20260917_whatsapp_profile_attribution.sql` was applied and independently checked through SQL: later available profile names fill placeholders; advertised destination remains separate from customer preference.
- **Real inbound lead ingestion and attribution are operational.** A real ad enquiry with initial message timestamp **20:40:19 UTC** and follow-up timestamp **20:45:33 UTC on 16 September** shares one lead in Supabase. The authenticated Leads API returned campaign **SP 28 DUPE**, ad **New Leads ad**, ad ID `120250805462520524`, attribution status **ready**, and available phone/display name. Exact click platform remains null; no personal customer identifiers are recorded in this runbook.
- Approved public policies are mirrored on existing GitHub Pages at **`/Japs_CRM/privacy/`** and **`/Japs_CRM/data-deletion/`**. Meta Sharing Debugger successfully fetched the mirrored deletion page with a **206 range response**, and both policy URLs were saved in Meta Basic settings with contact `contactjapstours@gmail.com`; the generic Terms URL was removed. The mirror was needed because the actual Meta crawler received 403 on the Sites policy URLs. Policy content remains the owner's approved `Travel with Japs` notice: manual deletion requests, a 12-month review policy for unsuccessful enquiries, and no additional promotional or third-party marketing use.
- **Email-login/sender setup is paused at the user's request.** Custom SMTP remains off and no sender account or paid plan has been created. The provided website is `travelwithjaps.in`; its DNS is managed by someone else. Do not make email setup a prerequisite for the WhatsApp receiver, and do not remove customer-data access protections to skip it.
- **Still pending:** the owner-controlled fresh **`JAPS CRM TEST 17`** check and the owner's confirmation that the WhatsApp Business app still works normally. The existing real ad enquiry proves the operational path, but do not call the entire owner acceptance process complete before these checks.

## Current priority: finish owner acceptance; keep email setup paused

The webhook route runs before staff authentication and does not call Supabase Auth or an email provider. Its runtime dependencies are the Meta signing/verification secrets, a reachable Supabase database with the ingestion migration, and an explicitly enabled matching WABA/phone connection. Campaign enrichment separately needs authorized Marketing API access. This permits receiver rollout without completing staff sign-in.

Keep the existing agency number and ads unchanged. Coexistence, the signed receiver, account subscription, published app, real ad attribution and authenticated CRM API data have now been verified. Finish the fresh owner-controlled test and normal Business app confirmation without weakening staff authentication or exposing customer records.

The website footer's linked privacy page, `https://travelwithjaps.in/privacy`, returned 404 in the 17 September read-only check. That separate website issue was not changed; Meta now uses the approved GitHub Pages mirror, which passed its crawler check.

Meta Basic settings no longer use the blank contact/privacy fields or generic Facebook deletion/Terms placeholders. Preserve the approved contact and policy URLs; do not substitute unrelated policies or promise unimplemented deletion/retention behavior.

## Agreed scope

Keep the agency WhatsApp Business app number **+91 73035 30355**, its ads and normal app use. The owner's personal tester is only a customer-side tester. Do not automatically migrate/disconnect/register numbers, delete accounts, publish ads, become a Tech Provider or buy a provider subscription.

Flow: ad → customer **sends** a WhatsApp message → signed webhook → durable CRM enquiry → campaign lookup.

Ads alone do not reveal the sender’s phone/name at click time. WhatsApp provides the message and available sender/profile/referral data. The ad ID is resolved separately to a campaign. Configured Facebook/Instagram placements do not prove an individual click’s platform.

## 1. Secure the CRM receiver

1. Sign into the Supabase project owning Japs_CRM and confirm its backup/restore plan.
2. **Completed:** apply `supabase/migrations/20260917_verified_staff_whatsapp.sql` and `supabase/migrations/20260917_whatsapp_profile_attribution.sql`. For the existing database, do not rerun the old initial schema. No customer records were deleted.
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

1. **Completed:** obtain authorized read access to the correct WhatsApp account. Store it as `META_WHATSAPP_ACCESS_TOKEN`, never in chat or frontend code. The current credential has `whatsapp_business_management` and no messaging-send scope.
2. **Completed and rechecked on 17 September:** authorized GET of `is_on_biz_app,platform_type` returned `true` and `CLOUD_API`; the WABA's `/phone_numbers` edge verified the exact agency number. Staff sign-in and the persistent read credential are now configured, so CRM Settings can repeat the read-only check. An access failure would not prove coexistence is absent.
3. **Not needed for the current, already confirmed connection.** If future onboarding is needed, resolve eligibility for Meta’s supported Embedded Signup coexistence route. Current documentation has provider prerequisites for implementing it. A generic Facebook Login configuration or the API Setup “From” dropdown does not complete this onboarding. Resolve eligibility before any irreversible Tech Provider declaration or provider purchase.
4. If the route is available and approved, connect the **existing Business app account** through Meta’s official verification/QR flow. Keep returned WABA/phone IDs. Do not run the standard phone `/register` step for the coexistence number.
5. Review current companion-device, broadcast and history limitations with the owner first. Complete required contact/history sync initiation within Meta’s onboarding window. Historical/app-sent messages must not create new enquiries.

Source: [Meta coexistence onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/).

## 3. Connect live message delivery and campaign lookup

1. **Completed:** set `META_APP_SECRET` from the same app and a strong random `META_WEBHOOK_VERIFY_TOKEN`; these are different secrets.
2. **Completed:** configure callback `https://japs-crm.rakesh-collegedunia.chatgpt.site/api/webhooks/whatsapp` in WhatsApp Configuration and verify it with the matching token. Meta app publication is also complete, using the owner-approved crawler-accessible policy mirror. A dashboard test alone does not prove real delivery. Preserve the policy's accurate agency details and implemented manual deletion/retention process.
3. **Completed and checked after publication:** subscribe to `messages` at `v26.0` and subscribe this app to the **correct WABA**, preserving the existing Business Agent subscription. Follow Meta’s additional coexistence subscription/sync requirements when applicable. History and Business app echoes are intentionally not treated as leads.
4. **Completed:** confirm the phone/WABA mapping, then enable that exact row in `whatsapp_connections` after supported onboarding. This database switch does not itself connect Meta.
5. **Completed:** set `META_ADS_ACCESS_TOKEN` with `ads_read` and read-only View performance access to ad account `1014327913183517`; set `META_AD_ACCOUNT_ID` and `META_GRAPH_VERSION` (`v26.0` for this release). Authorized account/ads GET requests and live campaign enrichment succeeded. The current SYSTEM_USER token reports Expires: Never, but access can still be revoked; do not treat this as a guarantee of permanent access.
6. The receiver retains `referral.source_id` (ad ID), `ctwa_clid`, referral contents and the actual sent message. Campaign lookup failures remain unresolved for **manual recovery**: Settings retries three oldest unresolved ads per action. There is no scheduled automatic retry service.
7. Optional: map an actual ad ID to an advertised package/destination/agency event. Keep advertised trip context separate from customer preferences. Do not infer travel dates or traveller count from ad targeting or run dates.

Sources: [Meta message webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text), [Meta Ad reference](https://developers.facebook.com/docs/marketing-api/reference/adgroup/).

## 4. Live acceptance test

1. **Pending owner check:** send **`JAPS CRM TEST 17`** from the owner's tester to the agency number and confirm receipt in the CRM. Separately obtain the owner's confirmation that normal WhatsApp Business app use still works. An existing sender's follow-up should reuse its open enquiry, not necessarily create another lead.
2. **Real ad path verified:** an actual ad-referred message and follow-up are stored under one lead, with the timestamps and ad reference recorded above. For future retests, use an actually delivered WhatsApp ad on Facebook/Instagram and **send** an FAQ or typed message. A direct WhatsApp link or chat opening alone does not test ad attribution.
3. **Authenticated CRM data verified:** the production Leads API returned available phone/display name, ad **New Leads ad**, campaign **SP 28 DUPE** and attribution status **ready**. On retest, refresh Leads and verify the sent text, ad ID, campaign and ad-set. Exact click platform may correctly remain unknown; do not infer Facebook/Instagram from campaign placements or a WhatsApp display name.
4. **Follow-up grouping verified on the real enquiry; replay/concurrency and out-of-order behavior covered by isolated tests.** A follow-up must stay with the same open enquiry. Replaying its message ID must not duplicate contacts/leads. An earlier initial ad message arriving late must correct first-touch attribution.
5. Check original Business app messages when error **131060** or unsupported delivery occurs; reconcile manually when necessary. Do not promise API replay can recover every coexistence message.
6. Inbound ingestion and campaign attribution are operational based on the real enquiry and authenticated CRM evidence. **Do not call the entire owner acceptance process complete** until the fresh owner-controlled test and normal Business app confirmation are finished. Build success, mock tests and a green API Setup screen alone are not enough.

## Operational notes

- PostgreSQL tests run in a disposable local cluster, not the live database.
- Persistence is transactional per message. If part of a batch fails, Meta gets a retryable response and already-saved messages deduplicate on replay.
- Unknown WABA/phone mappings cannot write to a fallback organization.
- Credentials, cookies and raw database errors must never be logged or exposed to the frontend.
- Staff sessions last at most one hour; users sign in again. No browser refresh token is stored. Temporary administrator mode expires at `2026-10-01T00:00:00Z`; arrange the owner's next approved access method before then. Expiry pauses staff access, not signed webhook ingestion.
- Campaign lookup recovery is manual through Settings; monitor unresolved lookups and repeat in batches of three when needed. The configured SYSTEM_USER credential has no scheduled expiry according to Meta, but permissions and credentials remain revocable.
- No historical import, outbound reply automation, ad-budget changes or template sending is implemented here.
- Later outbound automation needs separate consent/template/pricing checks; this receiver only captures inbound enquiries.
