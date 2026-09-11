"use client";
import { useId, useState } from "react";
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
import { outcomeLabels } from "@/lib/domain";
import { OriginalQuestionButton } from "@/components/original-question";
import {
  speedBands,
  type SpeedBand,
  type TimeDistribution as Distribution,
} from "@/lib/result-analysis";

export function formatTime(ms: number | null) {
  if (ms === null) return "暂无计时";
  const seconds = Math.round(ms / 100) / 10;
  const minutes = Math.floor(seconds / 60);
  return `${minutes ? `${minutes} 分 ` : ""}${Number((seconds % 60).toFixed(1))} 秒`;
}
function deltaText(ms: number | null) {
  if (ms === null) return "—";
  if (!ms) return "与均值相同";
  return `${ms < 0 ? "快" : "慢"} ${Number((Math.abs(ms) / 1000).toFixed(1))} 秒`;
}
type Filter = SpeedBand | "missing" | "all" | null;
export function TimeDistribution({
  data,
  module = false,
}: {
  data: Distribution;
  module?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>(module ? "all" : null);
  const [direction, setDirection] = useState("desc");
  const tableId = useId();
  const shown = data.rows
    .filter((row) => {
      if (filter === "all") return true;
      if (filter === "missing") return row.ms === null;
      return row.band === filter;
    })
    .sort((a, b) => {
      if (a.ms === null || b.ms === null)
        return a.ms === b.ms ? a.number - b.number : a.ms === null ? 1 : -1;
      return (
        (a.ms - b.ms) * (direction === "asc" ? 1 : -1) || a.number - b.number
      );
    });
  const activeLabel =
    speedBands.find((band) => band.key === filter)?.label ??
    (
      {
        missing: "缺少计时",
        all: "全部题目",
      } as Record<string, string>
    )[filter ?? "all"];
  function choose(value: Filter) {
    setFilter(value);
  }
  const fastest = data.rows.filter(
    (row) => row.ms !== null && row.ms === data.minMs,
  );
  const slowest = data.rows.filter(
    (row) => row.ms !== null && row.ms === data.maxMs,
  );
  const numbers = (rows: typeof data.rows) =>
    rows
      .slice(0, 5)
      .map((row) => String(row.number).padStart(2, "0"))
      .join("、") + (rows.length > 5 ? ` 等 ${rows.length} 题` : "");
  return (
    <div className="timing-distribution">
      <div className="timing-summary">
        <div className="timing-average">
          <span>平均用时</span>
          <strong
            className={data.mean === null ? "muted" : "timing-average-value"}
          >
            {formatTime(data.mean)}
          </strong>
        </div>
        <div className="speed-band-grid" aria-label="用时分档">
          {data.bands.map((band) => (
            <button
              type="button"
              key={band.key}
              className={`speed-band-card speed-${band.key}`}
              onClick={() => choose(band.key)}
              disabled={!data.timed}
              aria-pressed={filter === band.key}
              aria-controls={tableId}
            >
              <span>{band.label}</span>
              <strong>{band.count} 题</strong>
              <small>{band.percent.toFixed(1)}%</small>
            </button>
          ))}
        </div>
      </div>
      {data.timed > 0 ? (
        <>
          <p className="assessment-note">
            “均值”表示平均用时附近。点击快慢档可查看对应题目。
          </p>
          {module && (
            <p className="timing-extremes">
              最快：第 {numbers(fastest)} 题（{formatTime(data.minMs)}） ·
              最慢：第 {numbers(slowest)} 题（{formatTime(data.maxMs)}）
            </p>
          )}
        </>
      ) : (
        <p className="empty-note">没有有效计时，暂不能分析快慢。</p>
      )}
      {(data.timed < 5 || data.deviation === 0) && data.timed > 0 && (
        <p className="assessment-note">
          {data.deviation === 0
            ? "本组已记录的用时一致，均归入“均值”档。"
            : "本组有效计时不足 5 题，分档仅供本次参考。"}
        </p>
      )}
      {data.missing > 0 && (
        <p className="assessment-note">
          有{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => choose("missing")}
          >
            {data.missing} 题缺少有效计时
          </button>
          ，不参与用时均值、分档和比例计算。
        </p>
      )}
      <div className="timing-question-list" id={tableId}>
        <div className="subheading">
          <h3>
            {filter ? `${activeLabel} · ${shown.length} 题` : "查看对应题目"}
          </h3>
          <div className="toolbar">
            {filter && (
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger
                  className="timing-sort-select"
                  aria-label="题目用时排序"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">用时从长到短</SelectItem>
                  <SelectItem value="asc">用时从短到长</SelectItem>
                </SelectContent>
              </Select>
            )}
            <button
              className="text-button"
              type="button"
              onClick={() => choose("all")}
            >
              全部题目
            </button>
            {!module && filter && (
              <button
                className="text-button"
                type="button"
                onClick={() => choose(null)}
              >
                收起题目
              </button>
            )}
          </div>
        </div>
        {filter &&
          (shown.length ? (
            <div className="table-wrap timing-table">
              <Table
                aria-label={module ? "模块内题目用时" : "所选用时区间题目"}
              >
                <TableHeader>
                  <TableRow>
                    {[
                      "题号",
                      ...(!module ? ["模块"] : []),
                      "作答结果",
                      "累计用时",
                      `与${module ? "模块" : "全卷"}均值相比`,
                      "速度档",
                      "原题",
                    ].map((label) => (
                      <TableHead key={label}>{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((row) => (
                    <TableRow key={row.item.question.id}>
                      <TableCell title={row.item.question.stem}>
                        {String(row.number).padStart(2, "0")}
                      </TableCell>
                      {!module && <TableCell>{row.module}</TableCell>}
                      <TableCell>
                        <span className={`status-tag ${row.item.outcome}`}>
                          {outcomeLabels[row.item.outcome]}
                        </span>
                      </TableCell>
                      <TableCell>{formatTime(row.ms)}</TableCell>
                      <TableCell>{deltaText(row.deltaMs)}</TableCell>
                      <TableCell>
                        {row.band ? (
                          <span className={`speed-label speed-${row.band}`}>
                            {
                              speedBands.find((band) => band.key === row.band)!
                                .label
                            }
                          </span>
                        ) : (
                          "未计时"
                        )}
                      </TableCell>
                      <TableCell>
                        <OriginalQuestionButton
                          item={row.item}
                          number={row.number}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="empty-note">这个区间没有题目。</p>
          ))}
      </div>
    </div>
  );
}
