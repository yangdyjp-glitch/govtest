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
type Filter =
  SpeedBand | "below" | "equal" | "above" | "missing" | "all" | null;
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
      if (filter === "below") return row.deltaMs !== null && row.deltaMs < 0;
      if (filter === "equal") return row.deltaMs === 0;
      if (filter === "above") return row.deltaMs !== null && row.deltaMs > 0;
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
        below: "低于平均用时",
        equal: "等于平均用时",
        above: "高于平均用时",
        missing: "缺少计时",
        all: "全部题目",
      } as Record<string, string>
    )[filter ?? "all"];
  const percent = (count: number) =>
    data.timed ? ((count / data.timed) * 100).toFixed(1) : "0.0";
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
      <div className="timing-overview">
        <div>
          <span>平均用时</span>
          <strong>{formatTime(data.mean)}</strong>
          <small>中位用时 {formatTime(data.median)}</small>
        </div>
        {(
          [
            ["below", "低于平均用时", data.below],
            ["equal", "等于平均用时", data.equal],
            ["above", "高于平均用时", data.above],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => choose(key)}
            aria-pressed={filter === key}
            aria-controls={tableId}
          >
            <span>{label}</span>
            <strong>{count} 题</strong>
            <small>{percent(count)}%</small>
          </button>
        ))}
      </div>
      {data.timed > 0 ? (
        <>
          <DistributionChart data={data} />
          <div className="speed-band-grid" aria-label="用时分档">
            {data.bands.map((band) => (
              <button
                type="button"
                key={band.key}
                className={`speed-band-card speed-${band.key}`}
                onClick={() => choose(band.key)}
                aria-pressed={filter === band.key}
                aria-controls={tableId}
              >
                <span>{band.label}</span>
                <strong>{band.count} 题</strong>
                <small>{band.percent.toFixed(1)}%</small>
              </button>
            ))}
          </div>
          <p className="assessment-note">
            “均值”表示平均用时附近；上方“等于平均用时”仅统计用时相同的题目。点击题数可查看对应题号。
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
          暂不绘制参考曲线。
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

function DistributionChart({ data }: { data: Distribution }) {
  const left = 48,
    right = 780,
    top = 24,
    bottom = 194,
    width = right - left,
    height = bottom - top;
  const peak = Math.ceil(
    Math.max(
      1,
      ...data.histogram.map((bin) => bin.count),
      ...data.curve.map((point) => point.count),
    ),
  );
  const x = (ms: number) => left + (ms / data.chartMax) * width;
  const y = (count: number) => bottom - (count / peak) * height;
  const line = data.curve
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${x(point.ms).toFixed(2)},${y(point.count).toFixed(2)}`,
    )
    .join(" ");
  return (
    <figure className="distribution-figure">
      <figcaption>
        <span>实际用时分布</span>
        <span className="muted">
          柱形：实测题数{data.curve.length > 0 ? " · 曲线：分布参考" : ""}
        </span>
      </figcaption>
      <svg
        viewBox="0 0 820 235"
        role="img"
        aria-label={`用时分布：共 ${data.timed} 题，平均 ${formatTime(data.mean)}，低于均值 ${data.below} 题，高于均值 ${data.above} 题`}
      >
        <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#bdbdb1" />
        <text x={left - 8} y={top + 4} textAnchor="end">
          {Math.ceil(peak)}
        </text>
        <text x={left - 8} y={bottom + 4} textAnchor="end">
          0
        </text>
        <text x={left} y={14}>
          题数
        </text>
        {data.histogram.map((bin, index) => (
          <rect
            key={index}
            x={x(bin.start) + 2}
            y={y(bin.count)}
            width={Math.max(1, x(bin.end) - x(bin.start) - 4)}
            height={bottom - y(bin.count)}
            fill="#b9b9ad"
          >
            <title>{`${(bin.start / 1000).toFixed(1)}～${(bin.end / 1000).toFixed(1)} 秒：${bin.count} 题`}</title>
          </rect>
        ))}
        {line && (
          <path d={line} fill="none" stroke="#aa8b18" strokeWidth="2.5" />
        )}
        {data.mean !== null && (
          <>
            <line
              x1={x(data.mean)}
              y1={top}
              x2={x(data.mean)}
              y2={bottom}
              stroke="#35352e"
              strokeDasharray="4 4"
            />
            <text
              x={Math.max(left + 36, Math.min(right - 36, x(data.mean)))}
              y={top - 8}
              textAnchor="middle"
            >
              平均用时
            </text>
          </>
        )}
        {[0, 1, 2, 3, 4].map((tick) => (
          <text
            key={tick}
            x={left + (width * tick) / 4}
            y={216}
            textAnchor="middle"
          >
            {Number(((data.chartMax * tick) / 4 / 1000).toFixed(1))}
          </text>
        ))}
        <text x={right + 12} y={216}>
          秒
        </text>
      </svg>
      <p className="muted">曲线仅作分布参考；题数和比例均按实际作答计算。</p>
    </figure>
  );
}
