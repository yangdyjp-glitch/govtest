import { Buffer } from "node:buffer";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { prepareMathReview } from "./math-review";
import { preserveWordMath } from "./word-math";
import { blankQuestion, parseTextDocument } from "./text-importer";
export { blankQuestion, parseText } from "./text-importer";
import {
  type Question,
  type Choice,
  letters,
  validateQuestions,
} from "./domain";
export function parseWorkbook(buffer: Buffer): Question[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellText: true });
  const qs: Question[] = [];
  for (const sheet of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheet],
      { defval: "", raw: false },
    );
    for (const raw of rows) {
      const row: Record<string, string> = {};
      Object.entries(raw).forEach(
        ([k, v]) => (row[k.trim()] = String(v).trim()),
      );
      const get = (...keys: string[]) =>
        keys.map((k) => row[k]).find(Boolean) || "";
      if (!Object.values(row).some(Boolean)) continue;
      const q = blankQuestion(qs.length + 1);
      q.sourceId = get("题号", "题目编号", "编号", "id") || q.sourceId;
      q.stem = get("题干", "题目", "stem");
      q.material = get("材料", "material");
      q.category = get("分类", "知识点", "category") || "综合";
      q.explanation = get("解析", "答案解析", "explanation");
      q.answer = get("正确答案", "答案", "answer")
        .normalize("NFKC")
        .toUpperCase() as Choice;
      letters.forEach((k) => (q.options[k] = get(k, `选项${k}`, `${k}选项`)));
      qs.push(q);
    }
  }
  return qs;
}
export async function parseFile(file: File) {
  if (file.size > 8 * 1024 * 1024) throw new Error("单个文件不能超过 8 MB");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  let questions: Question[] = [];
  const warnings: string[] = [];
  const readText = (text: string) => {
    const parsed = parseTextDocument(text);
    warnings.push(...parsed.warnings);
    return parsed.questions;
  };
  if (extension === "md") {
    questions = readText(
      new TextDecoder("utf-8", { fatal: true }).decode(buffer),
    );
  } else if (extension === "xlsx" || extension === "xls")
    questions = parseWorkbook(buffer);
  else if (extension === "docx") {
    const result = await mammoth.extractRawText({
      buffer: await preserveWordMath(buffer),
    });
    questions = readText(result.value);
    warnings.push(
      "Word 以文字方式导入；请核对段落、表格及图片题。图片不自动导入。",
    );
  } else if (extension === "doc") {
    const doc = await new WordExtractor().extract(buffer);
    questions = readText(doc.getBody());
    warnings.push("旧版 Word 以文字方式导入；请在预览中核对内容。");
  } else throw new Error("支持 .xlsx、.xls、.md、.docx、.doc 文件");
  const prepared = prepareMathReview(questions);
  return {
    ...prepared,
    errors: validateQuestions(prepared.questions),
    warnings,
  };
}
