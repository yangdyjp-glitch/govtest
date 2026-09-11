import type { ResultItem } from "./domain";

export type ResultSort = {
  key: "number" | "category" | "outcome" | "time";
  direction: "asc" | "desc";
};

const outcomeOrder = { wrong: 0, revised: 1, first: 2 };
const categoryOrder = new Intl.Collator("zh-CN", { numeric: true });
export const assessmentRules = {
  correctRate: 80,
  firstRate: 70,
  onTimeRate: 80,
};

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

type Verdict = {
  code:
    | "balanced"
    | "slow"
    | "unstable"
    | "inaccurate"
    | "improve"
    | "untimed"
    | "empty";
  label: string;
  advice: string;
};

function measure(results: ResultItem[], targetMs: number) {
  const total = results.length;
  let first = 0,
    revised = 0,
    timed = 0,
    totalMs = 0,
    onTime = 0,
    firstOnTime = 0;
  for (const item of results) {
    if (item.outcome === "first") first++;
    if (item.outcome === "revised") revised++;
    const ms = item.state.elapsedMs;
    // Missing/zero timing must never earn a speed advantage.
    if (!Number.isFinite(ms) || ms <= 0) continue;
    timed++;
    totalMs += ms;
    if (ms <= targetMs) {
      onTime++;
      if (item.outcome === "first") firstOnTime++;
    }
  }
  const percent = (n: number) => (total ? (n / total) * 100 : 0);
  const correctRate = percent(first + revised),
    firstRate = percent(first);
  const onTimeRate = percent(onTime),
    averageMs = timed ? totalMs / timed : null;
  const accurate = correctRate >= assessmentRules.correctRate;
  const stable = firstRate >= assessmentRules.firstRate;
  const quick =
    timed === total &&
    onTimeRate >= assessmentRules.onTimeRate &&
    averageMs !== null &&
    averageMs <= targetMs;
  let verdict: Verdict;
  if (!total) {
    verdict = {
      code: "empty",
      label: "暂无可分析题目",
      advice: "完成练习后再查看整体判断。",
    };
  } else if (timed !== total) {
    verdict = {
      code: "untimed",
      label: "计时不足，暂不评价速度",
      advice:
        "部分题目没有有效计时。本次可查看正确性，重新完成含完整计时的练习后再判断是否又对又快。",
    };
  } else if (!accurate) {
    verdict = quick
      ? {
          code: "inaccurate",
          label: "速度达标，先提高正确性",
          advice:
            "先复盘最终错误的题目，确认考点和排除依据，再保持当前节奏练习。做得快不能抵消答错。",
        }
      : {
          code: "improve",
          label: "正确性与速度都需提高",
          advice:
            "先处理耗时较长仍答错的题目，补足考点和解题方法；能稳定答对后，再逐步缩短用时。",
        };
  } else if (!stable) {
    verdict = {
      code: "unstable",
      label: "答对较多，首次判断需巩固",
      advice: `修改后答对的题目仍需复习，重点找出第一次判断不准的原因。${quick ? "当前速度已达标，下一步提高首次正确率。" : "同时梳理解题步骤，减少反复改选和耗时。"}`,
    };
  } else if (!quick) {
    verdict = {
      code: "slow",
      label: "答得准，仍需提速",
      advice:
        "优先复盘答对但超出目标用时的题目，简化计算、定位材料和排除选项的步骤，在保持正确率的同时提速。",
    };
  } else {
    verdict = {
      code: "balanced",
      label: "又对又快",
      advice:
        "正确性、首次判断和用时均达到当前练习目标。保持节奏，继续复习少数错误、改选及超时题目。",
    };
  }
  return {
    total,
    first,
    revised,
    wrong: total - first - revised,
    correctRate,
    firstRate,
    revisedRate: percent(revised),
    wrongRate: percent(total - first - revised),
    timed,
    missingTiming: total - timed,
    totalMs,
    averageMs,
    onTime,
    onTimeRate,
    firstOnTime,
    firstOnTimeRate: percent(firstOnTime),
    verdict,
  };
}

export function analyzeResults(results: ResultItem[], targetSeconds = 60) {
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0)
    throw new Error("目标用时必须为正数");
  const groups = new Map<string, ResultItem[]>();
  for (const result of results) {
    const category = result.question.category.trim() || "未分类";
    const group = groups.get(category) ?? [];
    group.push(result);
    groups.set(category, group);
  }
  const targetMs = targetSeconds * 1000;
  const categories = [...groups].map(([category, items]) => ({
    category,
    ...measure(items, targetMs),
  }));
  const priorities = categories
    .filter((group) => group.verdict.code !== "balanced")
    .sort(
      (a, b) =>
        b.wrongRate - a.wrongRate ||
        b.revisedRate - a.revisedRate ||
        (b.averageMs ?? 0) - (a.averageMs ?? 0),
    )
    .slice(0, 3);
  return { overall: measure(results, targetMs), categories, priorities };
}
