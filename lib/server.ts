import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  classify,
  newStates,
  type Question,
  type User,
  type ResultItem,
} from "./domain";
import { demoQuestions } from "./demo";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function db() {
  if (!env.DB) throw new HttpError(503, "数据服务暂不可用，请稍后重试");
  return env.DB;
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function guarded(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json(
      { error: "操作未完成，请稍后重试；本地未同步答案会保留。" },
      500,
    );
  }
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    throw new HttpError(403, "请求来源不匹配");
}
export async function readUpload(req: Request) {
  const limit = 8 * 1024 * 1024;
  if (Number(req.headers.get("content-length") || 0) > limit)
    throw new HttpError(413, "文件不能超过 8 MB");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "请选择文件");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new HttpError(413, "文件不能超过 8 MB");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export async function currentUser(admin = false): Promise<User> {
  const identity = await getChatGPTUser();
  if (!identity) throw new HttpError(401, "请先登录");
  const d = db(),
    email = identity.email.toLowerCase();
  let user = await d
    .prepare("SELECT * FROM users WHERE id=?")
    .bind(identity.userId)
    .first<User>();
  if (!user) {
    // The site is owner-private at creation. The singleton claim is atomic.
    await d
      .prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('owner',?)")
      .bind(identity.userId)
      .run();
    const owner = await d
      .prepare("SELECT value FROM settings WHERE key='owner'")
      .first<{ value: string }>();
    const invite = await d
      .prepare("SELECT * FROM invitations WHERE email=?")
      .bind(email)
      .first<{ name: string; role: string }>();
    if (owner?.value !== identity.userId && !invite)
      throw new HttpError(403, "此账号尚未获准使用，请联系管理员添加你的邮箱");
    await d
      .prepare(
        "INSERT OR IGNORE INTO users (id,email,name,role,created_at) VALUES (?,?,?,?,?)",
      )
      .bind(
        identity.userId,
        email,
        invite?.name || identity.fullName || email,
        owner?.value === identity.userId ? "admin" : invite!.role,
        new Date().toISOString(),
      )
      .run();
    user = await d
      .prepare("SELECT * FROM users WHERE id=?")
      .bind(identity.userId)
      .first<User>();
  }
  if (!user || user.disabled) throw new HttpError(403, "账号已停用");
  if (admin && user.role !== "admin")
    throw new HttpError(403, "仅管理员可以执行此操作");
  return user;
}
export type AttemptRow = {
  id: string;
  user_id: string;
  bank_id: string;
  title: string;
  status: "active" | "submitted";
  questions: string;
  states: string;
  current: number;
  revision: number;
  created_at: string;
  submitted_at: string | null;
};
export async function getAttempt(id: string, user: User, write = false) {
  const row = await db()
    .prepare("SELECT * FROM attempts WHERE id=?")
    .bind(id)
    .first<AttemptRow>();
  if (!row || (row.user_id !== user.id && (write || user.role !== "admin")))
    throw new HttpError(404, "答题记录不存在");
  return row;
}
export function presentAttempt(row: AttemptRow) {
  const qs: Question[] = JSON.parse(row.questions),
    states = JSON.parse(row.states);
  return {
    id: row.id,
    userId: row.user_id,
    bankId: row.bank_id,
    title: row.title,
    status: row.status,
    questions: qs.map(({ answer: _, explanation: __, ...q }) => q),
    states,
    current: row.current,
    revision: row.revision,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    ...(row.status === "submitted"
      ? {
          results: qs.map((question, i) => ({
            question,
            state: states[i],
            outcome: classify(question.answer, states[i].history),
          })),
        }
      : {}),
  };
}
export async function createAttempt(
  user: User,
  bankId: string,
  title: string,
  questions: Question[],
) {
  if (!questions.length) throw new HttpError(400, "没有可练习的题目");
  if (questions.length > 300) throw new HttpError(400, "一次最多练习 300 题");
  const id = crypto.randomUUID();
  await db()
    .prepare(
      "INSERT INTO attempts (id,user_id,bank_id,title,status,questions,states,created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .bind(
      id,
      user.id,
      bankId,
      title,
      "active",
      JSON.stringify(questions),
      JSON.stringify(newStates(questions.length)),
      new Date().toISOString(),
    )
    .run();
  return presentAttempt(await getAttempt(id, user));
}
export async function seedDemo() {
  await db()
    .prepare(
      "INSERT OR IGNORE INTO banks (id,title,description,questions,count,created_at) VALUES (?,?,?,?,?,?)",
    )
    .bind(
      "demo",
      "行政职业能力测验 · 功能演示",
      "8 道演示题，用于体验答题流程，非考试真题。",
      JSON.stringify(demoQuestions),
      demoQuestions.length,
      new Date().toISOString(),
    )
    .run();
}
export async function wrongItems(user: User) {
  const rows = await db()
    .prepare(
      "SELECT * FROM attempts WHERE user_id=? AND status='submitted' ORDER BY submitted_at ASC",
    )
    .bind(user.id)
    .all<AttemptRow>();
  const items = new Map<
    string,
    {
      question: Question;
      reason: string;
      count: number;
      lastAt: string;
      lastOutcome: string;
      lastState: ResultItem["state"];
    }
  >();
  for (const row of rows.results) {
    const qs: Question[] = JSON.parse(row.questions),
      states = JSON.parse(row.states);
    qs.forEach((q, i) => {
      const outcome = classify(q.answer, states[i].history),
        old = items.get(q.id);
      if (outcome !== "first")
        items.set(q.id, {
          question: q,
          reason: outcome,
          count: (old?.count ?? 0) + 1,
          lastAt: row.submitted_at!,
          lastOutcome: outcome,
          lastState: states[i],
        });
      else if (old) {
        old.question = q;
        old.lastOutcome = outcome;
        old.lastState = states[i];
      }
    });
  }
  return [...items.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
