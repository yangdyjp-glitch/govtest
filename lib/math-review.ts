import type { Question } from "./domain";

export const expressionFields = [
  "stem",
  "material",
  "A",
  "B",
  "C",
  "D",
  "explanation",
] as const;
export type ExpressionField = (typeof expressionFields)[number];
export type ExpressionReview = {
  questionIndex: number;
  field: ExpressionField;
  before: string;
  after: string;
  notes: string[];
  confirmed: boolean;
};
export const expressionFieldLabels: Record<ExpressionField, string> = {
  stem: "题干",
  material: "材料",
  A: "选项 A",
  B: "选项 B",
  C: "选项 C",
  D: "选项 D",
  explanation: "解析",
};
export function expressionText(q: Question, field: ExpressionField) {
  return field.length === 1
    ? q.options[field as "A" | "B" | "C" | "D"]
    : q[field as "stem" | "material" | "explanation"];
}
const symbols: Record<string, string> = {
  times: "×",
  cdot: "·",
  div: "÷",
  pm: "±",
  mp: "∓",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
  approx: "≈",
  equiv: "≡",
  infty: "∞",
  pi: "π",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  sigma: "σ",
  omega: "ω",
  Delta: "Δ",
  Sigma: "Σ",
  Omega: "Ω",
  degree: "°",
  percent: "%",
  angle: "∠",
  parallel: "∥",
  perp: "⊥",
  sum: "∑",
  prod: "∏",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  cup: "∪",
  cap: "∩",
  ldots: "…",
  cdots: "⋯",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  log: "log",
  ln: "ln",
  lim: "lim",
};
const superChars = Object.fromEntries(
  [..."0123456789+-=()ni"].map((c, i) => [c, [..."⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ"][i]]),
);
const subChars = Object.fromEntries(
  [..."0123456789+-=()aehijklmnoprstuvx"].map((c, i) => [
    c,
    [..."₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ"][i],
  ]),
);
const mathSignals =
  /\\[a-zA-Z]+|[√∛∜×÷±≤≥≠≈∑∏∫∞¹²³⁰-⁹₀-₉α-ωΑ-Ω]|[\dA-Za-z)]\s*[+*=^]\s*[\dA-Za-z({\\]|[_^]\{|\b\d+\s*\/\s*\d+|\)\s*\/\s*\(/;

export function normalizeMathText(input: string) {
  const notes = new Set<string>();
  const scan = input
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[A-Za-z]:\\[^\s]+/g, "")
    .replace(/\b\d{4}\/\d{1,2}\/\d{1,2}\b/g, "");
  let detected =
    mathSignals.test(scan) ||
    input.includes("�") ||
    input.includes("【待核对公式");
  if (input.includes("【待核对公式"))
    notes.add(
      "原文件含复杂公式对象，无法可靠还原排版，请对照原文件补全公式后确认。",
    );
  if (input.includes("�"))
    notes.add("存在无法识别的字符，请对照原文件补全，系统不猜测缺失内容。");
  // Only paired math delimiters are removed; currency, URLs and ordinary prose stay intact.
  let text = input.replace(
    /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$])\$([^$\n]+)\$(?!\$)/g,
    (whole, ...args) => {
      const body = args
        .slice(0, 4)
        .find((value) => typeof value === "string") as string;
      if (
        !whole.startsWith("\\(") &&
        !whole.startsWith("\\[") &&
        !whole.startsWith("$$") &&
        !mathSignals.test(body) &&
        !/^[A-Za-z](?:_[A-Za-z0-9])?$/.test(body.trim())
      )
        return whole;
      detected = true;
      return body.trim();
    },
  );
  function group(source: string, from: number, open = "{", close = "}") {
    let start = from;
    while (/\s/.test(source[start] || "") && start < source.length) start++;
    if (source[start] !== open) return null;
    let depth = 0;
    for (let i = start; i < source.length; i++) {
      if (source[i] === open) depth++;
      if (source[i] === close) depth--;
      if (source[i] === close && depth === 0)
        return { value: source.slice(start + 1, i), end: i + 1 };
    }
    return null;
  }
  function convert(source: string, depth = 0): string {
    if (depth > 24) {
      notes.add("公式嵌套过深，请人工整理。");
      return source;
    }
    let result = "";
    for (let i = 0; i < source.length;) {
      const literal = source
        .slice(i)
        .match(/^(?:https?:\/\/|[A-Za-z]:\\)[^\s`]+/);
      if (literal) {
        result += literal[0];
        i += literal[0].length;
        continue;
      }
      const command =
        source[i] === "\\" ? source.slice(i).match(/^\\([A-Za-z]+)/) : null;
      if (command) {
        const name = command[1],
          next = i + command[0].length;
        if (name === "sqrt" || ["frac", "dfrac", "tfrac"].includes(name)) {
          let pos = next;
          const rootIndex =
            name === "sqrt" ? group(source, pos, "[", "]") : null;
          if (rootIndex) pos = rootIndex.end;
          const first = group(source, pos);
          const second =
            name !== "sqrt" && first ? group(source, first.end) : null;
          if (first && (name === "sqrt" || second)) {
            const inside = convert(first.value, depth + 1);
            if (!inside.trim() || (second && !second.value.trim()))
              notes.add("公式中有空的根号或分子、分母，请补全。");
            if (name === "sqrt") {
              const index = rootIndex?.value.trim();
              result +=
                !index || index === "2"
                  ? `√(${inside})`
                  : index === "3"
                    ? `∛(${inside})`
                    : index === "4"
                      ? `∜(${inside})`
                      : `(${inside})的(${convert(index, depth + 1)})次方根`;
            } else {
              if (/\d\s*$/.test(result))
                notes.add(
                  "分数前紧邻数字，请确认表示带分数还是乘法，必要时改写。",
                );
              result += `((${inside})/(${convert(second!.value, depth + 1)}))`;
            }
            i = second?.end ?? first.end;
            continue;
          }
          notes.add("根式或分数参数不完整，请补全括号及内容。");
        } else if (Object.hasOwn(symbols, name)) {
          result += symbols[name];
          i = next;
          continue;
        } else if (
          ["text", "mathrm", "mathbf", "operatorname"].includes(name)
        ) {
          const body = group(source, next);
          if (body) {
            result += convert(body.value, depth + 1);
            i = body.end;
            continue;
          }
          notes.add("公式文字标记不完整，请人工核对。");
        } else if (
          ["left", "right"].includes(name) &&
          /^\s*[()[\]|]/.test(source.slice(next))
        ) {
          i = next;
          continue;
        } else
          notes.add(
            `暂不能可靠转换 \\${name}，已保留该表达，请人工改写或核实。`,
          );
        result += command[0];
        i = next;
        continue;
      }
      if (source[i] === "\\" && /^[,;! ]/.test(source[i + 1] || "")) {
        result += " ";
        i += 2;
        continue;
      }
      if (source[i] === "\\" && source[i + 1] === "%") {
        result += "%";
        i += 2;
        continue;
      }
      if (
        (source[i] === "^" || source[i] === "_") &&
        /[\dA-Za-z)}\]∑∏α-ωΑ-Ω]/.test(source[i - 1] || "")
      ) {
        const body = group(source, i + 1);
        const digit = source
          .slice(i + 1)
          .match(/^(?:[+-]?\d+|[A-Za-z](?![A-Za-z]))/);
        const value = body?.value ?? digit?.[0];
        if (value !== undefined) {
          detected = true;
          if (!body && /^[+-]?\d{2,}$/.test(value))
            notes.add("未加括号的多位上下标已合并显示，请确认其范围。");
          const converted = convert(value, depth + 1),
            chars = source[i] === "^" ? superChars : subChars;
          result +=
            converted && [...converted].every((c) => Object.hasOwn(chars, c))
              ? [...converted].map((c) => chars[c]).join("")
              : `${source[i]}(${converted})`;
          i = body?.end ?? i + 1 + value.length;
          continue;
        }
        if (source[i + 1] === "{") notes.add("上下标括号未闭合，请人工补全。");
      }
      result += source[i++];
    }
    return result;
  }
  text = convert(text);
  text = text.replace(/`([^`\n]+)`/g, (whole, body) =>
    !/^(?:https?:\/\/|[A-Za-z]:\\)/.test(body) && mathSignals.test(body)
      ? body
      : whole,
  );
  text = text.replace(/\bsqrt\(([^()\n]+)\)/g, (_, value) => {
    detected = true;
    return `√(${value})`;
  });
  if (/\b\d+\s*[xX]\s*\d+\b/.test(input)) {
    detected = true;
    notes.add("数字间的 x/X 可能是乘号或变量，请核实后改写。");
  }
  if (
    /\b\d+\s*\/\s*\d+\s*\/\s*\d+\b/.test(input) &&
    !/\d{4}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2}/.test(input)
  )
    notes.add("连续除法的运算顺序可能不明确，请用括号说明。");
  return { text, detected: detected || text !== input, notes: [...notes] };
}

export function prepareMathReview(
  questions: Question[],
  previous: ExpressionReview[] = [],
) {
  const reviews: ExpressionReview[] = [];
  const prepared = questions.map((q, questionIndex) => {
    const next = { ...q, options: { ...q.options } };
    for (const field of expressionFields) {
      const before = expressionText(q, field);
      const old = previous.find(
        (review) =>
          review.questionIndex === questionIndex && review.field === field,
      );
      const result = normalizeMathText(before);
      if (field.length === 1)
        next.options[field as "A" | "B" | "C" | "D"] = result.text;
      else next[field as "stem" | "material" | "explanation"] = result.text;
      if (result.detected || old)
        reviews.push({
          questionIndex,
          field,
          before: old?.before ?? before,
          after: result.text,
          notes: result.notes.length
            ? result.notes
            : old?.after === result.text
              ? old.notes
              : [],
          confirmed:
            old?.confirmed === true &&
            old.after === before &&
            before === result.text,
        });
    }
    return next;
  });
  return { questions: prepared, expressionReviews: reviews };
}

export function pendingMathReviews(
  questions: Question[],
  reviews: ExpressionReview[] = [],
) {
  return reviews.filter(
    (review) =>
      !review.confirmed ||
      !questions[review.questionIndex] ||
      expressionText(questions[review.questionIndex], review.field) !==
        review.after,
  );
}
