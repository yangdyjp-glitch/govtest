"use client";
import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/client";
export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="stack"
      style={{ textAlign: "left", marginTop: 25 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api("auth/login", { username, password });
          setPassword("");
          onSuccess();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        账号
        <input
          required
          autoComplete="username"
          value={username}
          maxLength={64}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>
      <label className="field">
        密码
        <input
          required
          autoComplete="current-password"
          type="password"
          maxLength={256}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && (
        <p className="danger-message" role="alert">
          {error}
        </p>
      )}
      <button className="button primary full" disabled={busy} type="submit">
        {busy ? "正在登录…" : "登录研习空间"}
      </button>
      <p className="muted">账号由管理员创建。忘记密码请联系管理员重置。</p>
    </form>
  );
}
export function AccountControls() {
  const [open, setOpen] = useState(false),
    [oldPassword, setOldPassword] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        className="text-button"
        title="修改密码"
        aria-label="修改密码"
        onClick={() => setOpen(true)}
      >
        <KeyRound size={16} />
      </button>
      <button
        className="text-button"
        title="退出登录"
        aria-label="退出登录"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api("auth/logout", {});
            window.location.assign("/");
          } catch (e) {
            setError((e as Error).message);
            setOpen(true);
            setBusy(false);
          }
        }}
      >
        <LogOut size={16} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="dialog-content">
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>修改成功后需要重新登录。</DialogDescription>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (password !== confirm) {
                setError("两次输入的新密码不一致");
                return;
              }
              setBusy(true);
              setError("");
              try {
                await api("auth/password", { oldPassword, password });
                window.location.assign("/");
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <label className="field">
              原密码
              <input
                required
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
            </label>
            <label className="field">
              新密码（至少 10 位）
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={256}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="field">
              再次输入新密码
              <input
                required
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {error && (
              <p className="danger-message" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "正在修改…" : "确认修改"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
