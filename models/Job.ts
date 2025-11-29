import mongoose from "mongoose";

const JobSchema = new mongoose.Schema({
    title: { type: String, required: true },
    job_category: { type: String, required: true },
    budget_min: { type: Number, required: true },
    budget_max: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    urgency_level: { type: String, default: "Medium" },
    experience_level: { type: String, default: "Mid" },
    job_description: { type: String, required: true },
    skills: [{ type: String }],
    required_hours_estimate: { type: Number },
    days_to_complete: { 
        type: Number, 
        required: true,
        min: [1, 'Days to complete must be at least 1 day'],
        validate: {
            validator: Number.isInteger,
            message: 'Days to complete must be a whole number'
        }
    },
    deadline: { type: Date },
    job_status: { type: String, default: "Open" },
    clientId: { type: String, required: true }, // User ID of the client
    clientName: { type: String },
    status: {
        type: String,
        enum: ["Open", "InProgress", "Completed"],
        default: "Open"
    },
    assignedFreelancerId: { type: String },
    bids: [{
        freelancerId: { type: String, required: true },
        freelancerName: { type: String, required: true },
        amount: { type: Number, required: true },
        proposal: { type: String },
        createdAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    job_id: { type: String }, // From CSV/JSON import
});

export default mongoose.models.Job || mongoose.model("Job", JobSchema);
