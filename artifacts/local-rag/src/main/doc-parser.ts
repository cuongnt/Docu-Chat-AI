import fs from "fs";
import path from "path";

/** Extract plain text from a file based on its extension */
export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".pdf":
      return extractPdf(filePath);
    case ".docx":
    case ".doc":
      return extractDocx(filePath);
    case ".xlsx":
    case ".xls":
      return extractXlsx(filePath);
    case ".txt":
    case ".md":
    case ".markdown":
    case ".csv":
      return fs.readFileSync(filePath, "utf-8");
    default:
      // Try to read as text
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        if (content.length > 0) return content;
      } catch {
        // ignore
      }
      throw new Error(`Định dạng file không được hỗ trợ: ${ext}`);
  }
}

async function extractPdf(filePath: string): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractDocx(filePath: string): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function extractXlsx(filePath: string): Promise<string> {
  const xlsx = await import("xlsx");
  const workbook = xlsx.readFile(filePath);
  const lines: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    lines.push(`=== Sheet: ${sheetName} ===`);
    lines.push(xlsx.utils.sheet_to_csv(sheet));
  }
  return lines.join("\n");
}

/**
 * Split text into overlapping chunks.
 * Uses word-count estimation (~4 chars/word, ~400 words target).
 */
export function chunkText(text: string, targetWords = 400, overlapWords = 50): string[] {
  // Normalize whitespace
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const words = normalized.split(/\s+/);

  if (words.length <= targetWords) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + targetWords, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;
    start = end - overlapWords;
  }

  return chunks.filter((c) => c.trim().length > 20);
}
