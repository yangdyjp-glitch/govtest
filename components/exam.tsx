"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  CloudCheck,
  RefreshCw,
  Pause,
  BookOpen,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { QuestionMaterial } from "@/components/question-material";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/client";
import { Draft } from "@/lib/draft";
import { letters, type Attempt } from "@/lib/domain";
export function Exam({
  id,
  onExit,
  onSubmit,
}: {
  id: string;
  onExit: () => void;
  onSubmit: (a: Attempt) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null),
    [attempt, setAttempt] = useState<Attempt | null>(null),
    [message, setMessage] = useState("正在恢复答题进度"),
    [ready, setReady] = useState(false),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const capture = useRef<() => void>(() => {});
  const active = useRef(true);
  useEffect(() => {
    let disposed = false,
      release = () => {};
    let d: Draft | null = null;
    let cleanup = () => {};
    active.current = true;
    const start = async () => {
      try {
        const a = await api<Attempt>(`attempts/${id}`);
        if (disposed) return;
        if (a.status === "submitted") {
          onSubmit(a);
          return;
        }
        d = new Draft(a);
        const render = () => {
          if (!disposed) {
            setAttempt(d!.view());
            setMessage(d!.notice);
          }
        };
        d.listener = render;
        setDraft(d);
        try {
          await d.sync();
        } catch {}
        if (disposed) return;
        render();
        setReady(true);
        let last = performance.now(),
          wasVisible = !document.hidden;
        const tick = () => {
          const now = performance.now(),
            delta = now - last;
          last = now;
          if (wasVisible && active.current && !d!.stopped && delta > 0) {
            d!.add("time", d!.view().current, Math.min(delta, 15000));
          }
          wasVisible = !document.hidden;
        };
        capture.current = tick;
        const clock = setInterval(tick, 5000),
          sync = setInterval(() => void d!.sync().catch(() => {}), 10000);
        const visible = () => {
          tick();
          void d!.sync().catch(() => {});
        };
        const online = () => void d!.sync().catch(() => {});
        const unload = () => {
          tick();
          d!.persist();
        };
        document.addEventListener("visibilitychange", visible);
        window.addEventListener("online", online);
        window.addEventListener("pagehide", unload);
        cleanup = () => {
          tick();
          clearInterval(clock);
          clearInterval(sync);
          document.removeEventListener("visibilitychange", visible);
          window.removeEventListener("online", online);
          window.removeEventListener("pagehide", unload);
          void d!.sync().catch(() => {});
        };
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      }
    };
    if (navigator.locks) {
      void navigator.locks.request(
        `govtest-attempt-${id}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            if (!disposed)
              setError("此练习已在另一个标签页打开。请关闭另一页后重试。");
            return;
          }
          await start();
          if (!disposed)
            await new Promise<void>((r) => {
              release = r;
            });
        },
      );
    } else void start();
    return () => {
      disposed = true;
      cleanup();
      active.current = false;
      release();
    };
    // A mounted exam owns one attempt for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  function choose(value: string) {
    if (!draft || !attempt || !ready) return;
    capture.current();
    if (attempt.states[attempt.current].history.at(-1) === value) return;
    draft.add("answer", attempt.current, value as any);
    void draft.sync().catch(() => {});
  }
  function go(i: number) {
    if (!draft || !attempt || i < 0 || i >= attempt.questions.length) return;
    capture.current();
    draft.add("navigate", i);
    void draft.sync().catch(() => {});
  }
  async function finish() {
    if (!draft) return;
    setBusy(true);
    setError("");
    capture.current();
    active.current = false;
    try {
      const a = await draft.submit();
      setConfirm(false);
      onSubmit(a);
    } catch (e) {
      active.current = true;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!attempt || !ready)
    return (
      <div className="empty-state">
        <BookOpen size={32} />
        <h2>{error || "正在恢复答题进度"}</h2>
        <p className="muted">
          {!error && "题目、已选答案和待检查标记会一同恢复。"}
        </p>
        {error && (
          <button className="button" onClick={onExit}>
            返回题库
          </button>
        )}
      </div>
    );
  const index = attempt.current,
    q = attempt.questions[index],
    state = attempt.states[index],
    selected = state.history.at(-1),
    answered = attempt.states.filter((x) => x.history.length).length,
    total = attempt.questions.length,
    flagged = attempt.states.filter((x) => x.flagged).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PRACTICE / 在线答题</p>
          <h1>{attempt.title}</h1>
          <p className="muted">单项选择 · 共 {total} 题</p>
        </div>
        <div className="toolbar">
          <span className="save-state" role="status">
            <CloudCheck size={16} />
            {message}
          </span>
          {message !== "已保存" && (
            <button
              className="text-button"
              onClick={() => void draft?.sync().catch(() => {})}
            >
              <RefreshCw size={14} />
              重试
            </button>
          )}
          <button
            className="button"
            onClick={() => {
              capture.current();
              onExit();
            }}
          >
            <Pause size={15} /> 暂存退出
          </button>
        </div>
      </div>
      <div className="exam-layout">
        <aside className="answer-card">
          <div className="section-head">
            <h2>答题卡</h2>
            <span>单项选择</span>
          </div>
          <div className="progress-label">
            <span>已完成</span>
            <span>
              {answered} / {total}
            </span>
          </div>
          <Progress value={(answered / total) * 100} />
          <div className="number-grid">
            {attempt.questions.map((_, i) => (
              <button
                key={i}
                aria-label={`第 ${i + 1} 题，${attempt.states[i].history.length ? "已答" : "未答"}${attempt.states[i].flagged ? "，待检查" : ""}`}
                aria-current={i === index ? "step" : undefined}
                onClick={() => go(i)}
                className={`question-number ${attempt.states[i].history.length ? "answered" : ""} ${i === index ? "current" : ""}`}
              >
                {String(i + 1).padStart(2, "0")}
                {attempt.states[i].flagged && (
                  <Flag size={13} className="mini-flag" />
                )}
              </button>
            ))}
          </div>
          <div className="legend">
            <span>□ 未答</span>
            <span>■ 已答</span>
            <span>
              <Flag size={13} /> 待检查
            </span>
          </div>
          <div className="card-note">
            {answered < total ? (
              <>
                还有 {total - answered} 题未答。
                <br />
                <button
                  className="link-button"
                  onClick={() =>
                    go(attempt.states.findIndex((x) => !x.history.length))
                  }
                >
                  跳转到第一道未答题
                </button>
              </>
            ) : (
              "全部题目已作答，可以交卷。"
            )}
            {flagged > 0 && (
              <p className="spaced">
                <button
                  className="link-button"
                  onClick={() =>
                    go(
                      attempt.states.findIndex(
                        (x, i) => x.flagged && i > index,
                      ) >= 0
                        ? attempt.states.findIndex(
                            (x, i) => x.flagged && i > index,
                          )
                        : attempt.states.findIndex((x) => x.flagged),
                    )
                  }
                >
                  检查已标记的 {flagged} 道题
                </button>
              </p>
            )}
          </div>
          <button
            className="button primary full"
            disabled={answered !== total || busy}
            onClick={() => setConfirm(true)}
          >
            交卷并查看结果
          </button>
        </aside>
        <section className="question-panel">
          <div className="question-meta">
            <span>
              {q.category || "综合"}
              <i>单选题</i>
            </span>
            <button
              className={`text-button ${state.flagged ? "marked" : ""}`}
              aria-pressed={state.flagged}
              onClick={() => {
                draft!.add("flag", index, !state.flagged);
                void draft!.sync().catch(() => {});
              }}
            >
              <Flag size={15} fill={state.flagged ? "#e4c650" : "none"} />
              {state.flagged ? "取消待检查" : "标记待检查"}
            </button>
          </div>
          <div className="question-content">
            {q.material && <QuestionMaterial text={q.material} />}
            <div className="question-title">
              <span className="question-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2 id="question-stem">{q.stem}</h2>
            </div>
            <RadioGroup
              aria-labelledby="question-stem"
              value={selected || ""}
              onValueChange={choose}
              className="options"
            >
              {letters.map((k) => (
                <label
                  key={`${q.id}-${k}`}
                  htmlFor={`answer-${k}`}
                  className={`option ${selected === k ? "selected" : ""}`}
                >
                  <RadioGroupItem value={k} id={`answer-${k}`} />
                  <span className="option-letter">{k}</span>
                  <span style={{ whiteSpace: "pre-wrap" }}>{q.options[k]}</span>
                  {selected === k && <Check size={18} />}
                </label>
              ))}
            </RadioGroup>
          </div>
          <footer className="question-footer">
            <button
              className="button"
              disabled={index === 0}
              onClick={() => go(index - 1)}
            >
              <ChevronLeft size={16} /> 上一题
            </button>
            <span className="muted">
              第 {index + 1} 题 / 共 {total} 题
            </span>
            <button
              className="button"
              disabled={index === total - 1}
              onClick={() => go(index + 1)}
            >
              下一题 <ChevronRight size={16} />
            </button>
          </footer>
        </section>
      </div>
      <Dialog
        open={confirm}
        onOpenChange={(v) => {
          if (!busy) setConfirm(v);
        }}
      >
        <DialogContent className="dialog-content">
          <DialogTitle>确认交卷</DialogTitle>
          <DialogDescription>
            已完成全部 {total} 道题。交卷后不能修改本次答案。
          </DialogDescription>
          {flagged > 0 && (
            <div className="notice">
              还有 {flagged}{" "}
              道题标记为待检查，你可以返回继续检查，也可以直接交卷。
            </div>
          )}
          {error && (
            <div role="alert" className="danger-message">
              {error}
            </div>
          )}
          <div className="toolbar" style={{ justifyContent: "flex-end" }}>
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              返回检查
            </button>
            <button className="button primary" disabled={busy} onClick={finish}>
              {busy ? "正在保存并交卷…" : "确认交卷"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
