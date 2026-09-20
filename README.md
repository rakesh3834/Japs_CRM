# Japs_CRM

Travel-agency CRM with a React interface, Cloudflare-compatible Worker API and an existing Supabase database. WhatsApp lead capture starts when a customer **sends a message**, not when they merely open a chat.

## Implemented locally

- Temporary administrator password sign-in backed by Supabase; email-code setup is paused. Server-side role and organization checks protect every customer API.
- Signed WhatsApp webhook with atomic contact/enquiry/message writes, duplicate protection and out-of-order first-touch correction.
- Business-scoped sender aliases preserve enquiry continuity when WhatsApp withholds a phone; available WhatsApp usernames can fill missing display names.
- Read-only ad → campaign/ad-set lookup, with durable pending work if Meta access fails.
- Settings: connection readiness, read-only coexistence check, campaign retry and ad-to-package mapping.
- Delivery health distinguishes credentials from actual saved messages; the visible Leads dashboard refreshes every 15 seconds. Recent delivery does not prove all enquiries were captured.
- Missing names, phone numbers and click platforms are not invented.
- Existing business records remain in Supabase. Legacy self-created administrators are not automatically trusted.
- Operations, reports and some dashboard/finance panels remain labelled design previews. Network errors never fabricate saved records.

A successful build is not proof of a live Meta connection. See [the staged setup guide](docs/whatsapp-setup.md).

## Local development

1. Install dependencies: `npm --prefix frontend install`.
2. Supply server-only values from `.env.example` in `.env`.
3. Run `npm run dev:api` from the project root.
4. Run `npm --prefix frontend run dev`; open `http://127.0.0.1:5173`.

Vite proxies /api to the exact deployed Worker. The old FastAPI prototype refuses to run against real database credentials; its unverified login is no longer supported.

## Validation

```sh
npm test
node scripts/test-database.mjs
npm run build
```

Database tests use an isolated local PostgreSQL cluster, never Supabase. Set JAPS_TEST_PG_BIN if executables are not in /opt/homebrew/bin. Build output bundles the Worker and frontend assets into dist/server/index.js.

## Rollout gates

For the existing database, do not rerun the initial schema or completed bootstrap. The verified-staff and profile/attribution migrations are already applied. Apply `supabase/migrations/20260920_whatsapp_sender_identity.sql` once **before deploying the repaired Worker**, after checking migration state. The 20 September audit found a messaging-permission gap and no new stored messages after early 17 September IST. Meta callback testing succeeded, but production permissions, the new migration/deployment and fresh normal/ad-message acceptance checks remain outstanding. See the setup guide for current evidence and account-access blockers.

While email is paused, set `JAPS_CRM_AUTH_MODE=temporary_password`, `JAPS_CRM_TEMP_ADMIN_EMAIL` and a future `JAPS_CRM_TEMP_ADMIN_EXPIRES_AT`. Only that already-confirmed, approved Admin/Owner can sign in. Supabase stores the password; never place it in source or frontend configuration. Missing/expired configuration fails closed. Email endpoints are disabled in password mode.

When email sign-in is explicitly resumed, set `JAPS_CRM_AUTH_MODE=email`, configure the Supabase live Site URL and a code-based email template using `{{ .Token }}`, and verify delivery first. Current Supabase access tokens expire after one hour; no browser refresh token is stored.

Existing Site: https://japs-crm.rakesh-collegedunia.chatgpt.site

Runtime secrets stay server-only. Public publication is approved; customer APIs remain staff-authenticated. Public privacy and manual deletion-request instructions are available at `/privacy` and `/data-deletion`. Do not roll back to the old unsigned-login Worker. GitHub Pages only redirects to the full hosted CRM; it cannot host the Worker or database itself.
