import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    dueDate: { type: Date },
    est_hours: { type: Number },
    priority: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
    done: { type: Boolean, default: false },
    userId: { type: String, required: true },
    relatedJobId: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.models.Task || mongoose.model("Task", TaskSchema);
