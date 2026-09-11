import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeResults,
  moduleReference,
  moduleReferences,
  sortResults,
  speedBand,
} from "../lib/result-analysis.ts";
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
const near = (a, b) =>
  assert.ok(
    Math.abs(a - b) <= Math.max(1e-7, Math.abs(b) * 1e-9),
    `${a} != ${b}`,
  );
test("four sorts keep original numbers, numeric order and stable ties without mutation", () => {
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
  for (const key of ["category", "outcome", "time"])
    assert.deepEqual(
      sortResults(mixed, { key, direction: "asc" }).map((row) => row.number),
      [2, 3, 1],
    );
  assert.deepEqual(
    sortResults(mixed, { key: "outcome", direction: "desc" }).map(
      (row) => row.number,
    ),
    [1, 3, 2],
  );
  assert.deepEqual(
    sortResults(mixed, { key: "time", direction: "desc" }).map(
      (row) => row.number,
    ),
    [1, 2, 3],
  );
  assert.deepEqual(rows, original);
});
test("five timing bands include one deviation in average and two in fast/slow", () => {
  for (const [value, expected] of [
    [79.999, "very-fast"],
    [80, "fast"],
    [89, "fast"],
    [90, "average"],
    [100, "average"],
    [110, "average"],
    [111, "slow"],
    [120, "slow"],
    [120.001, "very-slow"],
  ])
    assert.equal(speedBand(value, 100, 10), expected);
  assert.equal(speedBand(100, 100, 0), "average");
});
test("mean comparisons and band counts reconcile using population deviation", () => {
  const data = analyzeResults(
    [10, 20, 30, 40].map((s, i) => result(i, "first", s)),
  ).distribution;
  near(data.mean, 25000);
  near(data.median, 25000);
  near(data.deviation, Math.sqrt(125) * 1000);
  assert.deepEqual([data.below, data.equal, data.above], [2, 0, 2]);
  assert.deepEqual(
    data.bands.map((b) => b.count),
    [0, 1, 2, 1, 0],
  );
  assert.equal(
    data.bands.reduce((n, b) => n + b.count, 0),
    4,
  );
  near(
    data.bands.reduce((n, b) => n + b.percent, 0),
    100,
  );
  const odd = analyzeResults(
    [10, 20, 30].map((s, i) => result(i, "first", s)),
  ).distribution;
  assert.deepEqual([odd.below, odd.equal, odd.above], [1, 1, 1]);
  const tail = analyzeResults(
    [...Array(5).fill(100), 1000].map((s, i) => result(i, "wrong", s)),
  );
  for (const data of [tail.distribution, tail.categories[0].times]) {
    assert.equal(data.bands.find((b) => b.key === "very-slow").count, 1);
  }
  const lower = analyzeResults(
    [10, ...Array(5).fill(100)].map((s, i) => result(i, "first", s)),
  );
  for (const data of [lower.distribution, lower.categories[0].times]) {
    assert.equal(data.bands.find((b) => b.key === "very-fast").count, 1);
  }
});
test("reference midpoints define ratios; matching proportional times yields no artificial winners", () => {
  const rows = moduleReferences.flatMap((ref, i) =>
    Array.from({ length: i + 2 }, (_, j) =>
      result(`${i}-${j}`, "first", 20 * ref.weight, ref.name),
    ),
  );
  const report = analyzeResults(rows);
  assert.equal(report.comparable, 6);
  assert.equal(report.fastest.length, 0);
  assert.equal(report.slowest.length, 0);
  near(report.baseMs, 20000);
  for (const group of report.categories) {
    near(group.paceRatio, 1);
    near(group.times.mean, 20000 * group.reference.weight);
  }
  near(
    report.categories.reduce((sum, g) => sum + g.expectedMs * g.times.timed, 0),
    report.overall.totalMs,
  );
});
test("relative module speed accounts for type ratio rather than raw seconds", () => {
  const report = analyzeResults([
    result(1, "first", 20, "常识判断"),
    result(2, "first", 40, "资料分析"),
  ]);
  assert.equal(report.fastest[0].category, "资料分析");
  assert.equal(report.slowest[0].category, "常识判断");
  near(report.categories[0].paceRatio, 7 / 6);
  near(report.categories[1].paceRatio, 14 / 15);
});
test("making a complete exam easier or harder does not change relative judgments or bands", () => {
  const rows = [
    result(1, "first", 20, "常识判断"),
    result(2, "wrong", 60, "常识判断"),
    result(3, "first", 40, "资料分析"),
    result(4, "revised", 75, "资料分析"),
    result(5, "first", 200, "资料分析"),
  ];
  const report = analyzeResults(rows),
    original = structuredClone(rows);
  for (const scale of [0.1, 0.5, 2, 10]) {
    const changed = analyzeResults(
      rows.map((row) => ({
        ...row,
        state: { ...row.state, elapsedMs: row.state.elapsedMs * scale },
      })),
    );
    assert.deepEqual(
      changed.distribution.bands.map((b) => b.count),
      report.distribution.bands.map((b) => b.count),
    );
    assert.deepEqual(
      changed.ranked.map((g) => g.category),
      report.ranked.map((g) => g.category),
    );
    for (let i = 0; i < report.categories.length; i++) {
      near(changed.categories[i].paceRatio, report.categories[i].paceRatio);
      assert.equal(
        changed.categories[i].verdict.code,
        report.categories[i].verdict.code,
      );
      assert.deepEqual(
        changed.categories[i].times.bands.map((b) => b.count),
        report.categories[i].times.bands.map((b) => b.count),
      );
    }
    assert.equal(changed.overallVerdict.code, report.overallVerdict.code);
  }
  assert.deepEqual(rows, original);
});
test("module comparisons weight question counts and do not average category averages", () => {
  const rows = [
    ...Array.from({ length: 9 }, (_, i) => result(i, "first", 20, "常识判断")),
    result(10, "wrong", 100, "资料分析"),
  ];
  const report = analyzeResults(rows);
  near(report.overall.averageMs, 28000);
  near(report.baseMs, 280000 / 11.5);
  assert.equal(report.overall.correctRate, 90);
  assert.equal(report.priorities[0].category, "资料分析");
  near(
    report.categories.reduce((sum, g) => sum + g.expectedMs * g.times.timed, 0),
    280000,
  );
});
test("module internal timing uses its own mean and original question numbers", () => {
  const rows = [
    result(1, "first", 10, "常识判断"),
    result(2, "first", 20, "常识判断"),
    result(3, "first", 30, "常识判断"),
    result(4, "first", 100, "资料分析"),
    result(5, "wrong", 200, "资料分析"),
    result(6, "wrong", 500, "资料分析"),
  ];
  const report = analyzeResults(rows),
    data = report.categories.find((g) => g.category === "资料分析").times;
  near(data.mean, 800000 / 3);
  assert.deepEqual(
    data.rows.map((row) => row.number),
    [4, 5, 6],
  );
  assert.equal(data.rows[2].band, "slow");
  assert.deepEqual(
    report.slowWrong.map((row) => row.number),
    [6],
  );
});
test("incorrect or repeatedly revised fast answers never receive a positive judgment", () => {
  for (const [outcome, code] of [
    ["wrong", "inaccurate"],
    ["revised", "unstable"],
  ]) {
    const rows = [
      result(1, outcome, 1, "常识判断"),
      result(2, "first", 100, "资料分析"),
    ];
    const report = analyzeResults(rows);
    assert.equal(report.fastest[0].category, "常识判断");
    assert.equal(report.categories[0].verdict.code, code);
    assert.equal(report.categories[0].firstRate, 0);
  }
});
test("unknown and ambiguous modules keep internal analysis but cannot distort reference ratios", () => {
  assert.equal(moduleReference("判断推理 / 类比推理").name, "判断推理");
  assert.equal(moduleReference("政治理论与资料分析"), null);
  const report = analyzeResults([
    result(1, "first", 20, "常识判断"),
    result(2, "first", 40, "资料分析"),
    result(3, "first", 99999, "综合"),
  ]);
  near(report.baseMs, 60000 / 3.5);
  assert.equal(report.categories[2].paceRatio, null);
  assert.equal(report.categories[2].times.timed, 1);
  assert.equal(
    analyzeResults([result(1, "first", 10, "资料分析")]).ranked.length,
    0,
  );
  assert.equal(
    analyzeResults([result(1, "first", 10, "资料分析")]).categories[0].verdict
      .code,
    "relative",
  );
});
test("zero/missing timing is excluded, equal times stay central, empty data remains finite", () => {
  for (const seconds of [0, -1, NaN, Infinity]) {
    const data = analyzeResults([
      result(1, "first", seconds, "常识判断"),
      result(2, "first", 20, "资料分析"),
    ]);
    assert.equal(data.distribution.missing, 1);
    assert.equal(data.distribution.mean, 20000);
    assert.equal(
      data.distribution.bands.reduce((n, b) => n + b.count, 0),
      1,
    );
    assert.equal(data.distribution.rows[0].band, null);
    assert.equal(data.comparable, 1);
    assert.equal(data.overallVerdict.code, "untimed");
  }
  const equal = analyzeResults(
    Array.from({ length: 8 }, (_, i) => result(i, "first", 10)),
  ).distribution;
  assert.equal(equal.equal, 8);
  assert.equal(equal.deviation, 0);
  assert.equal(equal.bands[2].count, 8);
  const empty = analyzeResults([]);
  assert.equal(empty.distribution.mean, null);
  assert.equal(empty.distribution.median, null);
  assert.equal(empty.distribution.timed, 0);
  assert.deepEqual(empty.categories, []);
});
