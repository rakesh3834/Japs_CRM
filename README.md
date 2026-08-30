# Japs_CRM

Japs_CRM is a responsive travel-agency CRM prototype. It treats the trip as the shared record between sales, planning, operations, suppliers, and payment tracking.

## Run locally

Frontend:

```bash
cd frontend
npm install
npm run dev
```

FastAPI:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The current interface ships with demo data so it can be explored immediately. To connect the real Supabase project, copy [`.env.example`](.env.example) to `.env`, replace `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and run [`supabase/schema.sql`](supabase/schema.sql) once in the Supabase SQL editor. The FastAPI process loads the workspace `.env` automatically from either the project root or `backend/`. Keep the service-role key server-side; never put it in `frontend/.env`. For a deployed environment set `JAPS_CRM_ALLOW_DEMO=false`, use a long `JAPS_CRM_SESSION_SECRET`, and set `JAPS_CRM_COOKIE_SECURE=true`.

When Supabase credentials are present, `/api/dashboard`, `/api/leads`, `/api/trips`, `/api/contacts`, `/api/suppliers`, and `/api/payments` read the organization-scoped records from Supabase. Lead creation creates the customer contact and lead together; trip creation can convert a lead code into a trip; payment logging resolves the human trip code (for example `TRP-248`) to its UUID before writing.

## Current slice

- Command center with action queue, pipeline pulse, upcoming departures, trip health, and recent leads.
- Leads list with search, stage filters, responsive cards, and two-step lead capture drawer.
- Trip workspaces with health and progress drawers.
- Operations week calendar and mobile-friendly day view.
- Money screen for manual incoming/outgoing payment tracking; no gateway collection.
- Contacts, supplier network, reports, file library, and workspace settings surfaces so every primary navigation item has a usable home from day one.
- INR default currency and 5% tax displayed in workspace configuration.
- FastAPI endpoints for login, dashboard, leads, trips, contacts, suppliers, operations, and payments, including lead-to-trip conversion.

## Login note

The requested no-OTP login is implemented as a trusted internal MVP form accepting name, email, and phone. It is not identity verification. Before external or consumer use, replace it with verified Supabase Auth (email/phone OTP or magic link) while keeping the same `organization_memberships` model.

## Hosted app

The public app is served by the worker-backed deployment at
https://japs-crm.rakesh-collegedunia.chatgpt.site. The GitHub Pages entry point
at https://rakesh3834.github.io/Japs_CRM/ redirects to that live app. Supabase
credentials are configured as server-side runtime secrets; they are never
bundled into the frontend.
