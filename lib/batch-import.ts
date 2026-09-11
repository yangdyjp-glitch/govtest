import { type Question, validateQuestions } from "./domain";
import { pendingMathReviews, type ExpressionReview } from "./math-review";

export type ImportItem = {
  key: string;
  filename: string;
  title: string;
  description: string;
  questions: Question[];
  warnings: string[];
  expressionReviews: ExpressionReview[];
  status: "pending" | "reading" | "ready" | "failed" | "saving" | "saved";
  error: string;
  locked: boolean;
};

export function importIssues(item: ImportItem): string[] {
  return [
    ...(!item.title.trim() || item.title.length > 120
      ? ["题库名称不能为空，且最多 120 字"]
      : []),
    ...validateQuestions(item.questions),
    ...(pendingMathReviews(item.questions, item.expressionReviews).length
      ? [
          `有 ${pendingMathReviews(item.questions, item.expressionReviews).length} 处数学表达待人工确认`,
        ]
      : []),
  ];
}

export async function readQuestionFile(file: File): Promise<{
  questions: Question[];
  warnings: string[];
  expressionReviews: ExpressionReview[];
}> {
  if (file.size > 8 * 1024 * 1024) throw new Error("单个文件不能超过 8 MB");
  if (!/\.(xlsx|xls|md|docx|doc)$/i.test(file.name))
    throw new Error("支持 .xlsx、.xls、.md、.docx、.doc 文件");
  const response = await fetch("/api/admin/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  const data = (await response.json()) as {
    questions: Question[];
    warnings?: string[];
    expressionReviews?: ExpressionReview[];
    error?: string;
  };
  if (!response.ok)
    throw new Error(data.error || "文件读取失败，请重新选择文件");
  return {
    questions: data.questions,
    warnings: data.warnings || [],
    expressionReviews: data.expressionReviews || [],
  };
}
