import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
const origin = "http://127.0.0.1:8788";
const owner = {
  username: "qa-owner",
  password: process.env.TEST_ADMIN_PASSWORD,
};
const learner = { username: "qa-learner", password: "Integration-learner-42" };
let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}
async function req(path, body, identity = owner, expected = 200) {
  const headers = identity?.cookie ? { Cookie: identity.cookie } : {};
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const r = await fetch(origin + "/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: payload,
  });
  const data = await r.json();
  assert.equal(r.status, expected, `${path}: ${JSON.stringify(data)}`);
  checks++;
  return data;
}
async function signIn(identity) {
  const r = await fetch(origin + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(identity),
  });
  assert.equal(r.status, 200, await r.text());
  const cookie = r.headers.get("set-cookie");
  check(
    cookie.includes("HttpOnly") && cookie.includes("SameSite=strict"),
    "session cookie protected",
  );
  identity.cookie = cookie.split(";")[0];
}
await req("bootstrap", undefined, null, 401);
await signIn(owner);
const boot = await req("bootstrap");
owner.id = boot.user.id;
check(boot.user.role === "admin", "configured initial account is admin");
await req("admin/users", {
  action: "create",
  username: learner.username,
  password: learner.password,
  name: "测试学员",
  role: "user",
});
await signIn(learner);
learner.id = (await req("bootstrap", undefined, learner)).user.id;
const forged = await fetch(origin + "/api/bootstrap", {
  headers: {
    "oai-authenticated-user-id": owner.id,
    "oai-authenticated-user-email": "qa-owner",
  },
});
check(forged.status === 401, "identity headers cannot bypass authentication");
const crossSite = await fetch(origin + "/api/auth/login", {
  method: "POST",
  headers: {
    Origin: "https://evil.example",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(owner),
});
check(crossSite.status === 403, "cross-origin mutation rejected");
await req("admin/banks", undefined, learner, 403);
await req("admin/users", undefined, learner, 403);
await req("admin/demo", {}, learner, 403);
await req("admin/demo", {});
const bank = await req("admin/banks/demo");
let a = await req("attempts", { bankId: "demo" }, learner);
check(
  a.questions.every((q) => !("answer" in q) && !("explanation" in q)),
  "answers stay server-side before submission",
);
await req(`attempts/${a.id}/submit`, { revision: a.revision }, learner, 400);
await req(
  `attempts/${a.id}`,
  undefined,
  { id: "qa-stranger", email: "stranger@sites.test" },
  401,
);
await req(
  `attempts/${a.id}/sync`,
  { revision: a.revision, events: [] },
  owner,
  404,
);
const event = (type, index, value) => ({
  id: crypto.randomUUID(),
  type,
  index,
  value,
  at: new Date().toISOString(),
});
const events = [];
bank.questions.forEach((q, i) => {
  const wrong = ["A", "B", "C", "D"].find((x) => x !== q.answer);
  const history =
    i === 1
      ? [wrong, q.answer]
      : i === 2
        ? [q.answer, wrong, q.answer]
        : i === 3
          ? [q.answer, wrong]
          : i === 4
            ? [wrong]
            : [q.answer];
  history.forEach((v) => events.push(event("answer", i, v)));
  events.push(event("time", i, (i + 1) * 1000));
});
events.push(event("flag", 0, true), event("navigate", 7));
const synced = await req(
  `attempts/${a.id}/sync`,
  { revision: a.revision, events },
  learner,
);
a = synced.attempt;
check(a.current === 7 && a.states[0].flagged, "navigation and flags persisted");
const duplicate = await req(
  `attempts/${a.id}/sync`,
  { revision: a.revision, events },
  learner,
);
check(duplicate.attempt.revision === a.revision, "retries are idempotent");
check(
  duplicate.attempt.states[2].history.length === 3,
  "no duplicated answer history",
);
const stale = await req(
  `attempts/${a.id}/sync`,
  { revision: 0, events: [event("time", 0, 1000)] },
  learner,
  409,
);
check(
  stale.attempt.revision === a.revision,
  "stale writes return latest state",
);
const e1 = event("time", 0, 1000),
  e2 = event("time", 0, 2000);
const races = await Promise.all(
  [e1, e2].map(async (e) => {
    const r = await fetch(origin + `/api/attempts/${a.id}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: learner.cookie,
      },
      body: JSON.stringify({ revision: a.revision, events: [e] }),
    });
    return { status: r.status, data: await r.json(), event: e };
  }),
);
check(
  races.filter((x) => x.status === 200).length === 1 &&
    races.filter((x) => x.status === 409).length === 1,
  "concurrent writes cannot overwrite each other",
);
a = await req(`attempts/${a.id}`, undefined, learner);
const failed = races.find((x) => x.status === 409);
a = (
  await req(
    `attempts/${a.id}/sync`,
    { revision: a.revision, events: [failed.event] },
    learner,
  )
).attempt;
check(
  a.states[0].elapsedMs === 4000,
  "both elapsed-time increments survive conflict retry",
);
await req(`attempts/${a.id}/submit`, { revision: 0 }, learner, 409);
a = await req(`attempts/${a.id}/submit`, { revision: a.revision }, learner);
check(
  a.results.filter((x) => x.outcome === "first").length === 4,
  "four first-correct",
);
check(
  a.results.filter((x) => x.outcome === "revised").length === 2,
  "two revised-correct",
);
check(
  a.results.filter((x) => x.outcome === "wrong").length === 2,
  "two final-wrong",
);
await req(
  `attempts/${a.id}/sync`,
  { revision: a.revision, events: [event("answer", 0, "D")] },
  learner,
  409,
);
const res = await req("results", undefined, learner);
check(
  res.find((x) => x.id === a.id).firstRate === 50,
  "rates use total questions",
);
const wrong = await req("wrong", undefined, learner);
const ids = new Set(
  bank.questions.filter((_, i) => [1, 2, 3, 4].includes(i)).map((q) => q.id),
);
check(
  wrong.filter((x) => ids.has(x.question.id)).length === 4,
  "revised and wrong enter wrong book",
);
check(
  !wrong.some((x) => x.question.id === bank.questions[0].id),
  "first-correct never enters wrong book",
);
const redo = await req(
  "attempts",
  { wrongIds: [bank.questions[1].id] },
  learner,
);
const correct = bank.questions[1].answer;
const redone = (
  await req(
    `attempts/${redo.id}/sync`,
    { revision: 0, events: [event("answer", 0, correct)] },
    learner,
  )
).attempt;
await req(`attempts/${redo.id}/submit`, { revision: redone.revision }, learner);
const revisited = (await req("wrong", undefined, learner)).find(
  (x) => x.question.id === bank.questions[1].id,
);
check(
  revisited.lastOutcome === "first",
  "correct review retains wrong history",
);
check(
  !(await req("results")).some((x) => x.id === a.id),
  "admin personal history is isolated",
);
check(
  (await req("results?scope=all")).some((x) => x.id === a.id),
  "admin may inspect all results",
);
const md = await readFile(
  new URL("../public/templates/questions.md", import.meta.url),
  "utf8",
);
async function upload(filename, buffer, identity = owner, expected = 200) {
  const r = await fetch(origin + "/api/admin/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      Connection: "close",
      "X-File-Name": encodeURIComponent(filename),
      Cookie: identity.cookie,
    },
    body: typeof buffer === "string" ? Buffer.from(buffer) : buffer,
  });
  const text = await r.text();
  assert.equal(r.status, expected, filename + ": " + text);
  checks++;
  return JSON.parse(text);
}
await upload("test.md", md, learner, 403);
const parsed = await upload("test.md", md);
check(
  parsed.questions.length === 2 && parsed.errors.length === 0,
  "Markdown import",
);
const centralText = await readFile(
  new URL("./fixtures/central-answers.md", import.meta.url),
  "utf8",
);
const central = await upload("central.md", centralText);
check(
  central.questions.length === 6 &&
    central.errors.length === 0 &&
    central.warnings.length === 0 &&
    central.questions.map((q) => q.answer).join("") === "BCBDCC" &&
    central.questions[2].material.includes("销售额") &&
    central.questions[4].material.includes("部门"),
  "centralized Markdown answers and shared materials",
);
const inlineText = centralText.replace(
  /^A\.[^\n]*\nB\.[^\n]*\nC\.[^\n]*\nD\.[^\n]*/gm,
  (block) => block.replaceAll("\n", "　"),
);
const inlineParsed = await upload("inline-options.md", inlineText);
check(
  JSON.stringify(inlineParsed) === JSON.stringify(central),
  "inline options preserve centralized answers and materials",
);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.json_to_sheet([
    {
      题号: "1",
      题干: "选择正确答案",
      A: "甲",
      B: "乙",
      C: "丙",
      D: "丁",
      正确答案: "B",
      解析: "说明",
      分类: "综合",
    },
  ]),
  "题库",
);
for (const ext of ["xlsx", "xls"]) {
  const buffer = XLSX.write(wb, {
    type: "buffer",
    bookType: ext === "xls" ? "biff8" : "xlsx",
  });
  const data = await upload("test." + ext, buffer);
  check(
    data.questions.length === 1 && data.questions[0].answer === "B",
    ext + " import",
  );
}
const zip = new JSZip();
zip.file(
  "[Content_Types].xml",
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
);
zip.file(
  "_rels/.rels",
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
);
zip.file(
  "word/document.xml",
  `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${md
    .split("\n")
    .map(
      (s) =>
        `<w:p><w:r><w:t>${s.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</w:t></w:r></w:p>`,
    )
    .join("")}</w:body></w:document>`,
);
const docx = await upload(
  "test.docx",
  await zip.generateAsync({ type: "nodebuffer" }),
);
check(
  docx.questions.length === 2 && docx.errors.length === 0,
  "Word DOCX import",
);
zip.file(
  "word/document.xml",
  `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${inlineText
    .replace(/^#{1,6}\s*/gm, "")
    .split("\n")
    .map(
      (s) =>
        `<w:p><w:r><w:t>${s.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</w:t></w:r></w:p>`,
    )
    .join("")}</w:body></w:document>`,
);
const centralDocx = await upload(
  "central.docx",
  await zip.generateAsync({ type: "nodebuffer" }),
);
check(
  centralDocx.errors.length === 0 &&
    centralDocx.questions.map((q) => q.answer).join("") === "BCBDCC",
  "centralized Word answers",
);
const docBuffer = await readFile(
  new URL("./fixtures/sample.doc", import.meta.url),
);
const legacy = await upload("test.doc", docBuffer);
check(
  Array.isArray(legacy.questions) && legacy.warnings.length > 0,
  "legacy DOC extractor works in Node",
);
const invalid = await upload("test.md", "1. 缺少选项\nA. 甲\n答案：AB");
check(invalid.errors.length > 0, "invalid import produces reviewable errors");
await req(
  "admin/banks",
  { title: "invalid", questions: invalid.questions },
  owner,
  400,
);
const newBank = await req("admin/banks", {
  title: "导入校验 " + Date.now(),
  description: "test",
  questions: parsed.questions,
});
const batchCountBefore = (await req("admin/banks")).length;
const bulkItems = [parsed, central].map((data, index) => ({
  action: "import",
  importKey: crypto.randomUUID(),
  title: `批量导入验证 ${index + 1}`,
  description: "混合题库批量保存验证",
  questions: data.questions,
}));
for (const item of bulkItems) {
  const saved = await req("admin/banks", item);
  check(
    saved.id === item.importKey && saved.count === item.questions.length,
    "batch item saves separately",
  );
  const snapshot = await req(`admin/banks/${saved.id}`);
  const repeated = await req("admin/banks", item);
  check(repeated.id === saved.id, "retry returns the same bank");
  check(
    JSON.stringify(await req(`admin/banks/${saved.id}`)) ===
      JSON.stringify(snapshot),
    "retry preserves saved questions and IDs",
  );
}
check(
  (await req("admin/banks")).length === batchCountBefore + 2,
  "retry does not duplicate batch banks",
);
await req(
  "admin/banks",
  { ...bulkItems[0], importKey: crypto.randomUUID() },
  learner,
  403,
);
await req("admin/banks", { ...bulkItems[0], importKey: "invalid" }, owner, 400);
await req(
  "admin/banks",
  {
    ...bulkItems[0],
    importKey: crypto.randomUUID(),
    questions: invalid.questions,
  },
  owner,
  400,
);
check(
  (await req("admin/banks")).length === batchCountBefore + 2,
  "failed items create no banks",
);
const snap = await req("attempts", { bankId: newBank.id }, learner);
const updated = structuredClone(parsed.questions);
updated[0].answer = "D";
await req(`admin/banks/${newBank.id}`, { title: "已更新", questions: updated });
const snapRead = await req(`attempts/${snap.id}`, undefined, learner);
check(
  snapRead.title === snap.title,
  "bank updates do not rewrite attempt snapshots",
);
await req(`admin/banks/${newBank.id}`, { action: "archive", archived: true });
await req("attempts", { bankId: newBank.id }, learner, 404);
await req(
  "admin/users",
  { action: "update", id: owner.id, role: "user", disabled: false },
  owner,
  400,
);
await req("admin/users", {
  action: "update",
  id: learner.id,
  role: "user",
  disabled: true,
});
await req("bootstrap", undefined, learner, 403);
await req("admin/users", {
  action: "update",
  id: learner.id,
  role: "user",
  disabled: false,
});
await req("admin/users", {
  action: "password",
  id: learner.id,
  password: "Reset-learner-password-42",
});
await req("bootstrap", undefined, learner, 401);
await req(
  "auth/login",
  { username: learner.username, password: learner.password },
  null,
  401,
);
learner.password = "Reset-learner-password-42";
await signIn(learner);
await req(
  "auth/password",
  { oldPassword: learner.password, password: "Changed-learner-password-42" },
  learner,
);
await req("bootstrap", undefined, learner, 401);
learner.password = "Changed-learner-password-42";
await signIn(learner);
await req("auth/logout", {}, learner);
await req("bootstrap", undefined, learner, 401);
console.log(
  `Passed ${checks} integration checks: permissions, submission, classification, timing, sync conflicts, immutable snapshots, wrong-book review and all five file extensions.`,
);
