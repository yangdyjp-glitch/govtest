import { applyEvent, type Attempt, type Event } from "./domain";
import { api, ApiError } from "./client";
// Durable server state plus a device-local outbox. Event IDs make retries idempotent.
export class Draft {
  base: Attempt;
  pending: Event[] = [];
  key: string;
  syncing: Promise<void> | null = null;
  notice = "已保存";
  listener: () => void = () => {};
  stopped = false;
  constructor(attempt: Attempt) {
    this.base = attempt;
    this.key = `govtest.outbox.${attempt.userId}.${attempt.id}`;
    try {
      this.pending = JSON.parse(localStorage.getItem(this.key) || "[]");
      if (!Array.isArray(this.pending)) this.pending = [];
    } catch {
      this.pending = [];
    }
  }
  view() {
    const a = structuredClone(this.base);
    for (const e of this.pending) {
      const next = applyEvent(a.states, e);
      if (next !== undefined) a.current = next;
    }
    return a;
  }
  persist() {
    try {
      if (this.pending.length)
        localStorage.setItem(this.key, JSON.stringify(this.pending));
      else localStorage.removeItem(this.key);
    } catch {
      this.notice = "本地保存空间不足，请保持页面打开并联网同步";
    }
  }
  add(type: Event["type"], index: number, value?: Event["value"]) {
    if (this.stopped) return;
    const e = {
      id: crypto.randomUUID(),
      type,
      index,
      value,
      at: new Date().toISOString(),
    };
    this.pending.push(e);
    this.notice = "待同步";
    this.persist();
    this.listener();
  }
  sync() {
    if (this.syncing) return this.syncing;
    this.syncing = this.drain().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }
  async drain() {
    let conflicts = 0;
    try {
      while (this.pending.length) {
        const batch = this.pending.slice(0, 200);
        this.notice = "保存中";
        this.listener();
        try {
          const r = await api<{ attempt: Attempt; acked: string[] }>(
            `attempts/${this.base.id}/sync`,
            { revision: this.base.revision, events: batch },
          );
          this.base = r.attempt;
          const ids = new Set(r.acked);
          this.pending = this.pending.filter((x) => !ids.has(x.id));
          this.persist();
          conflicts = 0;
        } catch (e) {
          if (
            e instanceof ApiError &&
            e.status === 409 &&
            e.data.attempt &&
            conflicts++ < 4
          ) {
            this.base = e.data.attempt;
            continue;
          }
          throw e;
        }
      }
      this.notice = "已保存";
    } catch (e) {
      this.notice =
        e instanceof ApiError
          ? e.message
          : "连接中断，答案已暂存，恢复连接后自动同步";
      throw e;
    } finally {
      this.listener();
    }
  }
  async submit() {
    await this.sync();
    const a = await api<Attempt>(`attempts/${this.base.id}/submit`, {
      revision: this.base.revision,
    });
    this.stopped = true;
    this.base = a;
    return a;
  }
}
