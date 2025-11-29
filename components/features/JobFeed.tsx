"use client";

import { useEffect, useState } from "react";
import { getJobs, Job } from "@/lib/data-service";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { motion } from "framer-motion";

interface JobFeedProps {
  initialJobs?: Job[];
}

export function JobFeed({ initialJobs }: JobFeedProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs || []);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!initialJobs) {
      const loadJobs = async () => {
        const data = await getJobs();
        const topJobs = data.slice(0, 5);
        setJobs(topJobs);
      };
      loadJobs();
    }
  }, [initialJobs]);

  const handleApplyClick = (job: Job) => {
      setSelectedJob(job);
      // Pre-fill cover letter if draft exists (mock logic or from job prop)
      setCoverLetter((job as any).hasDraft ? "Dear Hiring Manager,\n\nI am excited to apply for this position. Based on my experience with..." : "");
      setIsApplyOpen(true);
  };

  const handleSubmitApplication = async () => {
      if (!selectedJob) return;
      setIsSubmitting(true);
      
      try {
          // Call API to execute agent action (create bid)
          const res = await fetch("/api/agents/execute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  actionId: "manual_apply", // Special ID for manual trigger
                  agent: "Hunter",
                  type: "job_bid",
                  payload: {
                      jobId: selectedJob._id || selectedJob.job_id,
                      amount: selectedJob.budget_min, // Default to min budget for now
                      proposal: coverLetter
                  }
              })
          });

          if (res.ok) {
              setIsApplyOpen(false);
              // Optionally show success toast
              alert("Application sent successfully!");
          } else {
              alert("Failed to send application.");
          }
      } catch (error) {
          console.error("Apply error:", error);
          alert("Error sending application.");
      } finally {
          setIsSubmitting(false);
      }
  };

  return (
    <>
    <Card className="glass-card p-6 h-[500px] flex flex-col relative">
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Hunter Agent Feed
        </h3>
        <span className="text-xs text-muted-foreground">Live Scanning...</span>
      </div>

      <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1 min-h-0">
        {jobs.map((job, index) => (
          <motion.div
            key={job._id || job.job_id || index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/20 text-primary border border-primary/20">
                {job.platform || "Upwork"}
              </span>
              <span className="text-green-400 font-bold text-sm">
                {job.currency} {job.budget_min.toLocaleString()} - {job.budget_max.toLocaleString()}
              </span>
            </div>
            <h4 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors line-clamp-1">
              {job.title}
            </h4>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-3">
              <div className="flex items-center gap-3">
                <span>Match: <span className="text-white font-medium">{job.match_score || 95}%</span></span>
                {(job as any).days_to_complete && (
                  <span className="flex items-center gap-1">
                    <span className="text-blue-400">📅</span>
                    <span className="text-white font-medium">{(job as any).days_to_complete} days</span>
                  </span>
                )}
              </div>
              {(job as any).hasDraft && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-500 border border-yellow-500/20">
                    Draft Ready
                  </span>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); handleApplyClick(job); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-primary font-medium hover:underline"
              >
                Auto-Apply &rarr;
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </Card>

    {/* Simple Modal for Application */}
    {isApplyOpen && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-lg shadow-2xl"
            >
                <h3 className="text-xl font-bold mb-4">Apply to {selectedJob.title}</h3>
                <div className="mb-4">
                    <label className="block text-sm text-muted-foreground mb-2">Cover Letter (Drafted by Hunter)</label>
                    <textarea 
                        className="w-full h-40 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm focus:outline-none focus:border-primary resize-none"
                        value={coverLetter}
                        onChange={(e) => setCoverLetter(e.target.value)}
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setIsApplyOpen(false)}
                        className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSubmitApplication}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                        {isSubmitting ? "Sending..." : "Send Application"}
                    </button>
                </div>
            </motion.div>
        </div>
    )}
    </>
  );
}
