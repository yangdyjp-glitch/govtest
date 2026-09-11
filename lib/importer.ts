import { Buffer } from "node:buffer";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import {
  type Question,
  type Choice,
  letters,
  validateQuestions,
} from "./domain";
export function blankQuestion(n = 1): Question {
  return {
    id: "",
    sourceId: String(n),
    stem: "",
    material: "",
    category: "综合",
    options: { A: "", B: "", C: "", D: "" },
    answer: "" as Choice,
    explanation: "",
  };
}
export function parseText(text: string): Question[] {
  const qs: Question[] = [];
  let q: Question | null = null;
  let field: "stem" | "material" | "explanation" | Choice = "stem";
  const push = () => {
    if (q && (q.stem || letters.some((k) => q!.options[k]))) qs.push(q);
  };
  for (let line of text
    .replace(/\r/g, "")
    .replace(/\u0007/g, "\n")
    .split("\n")) {
    line = line
      .trim()
      .replace(/^#{1,6}\s*/, "")
      .replace(/\*\*/g, "");
    if (!line || /^[-=_]{3,}$/.test(line)) continue;
    const start = line.match(
      /^(?:第\s*)?(\d+)\s*(?:[.、．）)]|题[：:、.]?)\s*(.*)$/,
    );
    if (start) {
      push();
      q = blankQuestion(qs.length + 1);
      q.sourceId = start[1];
      q.stem = start[2];
      field = "stem";
      continue;
    }
    if (!q) continue;
    const opt = line.match(/^([A-DＡ-Ｄ])[.、．:：）)\s]\s*(.*)$/i);
    if (opt) {
      const key = opt[1].normalize("NFKC").toUpperCase() as Choice;
      q.options[key] = opt[2];
      field = key;
      continue;
    }
    const answer = line.match(
      /^(?:正确答案|参考答案|答案)\s*[:：]\s*(.*?)\s*$/,
    );
    if (answer) {
      q.answer = answer[1].normalize("NFKC").trim().toUpperCase() as Choice;
      field = "explanation";
      continue;
    }
    const named = line.match(
      /^(解析|答案解析|分类|知识点|材料|题干)\s*[:：]\s*(.*)$/,
    );
    if (named) {
      const [, name, value] = named;
      if (name === "分类" || name === "知识点") q.category = value;
      else {
        field =
          name === "材料"
            ? "material"
            : name === "题干"
              ? "stem"
              : "explanation";
        q[field] = value;
      }
      continue;
    }
    if (letters.includes(field as Choice))
      q.options[field as Choice] += "\n" + line;
    else
      q[field as "stem" | "material" | "explanation"] +=
        (q[field as "stem" | "material" | "explanation"] ? "\n" : "") + line;
  }
  push();
  return qs;
}
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
  if (extension === "md") {
    questions = parseText(
      new TextDecoder("utf-8", { fatal: true }).decode(buffer),
    );
  } else if (extension === "xlsx" || extension === "xls")
    questions = parseWorkbook(buffer);
  else if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    questions = parseText(result.value);
    warnings.push(
      "Word 以文字方式导入；请核对段落、表格及图片题。图片不自动导入。",
    );
  } else if (extension === "doc") {
    const doc = await new WordExtractor().extract(buffer);
    questions = parseText(doc.getBody());
    warnings.push("旧版 Word 以文字方式导入；请在预览中核对内容。");
  } else throw new Error("支持 .xlsx、.xls、.md、.docx、.doc 文件");
  return { questions, errors: validateQuestions(questions), warnings };
}
