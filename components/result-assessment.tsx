"use client";
import { useId, useMemo, useState } from "react";
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
import { TimeDistribution, formatTime } from "@/components/time-distribution";
import { analyzeResults, moduleReferences } from "@/lib/result-analysis";
import type { ResultItem } from "@/lib/domain";

function paceText(ratio: number | null) {
  if (ratio === null) return "不参与比例排名";
  const percent = Math.round(Math.abs(ratio - 1) * 1000) / 10;
  if (!percent) return "与比例基准相同";
  return `相对${ratio < 1 ? "少" : "多"}用 ${percent}% 时间`;
}
export function ResultAssessment({ results }: { results: ResultItem[] }) {
  const report = useMemo(() => analyzeResults(results), [results]);
  const [selected, setSelected] = useState("");
  const [order, setOrder] = useState("pace");
  const moduleHeading = useId();
  const current =
    report.categories.find((group) => group.category === selected) ??
    report.categories[0];
  const modules = [...report.categories].sort((a, b) => {
    const av = order === "pace" ? a.paceRatio : a.times.mean;
    const bv = order === "pace" ? b.paceRatio : b.times.mean;
    if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
    return (av - bv) * (order === "time-desc" ? -1 : 1);
  });
  const fastCorrect = report.categories
    .flatMap((group) => group.times.rows)
    .filter(
      (row) =>
        row.item.outcome === "first" &&
        (row.band === "fast" || row.band === "very-fast"),
    ).length;
  const { overall, overallVerdict, fastest, slowest } = report;
  const names = (groups: typeof report.categories) =>
    groups.map((group) => group.category).join("、");
  function openModule(category: string) {
    setSelected(category);
    document
      .getElementById(moduleHeading)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (!results.length) return null;
  return (
    <>
      <section
        className="result-analysis-section"
        aria-labelledby="overall-timing-heading"
      >
        <div className="subheading">
          <h2 id="overall-timing-heading">全卷用时分布</h2>
          <span className="muted">按本次实际用时统计</span>
        </div>
        <TimeDistribution data={report.distribution} />
      </section>
      <section
        className="result-analysis-section"
        aria-labelledby="module-comparison-heading"
      >
        <div className="subheading">
          <h2 id="module-comparison-heading">模块之间的快慢</h2>
          <Select value={order} onValueChange={setOrder}>
            <SelectTrigger className="module-sort-select" aria-label="模块排序">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pace">相对用时从少到多</SelectItem>
              <SelectItem value="time-asc">实际平均用时从短到长</SelectItem>
              <SelectItem value="time-desc">实际平均用时从长到短</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="assessment-note">
          先按题型参考比例校正，再比较模块速度。相对用时 1.00
          倍表示符合本次比例基准，低于 1.00 倍更快，高于 1.00
          倍更慢；基准由本次有效用时和各模块题数共同计算。
        </p>
        {report.comparable >= 2 ? (
          fastest.length ? (
            <div className="module-comparison-summary">
              <div>
                <span>按比例校正后相对更快</span>
                <strong>{names(fastest)}</strong>
                <p>{paceText(fastest[0].paceRatio)}</p>
              </div>
              <div>
                <span>按比例校正后相对更慢</span>
                <strong>{names(slowest)}</strong>
                <p>{paceText(slowest[0].paceRatio)}</p>
              </div>
            </div>
          ) : (
            <p className="notice">
              各模块的实际节奏与参考比例一致，没有相对快慢差异。
            </p>
          )
        ) : (
          <p className="notice">
            至少需要两个有有效计时的已识别模块，才能比较模块之间的相对快慢。仍可查看各模块内部的题目用时。
          </p>
        )}
        <div className="table-wrap module-comparison-table">
          <Table aria-label="模块相对用时对比">
            <TableHeader>
              <TableRow>
                {[
                  "模块",
                  "题数 / 参考比",
                  "实际平均用时",
                  "本次比例基准",
                  "相对用时",
                  "作答结果",
                  "模块判断",
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((group) => (
                <TableRow key={group.category}>
                  <TableCell>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => openModule(group.category)}
                      aria-label={`查看${group.category}的题目用时`}
                    >
                      {group.category}
                    </button>
                    <p className="muted">查看模块内题目</p>
                  </TableCell>
                  <TableCell>
                    {group.total} 题
                    <p className="muted">
                      {group.reference
                        ? `参考比 ${Number(group.reference.weight.toFixed(2))}`
                        : "未匹配参考比"}
                    </p>
                  </TableCell>
                  <TableCell>
                    {formatTime(group.times.mean)}
                    <p className="muted">
                      中位 {formatTime(group.times.median)}
                    </p>
                  </TableCell>
                  <TableCell>
                    {group.paceRatio === null
                      ? "—"
                      : formatTime(group.expectedMs)}
                  </TableCell>
                  <TableCell>
                    {group.paceRatio === null
                      ? "—"
                      : `${group.paceRatio.toFixed(2)} 倍`}
                    <p className="muted">{paceText(group.paceRatio)}</p>
                  </TableCell>
                  <TableCell>
                    首次正确 {group.firstRate.toFixed(1)}%
                    <p className="muted">
                      修改正确 {group.revisedRate.toFixed(1)}% · 错误{" "}
                      {group.wrong} 题
                    </p>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`assessment-verdict ${group.verdict.code === "balanced" ? "balanced" : ""}`}
                    >
                      {group.verdict.label}
                    </span>
                    {group.times.timed < 5 && (
                      <p className="muted">计时样本较少，仅供本次参考</p>
                    )}
                    {group.times.missing > 0 && (
                      <p className="muted">缺少 {group.times.missing} 题计时</p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <details className="timing-method">
          <summary>模块参考比例与计算说明</summary>
          <p>
            使用所提供用时区间的中点换算相对比例，以政治理论、常识判断为
            1。整套题整体加快或放慢时，比例基准同步变化，不设置固定秒数限时。
          </p>
          <div className="reference-ratios">
            {moduleReferences.map((ref) => (
              <span key={ref.name}>
                {ref.name} <b>{Number(ref.weight.toFixed(2))}</b>
              </span>
            ))}
          </div>
          <p>
            参考比乘以本次基础节奏，得到各模块的比例基准。题数按有效计时题目计算，避免题目多的模块因总用时较长而被判慢。未识别的分类不参与比例排名，保留其内部用时分析。资料分析的累计用时包含阅读材料。
          </p>
        </details>
      </section>
      {current && (
        <section
          className="result-analysis-section"
          aria-labelledby={moduleHeading}
        >
          <div className="subheading">
            <h2 id={moduleHeading}>模块内题目快慢</h2>
            <Select value={current.category} onValueChange={setSelected}>
              <SelectTrigger
                className="module-select"
                aria-label="选择用时分析模块"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {report.categories.map((group) => (
                  <SelectItem key={group.category} value={group.category}>
                    {group.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="assessment-note">
            当前模块：{current.category}
            。每道题只与本模块平均用时比较，保留原题号；默认将耗时最长的题目排在前面。
          </p>
          <TimeDistribution
            key={current.category}
            data={current.times}
            module
          />
        </section>
      )}
      <section
        className="result-assessment"
        aria-labelledby="assessment-heading"
      >
        <div className="subheading">
          <h2 id="assessment-heading">整体判断</h2>
          <span className="muted">正确性与相对用时一起看</span>
        </div>
        <div className="assessment-summary">
          <h3>{overallVerdict.label}</h3>
          <p>{overallVerdict.advice}</p>
          <div className="assessment-metrics">
            <div>
              <span>最终正确率</span>
              <strong>{overall.correctRate.toFixed(1)}%</strong>
              <small>
                首次正确 {overall.first} 题 · 修改正确 {overall.revised} 题 ·
                错误 {overall.wrong} 题
              </small>
            </div>
            <div>
              <span>模块内较快且首次正确</span>
              <strong>{fastCorrect} 题</strong>
              <small>首次正确，且属于本模块的较快或极快档</small>
            </div>
            <div>
              <span>模块内较慢且最终错误</span>
              <strong>{report.slowWrong.length} 题</strong>
              <small>优先复盘的耗时错题</small>
            </div>
            <div>
              <span>全卷平均用时</span>
              <strong>{formatTime(overall.averageMs)}</strong>
              <small>按 {overall.timed} 道有计时的题目计算</small>
            </div>
          </div>
        </div>
        {fastest.length > 0 && (
          <p className="assessment-note">
            按题型比例校正后，{names(fastest)}相对更快，{names(slowest)}
            相对更慢。快慢描述用时差异，模块表现还需结合首次正确、修改正确和最终错误。
          </p>
        )}
        {report.slowWrong.length > 0 && (
          <p className="notice timing-priority-questions">
            优先复盘题号：
            {report.slowWrong
              .slice(0, 8)
              .map(
                (row) =>
                  `${String(row.number).padStart(2, "0")}（${row.module}）`,
              )
              .join("、")}
            {report.slowWrong.length > 8
              ? `，另有 ${report.slowWrong.length - 8} 题可在模块内查看`
              : ""}
            。这些题在各自模块内耗时较多且仍答错。
          </p>
        )}
        {report.priorities.length > 0 && (
          <div className="assessment-priorities">
            <h3>优先改进的模块</h3>
            <ol>
              {report.priorities.map((group) => (
                <li key={group.category}>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => openModule(group.category)}
                  >
                    {group.category}
                  </button>
                  ：{group.verdict.advice}
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="assessment-note">
          正确性以最终正确率 80%、首次正确率 70%
          为练习参考；修改正确计入最终正确，但不计入首次正确。速度仅按本次题型比例和模块内部用时比较，不使用固定用时达标率。
        </p>
      </section>
    </>
  );
}
