declare module "word-extractor" {
  export default class WordExtractor {
    extract(
      input: import("node:buffer").Buffer,
    ): Promise<{ getBody(): string }>;
  }
}
