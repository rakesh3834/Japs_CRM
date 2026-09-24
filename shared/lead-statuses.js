// Six day-to-day queues stay prominent; less common closed/nurture stages remain
// available in the lead workspace without cluttering the command-center pipeline.
export const PRIMARY_LEAD_STATUSES = [
  "Yet to contact",
  "Requirements captured",
  "Quotation sent",
  "Follow up",
  "Call later",
  "No response",
];

export const LEAD_STATUSES = [
  ...PRIMARY_LEAD_STATUSES,
  "Travel Later",
  "Won",
  "Payment / Negotiation",
  "Lost",
];

const legacyStatusNames = new Map([
  ["Inbox", "Yet to contact"],
  ["Qualified", "Requirements captured"],
  ["Discovery", "Requirements captured"],
  ["Requirement_Captured", "Requirements captured"],
  ["Quotation Sent", "Quotation sent"],
  ["Proposal", "Quotation sent"],
  ["Follow_Up", "Follow up"],
  ["Call Later", "Call later"],
  ["No_Response", "No response"],
]);

export function normalizeLeadStatus(value) {
  return legacyStatusNames.get(value) || value || "Yet to contact";
}

// The deployed Supabase CHECK constraint still stores the legacy values. Keep
// that schema compatible while the CRM shows the cleaner working-stage labels.
export function storedLeadStatus(value) {
  const canonical = normalizeLeadStatus(value);
  return new Map([
    ["Yet to contact", "Inbox"],
    ["Requirements captured", "Requirement_Captured"],
    ["Quotation sent", "Quotation Sent"],
    ["Follow up", "Follow_Up"],
    ["Call later", "Call Later"],
    ["No response", "No_Response"],
  ]).get(canonical) || canonical;
}

export const statusSlug = (value) => normalizeLeadStatus(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
