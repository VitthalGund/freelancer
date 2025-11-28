// lib/agents/collections.ts
import { callGemini } from "./ai-client";
import Invoice from "@/models/Invoice";

export type InvoiceRow = {
    invoice_id: string;
    company_id?: string;
    client_id?: string;
    related_freelancer_id?: string;
    amount_due?: number;
    currency?: string;
    due_date?: string;
    status?: string;
    days_overdue?: number;
    last_communication_at?: string;
    risk_score?: number; // optional precomputed client risk score
};

export type CollectionsAction =
    | { type: "send_message"; channel: "email" | "whatsapp"; to: string; subject?: string; body: string; invoice_id: string }
    | { type: "escalate_to_legal"; invoice_id: string; reason: string; payload?: any }
    | { type: "schedule_followup"; invoice_id: string; when: string; method: string };

const NUDGE_THRESHOLDS = { polite: 3, firm: 10, legal: 30 };

/**
 * Trigger helper: when should Collections act?
 * - If invoice days_overdue crosses thresholds or status changes.
 * - If partial payment (status="PARTIAL") -> nudge.
 */
export function shouldActOnInvoice(invoice: InvoiceRow) {
    if (!invoice) return false;
    const status = (invoice.status || "").toUpperCase();
    if (status === "PAID") return false;
    const days = Number(invoice.days_overdue || 0);
    if (days >= NUDGE_THRESHOLDS.polite) return true;
    if (status === "PARTIAL") return true;
    return false;
}

/**
 * Main handler: onInvoiceAging -> returns action (send message or escalate)
 */
/**
 * Main handler: onInvoiceAging -> returns action (send message or escalate)
 */
export async function onInvoiceAging(invoice: InvoiceRow, services: { sendEmail?: Function; sendWhatsApp?: Function } = {}) {
    if (!invoice) return null;

    const status = (invoice.status || "").toUpperCase();
    if (status === "PAID") return null;

    const daysOver = Number(invoice.days_overdue || 0);
    let level: "polite" | "firm" | "legal" | null = null;
    if (daysOver >= NUDGE_THRESHOLDS.legal) level = "legal";
    else if (daysOver >= NUDGE_THRESHOLDS.firm) level = "firm";
    else if (daysOver >= NUDGE_THRESHOLDS.polite) level = "polite";
    else level = null;

    // If partial payment, prefer polite/follow-up
    if (status === "PARTIAL" && level === null) level = "polite";

    if (!level) return null;

    // If client risk score high -> escalate sooner (example rule)
    const risk = Number(invoice.risk_score || 0);
    if (risk > 80 && level === "polite") level = "firm";

    const tone =
        level === "polite"
            ? "polite and friendly"
            : level === "firm"
                ? "firm and professional"
                : "formal legal language referencing contract terms and next steps";

    const prompt = `
You are an accounts receivable assistant. Compose a ${tone} message for invoice ${invoice.invoice_id} (amount: ${invoice.amount_due || "N/A"} ${invoice.currency || "INR"}, days overdue: ${daysOver}). 
Include:
- short opening reminding of invoice
- clear ask (date by when payment will be made)
- consequences if not paid (for firm/legal only)
- proposed payment options (UPI/NEFT/CARD)
Return subject (one line) and body separated by a blank line.
  `.trim();

    const gm = await callGemini(prompt, 250);
    const aiText = gm.text || `Reminder for invoice ${invoice.invoice_id}. Please pay.`;

    // Simple parse: first blank-line separation => subject / body
    const [subject, ...bodyParts] = aiText.split(/\n\n/);
    const body = bodyParts.join("\n\n").trim() || aiText;

    // Update Invoice with draft nudge
    try {
        await Invoice.findOneAndUpdate(
            { invoice_id: invoice.invoice_id },
            {
                $set: {
                    draft_nudge: {
                        subject: subject.replace("Subject: ", "").trim(),
                        body: body,
                        status: "waiting_approval",
                        generated_at: new Date()
                    }
                }
            }
        );
        console.log(`Collections Agent: Draft nudge saved for Invoice ${invoice.invoice_id}`);
    } catch (e) {
        console.error("Failed to update invoice with draft nudge:", e);
    }

    if (level === "legal") {
        return {
            type: "escalate_to_legal",
            invoice_id: invoice.invoice_id,
            reason: `Overdue ${daysOver} days / risk ${risk}`,
            payload: { subject, body }
        } as CollectionsAction;
    }

    const channel: "whatsapp" | "email" = level === "polite" ? "whatsapp" : "email";

    // Also schedule next follow-up depending on level
    const followupDays = level === "polite" ? 4 : level === "firm" ? 7 : 0;
    const followupISO = followupDays > 0 ? new Date(Date.now() + followupDays * 24 * 3600 * 1000).toISOString() : "";

    return {
        success: true,
        action: "draft_saved",
        type: "send_message", // Keeping for compatibility if needed
        channel,
        to: invoice.client_id || invoice.company_id || "unknown",
        subject,
        body,
        invoice_id: invoice.invoice_id,
        ...(followupISO ? { schedule_followup_at: followupISO } : {})
    } as any; // Cast to any to allow modified return type
}
