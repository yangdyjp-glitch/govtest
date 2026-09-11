export type Choice = "A" | "B" | "C" | "D";
export type Outcome = "first" | "revised" | "wrong";
export type Question = {
  id: string;
  sourceId: string;
  stem: string;
  material: string;
  options: Record<Choice, string>;
  answer: Choice;
  explanation: string;
  category: string;
};
export type PublicQuestion = Omit<Question, "answer" | "explanation">;
export type AnswerState = {
  history: Choice[];
  flagged: boolean;
  elapsedMs: number;
};
export type Attempt = {
  id: string;
  userId: string;
  bankId: string;
  title: string;
  status: "active" | "submitted";
  questions: PublicQuestion[];
  states: AnswerState[];
  current: number;
  revision: number;
  createdAt: string;
  submittedAt: string | null;
  results?: ResultItem[];
};
export type ResultItem = {
  question: Question;
  state: AnswerState;
  outcome: Outcome;
};
export type User = {
  username?: string;
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  disabled: number;
};
export type Bank = {
  id: string;
  title: string;
  description: string;
  count: number;
  archived: number;
  createdAt: string;
};
export type Event = {
  id: string;
  type: "answer" | "flag" | "time" | "navigate";
  index: number;
  value?: Choice | boolean | number;
  at: string;
};
export const letters: Choice[] = ["A", "B", "C", "D"];
export const outcomeLabels: Record<Outcome, string> = {
  first: "首次正确",
  revised: "修改正确",
  wrong: "最终错误",
};
export const newStates = (n: number): AnswerState[] =>
  Array.from({ length: n }, () => ({
    history: [],
    flagged: false,
    elapsedMs: 0,
  }));
export function classify(answer: Choice, history: Choice[]): Outcome {
  if (history.at(-1) !== answer) return "wrong";
  return history.length === 1 ? "first" : "revised";
}
export function applyEvent(
  states: AnswerState[],
  event: Event,
): number | undefined {
  if (
    !Number.isInteger(event.index) ||
    event.index < 0 ||
    event.index >= states.length
  )
    throw new Error("题号无效");
  const s = states[event.index];
  if (event.type === "answer") {
    if (!letters.includes(event.value as Choice))
      throw new Error("答案必须为 A/B/C/D");
    if (s.history.at(-1) !== event.value) s.history.push(event.value as Choice);
  } else if (event.type === "flag") {
    if (typeof event.value !== "boolean") throw new Error("标记无效");
    s.flagged = event.value;
  } else if (event.type === "time") {
    if (
      typeof event.value !== "number" ||
      !Number.isFinite(event.value) ||
      event.value < 0 ||
      event.value > 60000
    )
      throw new Error("计时增量无效");
    s.elapsedMs += Math.round(event.value);
  } else if (event.type === "navigate") return event.index;
  else throw new Error("操作类型无效");
}
export function summarize(results: ResultItem[]) {
  const first = results.filter((x) => x.outcome === "first").length,
    revised = results.filter((x) => x.outcome === "revised").length;
  return {
    total: results.length,
    first,
    revised,
    wrong: results.length - first - revised,
    firstRate: results.length ? (first / results.length) * 100 : 0,
    revisedRate: results.length ? (revised / results.length) * 100 : 0,
    totalMs: results.reduce((n, x) => n + x.state.elapsedMs, 0),
  };
}
export function validateQuestions(input: unknown): string[] {
  if (!Array.isArray(input) || !input.length) return ["题库至少需要一道题"];
  if (input.length > 300) return ["每次最多导入 300 道题，请分批导入"];
  const errors: string[] = [];
  const ids = new Set<string>();
  const contents = new Map<string, number>();
  input.forEach((q, i) => {
    const p = `第 ${i + 1} 题`;
    if (!q || typeof q !== "object") {
      errors.push(`${p}格式错误`);
      return;
    }
    if (typeof q.stem !== "string" || !q.stem.trim())
      errors.push(`${p}缺少题干`);
    if (typeof q.stem === "string" && q.stem.length > 20000)
      errors.push(`${p}题干过长`);
    if (
      !q.options ||
      Object.keys(q.options).length !== 4 ||
      letters.some(
        (k) => typeof q.options[k] !== "string" || !q.options[k].trim(),
      )
    )
      errors.push(`${p}必须包含四个非空选项`);
    if (q.options && letters.some((k) => (q.options[k]?.length ?? 0) > 10000))
      errors.push(`${p}选项过长`);
    if (!letters.includes(q.answer))
      errors.push(`${p}正确答案必须为 A/B/C/D 中一个`);
    if (q.sourceId && ids.has(q.sourceId))
      errors.push(`${p}题号重复：${q.sourceId}`);
    ids.add(q.sourceId);
    if (
      typeof q.stem === "string" &&
      typeof q.material === "string" &&
      q.options &&
      letters.every((key) => typeof q.options[key] === "string")
    ) {
      const content = JSON.stringify(
        [q.stem, q.material, ...letters.map((key) => q.options[key])].map(
          (text: string) => text.trim().replace(/\s+/g, " "),
        ),
      );
      const previous = contents.get(content);
      if (previous !== undefined)
        errors.push(
          `${p}与第 ${previous + 1} 题内容重复（题干、材料和四个选项相同），请核实后修改`,
        );
      else contents.set(content, i);
    }
    for (const k of ["material", "explanation", "category"])
      if (typeof q[k] !== "string" || q[k].length > 30000)
        errors.push(`${p}${k}格式或长度错误`);
  });
  return errors;
}
export function duration(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)} 分 ${String(s % 60).padStart(2, "0")} 秒`;
}
