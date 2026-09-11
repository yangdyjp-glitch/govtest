"use client";
import { useState } from "react";
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
import { analyzeResults, assessmentRules } from "@/lib/result-analysis";
import { duration, type ResultItem } from "@/lib/domain";

export function ResultAssessment({ results }: { results: ResultItem[] }) {
  const [target, setTarget] = useState("60");
  const { overall, categories, priorities } = analyzeResults(
    results,
    Number(target),
  );
  return (
    <section className="result-assessment" aria-labelledby="assessment-heading">
      <div className="subheading">
        <h2 id="assessment-heading">整体判断</h2>
        <div className="toolbar">
          <span id="target-time-label" className="muted">
            目标用时
          </span>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger
              aria-labelledby="target-time-label"
              className="assessment-target"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[30, 45, 60, 90, 120, 180].map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {seconds} 秒 / 题
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div
        className={`assessment-summary ${overall.verdict.code === "balanced" ? "balanced" : ""}`}
      >
        <h3>{overall.verdict.label}</h3>
        <p>{overall.verdict.advice}</p>
        <div className="assessment-metrics">
          <div>
            <span>最终正确率</span>
            <strong>{overall.correctRate.toFixed(1)}%</strong>
            <small>
              首次正确 {overall.first} 题 · 修改正确 {overall.revised} 题 · 错误{" "}
              {overall.wrong} 题
            </small>
          </div>
          <div>
            <span>首次正确且用时达标</span>
            <strong>
              {overall.firstOnTime} / {overall.total} 题
            </strong>
            <small>同时满足一次选对和每题目标用时</small>
          </div>
          <div>
            <span>平均用时</span>
            <strong>
              {overall.averageMs === null
                ? "暂无计时"
                : duration(overall.averageMs)}
            </strong>
            <small>按 {overall.timed} 道有计时的题目计算</small>
          </div>
          <div>
            <span>用时达标率</span>
            <strong>{overall.onTimeRate.toFixed(1)}%</strong>
            <small>
              {overall.onTime} / {overall.total} 题在 {target} 秒内完成
            </small>
          </div>
        </div>
        {overall.missingTiming > 0 && (
          <p className="assessment-note">
            有 {overall.missingTiming} 题缺少有效计时，未计入用时达标题数。
          </p>
        )}
      </div>
      <div className="table-wrap assessment-table">
        <Table aria-label="分类表现分析">
          <TableHeader>
            <TableRow>
              {[
                "分类",
                "题数",
                "首次正确率",
                "修改正确率",
                "最终错误",
                "平均用时",
                "用时达标率",
                "分类判断",
              ].map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((group) => (
              <TableRow key={group.category}>
                <TableCell>{group.category}</TableCell>
                <TableCell>{group.total}</TableCell>
                <TableCell>{group.firstRate.toFixed(1)}%</TableCell>
                <TableCell>{group.revisedRate.toFixed(1)}%</TableCell>
                <TableCell>{group.wrong} 题</TableCell>
                <TableCell>
                  {group.averageMs === null
                    ? "暂无计时"
                    : duration(group.averageMs)}
                </TableCell>
                <TableCell>{group.onTimeRate.toFixed(1)}%</TableCell>
                <TableCell>
                  <span
                    className={`assessment-verdict ${group.verdict.code === "balanced" ? "balanced" : ""}`}
                  >
                    {group.verdict.label}
                  </span>
                  {group.total < 5 && (
                    <p className="muted">样本较少，仅供本次参考</p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {priorities.length > 0 && (
        <div className="assessment-priorities">
          <h3>优先改进的分类</h3>
          <ol>
            {priorities.map((group) => (
              <li key={group.category}>
                <b>{group.category}</b>：{group.verdict.advice}
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="assessment-note">
        评价口径：最终正确率 ≥ {assessmentRules.correctRate}%、首次正确率 ≥{" "}
        {assessmentRules.firstRate}%、用时达标率 ≥ {assessmentRules.onTimeRate}
        %，且平均用时不超过每题目标，才评为“又对又快”。修改正确计入最终正确率，但不计入首次正确。默认目标为
        60 秒 / 题，可按题目难度调整；这是练习参考标准。
      </p>
    </section>
  );
}
