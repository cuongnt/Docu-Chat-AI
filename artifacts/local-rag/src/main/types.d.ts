// Type declarations for packages without @types

declare module "pdf-parse" {
  interface PDFData {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    version: string;
  }
  function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>
  ): Promise<PDFData>;
  export = pdfParse;
}

declare module "mammoth" {
  interface Result {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  interface Input {
    path?: string;
    buffer?: Buffer;
    arrayBuffer?: ArrayBuffer;
  }
  export function extractRawText(input: Input): Promise<Result>;
  export function convertToHtml(input: Input): Promise<Result>;
}
