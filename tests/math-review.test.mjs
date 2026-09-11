import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMathText,
  prepareMathReview,
  pendingMathReviews,
} from "../lib/math-review.ts";

const question = (patch = {}) => ({
  id: "q",
  sourceId: "7",
  category: "数量关系",
  stem: "请选择",
  material: "",
  options: { A: "甲", B: "乙", C: "丙", D: "丁" },
  answer: "A",
  explanation: "",
  ...patch,
});

test("roots, nested fractions, scripts and operators become readable without changing grouping", () => {
  for (const [before, after] of [
    [String.raw`6\sqrt{2}`, "6√(2)"],
    [String.raw`\frac{1}{\sqrt{2}}`, "((1)/(√(2)))"],
    [String.raw`\sqrt{\frac{a+b}{c}}`, "√(((a+b)/(c)))"],
    [String.raw`\frac{1}{2}^{2}`, "((1)/(2))²"],
    [String.raw`\frac{a+b}{c}x`, "((a+b)/(c))x"],
    [String.raw`\sqrt[3]{8}`, "∛(8)"],
    [String.raw`x^{2}+a_{n+1}`, "x²+aₙ₊₁"],
    [String.raw`x^{a+b}`, "x^(a+b)"],
    [String.raw`2\times3\leq 6`, "2×3≤ 6"],
    [String.raw`\left(\frac{1}{2}\right)`, "(((1)/(2)))"],
    [String.raw`$6\sqrt{2}$`, "6√(2)"],
    [String.raw`\(x\)`, "x"],
    [String.raw`\(6\)`, "6"],
    ["`6\\sqrt{2}`", "6√(2)"],
    ["10^12", "10¹²"],
    ["x^-1", "x⁻¹"],
    ["a_n", "aₙ"],
    ["x^n", "xⁿ"],
  ]) {
    const result = normalizeMathText(before);
    assert.equal(result.text, after);
    assert.equal(result.detected, true);
    assert.equal(
      normalizeMathText(result.text).text,
      after,
      "normalization is idempotent",
    );
  }
});

test("incomplete and unknown syntax retains content and requests manual checking", () => {
  for (const before of [
    String.raw`6\sqrt{`,
    String.raw`\frac{1}`,
    String.raw`\unknown{a+b}`,
    "【待核对公式：a；b】",
    "2x3",
    "内容�缺字",
  ]) {
    const result = normalizeMathText(before);
    assert.equal(result.text, before);
    assert.equal(result.detected, true);
    assert.ok(result.notes.length > 0);
  }
});

test("ordinary prose, dates, money and Markdown tables are preserved", () => {
  for (const text of [
    "公务员考试，选择正确说法。",
    "2026/09/12",
    "价格 $5 和 $6",
    "| 年份 | 人数 |\n| --- | --- |\n| 2024 | 30 |",
    "https://example.com/a?x=2",
    String.raw`C:\times\sqrt{2}.txt`,
  ]) {
    const result = normalizeMathText(text);
    assert.equal(result.text, text);
    assert.equal(result.detected, false);
  }
});

test("all content fields are reviewed and answers, categories and originals are preserved", () => {
  const source = [
    question({
      stem: String.raw`6\sqrt{2}`,
      material: String.raw`\frac{1}{2}`,
      explanation: "x^{2}",
      options: { A: "2×3", B: "2²", C: "√(3)", D: "a_{1}" },
    }),
  ];
  const snapshot = structuredClone(source);
  const prepared = prepareMathReview(source);
  assert.equal(prepared.expressionReviews.length, 7);
  assert.equal(
    pendingMathReviews(prepared.questions, prepared.expressionReviews).length,
    7,
  );
  assert.deepEqual(source, snapshot);
  assert.equal(prepared.questions[0].answer, "A");
  assert.equal(prepared.questions[0].category, "数量关系");
  assert.equal(
    prepared.expressionReviews.find((r) => r.field === "stem").before,
    String.raw`6\sqrt{2}`,
  );
});

test("confirmation is tied to the current expression and survives only unchanged content", () => {
  const initial = prepareMathReview([
    question({ stem: String.raw`6\sqrt{2}` }),
  ]);
  const confirmed = initial.expressionReviews.map((r) => ({
    ...r,
    confirmed: true,
  }));
  const unchanged = prepareMathReview(initial.questions, confirmed);
  assert.equal(
    pendingMathReviews(unchanged.questions, unchanged.expressionReviews).length,
    0,
  );
  const edited = prepareMathReview(
    [{ ...initial.questions[0], stem: "7√(2)" }],
    confirmed,
  );
  assert.equal(
    pendingMathReviews(edited.questions, edited.expressionReviews).length,
    1,
  );
  assert.equal(edited.expressionReviews[0].before, String.raw`6\sqrt{2}`);
  const rewritten = prepareMathReview(
    [{ ...initial.questions[0], stem: "六乘以二的平方根" }],
    confirmed,
  );
  assert.equal(
    pendingMathReviews(rewritten.questions, rewritten.expressionReviews).length,
    1,
  );
});
