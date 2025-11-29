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

        const userId = (session.user as any).id;
        await dbConnect();

        const metrics = await calculateFinancialMetrics(userId);
        const tax = await calculateTaxLiability(userId);

        return NextResponse.json({
            revenue: tax.totalIncome, // Use actual total income for the year
            taxSaved: tax.estimatedTaxDue, // Renaming for frontend compatibility or updating frontend
            burnRate: metrics.burnRate,
            runwayDays: metrics.runwayDays,
            healthScore: metrics.healthScore
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
