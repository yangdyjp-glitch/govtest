import test from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  applyEvent,
  newStates,
  validateQuestions,
} from "../lib/domain.ts";
test("mutually exclusive outcomes use the complete choice history", () => {
  for (const [h, outcome] of [
    [["A"], "first"],
    [["B", "A"], "revised"],
    [["A", "B", "A"], "revised"],
    [["A", "B"], "wrong"],
    [["B"], "wrong"],
  ])
    assert.equal(classify("A", h), outcome);
});
test("repeat clicks and revisits do not count as changed answers; times accumulate", () => {
  const s = newStates(1);
  for (const v of ["A", "A"])
    applyEvent(s, { index: 0, type: "answer", value: v });
  assert.deepEqual(s[0].history, ["A"]);
  applyEvent(s, { index: 0, type: "navigate" });
  applyEvent(s, { index: 0, type: "flag", value: true });
  applyEvent(s, { index: 0, type: "time", value: 4000 });
  applyEvent(s, { index: 0, type: "time", value: 6000 });
  assert.equal(s[0].elapsedMs, 10000);
  assert.equal(classify("A", s[0].history), "first");
  assert.throws(() => applyEvent(s, { index: 0, type: "time", value: -1 }));
  assert.throws(() => applyEvent(s, { index: 0, type: "answer", value: "E" }));
});
test("imports reject missing choices, multiple answers and duplicate IDs", () => {
  const q = {
    sourceId: "1",
    stem: "test",
    material: "",
    explanation: "",
    category: "综合",
    answer: "A",
    options: { A: "a", B: "b", C: "c", D: "d" },
  };
  assert.deepEqual(validateQuestions([q]), []);
  assert.ok(validateQuestions([{ ...q, answer: "AB" }]).length);
  assert.ok(validateQuestions([q, q]).length);
  assert.ok(validateQuestions([{ ...q, options: { A: "a" } }]).length);
});
