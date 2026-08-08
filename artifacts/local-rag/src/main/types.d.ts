/**
 * Type stubs for packages without bundled declarations.
 */

declare module "pdf-parse" {
  interface PdfData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    text: string;
    version: string;
  }
  function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<PdfData>;
  export = pdfParse;
}

declare module "mammoth" {
  interface ConversionResult {
    value: string;
    messages: unknown[];
  }
  interface ExtractOptions {
    path?: string;
    buffer?: Buffer;
  }
  function extractRawText(options: ExtractOptions): Promise<ConversionResult>;
  function convertToHtml(
    options: ExtractOptions,
    styleMap?: unknown
  ): Promise<ConversionResult>;
  export { extractRawText, convertToHtml };
}
