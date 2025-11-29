import { NextResponse } from "next/server";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force');

    // Mock network graph data
    const mockData = {
        nodes: [
            {
                id: "freelancer_1",
                type: "freelancer",
                name: "Sarah Chen",
                value: 85,
                skills: ["React", "TypeScript", "Node.js"],
                projects: 12,
                rating: 4.9
            },
            {
                id: "freelancer_2",
                type: "freelancer",
                name: "James Wilson",
                value: 72,
                skills: ["Python", "Django", "PostgreSQL"],
                projects: 8,
                rating: 4.7
            },
            {
                id: "company_1",
                type: "company",
                name: "TechCorp Solutions",
                value: 95,
                industry: "Technology",
                employees: "50-200",
                activeProjects: 5
            },
            {
                id: "company_2",
                type: "company",
                name: "Digital Ventures",
                value: 68,
                industry: "Marketing",
                employees: "10-50",
                activeProjects: 3
            },
            {
                id: "freelancer_3",
                type: "freelancer",
                name: "Maya Patel",
                value: 90,
                skills: ["UI/UX Design", "Figma", "Adobe XD"],
                projects: 15,
                rating: 5.0
            }
        ],
        links: [
            { source: "freelancer_1", target: "company_1", value: 3 },
            { source: "freelancer_2", target: "company_1", value: 2 },
            { source: "freelancer_1", target: "company_2", value: 1 },
            { source: "freelancer_3", target: "company_1", value: 4 },
            { source: "freelancer_3", target: "company_2", value: 2 }
        ],
        stats: {
            totalFreelancers: 3,
            totalCompanies: 2,
            totalConnections: 5,
            lastUpdated: new Date().toISOString()
        }
    };

    return NextResponse.json(mockData);
}
