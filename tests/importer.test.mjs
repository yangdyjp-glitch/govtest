import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { validateQuestions } from "../lib/domain.ts";

const bundle = await build({
  entryPoints: ["lib/text-importer.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { parseTextDocument } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const source = await readFile(
  new URL("./fixtures/central-answers.md", import.meta.url),
  "utf8",
);

test("central answers match question numbers and preserve categories and shared tables", () => {
  const { questions, warnings } = parseTextDocument(source);
  assert.equal(questions.length, 6);
  assert.deepEqual(warnings, []);
  assert.deepEqual(validateQuestions(questions), []);
  assert.deepEqual(
    questions.map((q) => q.sourceId),
    ["1", "2", "3", "4", "5", "6"],
  );
  assert.equal(questions.map((q) => q.answer).join(""), "BCBDCC");
  assert.deepEqual(
    questions.map((q) => q.category),
    ["数量关系", "数量关系", ...Array(4).fill("资料分析")],
  );
  assert.equal(questions[1].options.D, "9");
  assert.equal(questions[3].options.D, "220万元");
  assert.equal(questions[5].options.D, "19人");
  assert.equal(questions[0].material, "");
  assert.equal(questions[1].material, "");
  assert.equal(questions[2].material, questions[3].material);
  assert.match(questions[2].material, /\| 第一季度 \| 100 \|/);
  assert.equal(questions[4].material, questions[5].material);
  assert.match(questions[4].material, /\| 综合部 \| 10 \|/);
  assert.doesNotMatch(questions[4].material, /销售额/);
  assert.match(questions[5].stem, /\n只计算/);
  assert.doesNotMatch(JSON.stringify(questions), /编制参考|本段不是/);
});

test("answer matching uses IDs instead of answer order, including fullwidth syntax", () => {
  const text = source
    .replace("1.B　2.C", "２：ｃ，１．ｂ")
    .replace("3.B　4.D　5.C　6.C", "6 C；第4题：D\n5、C\n3.B")
    .replace("### 1.", "### 001.");
  const { questions, warnings } = parseTextDocument(text);
  assert.equal(questions.map((q) => q.answer).join(""), "BCBDCC");
  assert.deepEqual(warnings, []);
});

test("four inline options, two-column options and fullwidth labels preserve every option", () => {
  const expected = parseTextDocument(source);
  const options = /^A\.[^\n]*\nB\.[^\n]*\nC\.[^\n]*\nD\.[^\n]*/gm;
  const inline = source.replace(options, (block) =>
    block.replaceAll("\n", "　"),
  );
  const twoColumns = source.replace(options, (block) => {
    const rows = block.split("\n");
    return `${rows[0]}\t${rows[1]}\n${rows[2]}  ${rows[3]}`;
  });
  const fullwidth = inline.replace(
    /\b([A-D])\. /g,
    (_, key) => String.fromCharCode(key.charCodeAt(0) + 0xfee0) + "．",
  );
  for (const text of [
    inline,
    twoColumns,
    fullwidth,
    inline.replace(/^#{1,6}\s*/gm, ""),
  ]) {
    assert.deepEqual(parseTextDocument(text), expected);
  }
});

test("option text containing letter abbreviations and multiline content is preserved", () => {
  const { questions } = parseTextDocument(
    `1. 选择包含 C. elegans 的表述\nA. C. elegans 是一种线虫\n这是选项 A 的补充说明\nB. 另一个选项　C. 第三个选项　D. 第四个选项\n答案：A`,
  );
  assert.deepEqual(validateQuestions(questions), []);
  assert.equal(
    questions[0].options.A,
    "C. elegans 是一种线虫\n这是选项 A 的补充说明",
  );
  assert.equal(questions[0].options.B, "另一个选项");
  assert.equal(questions[0].options.C, "第三个选项");
  assert.equal(questions[0].options.D, "第四个选项");
});

test("missing, conflicting and invalid answers stay invalid for preview correction", () => {
  const { questions, warnings } = parseTextDocument(
    source
      .replace("1.B　2.C", "1.B　1.A　2.AB")
      .replace("3.B　4.D　5.C　6.C", "3.E　4.D　5.C　99.A"),
  );
  assert.deepEqual(
    questions.map((q) => q.answer),
    ["", "", "", "D", "C", ""],
  );
  assert.ok(validateQuestions(questions).length >= 4);
  assert.ok(warnings.some((w) => w.includes("99") && w.includes("未找到")));
  const mixed = parseTextDocument(source.replace("D. 4", "D. 4\n答案：A"));
  assert.equal(mixed.questions[0].answer, "");
  assert.ok(mixed.warnings.some((w) => w.includes("冲突")));
});

test("existing inline-answer template and Word-style plain paragraphs still import", async () => {
  const template = await readFile(
    new URL("../public/templates/questions.md", import.meta.url),
    "utf8",
  );
  for (const text of [
    template,
    template.replace(/^#{1,6}\s*/gm, "").replace(/\n/g, "\r\n"),
  ]) {
    const { questions, warnings } = parseTextDocument(text);
    assert.deepEqual(validateQuestions(questions), []);
    assert.deepEqual(warnings, []);
    assert.equal(questions.length, 2);
    assert.equal(questions.map((q) => q.answer).join(""), "BC");
    assert.equal(questions[0].explanation, "1 + 1 = 2。");
  }
  const plain = parseTextDocument(source.replace(/^#{1,6}\s*/gm, ""));
  assert.equal(plain.questions.length, 6);
  assert.deepEqual(validateQuestions(plain.questions), []);
});
