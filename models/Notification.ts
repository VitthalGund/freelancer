import mongoose from "mongoose"; // Schema updated
import crypto from "crypto";

const NotificationSchema = new mongoose.Schema({
    _id: { type: String, default: () => crypto.randomUUID() }, // UUID support
    recipientId: {
        type: String,
        required: false, // Made optional for broadcast/job_post types
        index: true,
    },
    type: {
        type: String,
        enum: ["job_match", "system", "message", "job_post", "job_bid", "proposal_received", "schedule_alert", "smart_split", "invoice_nudge", "tax_review", "status_report"], // Added agent action types
        default: "system",
    },
    message: {
        type: String,
        required: false, // Made optional
    },
    read: {
        type: Boolean,
        default: false,
    },
    relatedJobId: {
        type: String,
    },
    // Fields for seeded job data
    title: String,
    job_category: String,
    budget_min: Number,
    budget_max: Number,
    currency: String,
    urgency_level: String,
    experience_level: String,
    job_description: String,
    skills: [String],
    required_hours_estimate: Number,
    deadline: String,
    job_status: String,
    
    // Metadata for actionable notifications (Smart Split, etc.)
    metadata: {
        type: mongoose.Schema.Types.Mixed, // Flexible object
    },

    createdAt: {
        type: Date,
        default: Date.now,
    },
}, { strict: false }); // Allow flexible fields for seeded data

export default mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);
