# Japs_CRM

Travel-agency CRM with a React interface, Cloudflare-compatible Worker API and an existing Supabase database. WhatsApp lead capture starts when a customer **sends a message**, not when they merely open a chat.

## Implemented locally

- Verified email-code sign-in for explicitly approved staff; server-side role and organization checks.
- Signed WhatsApp webhook with atomic contact/enquiry/message writes, duplicate protection and out-of-order first-touch correction.
- Read-only ad → campaign/ad-set lookup, with durable pending work if Meta access fails.
- Settings: connection readiness, read-only coexistence check, campaign retry and ad-to-package mapping.
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

For the existing database, do not rerun the initial schema. Apply the verified-staff migration, then the explicitly approved administrator bootstrap. The agency number is staged **inactive**; enabling the receiver is separate from supported Meta coexistence onboarding.

Supabase sign-in emails must display `{{ .Token }}`. Verify SMTP delivery to approved staff before publishing. Sessions last at most one hour and require sign-in again; no browser refresh token is stored.

Existing Site: https://japs-crm.rakesh-collegedunia.chatgpt.site

Runtime secrets stay server-only. Publication requires approval for the Site’s existing public access; customer APIs remain staff-authenticated. Do not roll back to the old unsigned-login Worker.
