// Inbox is the unreviewed intake state; the remaining stages match the agency's workflow.
export const LEAD_STATUSES = ["Inbox", "Requirement_Captured", "Travel Later", "Quotation Sent", "Call Later", "Follow_Up", "Won", "Payment / Negotiation", "No_Response", "Lost"];
export const statusSlug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
