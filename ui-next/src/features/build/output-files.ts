import type { BuildOutputFile } from "@/lib/api";

export function sortBuildOutputs(outputs: BuildOutputFile[]): BuildOutputFile[] {
    const htmlRank: Record<string, number> = {
        landing: 0,
        chapter: 1,
        other: 2,
    };
    const pdfRank: Record<string, number> = {
        root: 0,
        print: 1,
        pc: 2,
        raksul: 3,
    };

    return [...outputs].sort((a, b) => {
        const aPrimary = a.type === "pdf" ? 0 : 1;
        const bPrimary = b.type === "pdf" ? 0 : 1;
        if (aPrimary !== bPrimary) {
            return aPrimary - bPrimary;
        }

        if (a.type === "pdf" && b.type === "pdf") {
            const aRank = pdfRank[a.pdfType || "root"] ?? 99;
            const bRank = pdfRank[b.pdfType || "root"] ?? 99;
            if (aRank !== bRank) {
                return aRank - bRank;
            }
        }

        if (a.type === "html" && b.type === "html") {
            const aRank = htmlRank[a.htmlType || "other"] ?? 99;
            const bRank = htmlRank[b.htmlType || "other"] ?? 99;
            if (aRank !== bRank) {
                return aRank - bRank;
            }
        }

        return a.name.localeCompare(b.name);
    });
}

export function getPreferredHtmlOutput(outputs: BuildOutputFile[]): BuildOutputFile | null {
    const sorted = sortBuildOutputs(outputs);
    return (
        sorted.find((file) => file.type === "html" && file.htmlType === "landing") ||
        sorted.find((file) => file.type === "html") ||
        null
    );
}

export function getPreferredPdfOutput(outputs: BuildOutputFile[]): BuildOutputFile | null {
    const preferredOrder = ["root", "print", "pc", "raksul"];
    const pdfOutputs = sortBuildOutputs(outputs).filter((file) => file.type === "pdf");

    for (const pdfType of preferredOrder) {
        const match = pdfOutputs.find((file) => (file.pdfType || "root") === pdfType);
        if (match) {
            return match;
        }
    }

    return pdfOutputs[0] || null;
}

export function hasHtmlOutputs(outputs: BuildOutputFile[]): boolean {
    return outputs.some((file) => file.type === "html");
}

export function hasPdfOutputs(outputs: BuildOutputFile[]): boolean {
    return outputs.some((file) => file.type === "pdf");
}
