# Meta-ad-only lead intake

The 20260921 migration replaces automatic intake, not staff-created manual leads.

* New automatic leads require a signed incoming message with an `ad` referral, an ad ID resolved through the authorized Meta account, a campaign ID and a verified sender phone.
* Ordinary chats never create leads. Unrelated organic content is not newly persisted. Minimal signed phone/BSUID aliases are retained for identity continuity.
* A qualifying ad message is durable before acknowledgement. Missing campaign/phone leaves it pending, visible in Settings, until resolution. Campaign lookup retries also reconcile cached metadata.
* `(organization_id, intake_campaign_id, intake_phone)` is uniquely indexed across all statuses, business numbers and deleted records. Editing a contact's phone does not change this original deduplication identity.
* Repeated ad touches retain each message's referral. One lead's displayed originating ad is its earliest qualifying ad touch. Another campaign creates another lead for that phone. Won/Lost are not reopened automatically.
* Follow-ups without referrals cannot create leads. Where ad context is known, event time selects their preceding ad touch; ambiguous or unresolved contexts remain unassigned. Organic content discarded before the first ad delivery cannot later be recovered.
* No inferred Instagram/Facebook platform, guessed campaign from message text, or invented phone fallback is used. Meta may omit referral or phone evidence; these are not silently classified as new ad leads.

## Existing records and recovery

The migration journals pre-change lead rows and message/contact-link assignments in the service-only `crm_intake_repair_journal`. It soft-archives webhook-generated leads, then restores/reuses valid campaign/phone leads while preserving staff fields. Duplicate or ordinary-chat leads remain archived. Contacts, messages, trips, tasks and financial records are not deleted. Manual leads stay available.

Recovery is an administrator operation: inspect the journal for a specific record and restore its fields/links in a transaction, accounting for subsequent activity and the campaign/phone unique constraint. Do not blindly overwrite newer data or rerun the migration. The archive reason is retained on the lead.

## Deployment and verification

Apply the append-only migration once after the 20260920 identity migration, then publish the matching Worker/UI. Intake stays compatible with the old Worker during this short interval; new campaign promotion may await the new Worker or an administrator retry.

Run `npm test`, `node scripts/test-database.mjs` and `npm run build`. Database tests use a disposable local PostgreSQL cluster and cover legacy behavior, migration repair, pending identities, retries and actual competing transactions. Never send synthetic customer messages or delete live test records to perform these tests.

After deployment, verify authenticated lead counts, active source breakdown, immutable key uniqueness, pending/error counts, UI statuses and unauthenticated access protection. A verified build does not prove that Meta has delivered every future enquiry; a fresh genuine ad enquiry is the final external-delivery check.
