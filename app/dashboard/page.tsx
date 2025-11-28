import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { Sidebar } from "@/components/layout/Sidebar";
import { JobFeed } from "@/components/features/JobFeed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Target, TrendingUp, Activity, Bell, Wallet, User as UserIcon } from "lucide-react";
import { findMatches } from "@/lib/agents/hunter";
import Notification from "@/models/Notification";
import Job from "@/models/Job";
import Invoice from "@/models/Invoice";
import User from "@/models/User";
import dbConnect from "@/lib/db";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session: any = await getServerSession(authOptions as any);
  if (!session) {
      redirect("/auth/login");
  }
  
  const userId = (session.user as any).userId || (session.user as any).id;

  await dbConnect();

  // 1. Fetch Matches & Notifications (Hunter Agent)
  let matches: any[] = [];
  try {
      matches = await findMatches(userId);
  } catch (e) {
      console.error("Error finding matches:", e);
  }
  
  const notifications = await Notification.find({ 
      recipientId: userId 
  }).sort({ createdAt: -1 }).limit(5).lean();

  const matchNotifications = notifications.filter((n: any) => n.type === 'job_match');
  const draftJobIds = new Set(matchNotifications.map((n: any) => n.relatedJobId));

  const rawJobs = matches.map((job: any) => ({
      ...job,
      _id: job._id.toString(),
      hasDraft: draftJobIds.has(job.job_id || job._id),
      match_score: 95 // Mock or calculate
  }));
  const jobsWithDrafts = JSON.parse(JSON.stringify(rawJobs));

  // 2. Active Pursuit (Bids)
  // Find jobs where this user has bid
  const activeJobs = await Job.find({
      "bids.freelancerId": userId,
      status: "Open"
  }).lean();

  const activeBidsCount = activeJobs.length;
  const potentialValue = activeJobs.reduce((sum: number, job: any) => {
      const bid = job.bids.find((b: any) => b.freelancerId === userId);
      return sum + (bid ? bid.amount : 0);
  }, 0);

  // 3. Market Demand (Skills from Open Jobs)
  const allOpenJobs = await Job.find({ status: "Open" }).select('skills').lean();
  const skillCounts: Record<string, number> = {};
  allOpenJobs.forEach((job: any) => {
      const skills = typeof job.skills === 'string' ? JSON.parse(job.skills) : job.skills; // Handle potential string format
      if (Array.isArray(skills)) {
          skills.forEach((skill: string) => {
              skillCounts[skill] = (skillCounts[skill] || 0) + 1;
          });
      }
  });
  const topSkills = Object.entries(skillCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4);

  // 4. Income Forecast
  // Simple heuristic: 20% win rate on active bids
  const winRate = 0.2;
  const projectedEarnings = Math.round(potentialValue * winRate);

  // 5. Financial Snapshot
  const invoices = await Invoice.find({ related_freelancer_id: userId }).lean();
  const unpaidAmount = invoices
      .filter((inv: any) => inv.status !== 'PAID')
      .reduce((sum: number, inv: any) => sum + inv.amount_due, 0);
  const paidAmount = invoices
      .filter((inv: any) => inv.status === 'PAID')
      .reduce((sum: number, inv: any) => sum + inv.amount_due, 0);

  // 6. User Profile (for completeness/credibility)
  const user = await User.findOne({ userId }).lean();
  const credibilityScore = (user as any)?.credibility_score || 50;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen">
        <header className="mb-8 flex justify-between items-end">
          <div>
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground">Welcome back, {session.user?.name}. Growth Autopilot is active.</p>
          </div>
          <div className="flex gap-4">
              <Card className="bg-card border-border p-3 flex items-center gap-3">
                  <UserIcon className="w-5 h-5 text-primary" />
                  <div>
                      <div className="text-xs text-muted-foreground">Credibility</div>
                      <div className="font-bold">{credibilityScore}/100</div>
                  </div>
              </Card>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Widget 1: Active Pursuit */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Active Pursuit</span>
                <Target className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold">{activeBidsCount} Bids</div>
              <p className="text-xs text-muted-foreground mt-1">Potential Value: ₹{potentialValue.toLocaleString()}</p>
            </CardContent>
          </Card>
          
          {/* Widget 2: Market Demand */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Market Demand</span>
                <TrendingUp className="w-4 h-4 text-blue-500" />
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                  {topSkills.map(([skill, count], i) => (
                      <Badge key={skill} variant="secondary" className="text-xs">
                          {skill} <span className="ml-1 opacity-50">({count})</span>
                      </Badge>
                  ))}
                  {topSkills.length === 0 && <span className="text-xs text-muted-foreground">No data yet</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Top skills in open jobs.</p>
            </CardContent>
          </Card>

          {/* Widget 3: Income Forecast */}
          <Card>
             <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Projected Earnings</span>
                <Activity className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-2xl font-bold">₹{projectedEarnings.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Based on pipeline & 20% win rate.</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Job Feed</h2>
              <Badge variant="outline" className="animate-pulse border-green-500 text-green-500">Live Scanning</Badge>
            </div>
            <JobFeed initialJobs={jobsWithDrafts} />
          </div>

          <div className="space-y-6">
            {/* Hunter Agent Status */}
            <Card className="border-accent/20">
              <CardHeader>
                <CardTitle className="text-base">Hunter Agent Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span>Scanning Upwork (API)</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span>Scanning LinkedIn Jobs</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span>Analyzing Freelancer.com</span>
                </div>
              </CardContent>
            </Card>

            {/* Financial Snapshot */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Wallet className="w-4 h-4" /> Financial Snapshot
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Unpaid Invoices</span>
                        <span className="font-bold text-red-400">₹{unpaidAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Collected</span>
                        <span className="font-bold text-green-400">₹{paidAmount.toLocaleString()}</span>
                    </div>
                </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Bell className="w-4 h-4" /> Recent Activity
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {notifications.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No recent activity.</p>
                    ) : (
                        notifications.map((n: any) => (
                            <div key={Date.now().toString(36) + Math.random().toString(36).slice(2)} className="flex gap-3 items-start">
                                <div className={`w-2 h-2 mt-1.5 rounded-full ${n.read ? 'bg-gray-500' : 'bg-blue-500'}`} />
                                <div>
                                    <p className="text-sm font-medium line-clamp-2">{n.message}</p>
                                    <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleDateString()}</p>
                                </div>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
