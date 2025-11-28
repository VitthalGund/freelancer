import mongoose from "mongoose";

const CommunicationHistorySchema = new mongoose.Schema({
    ts: { type: Date },
    from: { type: String },
    to: { type: String },
    channel: { type: String },
    message: { type: String },
    type: { type: String }
});

const InvoiceSchema = new mongoose.Schema({
    invoice_id: { type: String, required: true, unique: true },
    company_id: { type: String },
    company_name: { type: String },
    client_id: { type: String, required: true },
    related_freelancer_id: { type: String },
    related_job_id: { type: String },
    amount_due: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    invoice_created_at: { type: Date },
    due_date: { type: Date },
    payment_expected_date: { type: Date },
    status: { type: String, enum: ["PAID", "OVERDUE", "PARTIAL", "PENDING", "DRAFT"], default: "DRAFT" },
    days_overdue: { type: Number, default: 0 },
    communication_history: [CommunicationHistorySchema],
    
    // Draft Nudge for Collections Agent
    draft_nudge: {
        subject: String,
        body: String,
        status: { type: String, enum: ["waiting_approval", "approved", "sent", "rejected"], default: "waiting_approval" },
        generated_at: { type: Date }
    },

    last_communication_at: { type: Date },
    invoice_tags: { type: String },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

export default mongoose.models.Invoice || mongoose.model("Invoice", InvoiceSchema);
