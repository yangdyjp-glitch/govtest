import {
  currentUser,
  db,
  json,
  guarded,
  sameOrigin,
  readUpload,
  HttpError,
  getAttempt,
  presentAttempt,
  createAttempt,
  wrongItems,
  seedDemo,
  type AttemptRow,
} from "@/lib/server";
import {
  applyEvent,
  validateQuestions,
  summarize,
  type Question,
  type Event,
  type AnswerState,
} from "@/lib/domain";
import { parseFile } from "@/lib/importer";
import { createAccount, resetPassword } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function path(req: Request) {
  return new URL(req.url).pathname.replace(/^\/api\//, "").split("/");
}
export async function GET(req: Request) {
  return guarded(async () => {
    const user = await currentUser();
    const p = path(req);
    const d = db();
    if (p[0] === "bootstrap") {
      const banks = await d
        .prepare(
          'SELECT id,title,description,count,archived,created_at AS "createdAt" FROM banks WHERE archived=0 ORDER BY created_at DESC',
        )
        .all();
      const active = await d
        .prepare(
          "SELECT id,title,current,created_at AS \"createdAt\" FROM attempts WHERE user_id=? AND status='active' ORDER BY created_at DESC",
        )
        .bind(user.id)
        .all();
      return json({ user, banks: banks.results, active: active.results });
    }
    if (p[0] === "attempts" && p[1])
      return json(presentAttempt(await getAttempt(p[1], user)));
    if (p[0] === "results") {
      const all =
        user.role === "admin" &&
        new URL(req.url).searchParams.get("scope") === "all";
      const rows = await d
        .prepare(
          `SELECT a.*,u.name AS user_name FROM attempts a JOIN users u ON u.id=a.user_id WHERE a.status='submitted' ${all ? "" : "AND a.user_id=?"} ORDER BY a.submitted_at DESC`,
        )
        .bind(...(all ? [] : [user.id]))
        .all<AttemptRow & { user_name: string }>();
      return json(
        rows.results.map((row) => {
          const a = presentAttempt(row);
          return {
            id: a.id,
            title: a.title,
            submittedAt: a.submittedAt,
            userName: row.user_name,
            ...summarize(a.results!),
          };
        }),
      );
    }
    if (p[0] === "wrong") return json(await wrongItems(user));
    if (p[0] === "admin") {
      await currentUser(true);
      if (p[1] === "banks") {
        if (p[2]) {
          const bank = await d
            .prepare("SELECT * FROM banks WHERE id=?")
            .bind(p[2])
            .first();
          if (!bank) throw new HttpError(404, "题库不存在");
          return json({
            ...bank,
            questions: JSON.parse(bank.questions as string),
          });
        }
        return json(
          (
            await d
              .prepare(
                'SELECT id,title,description,count,archived,created_at AS "createdAt" FROM banks ORDER BY created_at DESC',
              )
              .all()
          ).results,
        );
      }
      if (p[1] === "users")
        return json({
          users: (
            await d
              .prepare(
                'SELECT u.id,u.email,u.name,u.role,u.disabled,u.created_at AS "createdAt",c.username FROM users u JOIN credentials c ON c.user_id=u.id ORDER BY u.created_at',
              )
              .all()
          ).results,
          invitations: [],
        });
    }
    throw new HttpError(404, "页面不存在");
  });
}
export async function POST(req: Request) {
  return guarded(async () => {
    sameOrigin(req);
    const user = await currentUser();
    const p = path(req),
      d = db();
    if (p[0] === "admin" && p[1] === "import") {
      const bytes = await readUpload(req);
      await currentUser(true);
      const name = req.headers.get("x-file-name");
      if (!name) throw new HttpError(400, "请选择文件");
      const file = new File([bytes], decodeURIComponent(name));
      try {
        return json(await parseFile(file));
      } catch (e) {
        throw new HttpError(
          400,
          e instanceof Error ? e.message : "文件解析失败",
        );
      }
    }
    if (Number(req.headers.get("content-length") || 0) > 8 * 1024 * 1024)
      throw new HttpError(413, "内容过大");
    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, "请求内容无效");
    }
    if (p[0] === "attempts" && !p[1]) {
      if (body.wrongIds) {
        if (!Array.isArray(body.wrongIds) || !body.wrongIds.length)
          throw new HttpError(400, "请选择错题");
        const items = await wrongItems(user);
        return json(
          await createAttempt(
            user,
            "wrong",
            "错题专项复习",
            items
              .filter((x) => body.wrongIds.includes(x.question.id))
              .map((x) => x.question),
          ),
        );
      }
      const bank = await d
        .prepare("SELECT * FROM banks WHERE id=? AND archived=0")
        .bind(String(body.bankId))
        .first();
      if (!bank) throw new HttpError(404, "题库不存在或已停用");
      return json(
        await createAttempt(
          user,
          bank.id as string,
          bank.title as string,
          JSON.parse(bank.questions as string),
        ),
      );
    }
    if (p[0] === "attempts" && p[1]) {
      const row = await getAttempt(p[1], user, true);
      if (p[2] === "sync") {
        if (row.status !== "active")
          throw new HttpError(409, "已交卷，不能继续修改");
        if (!Number.isInteger(body.revision) || body.revision !== row.revision)
          return json(
            {
              error: "进度已更新，正在合并本地操作",
              attempt: presentAttempt(row),
            },
            409,
          );
        if (!Array.isArray(body.events) || body.events.length > 250)
          throw new HttpError(400, "操作批次无效");
        const known = new Set(
          (
            await d
              .prepare("SELECT id FROM events WHERE attempt_id=?")
              .bind(row.id)
              .all<{ id: string }>()
          ).results.map((x) => x.id),
        );
        const states: AnswerState[] = JSON.parse(row.states);
        let current = row.current;
        const fresh: Event[] = [];
        for (const e of body.events as Event[]) {
          if (
            typeof e.id !== "string" ||
            e.id.length > 100 ||
            typeof e.at !== "string"
          )
            throw new HttpError(400, "操作记录无效");
          if (known.has(e.id)) continue;
          known.add(e.id);
          try {
            const next = applyEvent(states, e);
            if (next !== undefined) current = next;
          } catch (err) {
            throw new HttpError(400, (err as Error).message);
          }
          fresh.push(e);
        }
        if (!fresh.length)
          return json({
            attempt: presentAttempt(row),
            acked: body.events.map((x: Event) => x.id),
          });
        const token = crypto.randomUUID();
        const batch = [
          d
            .prepare(
              "UPDATE attempts SET states=?,current=?,revision=revision+1,sync_token=? WHERE id=? AND revision=? AND status='active'",
            )
            .bind(JSON.stringify(states), current, token, row.id, row.revision),
          ...fresh.map((e) =>
            d
              .prepare(
                "INSERT INTO events (id,attempt_id,payload) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM attempts WHERE id=? AND sync_token=?)",
              )
              .bind(e.id, row.id, JSON.stringify(e), row.id, token),
          ),
        ];
        const result = await d.batch(batch);
        if (!result[0].meta.changes)
          return json(
            {
              error: "进度冲突，正在重新合并",
              attempt: presentAttempt(await getAttempt(row.id, user)),
            },
            409,
          );
        return json({
          attempt: presentAttempt(await getAttempt(row.id, user)),
          acked: body.events.map((e: Event) => e.id),
        });
      }
      if (p[2] === "submit") {
        if (row.status === "submitted") return json(presentAttempt(row));
        if (body.revision !== row.revision)
          throw new HttpError(409, "请先同步最新答案后交卷");
        const states: AnswerState[] = JSON.parse(row.states);
        if (states.some((x) => !x.history.length))
          throw new HttpError(400, "必须全部答完才能交卷");
        const result = await d
          .prepare(
            "UPDATE attempts SET status='submitted',submitted_at=?,revision=revision+1 WHERE id=? AND revision=? AND status='active'",
          )
          .bind(new Date().toISOString(), row.id, row.revision)
          .run();
        if (!result.meta.changes)
          throw new HttpError(409, "进度已更新，请重新交卷");
        return json(presentAttempt(await getAttempt(row.id, user)));
      }
    }
    if (p[0] === "admin") {
      await currentUser(true);
      if (p[1] === "demo") {
        await seedDemo();
        return json({ ok: true });
      }
      if (p[1] === "banks") {
        if (p[2] && body.action === "archive") {
          await d
            .prepare("UPDATE banks SET archived=? WHERE id=?")
            .bind(body.archived ? 1 : 0, p[2])
            .run();
          return json({ ok: true });
        }
        const errors = validateQuestions(body.questions);
        if (errors.length) throw new HttpError(400, errors.join("；"));
        if (
          typeof body.title !== "string" ||
          !body.title.trim() ||
          body.title.length > 120
        )
          throw new HttpError(400, "请填写题库名称（最多 120 字）");
        const id = p[2] || crypto.randomUUID();
        let previous: Question[] = [];
        if (p[2]) {
          const old = await d
            .prepare("SELECT questions FROM banks WHERE id=?")
            .bind(id)
            .first<{ questions: string }>();
          if (!old) throw new HttpError(404, "题库不存在");
          previous = JSON.parse(old.questions);
        }
        const questions: Question[] = body.questions.map(
          (q: Question, i: number) => ({
            id:
              previous.find((x) => x.sourceId === q.sourceId)?.id ||
              crypto.randomUUID(),
            sourceId: String(q.sourceId || i + 1),
            stem: q.stem.trim(),
            options: Object.fromEntries(
              ["A", "B", "C", "D"].map((k) => [
                k,
                q.options[k as keyof Question["options"]].trim(),
              ]),
            ),
            answer: q.answer,
            material: q.material,
            explanation: q.explanation,
            category: q.category,
          }),
        );
        if (p[2])
          await d
            .prepare(
              "UPDATE banks SET title=?,description=?,questions=?,count=? WHERE id=?",
            )
            .bind(
              body.title.trim(),
              String(body.description || "").slice(0, 1000),
              JSON.stringify(questions),
              questions.length,
              id,
            )
            .run();
        else
          await d
            .prepare(
              "INSERT INTO banks (id,title,description,questions,count,created_at) VALUES (?,?,?,?,?,?)",
            )
            .bind(
              id,
              body.title.trim(),
              String(body.description || "").slice(0, 1000),
              JSON.stringify(questions),
              questions.length,
              new Date().toISOString(),
            )
            .run();
        return json({ id, count: questions.length });
      }
      if (p[1] === "users") {
        if (body.action === "create") {
          return json(
            await createAccount({
              username: body.username,
              password: body.password,
              name: body.name,
              role: body.role,
            }),
          );
        }
        if (body.action === "password") {
          await resetPassword(String(body.id), body.password);
          return json({ ok: true });
        }
        if (body.action === "update") {
          if (
            !["admin", "user"].includes(body.role) ||
            typeof body.disabled !== "boolean"
          )
            throw new HttpError(400, "用户设置无效");
          const owner = await d
            .prepare("SELECT value FROM settings WHERE key='owner'")
            .first<{ value: string }>();
          if (
            body.id === owner?.value &&
            (body.disabled || body.role !== "admin")
          )
            throw new HttpError(400, "初始管理员必须保持启用和管理员身份");
          await d
            .prepare("UPDATE users SET role=?,disabled=? WHERE id=?")
            .bind(body.role, body.disabled ? 1 : 0, String(body.id))
            .run();
          return json({ ok: true });
        }
      }
    }
    throw new HttpError(404, "操作不存在");
  });
}
