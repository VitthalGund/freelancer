
import dbConnect from "./lib/db";
import { calculateTaxLiability } from "./lib/agents/cfo";
import Transaction from "./models/Transaction";

async function debugCFO() {
    await dbConnect();
    
    // Find a user with transactions
    const txn = await Transaction.findOne();
    if (!txn) {
        console.log("No transactions found in DB.");
        return;
    }
    
    const userId = txn.user_id;
    console.log(`Testing with User ID: ${userId}`);
    
    const result = await calculateTaxLiability(userId);
    console.log("Result:", result);
    
    // Check raw count manually
    const now = new Date();
    const currentYear = now.getFullYear();
    const startYear = now.getMonth() >= 3 ? currentYear : currentYear - 1;
    const fyStart = new Date(`${startYear}-04-01`);
    
    const count = await Transaction.countDocuments({
        user_id: userId,
        date: { $gte: fyStart },
        transaction_type: 'CREDIT'
    });
    console.log(`Manual Count for CREDIT since ${fyStart.toISOString()}: ${count}`);
}

debugCFO().then(() => process.exit());
