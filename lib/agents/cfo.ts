// lib/agents/cfo.ts
import { callGemini } from "./ai-client";
import Transaction from "@/models/Transaction";
import Notification from "@/models/Notification";

export type TransactionType = {
    transaction_id: string;
    user_id: string;
    amount: number;
    type: string; // CREDIT / DEBIT
    narration?: string;
    date?: string;
    balance_after_transaction?: number;
    related_invoice_id?: string;
};

export type SmartSplitConfig = {
    tax_pct: number;
    savings_pct: number;
    buffer_pct: number;
};

export const DEFAULT_SPLIT: SmartSplitConfig = { tax_pct: 30, savings_pct: 20, buffer_pct: 50 };

/**
 * Calculates macro financial metrics for the user.
 */
export async function calculateFinancialMetrics(userId: string) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const transactions = await Transaction.find({
        user_id: userId,
        date: { $gte: ninetyDaysAgo }
    }).lean();

    let totalLiquidity = 0; 
    // Get latest balance from the most recent transaction
    const latestTxn = await Transaction.findOne({ user_id: userId }).sort({ date: -1 }).lean();
    if (latestTxn && typeof latestTxn.balance_after_transaction === 'number') {
        totalLiquidity = latestTxn.balance_after_transaction;
    }

    let totalBurn = 0;
    transactions.forEach((t: any) => {
        if (t.transaction_type === 'DEBIT' || t.type === 'DEBIT') {
            totalBurn += t.amount;
        }
    });

    const monthlyBurnRate = totalBurn / 3; // Average over 3 months
    const runwayDays = monthlyBurnRate > 0 ? (totalLiquidity / (monthlyBurnRate / 30)) : 0;
    
    // Health Score: Goal is 180 days (6 months) runway
    const healthScore = Math.min(100, Math.round((runwayDays / 180) * 100));

    return {
        liquidity: totalLiquidity,
        burnRate: Math.round(monthlyBurnRate),
        runwayDays: Math.round(runwayDays),
        healthScore
    };
}

/**
 * Calculates estimated tax liability for the current financial year.
 */
export async function calculateTaxLiability(userId: string) {
    // Financial Year starts April 1st
    const now = new Date();
    const currentYear = now.getFullYear();
    const startYear = now.getMonth() >= 3 ? currentYear : currentYear - 1;
    const fyStart = new Date(`${startYear}-04-01`);

    const transactions = await Transaction.find({
        user_id: userId,
        date: { $gte: fyStart },
        $or: [{ type: 'CREDIT' }, { transaction_type: 'CREDIT' }]
    }).lean();

    let totalIncome = 0;
    transactions.forEach((t: any) => {
        totalIncome += t.amount;
    });

    // Simple 30% estimation
    const estimatedTaxDue = Math.round(totalIncome * 0.3);

    return { estimatedTaxDue };
}

/**
 * Trigger helper: decide whether CFO agent should act.
 */
export function shouldActOnTransaction(txn: TransactionType, profile: { balances?: { checking?: number } } = { balances: {} }) {
    if (!txn) return false;
    const t = (txn.type || "").toUpperCase();
    if (t === "CREDIT" && txn.amount > 0) return true;
    if (t === "DEBIT" && typeof txn.balance_after_transaction === "number") {
        const lowBalanceThreshold = (profile.balances?.checking ?? 0) * 0.15;
        if (txn.balance_after_transaction < lowBalanceThreshold) return true;
    }
    return false;
}

/**
 * Main handler: onTransaction - suggests smart split and persists notifications.
 */
export async function onTransaction(
    txn: TransactionType,
    profile: { user_id: string; monthly_burn?: number; balances?: any; smart_split_config?: SmartSplitConfig } = { user_id: "" }
) {
    if (!txn) return null;
    const txType = (txn.type || "").toUpperCase();

    // Low-balance alert for DEBIT
    if (txType === "DEBIT" && typeof txn.balance_after_transaction === "number") {
        const lowBalanceThreshold = (profile.balances?.checking ?? 0) * 0.15;
        if (txn.balance_after_transaction < lowBalanceThreshold) {
            const prompt = `Shortly notify user: account balance low. Balance after transaction: ₹${txn.balance_after_transaction}. Suggest 3 quick actions: (1) pause non-essential services (2) request early payments (3) move buffer from savings. Output 3 bullets.`;
            const gm = await callGemini(prompt, 120);
            
            // Persist Low Balance Alert
            await Notification.create({
                recipientId: txn.user_id,
                type: "system", // or 'alert'
                message: gm.text || `Low balance alert: ₹${txn.balance_after_transaction}`,
                read: false,
                relatedJobId: txn.transaction_id // reusing field for entity ID
            });

            return {
                type: "low_balance_alert",
                txn_id: txn.transaction_id,
                balance: txn.balance_after_transaction,
                message: gm.text || `Low balance: ₹${txn.balance_after_transaction}.`,
                suggested_actions: ["Pause services", "Request early payments", "Move buffer"]
            };
        }
        return null;
    }

    // SmartSplit for CREDITs
    if (txType === "CREDIT" && txn.amount > 0) {
        const cfg: SmartSplitConfig = profile["smart_split_config"] || DEFAULT_SPLIT;

        const tax_amount = Math.round((cfg.tax_pct / 100) * txn.amount);
        const savings_amount = Math.round((cfg.savings_pct / 100) * txn.amount);
        const buffer_amount = Math.round(txn.amount - tax_amount - savings_amount);

        const actions = [
            { action: "transfer", to: "tax_savings", amount: tax_amount, reason: "smart_split_tax" },
            { action: "transfer", to: "savings", amount: savings_amount, reason: "smart_split_savings" },
            { action: "leave_checking", amount: buffer_amount, reason: "spendable_buffer" }
        ];

        const prompt = `Summarize the following split to the user in two short sentences: Incoming payment ₹${txn.amount}. We suggest: Tax ₹${tax_amount}, Savings ₹${savings_amount}, Checking ₹${buffer_amount}. Also include one short actionable sentence: "Approve transfers" or "Adjust split".`;
        const gm = await callGemini(prompt, 120);

        const message = gm.text || `Incoming ₹${txn.amount}. Suggested Split: Tax ₹${tax_amount}, Savings ₹${savings_amount}.`;

        // Persist Smart Split Notification
        await Notification.create({
            recipientId: txn.user_id,
            type: "ACTION_REQUIRED", // New type for actionable notifications
            title: "Smart Split Review",
            message: message,
            read: false,
            relatedJobId: txn.transaction_id,
            metadata: {
                split: {
                    tax: tax_amount,
                    savings: savings_amount,
                    buffer: buffer_amount
                },
                originalAmount: txn.amount,
                actions: actions
            }
        });

        console.log(`CFO Agent: Smart Split Notification created for Txn ${txn.transaction_id}`);

        return {
            type: "smart_split",
            txn_id: txn.transaction_id,
            suggested_actions: actions,
            message: message,
            meta: {
                tax_pct: cfg.tax_pct,
                savings_pct: cfg.savings_pct,
                buffer_pct: cfg.buffer_pct
            }
        };
    }

    return null;
}
