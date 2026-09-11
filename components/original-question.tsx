"use client";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { QuestionMaterial } from "@/components/question-material";
import { letters, type ResultItem } from "@/lib/domain";

export function OriginalQuestion({ item }: { item: ResultItem }) {
  const q = item.question;
  const selected = item.state.history.at(-1);
  const incorrect = selected !== undefined && selected !== q.answer;
  return (
    <article className="original-question">
      <p className="muted">
        {q.category} · 题库题号 {q.sourceId}
      </p>
      {q.material && <QuestionMaterial text={q.material} />}
      <p className="stem">{q.stem}</p>
      <div className="result-options">
        {letters.map((letter) => {
          const highlight = incorrect && letter === q.answer;
          return (
            <div
              key={letter}
              className={`result-option original-question-option${highlight ? " correct" : ""}`}
            >
              <b>{letter}</b>
              <span className="original-question-option-text">
                {q.options[letter]}
              </span>
              {letter === selected && (
                <span className="original-question-choice">当时选择</span>
              )}
              {highlight && (
                <span className="original-question-choice">正确答案</span>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function OriginalQuestionButton({
  item,
  number,
}: {
  item: ResultItem;
  number: number;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="link-button"
          aria-label={`查看第 ${number} 题原题`}
        >
          查看原题
        </button>
      </DialogTrigger>
      <DialogContent
        className="dialog-content original-question-dialog"
        showCloseButton={false}
      >
        <DialogHeader className="original-question-header">
          <div className="section-head">
            <DialogTitle>第 {number} 题 · 查看原题</DialogTitle>
            <DialogClose asChild>
              <button type="button" className="text-button">
                关闭
              </button>
            </DialogClose>
          </div>
          <DialogDescription>
            展示本次作答时的题目和交卷时所选答案。
          </DialogDescription>
        </DialogHeader>
        <OriginalQuestion item={item} />
      </DialogContent>
    </Dialog>
  );
}
