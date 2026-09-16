from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID, uuid4, uuid5, NAMESPACE_URL

import httpx
from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from dotenv import load_dotenv


# Load the workspace-level .env when running uvicorn from either the project
# root or the backend directory. Environment variables still take precedence.
load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")))


APP_NAME = "Japs_CRM API"
DEFAULT_TAX_RATE = 5.0
DEFAULT_CURRENCY = "INR"
SESSION_COOKIE = "japs_crm_session"


class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    supabase_url: str | None = os.getenv("SUPABASE_URL")
    supabase_service_role_key: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    session_secret: str = os.getenv("JAPS_CRM_SESSION_SECRET", "local-development-secret")
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"])
    organization_id: str = os.getenv("JAPS_CRM_ORGANIZATION_ID", "00000000-0000-4000-8000-000000000001")
    allow_demo: bool = os.getenv("JAPS_CRM_ALLOW_DEMO", "true").lower() == "true"
    cookie_secure: bool = os.getenv("JAPS_CRM_COOKIE_SECURE", "false").lower() == "true"


settings = Settings()

# This original prototype used unverified self-declared identities. It must not
# run against customer data. Production and local development now use the same
# verified Worker (`npm run dev:api`). Keep this file only for isolated demos.
if settings.supabase_url or settings.supabase_service_role_key or not settings.allow_demo:
    raise RuntimeError("Legacy demo backend disabled with real data. Run npm run dev:api instead.")


class LoginRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=24)


class User(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    role: str = "Admin"
    organization_id: str


class LeadCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=7, max_length=24)
    email: EmailStr | None = None
    destination: str = Field(min_length=2, max_length=120)
    source: str = "Manual"
    start_date: date | None = None
    travelers: int = Field(default=2, ge=1, le=999)
    notes: str = ""


class PaymentCreate(BaseModel):
    trip_id: str
    title: str
    direction: Literal["in", "out"]
    amount: int = Field(gt=0)
    due_date: date
    method: str = "Bank transfer"
    reference: str = ""


class TripCreate(BaseModel):
    lead_id: str | None = None
    destination: str = Field(min_length=2, max_length=120)
    start_date: date | None = None
    end_date: date | None = None
    travelers: int = Field(default=2, ge=1, le=999)
    total_amount: int = Field(default=0, ge=0)
    customer_due: int = Field(default=0, ge=0)
    stage: Literal["Lead", "Plan", "Quote", "Confirm", "Operate", "Close"] = "Plan"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sign_token(payload: dict[str, Any]) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(settings.session_secret.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{base64.urlsafe_b64encode(signature).decode().rstrip('=')}"


def verify_token(token: str) -> dict[str, Any] | None:
    try:
        body, encoded_signature = token.split(".", 1)
        expected = hmac.new(settings.session_secret.encode(), body.encode(), hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(encoded_signature + "===")
        if not hmac.compare_digest(expected, supplied):
            return None
        payload = json.loads(base64.urlsafe_b64decode(body + "===").decode())
        if float(payload.get("exp", 0)) < time.time():
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def current_user(
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    authorization: str | None = Header(default=None),
) -> User:
    token = session_cookie
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    payload = verify_token(token or "")
    if not payload:
        # The browser MVP can load the demo workspace before the user completes
        # the trusted-login form. Production deployment should set ALLOW_DEMO=false.
        if not settings.allow_demo:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required")
        return User(id="demo-user", name="Aarav Mehta", email="ops@japstravels.in", phone="+91 98765 43210", organization_id=settings.organization_id)
    return User(**payload["user"])


def base_leads() -> list[dict[str, Any]]:
    return [
        {"id": "JAP-1042", "name": "Nisha Kapoor", "source": "Website form", "destination": "Bali", "dates": "18-23 Oct", "travelers": "2 adults", "value": 68000, "owner": "Aarav", "status": "Proposal", "next": "Follow up today", "created_at": "2026-08-30T07:30:00Z"},
        {"id": "JAP-1041", "name": "Mohan & family", "source": "WhatsApp", "destination": "Kashmir", "dates": "02-08 Nov", "travelers": "4 adults · 1 child", "value": 125000, "owner": "Priya", "status": "Qualified", "next": "Build itinerary", "created_at": "2026-08-29T09:20:00Z"},
        {"id": "JAP-1038", "name": "Rhea Shah", "source": "Instagram", "destination": "Dubai", "dates": "14-18 Sep", "travelers": "2 adults", "value": 74000, "owner": "Aarav", "status": "Negotiation", "next": "Send revised quote", "created_at": "2026-08-28T12:10:00Z"},
        {"id": "JAP-1035", "name": "Northstar Pvt. Ltd.", "source": "Referral", "destination": "Vietnam", "dates": "21-28 Dec", "travelers": "12 adults", "value": 420000, "owner": "Vikram", "status": "Discovery", "next": "Schedule call", "created_at": "2026-08-27T06:50:00Z"},
        {"id": "JAP-1032", "name": "Ananya Menon", "source": "Meta lead", "destination": "Kerala", "dates": "09-13 Oct", "travelers": "2 adults · 2 children", "value": 92000, "owner": "Priya", "status": "Nurture", "next": "Review on 12 Sep", "created_at": "2026-08-26T10:25:00Z"},
    ]


def base_trips() -> list[dict[str, Any]]:
    return [
        {"id": "TRP-248", "guest": "Rhea Shah", "destination": "Dubai", "dates": "14-18 Sep", "days": 5, "travelers": 2, "stage": "Confirm", "health": "At risk", "health_tone": "warning", "progress": 72, "amount": 74000, "due": 24000, "owner": "Aarav", "services": "4/6 confirmed"},
        {"id": "TRP-247", "guest": "Mohan & family", "destination": "Kashmir", "dates": "02-08 Nov", "days": 7, "travelers": 5, "stage": "Plan", "health": "On track", "health_tone": "success", "progress": 40, "amount": 125000, "due": 62500, "owner": "Priya", "services": "2/8 confirmed"},
        {"id": "TRP-246", "guest": "Northstar Pvt. Ltd.", "destination": "Vietnam", "dates": "21-28 Dec", "days": 8, "travelers": 12, "stage": "Quote", "health": "On track", "health_tone": "success", "progress": 55, "amount": 420000, "due": 420000, "owner": "Vikram", "services": "Quote draft"},
        {"id": "TRP-241", "guest": "Kabir Jain", "destination": "Kerala", "dates": "07-11 Sep", "days": 5, "travelers": 2, "stage": "Operate", "health": "Ready", "health_tone": "success", "progress": 94, "amount": 58000, "due": 0, "owner": "Aarav", "services": "All confirmed"},
    ]


def base_contacts() -> list[dict[str, Any]]:
    return [
        {"id": "CON-1", "name": "Rhea Shah", "email": "rhea.shah@email.com", "phone": "+91 98200 11223", "type": "Customer", "trips": 2, "last_seen": "Quote viewed 2h ago"},
        {"id": "CON-2", "name": "Mohan & family", "email": "mohan@example.com", "phone": "+91 98765 22018", "type": "Customer", "trips": 1, "last_seen": "Lead qualified yesterday"},
        {"id": "CON-3", "name": "Northstar Pvt. Ltd.", "email": "travel@northstar.in", "phone": "+91 98111 88442", "type": "Agency partner", "trips": 3, "last_seen": "Group quote in progress"},
        {"id": "CON-4", "name": "Kabir Jain", "email": "kabir.jain@email.com", "phone": "+91 98990 44556", "type": "Customer", "trips": 1, "last_seen": "Payment logged today"},
    ]


def base_suppliers() -> list[dict[str, Any]]:
    return [
        {"id": "SUP-1", "name": "ABC Cars", "type": "Transfers", "destination": "Dubai", "contact": "Ahmed Khan · +971 50 112 3344", "status": "Needs attention"},
        {"id": "SUP-2", "name": "SnowPeak Stays", "type": "Hotels", "destination": "Kashmir", "contact": "reservations@snowpeak.in", "status": "On time"},
        {"id": "SUP-3", "name": "Kerala Trails", "type": "Guides · Experiences", "destination": "Kerala", "contact": "Anu Menon · +91 98470 22110", "status": "On time"},
        {"id": "SUP-4", "name": "Lotus DMC", "type": "Ground handling", "destination": "Vietnam", "contact": "ops@lotusdmc.vn", "status": "Review rate card"},
    ]


class DemoStore:
    def __init__(self) -> None:
        self.leads = base_leads()
        self.trips = base_trips()
        self.contacts = base_contacts()
        self.suppliers = base_suppliers()
        self.payments = [
            {"id": "PAY-1", "trip_id": "TRP-248", "title": "Deposit · Rhea Shah", "meta": "TRP-248 · due 14 Sep", "direction": "in", "amount": 24000, "status": "Due soon", "due_date": "2026-09-14"},
            {"id": "PAY-2", "trip_id": "TRP-241", "title": "Balance · Kabir Jain", "meta": "TRP-241 · due today", "direction": "in", "amount": 18000, "status": "Overdue", "due_date": "2026-08-30"},
            {"id": "PAY-3", "trip_id": "TRP-248", "title": "ABC Cars · Dubai transfer", "meta": "TRP-248 · supplier bill", "direction": "out", "amount": 8500, "status": "Due 12 Sep", "due_date": "2026-09-12"},
            {"id": "PAY-4", "trip_id": "TRP-246", "title": "Deposit · Northstar Pvt. Ltd.", "meta": "TRP-246 · due 21 Sep", "direction": "in", "amount": 126000, "status": "Scheduled", "due_date": "2026-09-21"},
        ]

    def create_lead(self, input_data: LeadCreate, owner: str) -> dict[str, Any]:
        item = {
            "id": f"JAP-{1043 + len(self.leads)}",
            "name": input_data.name,
            "source": input_data.source,
            "destination": input_data.destination,
            "dates": input_data.start_date.strftime("%d %b") if input_data.start_date else "Dates flexible",
            "travelers": f"{input_data.travelers} traveler" + ("s" if input_data.travelers != 1 else ""),
            "value": 0,
            "owner": owner,
            "status": "Inbox",
            "next": "Qualify this lead",
            "phone": input_data.phone,
            "email": str(input_data.email) if input_data.email else "",
            "notes": input_data.notes,
            "created_at": now_iso(),
        }
        self.leads.insert(0, item)
        return item

    def create_trip(self, input_data: TripCreate, owner: str) -> dict[str, Any]:
        code = f"TRP-{secrets.randbelow(9000) + 1000}"
        item = {"id": code, "guest": "New traveler", "destination": input_data.destination, "dates": readable_dates(input_data.start_date.isoformat() if input_data.start_date else None, input_data.end_date.isoformat() if input_data.end_date else None), "days": ((input_data.end_date - input_data.start_date).days + 1) if input_data.start_date and input_data.end_date else 0, "travelers": input_data.travelers, "stage": input_data.stage, "health": "On track", "healthTone": "success", "progress": 0, "amount": input_data.total_amount, "due": input_data.customer_due, "owner": owner, "services": "Services pending"}
        self.trips.insert(0, item)
        return item


store = DemoStore()


class SupabaseClient:
    """Small REST adapter; demo data remains available until tables are migrated."""

    @property
    def enabled(self) -> bool:
        return bool(settings.supabase_url and settings.supabase_service_role_key)

    def request(self, method: str, path: str, **kwargs: Any) -> Any:
        if not self.enabled:
            raise RuntimeError("Supabase is not configured")
        base = settings.supabase_url.rstrip("/")
        headers = kwargs.pop("headers", {})
        headers.update({"apikey": settings.supabase_service_role_key, "Authorization": f"Bearer {settings.supabase_service_role_key}"})
        try:
            with httpx.Client(timeout=8) as client:
                result = client.request(method, f"{base}/rest/v1/{path}", headers=headers, **kwargs)
        except httpx.HTTPError as error:
            raise RuntimeError(f"Supabase request failed: {error}") from error
        if result.status_code >= 400:
            raise RuntimeError(result.text[:500])
        return result.json() if result.text else None

    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        query = "&".join(f"{key}={value}" for key, value in params.items())
        result = self.request("GET", f"{table}?{query}")
        return result if isinstance(result, list) else []

    def insert(self, table: str, payload: dict[str, Any], *, return_representation: bool = True) -> list[dict[str, Any]]:
        headers = {"Content-Type": "application/json", "Prefer": "return=representation" if return_representation else "return=minimal"}
        result = self.request("POST", table, headers=headers, json=payload)
        return result if isinstance(result, list) else []

    def upsert(self, table: str, payload: dict[str, Any], conflict: str = "id") -> list[dict[str, Any]]:
        headers = {"Content-Type": "application/json", "Prefer": f"resolution=merge-duplicates,return=representation"}
        result = self.request("POST", f"{table}?on_conflict={conflict}", headers=headers, json=payload)
        return result if isinstance(result, list) else []


def organization_filter(user: User) -> str:
    # Postgres UUID columns reject the local fallback id; in that case the
    # caller keeps using the demo store until a real organization is supplied.
    try:
        UUID(user.organization_id)
    except ValueError:
        raise RuntimeError("JAPS_CRM_ORGANIZATION_ID must be a UUID when Supabase is enabled")
    return f"eq.{user.organization_id}"


def readable_dates(start: str | None, end: str | None) -> str:
    if not start:
        return "Dates flexible"
    if not end:
        return start
    return f"{start[8:10]} {start[5:7]} - {end[8:10]} {end[5:7]}"


def map_lead_row(row: dict[str, Any]) -> dict[str, Any]:
    contact = row.get("contact") or {}
    owner = row.get("owner") or {}
    if isinstance(contact, list):
        contact = contact[0] if contact else {}
    if isinstance(owner, list):
        owner = owner[0] if owner else {}
    return {
        "id": row.get("code") or row.get("id", "")[:8].upper(),
        "uuid": row.get("id", ""),
        "name": contact.get("name", "Unnamed contact"),
        "email": contact.get("email", ""),
        "phone": contact.get("phone", ""),
        "source": row.get("source", "Manual"),
        "destination": row.get("destination", ""),
        "dates": readable_dates(row.get("start_date"), row.get("end_date")),
        "travelers": f"{row.get('travelers', 0)} travelers",
        "value": round((row.get("budget_minor") or 0) / 100),
        "owner": (owner.get("name") or "Unassigned").split(" ")[0],
        "status": row.get("status", "Inbox"),
        "next": row.get("next_action") or "Qualify this lead",
        "notes": row.get("notes", "") or "",
        "created_at": row.get("created_at", ""),
    }


def map_trip_row(row: dict[str, Any]) -> dict[str, Any]:
    contact = row.get("primary_contact") or {}
    owner = row.get("owner") or {}
    if isinstance(contact, list):
        contact = contact[0] if contact else {}
    if isinstance(owner, list):
        owner = owner[0] if owner else {}
    return {
        "id": row.get("code") or row.get("id", "")[:8].upper(),
        "uuid": row.get("id", ""),
        "guest": contact.get("name", "Unnamed guest"),
        "destination": row.get("destination", ""),
        "dates": readable_dates(row.get("start_date"), row.get("end_date")),
        "days": ((date.fromisoformat(row["end_date"]) - date.fromisoformat(row["start_date"])).days + 1) if row.get("start_date") and row.get("end_date") else 0,
        "travelers": row.get("travelers", 0),
        "stage": row.get("stage", "Plan"),
        "health": row.get("health", "On track"),
        "healthTone": "warning" if row.get("health") == "At risk" else "success",
        "progress": row.get("progress", 0),
        "amount": round((row.get("total_minor") or 0) / 100),
        "due": round((row.get("customer_due_minor") or 0) / 100),
        "owner": (owner.get("name") or "Unassigned").split(" ")[0],
        "services": row.get("services_summary", "Services pending"),
    }


def map_contact_row(row: dict[str, Any]) -> dict[str, Any]:
    return {"id": row.get("id", ""), "name": row.get("name", "Unnamed contact"), "email": row.get("email", "") or "", "phone": row.get("phone", "") or "", "type": row.get("type", "Customer"), "notes": row.get("notes", "") or "", "created_at": row.get("created_at", "")}


def map_supplier_row(row: dict[str, Any]) -> dict[str, Any]:
    capabilities = row.get("capabilities") or []
    if isinstance(capabilities, str):
        capabilities = [capabilities]
    return {"id": row.get("id", ""), "name": row.get("name", "Unnamed supplier"), "type": " · ".join(capabilities) or "Travel supplier", "destination": "", "contact": " · ".join(filter(None, [row.get("contact_name"), row.get("phone"), row.get("email")])), "status": "Active"}


def map_payment_row(row: dict[str, Any]) -> dict[str, Any]:
    trip = row.get("trip") or {}
    if isinstance(trip, list):
        trip = trip[0] if trip else {}
    trip_code = trip.get("code") or row.get("trip_id", "")
    return {
        "id": row.get("id", ""),
        "trip_id": trip_code,
        "title": row.get("title", "Payment"),
        "meta": f"{trip_code} · {row.get('status', 'Scheduled')}",
        "direction": row.get("direction", "in"),
        "amount": round((row.get("amount_minor") or 0) / 100),
        "status": row.get("status", "Scheduled"),
        "due_date": row.get("due_date", ""),
        "method": row.get("method", ""),
        "reference": row.get("reference", ""),
    }


def remote_leads(user: User, status_filter: str | None = None, q: str | None = None) -> list[dict[str, Any]]:
    params = {
        "select": "id,code,source,status,destination,start_date,end_date,travelers,budget_minor,next_action,notes,created_at,contact:contacts(name,email,phone),owner:profiles(name)",
        "organization_id": organization_filter(user),
        "order": "created_at.desc",
        "limit": "100",
    }
    if status_filter:
        params["status"] = f"eq.{status_filter}"
    rows = supabase.select("leads", params)
    result = [map_lead_row(row) for row in rows]
    if q:
        needle = q.lower().strip()
        result = [item for item in result if needle in json.dumps(item).lower()]
    return result


def remote_trips(user: User, stage: str | None = None) -> list[dict[str, Any]]:
    params = {
        "select": "id,code,stage,health,destination,start_date,end_date,travelers,total_minor,customer_due_minor,progress,services_summary,primary_contact:contacts(name),owner:profiles(name)",
        "organization_id": organization_filter(user),
        "order": "start_date.asc",
        "limit": "100",
    }
    if stage:
        params["stage"] = f"eq.{stage}"
    return [map_trip_row(row) for row in supabase.select("trips", params)]


def remote_contacts(user: User, q: str | None = None) -> list[dict[str, Any]]:
    params = {"select": "id,name,email,phone,type,notes,created_at", "organization_id": organization_filter(user), "order": "created_at.desc", "limit": "100"}
    items = [map_contact_row(row) for row in supabase.select("contacts", params)]
    if q:
        needle = q.lower().strip()
        items = [item for item in items if needle in json.dumps(item).lower()]
    return items


def remote_suppliers(user: User, q: str | None = None) -> list[dict[str, Any]]:
    params = {"select": "id,name,contact_name,email,phone,capabilities,created_at", "organization_id": organization_filter(user), "order": "name.asc", "limit": "100"}
    items = [map_supplier_row(row) for row in supabase.select("suppliers", params)]
    if q:
        needle = q.lower().strip()
        items = [item for item in items if needle in json.dumps(item).lower()]
    return items


def remote_payments(user: User, direction: Literal["in", "out"] | None = None) -> list[dict[str, Any]]:
    params = {"select": "id,trip_id,title,direction,amount_minor,currency,due_date,paid_at,method,reference,status,trip:trips(code)", "organization_id": organization_filter(user), "order": "due_date.asc", "limit": "100"}
    if direction:
        params["direction"] = f"eq.{direction}"
    return [map_payment_row(row) for row in supabase.select("payments", params)]


def resolve_trip_id(user: User, trip_reference: str) -> str:
    try:
        UUID(trip_reference)
        return trip_reference
    except ValueError:
        params = {"select": "id", "organization_id": organization_filter(user), "code": f"eq.{trip_reference}", "limit": "1"}
        rows = supabase.select("trips", params)
        if not rows:
            raise RuntimeError(f"Trip {trip_reference} was not found in Supabase")
        return rows[0]["id"]


def resolve_lead_row(user: User, lead_reference: str) -> dict[str, Any]:
    try:
        UUID(lead_reference)
        params = {"select": "id,contact_id,destination,start_date,end_date,travelers", "organization_id": organization_filter(user), "id": f"eq.{lead_reference}", "limit": "1"}
    except ValueError:
        params = {"select": "id,contact_id,destination,start_date,end_date,travelers", "organization_id": organization_filter(user), "code": f"eq.{lead_reference}", "limit": "1"}
    rows = supabase.select("leads", params)
    if not rows:
        raise RuntimeError(f"Lead {lead_reference} was not found in Supabase")
    return rows[0]


supabase = SupabaseClient()


app = FastAPI(title=APP_NAME, version="0.1.0", description="FastAPI backend for Japs_CRM travel agency CRM")
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health() -> dict[str, Any]:
    reachable = False
    warning = None
    if supabase.enabled:
        try:
            supabase.request("GET", "organizations?select=id&limit=1")
            reachable = True
        except RuntimeError as error:
            warning = str(error)
    return {"ok": True, "service": APP_NAME, "supabase_configured": supabase.enabled, "supabase_reachable": reachable, "warning": warning, "currency": DEFAULT_CURRENCY, "tax_rate": DEFAULT_TAX_RATE}


@app.post("/api/auth/login")
def login(request: LoginRequest, response: Response) -> dict[str, Any]:
    # Intentionally no OTP in this MVP per the product decision. This must be
    # replaced with verified Supabase Auth before public/consumer deployment.
    profile_id = str(uuid5(NAMESPACE_URL, f"japs-crm:{str(request.email).lower()}"))
    user = User(id=profile_id, name=request.name, email=str(request.email), phone=request.phone, organization_id=settings.organization_id)
    if supabase.enabled:
        try:
            UUID(settings.organization_id)
            supabase.upsert("organizations", {"id": settings.organization_id, "name": "Japs Travels", "brand_name": "Japs_CRM", "default_currency": DEFAULT_CURRENCY, "tax_rate": DEFAULT_TAX_RATE})
            supabase.upsert("profiles", {"id": profile_id, "name": user.name, "email": user.email, "phone": user.phone})
            supabase.upsert("organization_memberships", {"organization_id": settings.organization_id, "profile_id": profile_id, "role": "Admin"}, conflict="organization_id,profile_id")
        except (RuntimeError, ValueError):
            # Keep login usable while an administrator finishes the first SQL setup.
            pass
    token = sign_token({"user": user.model_dump(), "exp": time.time() + 60 * 60 * 24 * 30})
    response.set_cookie(SESSION_COOKIE, token, httponly=True, secure=settings.cookie_secure, samesite="lax", max_age=60 * 60 * 24 * 30)
    return {"ok": True, "user": user, "session": token, "trusted_login": True}


@app.post("/api/auth/logout")
def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@app.get("/api/me")
def me(user: User = Depends(current_user)) -> dict[str, Any]:
    return {"ok": True, "user": user, "trusted_login": True}


@app.get("/api/dashboard")
def dashboard(user: User = Depends(current_user)) -> dict[str, Any]:
    leads, trips, payments = store.leads[:5], store.trips, store.payments
    source = "demo"
    if supabase.enabled:
        try:
            leads = remote_leads(user)[:5]
            trips = remote_trips(user)
            payments = remote_payments(user)
            source = "supabase"
        except RuntimeError:
            pass
    incoming_due = sum(item["amount"] for item in payments if item.get("direction") == "in" and item.get("status") != "Paid")
    return {"ok": True, "source": source, "workspace": {"name": "Japs Travels", "brand": "Japs_CRM", "currency": DEFAULT_CURRENCY, "tax_rate": DEFAULT_TAX_RATE}, "stats": {"open_enquiries": sum(lead.get("status") not in {"Won", "Lost"} for lead in leads), "active_trips": len(trips), "customer_due": incoming_due, "margin_at_risk": sum(trip.get("health") == "At risk" for trip in trips)}, "leads": leads, "trips": trips, "payments": payments, "viewer": user}


@app.get("/api/leads")
def list_leads(status_filter: str | None = Query(default=None, alias="status"), q: str | None = None, user: User = Depends(current_user)) -> dict[str, Any]:
    leads = store.leads
    if supabase.enabled:
        try:
            leads = remote_leads(user, status_filter, q)
            return {"ok": True, "source": "supabase", "items": leads, "count": len(leads)}
        except RuntimeError:
            pass
    if status_filter:
        leads = [lead for lead in leads if lead.get("status") == status_filter]
    if q:
        needle = q.lower().strip()
        leads = [lead for lead in leads if needle in json.dumps(lead).lower()]
    return {"ok": True, "items": leads, "count": len(leads)}


@app.post("/api/leads", status_code=status.HTTP_201_CREATED)
def create_lead(input_data: LeadCreate, user: User = Depends(current_user)) -> dict[str, Any]:
    item = store.create_lead(input_data, user.name.split(" ")[0])
    if supabase.enabled:
        try:
            item["id"] = f"JAP-{secrets.randbelow(9000) + 1000}"
            contact_rows = supabase.insert("contacts", {"organization_id": user.organization_id, "name": input_data.name, "phone": input_data.phone, "email": str(input_data.email) if input_data.email else None, "type": "Customer"})
            contact_id = contact_rows[0]["id"] if contact_rows else None
            start_date = input_data.start_date.isoformat() if input_data.start_date else None
            lead_payload = {"organization_id": user.organization_id, "contact_id": contact_id, "code": item["id"], "source": input_data.source, "owner_id": user.id, "status": "Inbox", "destination": input_data.destination, "start_date": start_date, "travelers": input_data.travelers, "notes": input_data.notes, "next_action": "Qualify this lead"}
            supabase.insert("leads", lead_payload, return_representation=False)
            item["synced_at"] = now_iso()
            return {"ok": True, "item": item, "synced": True}
        except RuntimeError:
            # Keep the local mutation visible and return a clear sync signal.
            return {"ok": True, "item": item, "synced": False, "warning": "Supabase write failed; item is in local demo state."}
    return {"ok": True, "item": item, "synced": supabase.enabled}


@app.get("/api/trips")
def list_trips(stage: str | None = None, user: User = Depends(current_user)) -> dict[str, Any]:
    if supabase.enabled:
        try:
            trips = remote_trips(user, stage)
            return {"ok": True, "source": "supabase", "items": trips, "count": len(trips)}
        except RuntimeError:
            pass
    trips = [trip for trip in store.trips if not stage or trip["stage"] == stage]
    return {"ok": True, "source": "demo", "items": trips, "count": len(trips)}


@app.post("/api/trips", status_code=status.HTTP_201_CREATED)
def create_trip(input_data: TripCreate, user: User = Depends(current_user)) -> dict[str, Any]:
    if not supabase.enabled:
        item = store.create_trip(input_data, user.name.split(" ")[0])
        return {"ok": True, "source": "demo", "item": item, "synced": False}
    try:
        lead_row = resolve_lead_row(user, input_data.lead_id) if input_data.lead_id else None
        code = f"TRP-{secrets.randbelow(9000) + 1000}"
        payload = {"organization_id": user.organization_id, "lead_id": lead_row.get("id") if lead_row else None, "primary_contact_id": lead_row.get("contact_id") if lead_row else None, "code": code, "stage": input_data.stage, "health": "On track", "destination": input_data.destination, "start_date": input_data.start_date.isoformat() if input_data.start_date else None, "end_date": input_data.end_date.isoformat() if input_data.end_date else None, "travelers": input_data.travelers, "total_minor": input_data.total_amount * 100, "customer_due_minor": input_data.customer_due * 100, "progress": 0, "services_summary": "Services pending", "owner_id": user.id}
        rows = supabase.insert("trips", payload)
        item = map_trip_row(rows[0]) if rows else {"id": code, "destination": input_data.destination}
        item["id"] = code
        item["synced_at"] = now_iso()
        return {"ok": True, "source": "supabase", "item": item, "synced": True}
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error


@app.get("/api/contacts")
def list_contacts(q: str | None = None, user: User = Depends(current_user)) -> dict[str, Any]:
    if supabase.enabled:
        try:
            items = remote_contacts(user, q)
            return {"ok": True, "source": "supabase", "items": items, "count": len(items)}
        except RuntimeError:
            pass
    items = store.contacts
    if q:
        needle = q.lower().strip()
        items = [item for item in items if needle in json.dumps(item).lower()]
    return {"ok": True, "source": "demo", "items": items, "count": len(items)}


@app.get("/api/suppliers")
def list_suppliers(q: str | None = None, user: User = Depends(current_user)) -> dict[str, Any]:
    if supabase.enabled:
        try:
            items = remote_suppliers(user, q)
            return {"ok": True, "source": "supabase", "items": items, "count": len(items)}
        except RuntimeError:
            pass
    items = store.suppliers
    if q:
        needle = q.lower().strip()
        items = [item for item in items if needle in json.dumps(item).lower()]
    return {"ok": True, "source": "demo", "items": items, "count": len(items)}


@app.get("/api/operations")
def operations(user: User = Depends(current_user)) -> dict[str, Any]:
    return {"ok": True, "week_start": date.today().isoformat(), "items": [{"trip_id": "TRP-241", "date": date.today().isoformat(), "title": "Kabir Jain", "detail": "Airport pickup · Kerala", "status": "confirmed"}, {"trip_id": "TRP-248", "date": (date.today() + timedelta(days=1)).isoformat(), "title": "Rhea Shah", "detail": "Dubai transfer · chase", "status": "needs_action"}, {"trip_id": "TRP-247", "date": (date.today() + timedelta(days=3)).isoformat(), "title": "Mohan & family", "detail": "Kashmir hotel hold", "status": "planning"}]}


@app.get("/api/payments")
def list_payments(direction: Literal["in", "out"] | None = None, user: User = Depends(current_user)) -> dict[str, Any]:
    if supabase.enabled:
        try:
            items = remote_payments(user, direction)
            return {"ok": True, "source": "supabase", "items": items, "currency": DEFAULT_CURRENCY, "tax_rate": DEFAULT_TAX_RATE}
        except RuntimeError:
            pass
    items = [payment for payment in store.payments if not direction or payment["direction"] == direction]
    return {"ok": True, "source": "demo", "items": items, "currency": DEFAULT_CURRENCY, "tax_rate": DEFAULT_TAX_RATE}


@app.post("/api/payments", status_code=status.HTTP_201_CREATED)
def create_payment(input_data: PaymentCreate, user: User = Depends(current_user)) -> dict[str, Any]:
    item = {"id": f"PAY-{secrets.token_hex(3)}", **input_data.model_dump(mode="json"), "status": "Logged", "meta": f"{input_data.trip_id} · manually logged"}
    synced: bool | str = False
    if supabase.enabled:
        try:
            remote_trip_id = resolve_trip_id(user, input_data.trip_id)
            supabase.insert("payments", {"organization_id": user.organization_id, "trip_id": remote_trip_id, "title": input_data.title, "direction": input_data.direction, "amount_minor": input_data.amount * 100, "currency": DEFAULT_CURRENCY, "due_date": input_data.due_date.isoformat(), "method": input_data.method, "reference": input_data.reference, "status": "Logged"}, return_representation=False)
            synced = True
        except RuntimeError as error:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    store.payments.insert(0, item)
    return {"ok": True, "item": item, "synced": synced}


@app.get("/api/config")
def config(user: User = Depends(current_user)) -> dict[str, Any]:
    return {"ok": True, "brand": "Japs_CRM", "default_currency": DEFAULT_CURRENCY, "tax_rate": DEFAULT_TAX_RATE, "payment_collection_enabled": False, "lead_channels": ["Manual", "Web form", "Email", "WhatsApp", "Instagram", "Meta lead", "Referral"]}
