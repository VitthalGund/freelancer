import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import { calculateFinancialMetrics, calculateTaxLiability } from "@/lib/agents/cfo";

export async function GET() {
    try {
        const session:any = await getServerSession(authOptions as any);
        if (!session || !session.user) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const userId = (session.user as any).userId || (session.user as any).id;
        await dbConnect();

        const metrics = await calculateFinancialMetrics(userId);
        const tax = await calculateTaxLiability(userId);

        return NextResponse.json({
            revenue: metrics.liquidity, // Using liquidity as a proxy for available funds/revenue in this context, or we can add totalRevenue to metrics
            taxSaved: tax.estimatedTaxDue, // Renaming for frontend compatibility or updating frontend
            burnRate: metrics.burnRate,
            runwayDays: metrics.runwayDays,
            healthScore: metrics.healthScore
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
