"use client";
import { Checkbox } from "@/components/ui/checkbox";
import {
  expressionFieldLabels,
  pendingMathReviews,
  type ExpressionReview,
} from "@/lib/math-review";
import type { Question } from "@/lib/domain";

export function MathReview({
  questions,
  reviews,
  onConfirm,
  onEdit,
}: {
  questions: Question[];
  reviews: ExpressionReview[];
  onConfirm: (index: number, confirmed: boolean) => void;
  onEdit: (questionIndex: number) => void;
}) {
  if (!reviews.length) return null;
  const pending = pendingMathReviews(questions, reviews).length;
  return (
    <section className="panel math-review" aria-label="数学表达人工确认">
      <div className="subheading">
        <h2>数学表达检查</h2>
        <span className="status-tag">
          {pending ? `${pending} 处待确认` : "全部已确认"}
        </span>
      </div>
      <p className="muted">
        已整理可识别的公式。请逐项核对原文、括号范围和调整后的含义；不明确的内容可编辑修正，确认后才能保存题库。
      </p>
      {reviews.map((review, index) => (
        <article
          className="math-review-item"
          key={`${review.questionIndex}-${review.field}`}
        >
          <div className="section-head">
            <b>
              第{" "}
              {questions[review.questionIndex]?.sourceId ||
                review.questionIndex + 1}{" "}
              题 · {expressionFieldLabels[review.field]}
            </b>
            <button
              className="text-button"
              type="button"
              onClick={() => onEdit(review.questionIndex)}
            >
              编辑此题
            </button>
          </div>
          <div className="math-review-comparison">
            <div>
              <p className="muted">原文</p>
              <pre>{review.before}</pre>
            </div>
            <div>
              <p className="muted">
                {review.before === review.after
                  ? "当前内容（请核对）"
                  : "调整后"}
              </p>
              <pre>{review.after}</pre>
            </div>
          </div>
          {review.notes.map((note) => (
            <p key={note} className="batch-issue">
              {note}
            </p>
          ))}
          <label className="math-review-confirm">
            <Checkbox
              checked={review.confirmed}
              onCheckedChange={(value) => onConfirm(index, value === true)}
            />
            我已核对本项表达，确认含义正确
          </label>
        </article>
      ))}
    </section>
  );
}
