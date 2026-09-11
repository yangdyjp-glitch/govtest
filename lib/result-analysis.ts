import type { ResultItem } from "./domain";

export type ResultSort = {
  key: "number" | "category" | "outcome" | "time";
  direction: "asc" | "desc";
};
const outcomeOrder = { wrong: 0, revised: 1, first: 2 };
const categoryOrder = new Intl.Collator("zh-CN", { numeric: true });
export function sortResults(results: ResultItem[], sort: ResultSort) {
  return results
    .map((item, index) => ({ item, number: index + 1 }))
    .sort((a, b) => {
      let comparison = 0;
      if (sort.key === "number") comparison = a.number - b.number;
      if (sort.key === "category")
        comparison = categoryOrder.compare(
          a.item.question.category,
          b.item.question.category,
        );
      if (sort.key === "outcome")
        comparison =
          outcomeOrder[a.item.outcome] - outcomeOrder[b.item.outcome];
      if (sort.key === "time")
        comparison = a.item.state.elapsedMs - b.item.state.elapsedMs;
      return (
        comparison * (sort.direction === "asc" ? 1 : -1) || a.number - b.number
      );
    });
}

// Midpoints of the user's reference ranges define ratios, never fixed time limits.
export const moduleReferences = [
  { name: "政治理论", weight: 1, aliases: ["政治理论"] },
  { name: "常识判断", weight: 1, aliases: ["常识判断", "常识"] },
  {
    name: "言语理解与表达",
    weight: 52.5 / 30,
    aliases: ["言语理解与表达", "言语理解", "言语"],
  },
  {
    name: "判断推理",
    weight: 50 / 30,
    aliases: ["判断推理", "类比推理", "逻辑判断", "图形推理", "定义判断"],
  },
  { name: "资料分析", weight: 75 / 30, aliases: ["资料分析"] },
  {
    name: "数量关系",
    weight: 75 / 30,
    aliases: ["数量关系", "数学运算", "数字推理"],
  },
] as const;
export function moduleReference(category: string) {
  const matches = moduleReferences.filter((ref) =>
    ref.aliases.some((alias) => category.includes(alias)),
  );
  return matches.length === 1 ? matches[0] : null;
}
export const speedBands = [
  { key: "very-fast", label: "极快" },
  { key: "fast", label: "较快" },
  { key: "average", label: "均值" },
  { key: "slow", label: "较慢" },
  { key: "very-slow", label: "极慢" },
] as const;
export type SpeedBand = (typeof speedBands)[number]["key"];
export type TimedQuestion = {
  item: ResultItem;
  number: number;
  module: string;
  ms: number | null;
  band: SpeedBand | null;
  deltaMs: number | null;
};
export type TimeDistribution = ReturnType<typeof timeDistribution>;
const validTime = (ms: number) => Number.isFinite(ms) && ms > 0;
const close = (a: number, b: number) =>
  Math.abs(a - b) <= Math.max(1e-7, Math.abs(b) * 1e-10);

export function speedBand(
  ms: number,
  mean: number,
  deviation: number,
): SpeedBand {
  if (close(deviation, 0)) return "average";
  const z = (ms - mean) / deviation;
  if (z < -3 && !close(z, -3)) return "very-fast";
  if (z < -1 && !close(z, -1)) return "fast";
  if (z > 3 && !close(z, 3)) return "very-slow";
  if (z > 1 && !close(z, 1)) return "slow";
  return "average";
}
export function timeDistribution(
  source: { item: ResultItem; number: number; module: string }[],
) {
  const values = source
    .map((row) => row.item.state.elapsedMs)
    .filter(validTime)
    .sort((a, b) => a - b);
  const timed = values.length,
    totalMs = values.reduce((sum, ms) => sum + ms, 0);
  const mean = timed ? totalMs / timed : null;
  const deviation =
    mean === null
      ? 0
      : Math.sqrt(
          values.reduce((sum, ms) => sum + (ms - mean) ** 2, 0) / timed,
        );
  const median = timed
    ? (values[Math.floor((timed - 1) / 2)] + values[Math.floor(timed / 2)]) / 2
    : null;
  const rows: TimedQuestion[] = source.map((row) => {
    const ms = validTime(row.item.state.elapsedMs)
      ? row.item.state.elapsedMs
      : null;
    return {
      ...row,
      ms,
      band:
        ms === null || mean === null ? null : speedBand(ms, mean, deviation),
      deltaMs:
        ms === null || mean === null ? null : close(ms, mean) ? 0 : ms - mean,
    };
  });
  const below = rows.filter(
    (row) => row.deltaMs !== null && row.deltaMs < 0,
  ).length;
  const above = rows.filter(
    (row) => row.deltaMs !== null && row.deltaMs > 0,
  ).length;
  const bands = speedBands.map((band) => {
    const count = rows.filter((row) => row.band === band.key).length;
    return { ...band, count, percent: timed ? (count / timed) * 100 : 0 };
  });
  // Population deviation; histogram counts are actual observations, never theoretical shares.
  const minMs = timed ? values[0] : null,
    maxMs = timed ? values[timed - 1] : null;
  const chartMax =
    mean === null ? 1 : Math.max(maxMs!, mean + 3.3 * deviation, 1) * 1.05;
  const binCount = Math.max(6, Math.min(14, Math.ceil(Math.sqrt(timed))));
  const binWidth = chartMax / binCount;
  const histogram = Array.from({ length: binCount }, (_, i) => ({
    start: i * binWidth,
    end: (i + 1) * binWidth,
    count: 0,
  }));
  values.forEach(
    (ms) =>
      histogram[Math.min(binCount - 1, Math.floor(ms / binWidth))].count++,
  );
  const curve =
    timed >= 5 && !close(deviation, 0) && mean !== null
      ? Array.from({ length: 81 }, (_, i) => {
          const ms = (chartMax * i) / 80;
          return {
            ms,
            count:
              (Math.exp(-0.5 * ((ms - mean) / deviation) ** 2) /
                (deviation * Math.sqrt(2 * Math.PI))) *
              timed *
              binWidth,
          };
        })
      : [];
  return {
    rows,
    total: source.length,
    timed,
    missing: source.length - timed,
    totalMs,
    mean,
    median,
    deviation,
    minMs,
    maxMs,
    below,
    equal: timed - below - above,
    above,
    bands,
    histogram,
    curve,
    chartMax,
  };
}
function accuracy(rows: TimedQuestion[]) {
  const total = rows.length,
    first = rows.filter((row) => row.item.outcome === "first").length,
    revised = rows.filter((row) => row.item.outcome === "revised").length;
  const rate = (n: number) => (total ? (n / total) * 100 : 0);
  return {
    total,
    first,
    revised,
    wrong: total - first - revised,
    firstRate: rate(first),
    revisedRate: rate(revised),
    wrongRate: rate(total - first - revised),
    correctRate: rate(first + revised),
  };
}
export type Verdict = {
  code:
    "balanced" | "slow" | "unstable" | "inaccurate" | "untimed" | "relative";
  label: string;
  advice: string;
};
function judge(
  stats: ReturnType<typeof accuracy>,
  missing: number,
  paceRatio: number | null,
): Verdict {
  if (stats.correctRate < 80)
    return {
      code: "inaccurate",
      label: "先提高正确性",
      advice:
        "先复盘最终错误，检查考点、审题与排除依据。相对做得快不能抵消答错。",
    };
  if (stats.firstRate < 70)
    return {
      code: "unstable",
      label: "首次判断需巩固",
      advice: "修改正确仍需复习，找出第一次判断不准的原因，减少反复改选。",
    };
  if (missing)
    return {
      code: "untimed",
      label: "正确性较好，计时待补全",
      advice: "部分题目没有有效计时，当前速度统计仅覆盖已记录的题目。",
    };
  if (paceRatio === null)
    return {
      code: "relative",
      label: "正确性较好，查看内部用时",
      advice:
        "结合本模块的较慢、极慢题目检查解题步骤；目前没有足够的模块比例对比依据。",
    };
  if (paceRatio > 1 && !close(paceRatio, 1))
    return {
      code: "slow",
      label: "答得准，相对耗时偏多",
      advice:
        "相对于本次练习的模块用时比例，本模块耗时较多。优先复盘较慢题，在保持正确率的同时简化步骤。",
    };
  return {
    code: "balanced",
    label: "本次相对又对又快",
    advice:
      "正确性和首次判断较好，按题型比例校正后也不慢于本次节奏。保持方法，并复盘剩余错题。",
  };
}
export function analyzeResults(results: ResultItem[]) {
  const entries = results.map((item, index) => ({
    item,
    number: index + 1,
    module:
      moduleReference(item.question.category)?.name ??
      (item.question.category.trim() || "未分类"),
  }));
  const distribution = timeDistribution(entries);
  const groups = new Map<string, typeof entries>();
  entries.forEach((row) => {
    const group = groups.get(row.module) ?? [];
    group.push(row);
    groups.set(row.module, group);
  });
  let knownMs = 0,
    weightTotal = 0;
  entries.forEach((row) => {
    const ref = moduleReference(row.module);
    if (ref && validTime(row.item.state.elapsedMs)) {
      knownMs += row.item.state.elapsedMs;
      weightTotal += ref.weight;
    }
  });
  const baseMs = weightTotal ? knownMs / weightTotal : null;
  const measured = [...groups].map(([category, rows]) => {
    const ref = moduleReference(category),
      times = timeDistribution(rows);
    const expectedMs =
      ref && times.timed && baseMs !== null ? baseMs * ref.weight : null;
    return {
      category,
      reference: ref,
      times,
      ...accuracy(times.rows),
      expectedMs,
      paceRatio:
        expectedMs && times.mean !== null ? times.mean / expectedMs : null,
    };
  });
  const comparable = measured.filter(
    (group) => group.paceRatio !== null,
  ).length;
  const categories = measured.map((group) => ({
    ...group,
    paceRatio: comparable >= 2 ? group.paceRatio : null,
    verdict: judge(
      group,
      group.times.missing,
      comparable >= 2 ? group.paceRatio : null,
    ),
  }));
  const ranked = categories
    .filter((group) => group.paceRatio !== null)
    .sort(
      (a, b) =>
        a.paceRatio! - b.paceRatio! ||
        categoryOrder.compare(a.category, b.category),
    );
  const tied =
    ranked.length < 2 ||
    close(ranked[0].paceRatio!, ranked[ranked.length - 1].paceRatio!);
  const fastest = tied
    ? []
    : ranked.filter((group) => close(group.paceRatio!, ranked[0].paceRatio!));
  const slowest = tied
    ? []
    : ranked.filter((group) =>
        close(group.paceRatio!, ranked[ranked.length - 1].paceRatio!),
      );
  const priorities = categories
    .filter((group) => group.verdict.code !== "balanced")
    .sort(
      (a, b) =>
        b.wrongRate - a.wrongRate ||
        b.revisedRate - a.revisedRate ||
        (b.paceRatio ?? 1) - (a.paceRatio ?? 1),
    )
    .slice(0, 3);
  const slowQuestions = categories
    .flatMap((group) => group.times.rows)
    .filter((row) => row.band === "slow" || row.band === "very-slow");
  const slowWrong = slowQuestions
    .filter((row) => row.item.outcome === "wrong")
    .sort((a, b) => (b.deltaMs ?? 0) - (a.deltaMs ?? 0) || a.number - b.number);
  const overall = {
    ...accuracy(distribution.rows),
    averageMs: distribution.mean,
    totalMs: distribution.totalMs,
    timed: distribution.timed,
    missingTiming: distribution.missing,
  };
  const overallVerdict = judge(overall, distribution.missing, null);
  if (overallVerdict.code === "relative") {
    overallVerdict.label = "正确性较好，继续优化相对用时";
    overallVerdict.advice = slowWrong.length
      ? `优先复盘模块内较慢或极慢且仍答错的 ${slowWrong.length} 道题，检查是否存在计算、材料定位或解题方法上的困难。`
      : "结合模块比例和模块内用时分布，优先复盘修改正确与相对较慢的题目，保持首次判断的稳定性。";
  }
  return {
    overall,
    overallVerdict,
    distribution,
    categories,
    priorities,
    ranked,
    fastest,
    slowest,
    comparable,
    slowWrong,
    baseMs,
  };
}
