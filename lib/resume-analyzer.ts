// Resume analyzer using pdfreader for PDFs and mammoth for DOCX
import mammoth from 'mammoth';
import { callGemini } from "@/lib/agents/ai-client";
const { PdfReader } = require('pdfreader');

export async function extractTextFromBuffer(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
        return new Promise((resolve, reject) => {
            const rows: any = {}; // indexed by y-coordinate
            let text = '';

            new PdfReader().parseBuffer(buffer, (err: any, item: any) => {
                if (err) {
                    reject(err);
                } else if (!item) {
                    // End of file - compile all text
                    const sortedRows = Object.keys(rows)
                        .sort((a, b) => parseFloat(a) - parseFloat(b))
                        .map(y => rows[y]);

                    text = sortedRows.join('\n');
                    resolve(text);
                } else if (item.text) {
                    // Accumulate text items
                    const y = item.y;
                    if (!rows[y]) {
                        rows[y] = '';
                    }
                    rows[y] += item.text + ' ';
                }
            });
        });
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }
    throw new Error("Unsupported file type. Please upload a PDF or DOCX file.");
}

export interface ResumeAnalysisResult {
    skills: string[];
    experienceYears: number;
    credibilityScore: number;
    summary: string;
}

export async function analyzeResumeWithGemini(text: string): Promise<ResumeAnalysisResult> {
    const prompt = `
    You are an expert HR and Technical Recruiter. Analyze the following resume text and extract key information.
    
    Resume Text:
    """
    ${text.slice(0, 10000)}
    """
    
    IMPORTANT INSTRUCTIONS FOR EXPERIENCE CALCULATION:
    1. Look for employment/work experience sections with date ranges
    2. Parse dates in formats like: "Jan 2020 - Present", "2018-2022", "March 2019 to Dec 2021", etc.
    3. Calculate the TOTAL years by:
       - Converting each date range to years (use current date for "Present"/"Current")
       - Summing all non-overlapping periods
       - Rounding to nearest whole number
    4. Example: "2018-2020" (2 years) + "2020-2023" (3 years) = 5 years total
    5. If no clear dates found, estimate based on job titles and descriptions (Junior/Entry=0-2, Mid=2-5, Senior=5+)
    
    Return a JSON object with the following fields:
    - "skills": Array of strings (list ALL technical and soft skills mentioned - programming languages, frameworks, tools, methodologies).
    - "experienceYears": Number (total years of professional work experience as calculated above).
    - "credibilityScore": Number (0-100, based on resume quality):
        * 90-100: Exceptional resume with detailed achievements, metrics, well-structured
        * 70-89: Good resume with clear experience and skills
        * 50-69: Average resume with basic information
        * 30-49: Poor resume lacking details
        * 0-29: Very sparse or poorly written resume
    - "summary": String (a brief 2-sentence professional summary highlighting key strengths).

    Ensure the output is valid JSON. Do not include markdown formatting like \`\`\`json.
    `;

    try {
        const response = await callGemini(prompt, 1200);
        const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanText);

        return {
            skills: Array.isArray(data.skills) ? data.skills : [],
            experienceYears: typeof data.experienceYears === 'number' ? Math.max(0, Math.round(data.experienceYears)) : 0,
            credibilityScore: typeof data.credibilityScore === 'number' ? Math.min(100, Math.max(0, data.credibilityScore)) : 50,
            summary: data.summary || "No summary available."
        };
    } catch (error) {
        console.error("Gemini Analysis Error:", error);
        // Fallback or rethrow
        return {
            skills: [],
            experienceYears: 0,
            credibilityScore: 40, // Default low score on error
            summary: "Could not analyze resume."
        };
    }
}

// --- Helper Constants & Functions for Local Analysis ---

export const JOB_ROLES: Record<string, { required_skills: string[]; good_to_have: string[] }> = {
    "Frontend Developer": {
        required_skills: ["React", "JavaScript", "TypeScript", "HTML", "CSS"],
        good_to_have: ["Next.js", "Tailwind", "Redux", "GraphQL"]
    },
    "Backend Developer": {
        required_skills: ["Node.js", "Python", "Database", "SQL", "API"],
        good_to_have: ["AWS", "Docker", "Kubernetes", "Microservices"]
    },
    "Full Stack Developer": {
        required_skills: ["React", "Node.js", "Database", "API"],
        good_to_have: ["Next.js", "TypeScript", "AWS", "Docker"]
    },
    "Data Scientist": {
        required_skills: ["Python", "SQL", "Machine Learning", "Data Analysis"],
        good_to_have: ["Pandas", "NumPy", "TensorFlow", "PyTorch"]
    },
    "DevOps Engineer": {
        required_skills: ["Docker", "Kubernetes", "CI/CD", "Linux"],
        good_to_have: ["AWS", "Terraform", "Ansible", "Bash"]
    }
};

export function extractSkills(text: string): Record<string, string[]> {
    const foundSkills: Record<string, string[]> = {
        "Languages": [],
        "Frameworks": [],
        "Tools": [],
        "Core": []
    };

    const textLower = text.toLowerCase();

    // Simple keyword list for demonstration - in a real app this would be more comprehensive
    const commonSkills = {
        "Languages": ["javascript", "typescript", "python", "java", "c++", "go", "ruby", "php", "html", "css", "sql"],
        "Frameworks": ["react", "next.js", "vue", "angular", "node.js", "express", "django", "flask", "spring", "laravel"],
        "Tools": ["git", "docker", "kubernetes", "aws", "azure", "gcp", "jenkins", "jira"],
        "Core": ["agile", "scrum", "testing", "debugging", "system design"]
    };

    for (const [category, skills] of Object.entries(commonSkills)) {
        for (const skill of skills) {
            if (textLower.includes(skill)) {
                // Capitalize for display
                const displaySkill = skill.charAt(0).toUpperCase() + skill.slice(1);
                foundSkills[category].push(displaySkill);
            }
        }
    }

    return foundSkills;
}

export function analyzeExperience(text: string): string[] {
    // Simple extraction of lines that might look like experience
    // Looking for lines with years like 20xx-20xx or Present
    const lines = text.split('\n');
    const experienceLines: string[] = [];
    const datePattern = /\b(20\d{2}|19\d{2})\s*(-|to)\s*(20\d{2}|19\d{2}|Present|Current)\b/i;

    for (const line of lines) {
        if (datePattern.test(line) && line.length < 100) {
            experienceLines.push(line.trim());
        }
    }
    return experienceLines;
}

export function analyzeEducation(text: string): string[] {
    const lines = text.split('\n');
    const educationLines: string[] = [];
    const keywords = ["bachelor", "master", "phd", "degree", "university", "college", "b.tech", "m.tech", "b.sc", "m.sc"];

    for (const line of lines) {
        if (keywords.some(k => line.toLowerCase().includes(k)) && line.length < 100) {
            educationLines.push(line.trim());
        }
    }
    return educationLines;
}

export function suggestRoleMatch(skills: Record<string, string[]>): Record<string, number> {
    const allFoundSkills = new Set(Object.values(skills).flat().map(s => s.toLowerCase()));
    const matches: Record<string, number> = {};

    for (const [role, requirements] of Object.entries(JOB_ROLES)) {
        let score = 0;
        const totalReq = requirements.required_skills.length;
        const totalGood = requirements.good_to_have.length;

        let reqMatches = 0;
        for (const req of requirements.required_skills) {
            if (allFoundSkills.has(req.toLowerCase())) reqMatches++;
        }

        let goodMatches = 0;
        for (const good of requirements.good_to_have) {
            if (allFoundSkills.has(good.toLowerCase())) goodMatches++;
        }

        // Weighted score: Required skills worth more
        if (totalReq > 0) {
            score += (reqMatches / totalReq) * 70;
        }
        if (totalGood > 0) {
            score += (goodMatches / totalGood) * 30;
        }

        matches[role] = Math.round(score);
    }

    return matches;
}
