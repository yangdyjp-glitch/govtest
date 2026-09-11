import test from "node:test";
import assert from "node:assert/strict";
import { analyzeResults, sortResults } from "../lib/result-analysis.ts";

function result(id, outcome = "first", seconds = 30, category = "综合") {
  return {
    question: {
      id: String(id),
      sourceId: String(id),
      category,
      stem: `题目 ${id}`,
      material: "",
      explanation: "",
      options: { A: "甲", B: "乙", C: "丙", D: "丁" },
      answer: "A",
    },
    state: {
      history:
        outcome === "first"
          ? ["A"]
          : outcome === "revised"
            ? ["A", "B", "A"]
            : ["B"],
      flagged: false,
      elapsedMs: seconds * 1000,
    },
    outcome,
  };
}

test("four sorts preserve original question numbers and source order", () => {
  const rows = Array.from({ length: 12 }, (_, i) => result(i + 1));
  const original = structuredClone(rows);
  assert.deepEqual(
    sortResults(rows, { key: "number", direction: "desc" }).map(
      (row) => row.number,
    ),
    [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  );
  const mixed = [
    result("a", "first", 90, "模块10"),
    result("b", "wrong", 10, "模块2"),
    result("c", "revised", 10, "模块2"),
  ];
  const numbers = (key, direction) =>
    sortResults(mixed, { key, direction }).map((row) => row.number);
  assert.deepEqual(numbers("category", "asc"), [2, 3, 1]);
  assert.deepEqual(numbers("category", "desc"), [1, 2, 3]);
  assert.deepEqual(numbers("outcome", "asc"), [2, 3, 1]);
  assert.deepEqual(numbers("outcome", "desc"), [1, 3, 2]);
  assert.deepEqual(numbers("time", "asc"), [2, 3, 1]);
  assert.deepEqual(numbers("time", "desc"), [1, 2, 3]);
  assert.equal(
    sortResults(mixed, { key: "time", direction: "asc" })[0].item.question.id,
    "b",
  );
  assert.deepEqual(rows, original);
});

test("speed cannot compensate for wrong answers or unstable first choices", () => {
  const rows = (outcome, seconds) =>
    Array.from({ length: 10 }, (_, i) => result(i, outcome, seconds));
  assert.equal(
    analyzeResults(rows("first", 30)).overall.verdict.code,
    "balanced",
  );
  assert.equal(analyzeResults(rows("first", 90)).overall.verdict.code, "slow");
  assert.equal(
    analyzeResults(rows("wrong", 1)).overall.verdict.code,
    "inaccurate",
  );
  assert.equal(
    analyzeResults(rows("wrong", 90)).overall.verdict.code,
    "improve",
  );
  const revised = analyzeResults(rows("revised", 1)).overall;
  assert.equal(revised.verdict.code, "unstable");
  assert.equal(revised.correctRate, 100);
  assert.equal(revised.firstRate, 0);
  assert.equal(revised.firstOnTime, 0);
});

test("balanced judgment requires both accuracy thresholds and speed distribution", () => {
  const rows = Array.from({ length: 10 }, (_, i) =>
    result(i, i < 7 ? "first" : i === 7 ? "revised" : "wrong", i < 8 ? 50 : 90),
  );
  const report = analyzeResults(rows).overall;
  assert.equal(report.correctRate, 80);
  assert.equal(report.firstRate, 70);
  assert.equal(report.onTimeRate, 80);
  assert.equal(report.averageMs, 58000);
  assert.equal(report.verdict.code, "balanced");
  // Average still meets the goal, but too many individual questions exceed it.
  rows[0].state.elapsedMs = 61000;
  assert.equal(analyzeResults(rows).overall.verdict.code, "slow");
  rows[0].state.elapsedMs = 50000;
  rows[9].state.elapsedMs = 200000;
  // 80% are on time, but one very long question makes overall pace too slow.
  assert.equal(analyzeResults(rows).overall.verdict.code, "slow");
});

test("category sizes weight the overall result and weak categories come first", () => {
  const rows = [
    result(1, "first", 10, "常识"),
    ...Array.from({ length: 9 }, (_, i) =>
      result(i + 2, "wrong", 100, "资料分析"),
    ),
  ];
  const analysis = analyzeResults(rows);
  assert.equal(analysis.overall.correctRate, 10);
  assert.equal(analysis.overall.averageMs, 91000);
  assert.equal(analysis.categories[0].correctRate, 100);
  assert.equal(analysis.categories[1].wrong, 9);
  assert.equal(analysis.priorities[0].category, "资料分析");
  assert.deepEqual(
    analyzeResults(
      sortResults(rows, { key: "time", direction: "desc" }).map(
        (row) => row.item,
      ),
    ).overall,
    analysis.overall,
  );
});

test("missing timing and empty results cannot receive a positive speed judgment", () => {
  for (const seconds of [0, -1, NaN, Infinity]) {
    const report = analyzeResults([
      result(1, "first", seconds),
      result(2, "first", 20),
    ]).overall;
    assert.equal(report.verdict.code, "untimed");
    assert.equal(report.missingTiming, 1);
    assert.equal(report.onTime, 1);
    assert.equal(report.firstOnTime, 1);
    assert.equal(report.averageMs, 20000);
  }
  const empty = analyzeResults([]);
  assert.equal(empty.overall.verdict.code, "empty");
  assert.equal(empty.overall.averageMs, null);
  assert.deepEqual(empty.categories, []);
  assert.deepEqual(empty.priorities, []);
});

test("changing the practice time target changes only the judgment, not results", () => {
  const rows = [result(1, "first", 60, "   ")];
  const copy = structuredClone(rows);
  assert.equal(analyzeResults(rows, 45).overall.verdict.code, "slow");
  assert.equal(analyzeResults(rows, 60).overall.verdict.code, "balanced");
  assert.equal(analyzeResults(rows).categories[0].category, "未分类");
  assert.throws(() => analyzeResults(rows, 0));
  assert.throws(() => analyzeResults(rows, NaN));
  assert.deepEqual(rows, copy);
});
