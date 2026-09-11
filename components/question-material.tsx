import type { ReactNode } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));

/** Render text and simple Markdown tables without interpreting HTML from imports. */
export function QuestionMaterial({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      blocks.push(<div key={blocks.length}>{paragraph.join("\n")}</div>);
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const header = cells(lines[i]);
    const separators = cells(lines[i + 1] || "");
    if (
      header.length > 1 &&
      header.length === separators.length &&
      separators.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      flush();
      const rows: string[][] = [];
      i += 2;
      while (
        i < lines.length &&
        lines[i].includes("|") &&
        cells(lines[i]).length === header.length
      ) {
        rows.push(cells(lines[i]));
        i++;
      }
      i--;
      const align = (column: number) =>
        separators[column].endsWith(":")
          ? separators[column].startsWith(":")
            ? "center"
            : "right"
          : "left";
      blocks.push(
        <Table key={blocks.length} className="material-table">
          <TableHeader>
            <TableRow>
              {header.map((cell, column) => (
                <TableHead
                  key={column}
                  scope="col"
                  style={{ textAlign: align(column) }}
                >
                  {cell}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {row.map((cell, column) => (
                  <TableCell key={column} style={{ textAlign: align(column) }}>
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>,
      );
    } else paragraph.push(lines[i]);
  }
  flush();
  return <div className="material">{blocks}</div>;
}
