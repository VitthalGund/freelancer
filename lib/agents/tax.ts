// lib/agents/tax.ts
import { callGemini } from "./ai-client";
import Transaction from "@/models/Transaction";

export type Txn = {
    transaction_id: string;
    user_id: string;
    amount: number;
    narration?: string;
    date?: string;
    category?: string;
};

export type Categorization = { transaction_id: string; category: string; deductible: boolean; notes?: string };

const RULES = [
    { pattern: /fuel|petrol|diesel|petrol pump/i, category: "Transport", deductible: false },
    { pattern: /amazon|flipkart|myntra|croma/i, category: "Supplies", deductible: false },
    { pattern: /office|software|github|figma|adobe|paypal|google cloud|aws|azure/i, category: "Software/Tools", deductible: true },
    { pattern: /electricity|internet|broadband|wifi/i, category: "Utilities", deductible: true }
];

/**
 * Trigger helper: shouldTaxAgentAct
 * - act when a new debit/expense txn is ingested OR at month-end batch
 */
export function shouldTaxAgentAct(txn: Txn, eventType: "txn_ingested" | "month_end" = "txn_ingested") {
    if (!txn) return false;
    if (eventType === "txn_ingested") {
        // consider only DEBIT-like narrations (caller decides) — but we'll act conservatively for positive amounts
        return txn.amount > 0;
    }
    return true; // for month_end run
}

/**
 * categorizeTransaction: returns category & deductible flag using rules then LLM fallback
 */
/**
 * categorizeTransaction: returns category & deductible flag using rules then LLM fallback
 */
export async function categorizeTransaction(txn: Txn): Promise<Categorization> {
    const narr = txn.narration || "";
    let result: Categorization = { transaction_id: txn.transaction_id, category: "Other", deductible: false, notes: "init" };
    let confidence = 0;

    // 1. Rule-based matching
    let ruleMatched = false;
    for (const r of RULES) {
        if (r.pattern.test(narr)) {
            result = { transaction_id: txn.transaction_id, category: r.category, deductible: r.deductible, notes: "rule-match" };
            confidence = 100;
            ruleMatched = true;
            break;
        }
    }

    // 2. AI Fallback
    if (!ruleMatched) {
        const prompt = `
    Classify this expense into one of: "Office/Software", "Travel", "Meals", "Supplies", "Utilities", "Medical", "Other".
    Also say whether it is typically tax-deductible for a freelance sole proprietor in India (yes/no) with a one-line reason.
    Return JSON: {"category":"...","deductible":true,"reason":"..."}.
    NARRATION: "${narr.replace(/\n/g, " ")}"
    AMOUNT: ${txn.amount}
      `.trim();

        const gm = await callGemini(prompt, 180);

        try {
            const parsed = JSON.parse(gm.text || "{}");
            result = {
                transaction_id: txn.transaction_id,
                category: parsed.category || "Other",
                deductible: !!parsed.deductible,
                notes: parsed.reason || "LLM"
            };
            confidence = 85; // Arbitrary high confidence for AI
        } catch (e) {
            result = { transaction_id: txn.transaction_id, category: "Other", deductible: false, notes: "fallback" };
            confidence = 0;
        }
    }

    // 3. Update Transaction in DB
    try {
        await Transaction.findOneAndUpdate(
            { transaction_id: txn.transaction_id },
            {
                $set: {
                    transaction_category: result.category,
                    isDeductible: result.deductible,
                    deduction_status: confidence > 80 ? 'auto_verified' : 'needs_review',
                    deduction_confidence: confidence
                }
            }
        );
        console.log(`Tax Agent: Updated Txn ${txn.transaction_id} -> ${result.category} (Deductible: ${result.deductible})`);
    } catch (e) {
        console.error("Failed to update transaction with tax info:", e);
    }

    return result;
}

/**
 * Finds transactions that need manual review for tax deduction.
 */
export async function findDeductionOpportunities(userId: string) {
    try {
        const opportunities = await Transaction.find({
            user_id: userId,
            deduction_status: 'needs_review'
        }).lean();
        return opportunities;
    } catch (e) {
        console.error("Error finding deduction opportunities:", e);
        return [];
    }
}

/**
 * summarizeMonthly: quick monthly deductible summary (simple heuristic + txn narration pattern)
 */
export function summarizeMonthly(txs: Txn[]) {
    const monthMap: Record<string, { deductible_total: number; total: number; counts: number }> = {};
    for (const t of txs) {
        const m = (new Date(t.date || Date.now())).toISOString().slice(0, 7);
        monthMap[m] = monthMap[m] || { deductible_total: 0, total: 0, counts: 0 };
        const isDeduct = /software|office|utilities|aws|figma|adobe|github/i.test(t.narration || "");
        monthMap[m].counts += 1;
        monthMap[m].total += t.amount;
        if (isDeduct) monthMap[m].deductible_total += t.amount;
    }
    return monthMap;
}
