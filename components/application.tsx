"use client";
import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, LogOut, RefreshCw, Play } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Exam } from "./exam";
import { Results, WrongBook } from "./results";
import { Banks, UserAdmin } from "./admin";
import { api, ApiError } from "@/lib/client";
import type { User, Bank, Attempt } from "@/lib/domain";
type Bootstrap = {
  user: User;
  banks: Bank[];
  active: { id: string; title: string; current: number; createdAt: string }[];
};
export default function Application() {
  const [data, setData] = useState<Bootstrap | null>(null),
    [tab, setTab] = useState("exam"),
    [active, setActive] = useState<string | null>(null),
    [result, setResult] = useState<string | null>(null),
    [error, setError] = useState(""),
    [unauthorized, setUnauthorized] = useState(false),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const value = await api<Bootstrap>("bootstrap");
      setData(value);
      setError("");
      setUnauthorized(false);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 401) setUnauthorized(true);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!data) return;
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const c = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "get_practice_overview",
            title: "查看练习概况",
            description: "读取当前用户可用题库和未完成的练习，不包含答案。",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: (input: unknown) => {
              if (
                !input ||
                typeof input !== "object" ||
                Object.keys(input).length
              )
                throw new Error("不接受参数");
              return { banks: data.banks, unfinished: data.active };
            },
          },
          { signal: c.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => c.abort();
  }, [data]);
  async function start(bankId: string) {
    setBusy(true);
    setError("");
    try {
      const a = await api<Attempt>("attempts", { bankId });
      setActive(a.id);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function completed(a: Attempt) {
    setActive(null);
    setResult(a.id);
    setTab("results");
    void refresh();
  }
  const switchTab = (value: string) => {
    setTab(value);
    void refresh();
  };
  if (!data)
    return (
      <main className="login-page">
        <div className="brand">
          <BookOpen size={29} />
          <strong>公考研习</strong>
        </div>
        <div className="panel">
          <h1>公务员考试在线答题</h1>
          <p className="muted">{error || "正在连接你的研习空间…"}</p>
          {unauthorized ? (
            <a
              href="/signin-with-chatgpt?return_to=/"
              target="_top"
              className="button primary"
            >
              登录研习空间 <ChevronRight size={16} />
            </a>
          ) : (
            error && (
              <button className="button" onClick={() => void refresh()}>
                重试连接
              </button>
            )
          )}
        </div>
      </main>
    );
  const admin = data.user.role === "admin";
  return (
    <Tabs
      value={tab}
      onValueChange={switchTab}
      className="nav-tabs"
      activationMode="manual"
    >
      <header className="site-header">
        <a className="brand" href="/" aria-label="公考研习首页">
          <BookOpen size={25} />
          <strong>公考研习</strong>
        </a>
        <TabsList aria-label="主要页面">
          <TabsTrigger value="exam">在线答题</TabsTrigger>
          <TabsTrigger value="results">结果分析</TabsTrigger>
          <TabsTrigger value="wrong">错题集</TabsTrigger>
          {admin && (
            <>
              <TabsTrigger value="banks">题库管理</TabsTrigger>
              <TabsTrigger value="users">用户管理</TabsTrigger>
            </>
          )}
        </TabsList>
        <div className="user-badge">
          <span className="account-email" title={data.user.email}>
            {data.user.name}
          </span>
          <span className="role-label">{admin ? "admin" : "user"}</span>
          <a
            href="/signout-with-chatgpt?return_to=/"
            target="_top"
            aria-label="退出登录"
            title="退出登录"
          >
            <LogOut size={16} />
          </a>
        </div>
      </header>
      <main className="workspace">
        {error && (
          <div className="danger-message" role="alert">
            {error}
          </div>
        )}
        <TabsContent value="exam">
          {active ? (
            <Exam
              key={active}
              id={active}
              onExit={() => {
                setActive(null);
                void refresh();
              }}
              onSubmit={completed}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">PRACTICE / 研习空间</p>
                  <h1>在线答题</h1>
                  <p className="muted">选择一份题库，开始今天的练习。</p>
                </div>
                <button className="text-button" onClick={() => void refresh()}>
                  <RefreshCw size={15} /> 刷新题库
                </button>
              </div>
              {data.active.length > 0 && (
                <>
                  <div className="subheading">
                    <h2>继续上次练习</h2>
                    <span className="muted">答案与标记已保存</span>
                  </div>
                  <div className="stack" style={{ marginBottom: 28 }}>
                    {data.active.map((a) => (
                      <div
                        className="panel"
                        key={a.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "20px 26px",
                        }}
                      >
                        <div>
                          <h3>{a.title}</h3>
                          <p className="muted">
                            上次停留：第 {a.current + 1} 题 · 开始于{" "}
                            {new Date(a.createdAt).toLocaleString("zh-CN", {
                              hour12: false,
                            })}
                          </p>
                        </div>
                        <button
                          className="button yellow"
                          onClick={() => setActive(a.id)}
                        >
                          <Play size={15} /> 继续答题
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="subheading">
                <h2>可用题库</h2>
                <span className="muted">共 {data.banks.length} 份</span>
              </div>
              {data.banks.length ? (
                <div className="bank-grid">
                  {data.banks.map((b, i) => (
                    <article key={b.id} className="bank-card">
                      <div className="card-top">
                        <h2>{b.title}</h2>
                        <span className="eyebrow">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <p className="muted">
                        {b.description || "单项选择 · 四选一"}
                      </p>
                      <footer>
                        <span>
                          <span className="bank-number">{b.count}</span>题
                        </span>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => start(b.id)}
                        >
                          {busy ? "正在准备…" : "开始新练习"}
                          <ChevronRight size={16} />
                        </button>
                      </footer>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <BookOpen size={34} />
                  <h2>题库准备中</h2>
                  <p className="muted">
                    {admin
                      ? "导入你的题库后，即可开始练习。"
                      : "管理员发布题库后，会显示在这里。"}
                  </p>
                  {admin && (
                    <button
                      className="button primary"
                      onClick={() => switchTab("banks")}
                    >
                      前往题库管理
                    </button>
                  )}
                </div>
              )}
              <div className="notice spaced">
                可以跳过题目、返回修改，并标记待检查。全部题目作答后方可交卷。
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="results">
          <Results key={result || "history"} initialId={result} admin={admin} />
        </TabsContent>
        <TabsContent value="wrong">
          <WrongBook
            onStart={(a) => {
              setActive(a.id);
              setTab("exam");
              void refresh();
            }}
          />
        </TabsContent>
        {admin && (
          <>
            <TabsContent value="banks">
              <Banks />
            </TabsContent>
            <TabsContent value="users">
              <UserAdmin />
            </TabsContent>
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>公考研习 · 在线答题系统</span>
        <span>专注每一道题。</span>
      </footer>
    </Tabs>
  );
}
