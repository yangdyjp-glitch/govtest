"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  Upload,
  Download,
  Pencil,
  Archive,
  Check,
  Users,
  BookOpen,
  ChevronLeft,
  TextCursorInput,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { api } from "@/lib/client";
import {
  letters,
  validateQuestions,
  type Question,
  type Bank,
  type User,
} from "@/lib/domain";
const blank = (n: number): Question => ({
  id: "",
  sourceId: String(n),
  stem: "",
  material: "",
  category: "综合",
  options: { A: "", B: "", C: "", D: "" },
  answer: "" as any,
  explanation: "",
});
type DraftBank = {
  id?: string;
  title: string;
  description: string;
  questions: Question[];
};
export function Banks() {
  const [banks, setBanks] = useState<Bank[]>([]),
    [editing, setEditing] = useState<DraftBank | null>(null),
    [renaming, setRenaming] = useState<Bank | null>(null),
    [renameTitle, setRenameTitle] = useState(""),
    [renameError, setRenameError] = useState(""),
    [question, setQuestion] = useState<{ index: number; q: Question } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [warnings, setWarnings] = useState<string[]>([]),
    [loading, setLoading] = useState(true);
  const refresh = () =>
    api<Bank[]>("admin/banks")
      .then(setBanks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    void refresh();
  }, []);
  const errors = editing ? validateQuestions(editing.questions) : [];
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const data: any = await r.json();
      if (!r.ok) throw new Error(data.error);
      setEditing({
        title: file.name.replace(/\.[^.]+$/, ""),
        description: "",
        questions: data.questions,
      });
      setWarnings(data.warnings || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await api(`admin/banks${editing.id ? "/" + editing.id : ""}`, editing);
      setNotice(
        `已保存「${editing.title}」，共 ${editing.questions.length} 道题。`,
      );
      setEditing(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function edit(bank: Bank) {
    setBusy(true);
    try {
      const data = await api(`admin/banks/${bank.id}`);
      setEditing({
        id: bank.id,
        title: bank.title,
        description: bank.description,
        questions: data.questions,
      });
      setWarnings([]);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function rename() {
    if (!renaming || busy || !renameTitle.trim()) return;
    setBusy(true);
    setRenameError("");
    try {
      const result = await api<{ id: string; title: string }>(
        `admin/banks/${renaming.id}`,
        { action: "rename", title: renameTitle.trim() },
      );
      setBanks((current) =>
        current.map((bank) =>
          bank.id === result.id ? { ...bank, title: result.title } : bank,
        ),
      );
      setNotice(`题库已重命名为「${result.title}」。`);
      setRenaming(null);
    } catch (e) {
      setRenameError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(bank: Bank) {
    setBusy(true);
    try {
      await api(`admin/banks/${bank.id}`, {
        action: "archive",
        archived: !bank.archived,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setBusy(true);
    try {
      await api("admin/demo", {});
      await refresh();
      setNotice("已添加 8 道功能演示题，非考试真题。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function excelTemplate() {
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet([
        {
          题号: "001",
          题干: "1 + 1 等于多少？",
          A: "1",
          B: "2",
          C: "3",
          D: "4",
          正确答案: "B",
          解析: "1 + 1 = 2。",
          分类: "数量关系",
          材料: "",
        },
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "题库");
      XLSX.writeFile(wb, "公考研习-题库模板.xlsx");
    } catch {
      setError("模板生成失败，请使用 Markdown 模板");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN / 题库管理</p>
          <h1>{editing ? "检查并编辑题库" : "题库管理"}</h1>
          <p className="muted">
            {editing
              ? "确认题干、四个选项与答案无误后保存。"
              : "导入你的题库，统一管理题目与答案。"}
          </p>
        </div>
        {editing ? (
          <button
            className="button"
            disabled={busy}
            onClick={() => {
              setEditing(null);
              setError("");
            }}
          >
            <ChevronLeft size={16} /> 返回题库列表
          </button>
        ) : (
          <button
            className="button"
            onClick={() => {
              setEditing({ title: "", description: "", questions: [blank(1)] });
              setWarnings([]);
              setError("");
            }}
          >
            <Plus size={16} /> 手动建库
          </button>
        )}
      </div>
      {error && (
        <div className="danger-message" role="alert">
          {error}
        </div>
      )}
      {notice && !editing && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {editing ? (
        <div className="stack">
          <div className="panel form-row">
            <label className="field">
              题库名称
              <input
                value={editing.title}
                maxLength={120}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </label>
            <label className="field">
              题库说明
              <input
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
          </div>
          {warnings.map((w) => (
            <div key={w} className="notice">
              {w}
            </div>
          ))}
          {errors.length > 0 && (
            <div className="notice">
              <b>有 {errors.length} 项需要修正</b>
              <p>
                {errors.slice(0, 12).join("；")}
                {errors.length > 12 ? "……" : ""}
              </p>
            </div>
          )}
          <div className="subheading">
            <h2>
              题目预览{" "}
              <span className="muted">共 {editing.questions.length} 题</span>
            </h2>
            <div className="toolbar">
              <button
                className="button"
                onClick={() =>
                  setQuestion({
                    index: editing.questions.length,
                    q: blank(editing.questions.length + 1),
                  })
                }
              >
                <Plus size={15} /> 添加题目
              </button>
              <button
                className="button primary"
                disabled={busy || errors.length > 0 || !editing.title.trim()}
                onClick={save}
              >
                <Check size={16} />
                {busy ? "正在保存…" : "确认保存题库"}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  {["题号", "题干", "正确答案", "分类", ""].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {editing.questions.map((q, i) => (
                  <TableRow
                    key={i}
                    className={
                      validateQuestions([q]).length ? "invalid-row" : ""
                    }
                  >
                    <TableCell>{q.sourceId}</TableCell>
                    <TableCell className="question-title-preview">
                      {q.stem || "尚未填写题干"}
                      <p className="muted">
                        {letters
                          .map((k) => `${k}. ${q.options[k] || "（缺少选项）"}`)
                          .join("　")}
                      </p>
                    </TableCell>
                    <TableCell>{q.answer || "未识别"}</TableCell>
                    <TableCell>{q.category}</TableCell>
                    <TableCell>
                      <button
                        className="link-button"
                        onClick={() =>
                          setQuestion({ index: i, q: structuredClone(q) })
                        }
                      >
                        编辑
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <>
          <div className="panel" style={{ marginBottom: 28 }}>
            <div className="section-head">
              <h2>导入题库</h2>
              <div className="toolbar">
                <button className="text-button" onClick={excelTemplate}>
                  <Download size={15} /> Excel 模板
                </button>
                <a
                  className="text-button"
                  href="/templates/questions.md"
                  download
                >
                  <Download size={15} /> Markdown 模板
                </a>
              </div>
            </div>
            <div className="upload-area">
              <Upload size={25} style={{ margin: "0 auto" }} />
              <p>
                {busy ? "正在处理文件…" : "选择 Excel、Markdown 或 Word 文件"}
              </p>
              <p className="muted">
                支持 .xlsx / .xls / .md / .docx / .doc · 单个文件不超过 8
                MB，每次最多 300 题
              </p>
              <input
                type="file"
                aria-label="选择题库文件"
                accept=".xlsx,.xls,.md,.docx,.doc"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="muted spaced">
              Word 与 Markdown
              支持逐题填写答案，也支持在文末“答案”标题下集中填写，如“1.B　2.C”。
              分区标题和“根据下表回答51—55题”这类共用材料会按题号识别；图片题需另行整理为文字。
            </p>
          </div>
          {loading ? (
            <p className="empty-note">正在读取题库…</p>
          ) : banks.length ? (
            <div className="bank-grid">
              {banks.map((b) => (
                <article className="bank-card" key={b.id}>
                  <div className="card-top">
                    <h2>{b.title}</h2>
                    <span className="status-tag">
                      {b.archived ? "已停用" : "使用中"}
                    </span>
                  </div>
                  <p className="muted">{b.description || "暂无题库说明"}</p>
                  <footer>
                    <span>
                      <span className="bank-number">{b.count}</span>题
                    </span>
                    <div className="toolbar">
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          setRenaming(b);
                          setRenameTitle(b.title);
                          setRenameError("");
                          setError("");
                          setNotice("");
                        }}
                      >
                        <TextCursorInput size={15} />
                        重命名
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => edit(b)}
                      >
                        <Pencil size={15} />
                        编辑
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => toggle(b)}
                      >
                        <Archive size={15} />
                        {b.archived ? "启用" : "停用"}
                      </button>
                    </div>
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <BookOpen size={30} />
              <h2>等待你的第一份题库</h2>
              <p className="muted">
                上传真实题库，或先添加演示题体验完整流程。
              </p>
              <button className="button" disabled={busy} onClick={demo}>
                添加 8 道演示题
              </button>
            </div>
          )}
        </>
      )}
      <Dialog
        open={!!renaming}
        onOpenChange={(open) => {
          if (!open && !busy) setRenaming(null);
        }}
      >
        <DialogContent className="dialog-content" style={{ maxWidth: 520 }}>
          <DialogTitle>重命名题库</DialogTitle>
          <DialogDescription>
            修改这套题在题库列表中显示的名称。
          </DialogDescription>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
          >
            <label className="field">
              题库名称
              <input
                required
                autoFocus
                maxLength={120}
                value={renameTitle}
                disabled={busy}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setRenameTitle(e.target.value)}
              />
            </label>
            <p className="muted">最多 120 字</p>
            {renameError && (
              <p className="danger-message" role="alert">
                {renameError}
              </p>
            )}
            <div className="toolbar" style={{ justifyContent: "flex-end" }}>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => setRenaming(null)}
              >
                取消
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={
                  busy ||
                  !renameTitle.trim() ||
                  renameTitle.trim() === renaming?.title
                }
              >
                {busy ? "正在保存…" : "保存名称"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!question}
        onOpenChange={(open) => {
          if (!open) setQuestion(null);
        }}
      >
        <DialogContent className="dialog-content">
          <DialogTitle>编辑第 {(question?.index ?? 0) + 1} 题</DialogTitle>
          <DialogDescription>
            每道题必须有四个选项和一个正确答案。
          </DialogDescription>
          {question && (
            <div className="stack">
              <div className="form-row">
                <label className="field">
                  题号
                  <input
                    value={question.q.sourceId}
                    onChange={(e) =>
                      setQuestion({
                        ...question,
                        q: { ...question.q, sourceId: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="field">
                  分类
                  <input
                    value={question.q.category}
                    onChange={(e) =>
                      setQuestion({
                        ...question,
                        q: { ...question.q, category: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
              <label className="field">
                题干
                <textarea
                  value={question.q.stem}
                  onChange={(e) =>
                    setQuestion({
                      ...question,
                      q: { ...question.q, stem: e.target.value },
                    })
                  }
                />
              </label>
              <label className="field">
                材料（可选）
                <textarea
                  value={question.q.material}
                  onChange={(e) =>
                    setQuestion({
                      ...question,
                      q: { ...question.q, material: e.target.value },
                    })
                  }
                />
              </label>
              {letters.map((k) => (
                <label className="field" key={k}>
                  选项 {k}
                  <input
                    value={question.q.options[k]}
                    onChange={(e) =>
                      setQuestion({
                        ...question,
                        q: {
                          ...question.q,
                          options: {
                            ...question.q.options,
                            [k]: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </label>
              ))}
              <label className="field">
                正确答案
                <Select
                  value={question.q.answer || undefined}
                  onValueChange={(v) =>
                    setQuestion({
                      ...question,
                      q: { ...question.q, answer: v as any },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择正确答案" />
                  </SelectTrigger>
                  <SelectContent>
                    {letters.map((k) => (
                      <SelectItem value={k} key={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="field">
                答案解析
                <textarea
                  value={question.q.explanation}
                  onChange={(e) =>
                    setQuestion({
                      ...question,
                      q: { ...question.q, explanation: e.target.value },
                    })
                  }
                />
              </label>
              <div
                className="toolbar"
                style={{ justifyContent: "space-between" }}
              >
                <button
                  className="text-button"
                  onClick={() => {
                    if (editing)
                      setEditing({
                        ...editing,
                        questions: editing.questions.filter(
                          (_, i) => i !== question.index,
                        ),
                      });
                    setQuestion(null);
                  }}
                >
                  从本次草稿移除此题
                </button>
                <button
                  className="button primary"
                  onClick={() => {
                    if (editing) {
                      const qs = [...editing.questions];
                      qs[question.index] = question.q;
                      setEditing({ ...editing, questions: qs });
                    }
                    setQuestion(null);
                  }}
                >
                  保存到预览
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function UserAdmin() {
  const [data, setData] = useState<{ users: User[]; invitations: any[] }>({
      users: [],
      invitations: [],
    }),
    [open, setOpen] = useState(false),
    [form, setForm] = useState({ name: "", email: "", role: "user" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = () =>
    api("admin/users")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
  }, []);
  async function mutate(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("admin/users", body);
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN / 账号权限</p>
          <h1>用户管理</h1>
          <p className="muted">
            管理员拥有全部功能；普通用户仅可使用答题、结果分析和错题集。
          </p>
        </div>
        <button className="button primary" onClick={() => setOpen(true)}>
          <Plus size={16} /> 添加用户
        </button>
      </div>
      {error && <div className="danger-message">{error}</div>}
      <div className="table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              {["姓名", "登录邮箱", "角色", "状态", ""].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Select
                    disabled={busy}
                    value={u.role}
                    onValueChange={(role) =>
                      void mutate({
                        action: "update",
                        id: u.id,
                        role,
                        disabled: !!u.disabled,
                      })
                    }
                  >
                    <SelectTrigger style={{ width: 140 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">管理员 admin</SelectItem>
                      <SelectItem value="user">普通用户 user</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{u.disabled ? "已停用" : "正常"}</TableCell>
                <TableCell>
                  <button
                    className="link-button"
                    disabled={busy}
                    onClick={() =>
                      void mutate({
                        action: "update",
                        id: u.id,
                        role: u.role,
                        disabled: !u.disabled,
                      })
                    }
                  >
                    {u.disabled ? "启用" : "停用"}
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data.invitations.length > 0 && (
        <>
          <div className="subheading">
            <h2>待首次登录</h2>
          </div>
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.invitations.map((u) => (
                  <TableRow key={u.email}>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.role}</TableCell>
                    <TableCell>
                      <button
                        className="link-button"
                        disabled={busy}
                        onClick={() =>
                          void mutate({ action: "revoke", email: u.email })
                        }
                      >
                        撤销登记
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="dialog-content">
          <DialogTitle>添加用户</DialogTitle>
          <DialogDescription>
            登记用户的 ChatGPT
            登录邮箱和角色。此操作只登记应用权限，不发送邮件；在线站点的访问权限需另行开放。
          </DialogDescription>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate({ action: "invite", ...form })) {
                setOpen(false);
                setForm({ name: "", email: "", role: "user" });
              }
            }}
          >
            <label className="field">
              姓名
              <input
                required
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="field">
              登录邮箱
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="field">
              角色
              <Select
                value={form.role}
                onValueChange={(role) => setForm({ ...form, role })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">普通用户 user</SelectItem>
                  <SelectItem value="admin">管理员 admin</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {error && <p role="alert">{error}</p>}
            <button className="button primary" disabled={busy} type="submit">
              {busy ? "正在保存…" : "确认添加"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
