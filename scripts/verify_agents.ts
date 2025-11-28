
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import Transaction from '../models/Transaction';
import Notification from '../models/Notification';
import Invoice from '../models/Invoice';
import Task from '../models/Task';
import Event from '../models/Event';
import { onTransaction } from '../lib/agents/cfo';
import { onInvoiceAging } from '../lib/agents/collections';
import { categorizeTransaction } from '../lib/agents/tax';
import { evaluateSchedule, executeAction } from '../lib/agents/productivity';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Please define the MONGODB_URI environment variable inside .env.local');
  process.exit(1);
}

async function verifyAgents() {
  try {
    await mongoose.connect(MONGODB_URI as string);
    console.log('Connected to MongoDB');

    // 1. Setup Test User
    const testUserId = "test_user_" + Date.now();
    await User.create({
        userId: testUserId,
        name: "Test User",
        email: `test${Date.now()}@example.com`,
        phone: `99999${Date.now().toString().slice(-5)}`,
        password: "hashedpassword",
        role: "freelancer",
        skills: ["React", "Node.js"],
        experienceYears: 5
    });
    console.log(`\n1. Created Test User: ${testUserId}`);

    // 2. Verify CFO Agent (Smart Split)
    console.log('\n2. Verifying CFO Agent...');
    const creditTxn = await Transaction.create({
        transaction_id: `txn_${Date.now()}`,
        user_id: testUserId,
        amount: 10000,
        type: "CREDIT",
        transaction_type: "CREDIT",
        date: new Date(),
        narration: "Freelance Payment"
    });
    
    await onTransaction(creditTxn.toObject(), { user_id: testUserId });
    
    const notification = await Notification.findOne({ relatedJobId: creditTxn.transaction_id });
    if (notification && notification.metadata) {
        console.log('✅ CFO Agent: Smart Split Notification created with metadata:', notification.metadata);
    } else {
        console.error('❌ CFO Agent: Notification not found or missing metadata');
    }

    // 3. Verify Collections Agent (Draft Nudge)
    console.log('\n3. Verifying Collections Agent...');
    const invoiceId = `inv_${Date.now()}`;
    const overdueInvoice = await Invoice.create({
        invoice_id: invoiceId,
        client_id: "client_123",
        amount_due: 5000,
        status: "PENDING", // Will be treated as overdue by logic if days_overdue is high
        days_overdue: 5,
        related_freelancer_id: testUserId
    });

    await onInvoiceAging(overdueInvoice.toObject());
    
    const updatedInvoice = await Invoice.findOne({ invoice_id: invoiceId });
    if (updatedInvoice && updatedInvoice.draft_nudge && updatedInvoice.draft_nudge.status === 'waiting_approval') {
        console.log('✅ Collections Agent: Draft nudge saved:', updatedInvoice.draft_nudge.subject);
    } else {
        console.error('❌ Collections Agent: Draft nudge not saved');
    }

    // 4. Verify Tax Agent (Categorization)
    console.log('\n4. Verifying Tax Agent...');
    const expenseTxn = await Transaction.create({
        transaction_id: `exp_${Date.now()}`,
        user_id: testUserId,
        amount: 500,
        type: "DEBIT",
        transaction_type: "DEBIT",
        date: new Date(),
        narration: "Subscription for Adobe Creative Cloud"
    });

    await categorizeTransaction(expenseTxn.toObject());
    
    const updatedTxn = await Transaction.findOne({ transaction_id: expenseTxn.transaction_id });
    if (updatedTxn && updatedTxn.isDeductible === true && updatedTxn.transaction_category === 'Software/Tools') {
        console.log('✅ Tax Agent: Transaction categorized correctly:', updatedTxn.transaction_category);
    } else {
        console.error('❌ Tax Agent: Categorization failed', updatedTxn);
    }

    // 5. Verify Productivity Agent (Schedule Evaluation)
    console.log('\n5. Verifying Productivity Agent...');
    // Create a task due tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await Task.create({
        title: "Urgent Project",
        dueDate: tomorrow,
        est_hours: 4,
        userId: testUserId,
        priority: "High"
    });

    const scheduleResult = await evaluateSchedule(testUserId);
    console.log('Productivity Utilization:', scheduleResult.utilization);
    console.log('Productivity Actions:', scheduleResult.actions.map(a => a.type));

    const deepWorkAction = scheduleResult.actions.find(a => a.type === 'create_deep_work_block');
    if (deepWorkAction) {
        await executeAction(testUserId, deepWorkAction);
        const event = await Event.findOne({ userId: testUserId, event_type: 'deep_work' });
        if (event) {
            console.log('✅ Productivity Agent: Deep work event created:', event.title);
        } else {
            console.error('❌ Productivity Agent: Deep work event creation failed');
        }
    } else {
        console.log('ℹ️ Productivity Agent: No deep work block suggested (might be due to utilization or logic)');
    }

    // Cleanup
    console.log('\nCleaning up test data...');
    await User.deleteOne({ userId: testUserId });
    await Transaction.deleteMany({ user_id: testUserId });
    await Notification.deleteMany({ recipientId: testUserId });
    await Invoice.deleteMany({ related_freelancer_id: testUserId });
    await Task.deleteMany({ userId: testUserId });
    await Event.deleteMany({ userId: testUserId });
    console.log('Cleanup complete.');

  } catch (error: any) {
    console.error('Verification Error:', error);
    if (error.stack) {
        console.error(error.stack);
    }
  } finally {
    await mongoose.disconnect();
  }
}

verifyAgents();
