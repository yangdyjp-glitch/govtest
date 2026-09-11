export type RunResult = {
  success: boolean;
  meta: { changes: number; last_row_id: number };
};
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, any>>(): Promise<T | null>;
  all<T = Record<string, any>>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<RunResult>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<RunResult[]>;
}
