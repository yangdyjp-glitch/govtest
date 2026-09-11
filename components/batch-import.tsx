"use client";
import { type ImportItem, importIssues } from "@/lib/batch-import";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export function BatchImport({
  items,
  busy,
  onTitle,
  onPreview,
  onRemove,
  onSave,
  onFinish,
}: {
  items: ImportItem[];
  busy: boolean;
  onTitle: (key: string, title: string) => void;
  onPreview: (item: ImportItem) => void;
  onRemove: (key: string) => void;
  onSave: () => void;
  onFinish: () => void;
}) {
  const ready = items.filter(
    (item) => item.status === "ready" && !importIssues(item).length,
  );
  const saved = items.filter((item) => item.status === "saved").length;
  const processed = items.filter(
    (item) => !["reading", "pending"].includes(item.status),
  ).length;
  return (
    <section className="stack" aria-label="批量导入预览">
      <div className="subheading">
        <div>
          <h2>批量导入预览</h2>
          <p className="muted" role="status">
            共 {items.length} 个文件 · 已读取 {processed} 个 · 已保存 {saved} 套
          </p>
        </div>
        <div className="toolbar">
          <button className="button" disabled={busy} onClick={onFinish}>
            {saved === items.length ? "完成导入" : "返回题库列表"}
          </button>
          <button
            className="button primary"
            disabled={busy || !ready.length}
            onClick={onSave}
          >
            {busy ? "正在处理…" : `批量保存 ${ready.length} 套题库`}
          </button>
        </div>
      </div>
      <p className="muted">
        每个文件单独建库，可修改名称并预览题目。批量保存会处理校验通过的文件，需要修正的文件会保留在此列表。
      </p>
      <div className="table-wrap batch-import-table">
        <Table>
          <TableHeader>
            <TableRow>
              {["文件与题库名称", "题数", "导入状态", "操作"].map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const issues = item.status === "ready" ? importIssues(item) : [];
              const labels = {
                pending: "等待读取",
                reading: "正在读取…",
                ready: issues.length ? `需修正 ${issues.length} 项` : "可导入",
                failed: "读取失败",
                saving: "正在保存…",
                saved: "已保存",
              };
              return (
                <TableRow key={item.key}>
                  <TableCell>
                    <p className="muted batch-filename">{item.filename}</p>
                    <input
                      aria-label={`${item.filename} 的题库名称`}
                      maxLength={120}
                      value={item.title}
                      disabled={busy || item.locked || item.status !== "ready"}
                      onChange={(e) => onTitle(item.key, e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    {["pending", "reading", "failed"].includes(item.status)
                      ? "—"
                      : item.questions.length}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`status-tag ${item.status === "saved" ? "first" : ""}`}
                    >
                      {labels[item.status]}
                    </span>
                    {item.error && (
                      <p className="batch-issue" role="alert">
                        {item.error}
                      </p>
                    )}
                    {!!issues.length && (
                      <p className="batch-issue">
                        {issues.slice(0, 3).join("；")}
                        {issues.length > 3 ? "……" : ""}
                      </p>
                    )}
                    {!!item.warnings.length && item.status !== "saved" && (
                      <p className="muted">
                        有 {item.warnings.length} 条导入提示，请预览核对
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="toolbar">
                      <button
                        className="text-button"
                        disabled={
                          busy || item.locked || item.status !== "ready"
                        }
                        onClick={() => onPreview(item)}
                      >
                        预览与修正
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => onRemove(item.key)}
                      >
                        移出列表
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
