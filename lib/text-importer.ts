import { type Choice, type Question, letters } from "./domain";

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

const questionNumber = (value: string) => value.replace(/^0+(?=\d)/, "");
const answerHeading =
  /^(?:正确答案|参考答案|答案)(?:汇总表?|一览表?)?\s*[:：]?$/;
const referenceHeading =
  /^(?:编制参考|参考资料|参考文献|参考链接|编写参考)\s*[:：]?$/;
const categories =
  /^(?:政治理论|常识判断|言语理解与表达|数量关系|判断推理|资料分析)$/;

export function parseTextDocument(text: string) {
  const questions: Question[] = [];
  const warnings: string[] = [];
  const answers = new Map<string, Set<string>>();
  const materials: { from: number; to: number; lines: string[] }[] = [];
  let material: (typeof materials)[number] | null = null;
  let q: Question | null = null;
  let field: "stem" | "material" | "explanation" | Choice = "stem";
  let category = "综合";
  let inAnswers = false;
  const push = () => {
    if (q && (q.stem || letters.some((key) => q!.options[key])))
      questions.push(q);
    q = null;
  };

  for (const raw of text
    .replace(/\r/g, "")
    .replace(/\u0007/g, "\n")
    .split("\n")) {
    const heading = raw.trim().match(/^(#{1,6})\s+/)?.[1].length;
    const line = raw
      .trim()
      .replace(/^#{1,6}\s*/, "")
      .replace(/\*\*/g, "");
    if (!line || /^[-=_]{3,}$/.test(line)) continue;
    // Normalize syntax only; preserve Chinese text and Markdown table contents.
    const syntax = line.normalize("NFKC");
    if (referenceHeading.test(syntax)) break;
    if (answerHeading.test(syntax)) {
      push();
      material = null;
      inAnswers = true;
      continue;
    }
    if (inAnswers) {
      if ((heading && !/^(?:第\s*)?\d/.test(syntax)) || categories.test(syntax))
        continue;
      const remainder = syntax
        .toUpperCase()
        .replace(
          /(?:^|[\s,;、。])(?:第\s*)?(\d+)\s*(?:题\s*)?[.、:)]?\s*([A-Z]+)(?=$|[\s,;、。])/g,
          (_match, number: string, answer: string) => {
            const id = questionNumber(number);
            const values = answers.get(id) || new Set<string>();
            values.add(answer);
            answers.set(id, values);
            return "";
          },
        );
      if (remainder.replace(/[\s,;、。]/g, ""))
        warnings.push(`文末答案有未识别内容，请核对：${line.slice(0, 100)}`);
      continue;
    }

    const section = syntax.match(
      /^第[一二三四五六七八九十百零〇\d]+部分\s*[、.:]?\s*(.+?)(?:\s*\(.*\))?$/,
    );
    if (section || categories.test(syntax)) {
      push();
      material = null;
      category = section ? section[1].trim() : line;
      continue;
    }
    const range = syntax.match(
      /^(?:根据|阅读|请根据|请阅读).*(?:回答|完成)\s*(\d+)\s*[-—–~～至到]\s*(\d+)\s*题[。.:]?$/,
    );
    if (range) {
      push();
      material = {
        from: Number(range[1]),
        to: Number(range[2]),
        lines: [line],
      };
      materials.push(material);
      if (material.from > material.to)
        warnings.push(`共用材料的题号范围有误，请核对：${line}`);
      continue;
    }
    const start = line.match(
      /^(?:第\s*)?([\d０-９]+)\s*(?:[.、．）)]|题[：:、.]?)\s*(.*)$/,
    );
    if (start) {
      push();
      material = null;
      q = blankQuestion(questions.length + 1);
      q.sourceId = start[1].normalize("NFKC");
      q.stem = start[2];
      q.category = category;
      field = "stem";
      continue;
    }
    if (material) {
      material.lines.push(line);
      continue;
    }
    if (heading && heading <= 2) {
      push();
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

  const ids = new Set(
    questions.map((question) => questionNumber(question.sourceId)),
  );
  for (const id of answers.keys()) {
    if (!ids.has(id))
      warnings.push(
        `文末第 ${id} 题有答案，但未找到对应题目，请核对是否漏题。`,
      );
  }
  for (const question of questions) {
    const values = answers.get(questionNumber(question.sourceId));
    if (values) {
      const candidates = new Set(values);
      if (question.answer) candidates.add(question.answer);
      const answer = [...candidates][0];
      if (candidates.size !== 1 || !letters.includes(answer as Choice)) {
        question.answer = "" as Choice;
        warnings.push(
          `第 ${question.sourceId} 题的答案冲突或不是 A/B/C/D，请在预览中重新选择。`,
        );
      } else question.answer = answer as Choice;
    }
    const shared = materials.filter(
      ({ from, to }) =>
        Number(question.sourceId) >= from && Number(question.sourceId) <= to,
    );
    question.material = [
      ...shared.map(({ lines }) => lines.join("\n")),
      question.material,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return { questions, warnings };
}

export function parseText(text: string): Question[] {
  return parseTextDocument(text).questions;
}
