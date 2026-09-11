"use client";
import { useEffect, useState } from "react";
import { BookOpen, ChevronLeft, FileText, RotateCcw } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { api } from "@/lib/client";
import { QuestionMaterial } from "@/components/question-material";
import {
  duration,
  letters,
  outcomeLabels,
  summarize,
  type Attempt,
  type ResultItem,
  type Outcome,
  type Question,
  type AnswerState,
} from "@/lib/domain";
export function Status({ value }: { value: Outcome }) {
  return <span className={`status-tag ${value}`}>{outcomeLabels[value]}</span>;
}
export function Detail({ item }: { item: ResultItem }) {
  const q = item.question;
  return (
    <article className="result-detail">
      <div className="section-head">
        <span className="muted">
          {q.category} · {q.sourceId}
        </span>
        <Status value={item.outcome} />
      </div>
      {q.material && <QuestionMaterial text={q.material} />}
      <p className="stem">{q.stem}</p>
      <div className="result-options">
        {letters.map((k) => (
          <div
            key={k}
            className={`result-option ${k === q.answer ? "correct" : ""}`}
            style={{ whiteSpace: "pre-wrap" }}
          >
            <b style={{ marginRight: 14 }}>{k}</b>
            {q.options[k]}
            {k === q.answer && (
              <span className="status-tag" style={{ float: "right" }}>
                正确答案
              </span>
            )}
            {k === item.state.history.at(-1) && k !== q.answer && (
              <span className="muted" style={{ float: "right" }}>
                你的答案
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="form-row">
        <div>
          <p className="muted">作答过程</p>
          <p className="history-path">{item.state.history.join(" → ")}</p>
        </div>
        <div>
          <p className="muted">本题累计用时</p>
          <p style={{ fontSize: 23, marginTop: 7 }}>
            {duration(item.state.elapsedMs)}
          </p>
        </div>
      </div>
      <div className="analysis">
        <b>答案解析</b>
        <br />
        {q.explanation || "题库暂未提供解析。"}
      </div>
    </article>
  );
}
export function Results({
  initialId,
  admin,
}: {
  initialId: string | null;
  admin: boolean;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [scope, setScope] = useState("mine"),
    [selected, setSelected] = useState(initialId),
    [attempt, setAttempt] = useState<Attempt | null>(null),
    [index, setIndex] = useState<number | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api(`results?scope=${scope}`)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [scope]);
  useEffect(() => {
    if (!selected) {
      setAttempt(null);
      return;
    }
    let alive = true;
    setError("");
    api<Attempt>(`attempts/${selected}`)
      .then((a) => {
        if (alive) {
          setAttempt(a);
          setIndex(null);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [selected]);
  const stats = attempt?.results ? summarize(attempt.results) : null;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RESULTS / 学习记录</p>
          <h1>结果分析</h1>
          <p className="muted">
            区分首次判断与修改结果，回看每一道题的作答过程。
          </p>
        </div>
        {admin && !selected && (
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger style={{ width: 180 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">我的答题记录</SelectItem>
              <SelectItem value="all">全部用户记录</SelectItem>
            </SelectContent>
          </Select>
        )}
        {selected && (
          <button
            className="button"
            onClick={() => {
              setSelected(null);
              setAttempt(null);
            }}
          >
            <ChevronLeft size={16} /> 全部记录
          </button>
        )}
      </div>
      {error && <div className="danger-message">{error}</div>}
      {selected && attempt && stats ? (
        <>
          <div className="subheading">
            <h2>{attempt.title}</h2>
            <span className="muted">
              交卷于{" "}
              {new Date(attempt.submittedAt!).toLocaleString("zh-CN", {
                hour12: false,
              })}
            </span>
          </div>
          <div className="stats-grid">
            <Stat
              label="首次正确率"
              value={stats.firstRate.toFixed(1)}
              unit="%"
              note={`${stats.first} / ${stats.total} 题，直接选对且未改选`}
            />
            <Stat
              label="修改正确率"
              value={stats.revisedRate.toFixed(1)}
              unit="%"
              note={`${stats.revised} / ${stats.total} 题，已加入错题集`}
            />
            <Stat
              label="最终错误"
              value={String(stats.wrong)}
              unit="题"
              note="已加入错题集"
            />
            <Stat
              label="有效答题用时"
              value={String(Math.floor(stats.totalMs / 60000))}
              unit="分"
              note={`合计 ${duration(stats.totalMs)} · 平均 ${duration(stats.totalMs / stats.total)}`}
            />
          </div>
          <div className="chart-row" aria-label="作答结果分布">
            <span
              style={{ width: `${stats.firstRate}%`, background: "#48483e" }}
            />
            <span
              style={{ width: `${stats.revisedRate}%`, background: "#dfc650" }}
            />
            <span
              style={{
                width: `${(stats.wrong / stats.total) * 100}%`,
                background: "#ccccc1",
              }}
            />
          </div>
          {index !== null ? (
            <>
              <div className="subheading">
                <button className="text-button" onClick={() => setIndex(null)}>
                  <ChevronLeft size={15} /> 返回逐题分析
                </button>
                <div className="toolbar">
                  <button
                    className="button"
                    disabled={index === 0}
                    onClick={() => setIndex(index - 1)}
                  >
                    上一题
                  </button>
                  <span>
                    {index + 1} / {stats.total}
                  </span>
                  <button
                    className="button"
                    disabled={index === stats.total - 1}
                    onClick={() => setIndex(index + 1)}
                  >
                    下一题
                  </button>
                </div>
              </div>
              <Detail item={attempt.results![index]} />
            </>
          ) : (
            <div className="table-wrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      "题号",
                      "分类",
                      "你的答案",
                      "正确答案",
                      "作答结果",
                      "累计用时",
                      "",
                    ].map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attempt.results!.map((r, i) => (
                    <TableRow key={r.question.id}>
                      <TableCell>{String(i + 1).padStart(2, "0")}</TableCell>
                      <TableCell>{r.question.category}</TableCell>
                      <TableCell>{r.state.history.at(-1)}</TableCell>
                      <TableCell>{r.question.answer}</TableCell>
                      <TableCell>
                        <Status value={r.outcome} />
                      </TableCell>
                      <TableCell>{duration(r.state.elapsedMs)}</TableCell>
                      <TableCell>
                        <button
                          className="link-button"
                          onClick={() => setIndex(i)}
                        >
                          查看解析
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      ) : selected ? (
        <div className="empty-note">正在读取分析结果…</div>
      ) : loading ? (
        <div className="empty-note">正在读取答题记录…</div>
      ) : rows.length ? (
        <div className="table-wrap">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "练习名称",
                  ...(scope === "all" ? ["用户"] : []),
                  "交卷时间",
                  "首次正确率",
                  "修改正确率",
                  "题数",
                  "",
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.title}</TableCell>
                  {scope === "all" && <TableCell>{r.userName}</TableCell>}
                  <TableCell>
                    {new Date(r.submittedAt).toLocaleString("zh-CN", {
                      hour12: false,
                    })}
                  </TableCell>
                  <TableCell>{r.firstRate.toFixed(1)}%</TableCell>
                  <TableCell>{r.revisedRate.toFixed(1)}%</TableCell>
                  <TableCell>{r.total}</TableCell>
                  <TableCell>
                    <button
                      className="link-button"
                      onClick={() => setSelected(r.id)}
                    >
                      查看分析
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="empty-state">
          <FileText size={34} />
          <h2>还没有答题记录</h2>
          <p className="muted">完成全部题目并交卷后，这里会显示答题分析。</p>
        </div>
      )}
    </>
  );
}
function Stat({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
}) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-number">
        {value}
        <small>{unit}</small>
      </p>
      <p className="stat-note">{note}</p>
    </div>
  );
}
type Wrong = {
  question: Question;
  reason: Outcome;
  count: number;
  lastAt: string;
  lastOutcome: Outcome;
  lastState: AnswerState;
};
export function WrongBook({ onStart }: { onStart: (a: Attempt) => void }) {
  const [items, setItems] = useState<Wrong[]>([]),
    [filter, setFilter] = useState("all"),
    [detail, setDetail] = useState<Wrong | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api<Wrong[]>("wrong")
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const shown = items.filter((x) => filter === "all" || x.reason === filter);
  async function start(ids: string[]) {
    setBusy(true);
    try {
      onStart(await api<Attempt>("attempts", { wrongIds: ids }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">REVIEW / 错题复习</p>
          <h1>
            错题集 <span className="muted">{items.length} 题</span>
          </h1>
          <p className="muted">修改后答对的题目，也值得再做一次。</p>
        </div>
        <button
          className="button primary"
          disabled={!shown.length || busy}
          onClick={() => start(shown.map((x) => x.question.id))}
        >
          <RotateCcw size={16} />
          {busy ? "正在准备…" : "重做当前错题"}
        </button>
      </div>
      {error && <div className="danger-message">{error}</div>}
      {detail ? (
        <>
          <button className="text-button" onClick={() => setDetail(null)}>
            <ChevronLeft size={15} /> 返回错题列表
          </button>
          <div className="subheading">
            <span className="muted">
              累计入库 {detail.count} 次 · 最近入库{" "}
              {new Date(detail.lastAt).toLocaleDateString("zh-CN")}
            </span>
            <button
              className="button"
              disabled={busy}
              onClick={() => start([detail.question.id])}
            >
              重做此题
            </button>
          </div>
          <Detail
            item={{
              question: detail.question,
              state: detail.lastState,
              outcome: detail.lastOutcome,
            }}
          />
        </>
      ) : (
        <>
          <div className="toolbar" style={{ marginBottom: 20 }}>
            <span className="muted">入库原因</span>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger style={{ width: 180 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部错题</SelectItem>
                <SelectItem value="revised">修改正确</SelectItem>
                <SelectItem value="wrong">最终错误</SelectItem>
              </SelectContent>
            </Select>
            <span className="muted" style={{ marginLeft: "auto" }}>
              复习答对后保留历史记录
            </span>
          </div>
          {loading ? (
            <div className="empty-note">正在读取错题…</div>
          ) : shown.length ? (
            <div className="table-wrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["题目", "入库原因", "累计入库", "最近复习结果", ""].map(
                      (h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ),
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((x) => (
                    <TableRow key={x.question.id}>
                      <TableCell className="question-title-preview">
                        <p className="muted">
                          {x.question.category} · {x.question.sourceId}
                        </p>
                        {x.question.stem}
                      </TableCell>
                      <TableCell>
                        <Status value={x.reason} />
                      </TableCell>
                      <TableCell>{x.count} 次</TableCell>
                      <TableCell>
                        <Status value={x.lastOutcome} />
                      </TableCell>
                      <TableCell>
                        <button
                          className="link-button"
                          onClick={() => setDetail(x)}
                        >
                          查看详情
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="empty-state">
              <BookOpen size={34} />
              <h2>{items.length ? "此分类暂无错题" : "还没有错题"}</h2>
              <p className="muted">
                交卷后，修改正确与最终错误的题目会自动归入这里。
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
