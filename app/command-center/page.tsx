"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Bot, Zap, DollarSign, Briefcase, FileText, Calendar, Check, X, RefreshCw, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export default function CommandCenterPage() {
  const [actions, setActions] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);

  const runAgents = async () => {
    setLoading(true);
    try {
      const [agentsRes, tasksRes, eventsRes] = await Promise.all([
        fetch("/api/agents/run"),
        fetch("/api/tasks"),
        fetch("/api/events")
      ]);
      
      const agentsData = await agentsRes.json();
      const tasksData = await tasksRes.json();
      const eventsData = await eventsRes.json();

      if (agentsData.success) {
        setActions(agentsData.actions);
        setLogs(agentsData.logs);
        toast.success(`Agents active: ${agentsData.count} actions proposed`);
      } else {
        toast.error("Failed to run agents");
      }

      if (Array.isArray(tasksData)) setTasks(tasksData);
      if (Array.isArray(eventsData)) setEvents(eventsData);

    } catch (error) {
      console.error(error);
      toast.error("Error connecting to agent network");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAgents();
  }, []);

  const handleExecute = async (action: any) => {
    const toastId = toast.loading(`Executing ${action.agent} action...`);
    try {
      const res = await fetch("/api/agents/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action)
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success(data.message || "Action completed", { id: toastId });
        // Remove from list
        setActions(prev => prev.filter(a => a !== action));
        // Add to logs
        setLogs(prev => [`Executed ${action.agent}: ${action.type}`, ...prev]);
      } else {
        toast.error(data.message || "Failed to execute", { id: toastId });
      }
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong", { id: toastId });
    }
  };

  const handleDismiss = (action: any) => {
    setActions(prev => prev.filter(a => a !== action));
  };

  const getAgentIcon = (agent: string) => {
    switch (agent) {
      case "Hunter": return <Briefcase className="text-blue-400" />;
      case "CFO": return <DollarSign className="text-green-400" />;
      case "Collections": return <FileText className="text-red-400" />;
      case "Productivity": return <Calendar className="text-purple-400" />;
      case "Tax": return <FileText className="text-yellow-400" />;
      default: return <Bot />;
    }
  };

  const getAgentColor = (agent: string) => {
    switch (agent) {
      case "Hunter": return "bg-blue-500/10 border-blue-500/20 text-blue-400";
      case "CFO": return "bg-green-500/10 border-green-500/20 text-green-400";
      case "Collections": return "bg-red-500/10 border-red-500/20 text-red-400";
      case "Productivity": return "bg-purple-500/10 border-purple-500/20 text-purple-400";
      case "Tax": return "bg-yellow-500/10 border-yellow-500/20 text-yellow-400";
      default: return "bg-slate-800";
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <header className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Bot className="w-8 h-8 text-primary" />
                Command Center
              </h1>
              <p className="text-muted-foreground mt-1">
                Autonomous Financial Guardian (AFG) Ecosystem
              </p>
            </div>
            <Button onClick={runAgents} disabled={loading} variant="outline" className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? "Syncing Agents..." : "Run Agents"}
            </Button>
          </header>

          {/* Active Proposals Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence>
              {actions.map((action, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <Card className={`border-l-4 ${getAgentColor(action.agent)} h-full flex flex-col`}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-full bg-background/50`}>
                            {getAgentIcon(action.agent)}
                          </div>
                          <div>
                            <CardTitle className="text-lg">{action.agent} Agent</CardTitle>
                            <CardDescription className="text-xs uppercase tracking-wider font-semibold opacity-70">
                              {action.type?.replace(/_/g, " ")}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-background/50">
                          {action.agent === "Hunter" ? `${action.payload?.meta?.match_score ?? 95}% Match` : "High Priority"}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="flex-1 space-y-4 pt-2">
                      {/* Status Report Generic UI */}
                      {action.type === "status_report" ? (
                        <div className="space-y-3">
                           <p className="text-sm text-muted-foreground">{action.message}</p>
                           <div className="flex items-center gap-2 text-xs text-green-400/80 bg-green-500/10 p-2 rounded w-fit">
                             <Check className="w-3 h-3" />
                             <span>System Active & Monitored</span>
                           </div>
                        </div>
                      ) : (
                        <>
                          {/* Content varies by agent */}
                          {action.agent === "Hunter" && (
                            <div className="space-y-3">
                              <p className="text-sm text-muted-foreground">
                                Found a high-match job opportunity. Drafted a proposal for you.
                              </p>
                              <div className="bg-slate-950/50 p-3 rounded text-sm font-mono text-xs opacity-80 whitespace-pre-wrap line-clamp-4">
                                {action.payload.proposal_draft}
                              </div>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>Est. Hours: {action.payload.meta.estimated_hours}</span>
                                <span>Rate: ${action.payload.meta.suggested_rate}/hr</span>
                              </div>
                            </div>
                          )}

                          {action.agent === "CFO" && action.type === "smart_split" && (
                            <div className="space-y-3">
                              <p className="font-medium">{action.message}</p>
                              <div className="space-y-2">
                                {action.suggested_actions.map((sa: any, i: number) => (
                                  <div key={i} className="flex justify-between text-sm bg-slate-950/30 p-2 rounded">
                                    <span>{sa.action === "transfer" ? `Transfer to ${sa.to}` : "Keep in Checking"}</span>
                                    <span className="font-mono">₹{sa.amount}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {action.agent === "Collections" && (
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">Invoice {action.invoice_id} requires attention.</p>
                                {action.payload?.subject ? (
                                    <div className="bg-slate-950/50 p-3 rounded text-sm">
                                        <p className="font-bold mb-1">{action.payload.subject}</p>
                                        <p className="opacity-70 line-clamp-3">{action.payload.body}</p>
                                    </div>
                                ) : (
                                    <p className="font-medium">{action.subject}</p>
                                )}
                                <div className="flex gap-2">
                                    <Badge variant="secondary">{action.channel || "Escalation"}</Badge>
                                </div>
                            </div>
                          )}

                          {action.agent === "Productivity" && (
                              <div className="space-y-3">
                                  <p className="font-medium">{action.message || action.title || "Schedule Update"}</p>
                                  {action.type === "suggest_reprioritize" && (
                                      <ul className="list-disc list-inside text-sm text-muted-foreground">
                                          {action.suggestions.map((s: any, i: number) => (
                                              <li key={i}>Mark {s.taskId} as {s.suggestedPriority}</li>
                                          ))}
                                      </ul>
                                  )}
                                  {action.type === "create_deep_work_block" && (
                                      <p className="text-sm text-muted-foreground">
                                          Proposed: {new Date(action.start).toLocaleString()} - {new Date(action.end).toLocaleTimeString()}
                                      </p>
                                  )}
                              </div>
                          )}

                          {action.agent === "Tax" && (
                              <div className="space-y-3">
                                  <p className="text-sm text-muted-foreground">Categorized new expense.</p>
                                  <div className="flex justify-between items-center bg-slate-950/30 p-3 rounded">
                                      <span className="font-medium">{action.payload.category}</span>
                                      {action.payload.deductible ? (
                                          <Badge className="bg-green-500/20 text-green-400 hover:bg-green-500/30">Deductible</Badge>
                                      ) : (
                                          <Badge variant="outline">Non-Deductible</Badge>
                                      )}
                                  </div>
                                  <p className="text-xs text-muted-foreground italic">{action.payload.notes}</p>
                              </div>
                          )}
                        </>
                      )}
                    </CardContent>

                    <div className="p-4 pt-0 flex gap-3 mt-auto">
                      {action.type === "status_report" ? (
                          <Button onClick={() => handleDismiss(action)} className="flex-1 gap-2 border-white/10 hover:bg-white/5" variant="outline" size="sm">
                            <Check size={16} /> Acknowledge
                          </Button>
                      ) : (
                        <>
                          {action.agent === "Productivity" ? (
                            <>
                              <Button onClick={() => handleExecute(action)} className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700" size="sm">
                                <Check size={16} /> Execute
                              </Button>
                              <Button variant="outline" size="sm" className="flex-1 gap-2 border-white/10 hover:bg-white/5" onClick={() => toast.info("Edit feature coming soon")}>
                                <Edit2 size={16} /> Edit
                              </Button>
                              <Button onClick={() => handleDismiss(action)} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                                <X size={16} /> Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button onClick={() => handleExecute(action)} className="flex-1 gap-2" size="sm">
                                <Check size={16} />
                                {action.agent === "Hunter" ? "Send Proposal" : "Execute"}
                              </Button>
                              <Button onClick={() => handleDismiss(action)} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                                <X size={16} />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {actions.length === 0 && !loading && (
            <div className="text-center py-20 opacity-50">
              <Bot className="w-16 h-16 mx-auto mb-4" />
              <h3 className="text-xl font-medium">All Systems Nominal</h3>
              <p>No pending actions from your agent swarm.</p>
            </div>
          )}

          {/* Live Data Feed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Recent Tasks */}
            <Card className="bg-black/40 border-white/10">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-400" />
                  Live Task Feed
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
                {[...tasks, ...events].length > 0 ? (
                  [...tasks, ...events]
                    .sort((a, b) => new Date(b.createdAt || b.start_time || 0).getTime() - new Date(a.createdAt || a.start_time || 0).getTime())
                    .slice(0, 10)
                    .map((item, i) => {
                      const isEvent = !!item.event_id;
                      return (
                        <div key={item.id || item.event_id || i} className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${isEvent ? 'bg-blue-500' : (item.done ? 'bg-green-500' : 'bg-purple-500')}`} />
                            <span className={`text-sm ${!isEvent && item.done ? 'text-gray-500 line-through' : 'text-white'}`}>{item.title}</span>
                          </div>
                          <span className="text-xs text-gray-500">{item.dueDate || item.start_time || "No date"}</span>
                        </div>
                      );
                    })
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No active tasks or events.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Logs Console */}
          <div className="mt-12 border-t pt-8">
            <h3 className="text-sm font-mono text-muted-foreground mb-4 uppercase tracking-wider">Agent Logs</h3>
            <div className="bg-black/50 rounded-lg p-4 font-mono text-xs text-green-400/80 h-48 overflow-y-auto space-y-1">
              {logs.map((log, i) => (
                <div key={i}>
                  <span className="opacity-50">[{new Date().toLocaleTimeString()}]</span> {log}
                </div>
              ))}
              {logs.length === 0 && <span className="opacity-30">Waiting for agent activity...</span>}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
