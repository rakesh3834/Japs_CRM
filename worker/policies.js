const contact = '<a href="mailto:contactjapstours@gmail.com">contactjapstours@gmail.com</a>';
const pages = {
  "/privacy": { title: "Privacy notice", content: `
    <p>This notice explains how Travel with Japs uses personal information in its Japs_CRM travel-enquiry workspace, including enquiries received through WhatsApp and Meta ads.</p>
    <h2>Information we use</h2>
    <p>We receive your WhatsApp phone number or sender identifier, available profile display name, messages and selected enquiry options, message timestamps and identifiers, and available ad-referral information. We associate an ad reference with its campaign and ad-set details when Meta provides access. We also record travel preferences and contact details you provide and staff notes needed to handle your enquiry.</p>
    <p>Opening an ad or WhatsApp chat alone does not supply your contact details to this CRM. WhatsApp enquiries are recorded after a message is sent. Your Facebook or Instagram username and the exact platform of a click are not assumed when they are unavailable.</p>
    <h2>Why we use it</h2>
    <p>We use this information to respond to enquiries, follow up on requested travel arrangements, manage customer records and understand which ads generated enquiries. This CRM enquiry information is not used for unrelated promotional campaigns or shared with other businesses for their own marketing.</p>
    <h2>Access and service providers</h2>
    <p>Authorised Travel with Japs staff can access the workspace according to their assigned permissions. Meta/WhatsApp provides messaging and advertising services, Supabase provides database and account services, and our website hosting service operates the CRM. These services process information needed to provide their functions. Customer records are not publicly accessible through the CRM.</p>
    <h2>Retention</h2>
    <p>We review unsuccessful travel enquiries after 12 months to decide whether they are still needed or should be deleted. This is a manual review policy, not a promise of automatic deletion on a fixed date. Records needed for ongoing travel arrangements, legitimate record keeping or applicable legal obligations may need to be retained longer.</p>
    <h2>Your questions and requests</h2>
    <p>To ask about, correct or request deletion of your information, contact ${contact}. We may ask for information needed to verify that the request concerns your records. See our <a href="/data-deletion">data-deletion instructions</a>.</p>
    <p>This notice covers Travel with Japs' CRM use. Meta, WhatsApp and other services have their own notices governing their independent use of information.</p>` },
  "/data-deletion": { title: "Data-deletion instructions", content: `
    <p>You can request deletion of personal information held by Travel with Japs in Japs_CRM by emailing ${contact} with the subject <strong>Delete my Travel with Japs data</strong>.</p>
    <ol><li>Include the WhatsApp number with country code used for the enquiry, your name if provided, and the approximate enquiry date.</li><li>Tell us whether you want all enquiry information deleted or a particular record corrected or removed. Do not send passwords, verification codes or payment-card details.</li><li>Our team will verify ownership as needed, review the records manually and confirm the outcome. If some information must be retained for ongoing arrangements or applicable obligations, we will explain that.</li></ol>
    <p>This is a manually handled request process, not an automatic deletion button. Deleting a chat in WhatsApp does not by itself delete a CRM record. A request to Travel with Japs does not delete your WhatsApp account or copies independently held by other services or people.</p>
    <p>Read our <a href="/privacy">privacy notice</a> for information about collection, access and retention.</p>` },
};

export function policyResponse(path) {
  const page = pages[path.replace(/\/$/, "")];
  if (!page) return null;
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.title} · Travel with Japs</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#183b3b;background:#f5f8f8;margin:0}main{max-width:760px;margin:3rem auto;padding:2rem;background:white;border:1px solid #dce7e7;border-radius:16px}h1{font-size:2rem;line-height:1.2}h2{font-size:1.25rem;margin-top:2rem}a{color:#14666a}small{color:#506767}@media(max-width:600px){main{margin:1rem;padding:1.25rem}}</style></head><body><main><a href="/">Travel with Japs · Japs_CRM</a><h1>${page.title}</h1><small>Last updated: 17 September 2026</small>${page.content}</main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" } });
}
