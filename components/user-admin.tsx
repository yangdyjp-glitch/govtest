"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { api } from "@/lib/client";
import type { User } from "@/lib/domain";
export function UserAdmin() {
  const [users, setUsers] = useState<User[]>([]),
    [open, setOpen] = useState(false),
    [form, setForm] = useState({
      name: "",
      username: "",
      password: "",
      role: "user",
    }),
    [reset, setReset] = useState<User | null>(null),
    [resetValue, setResetValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = () =>
    api<{ users: User[] }>("admin/users")
      .then((d) => setUsers(d.users))
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
  }, []);
  async function mutate(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("admin/users", body);
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN / 账号权限</p>
          <h1>用户管理</h1>
          <p className="muted">
            管理员拥有全部功能；普通用户仅可使用答题、结果分析和错题集。
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          <Plus size={16} /> 添加用户
        </button>
      </div>
      {error && !open && !reset && (
        <p className="danger-message" role="alert">
          {error}
        </p>
      )}
      <div className="table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              {["姓名", "登录账号", "角色", "状态", "操作"].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.username}</TableCell>
                <TableCell>
                  <Select
                    disabled={busy}
                    value={u.role}
                    onValueChange={(role) =>
                      void mutate({
                        action: "update",
                        id: u.id,
                        role,
                        disabled: !!u.disabled,
                      })
                    }
                  >
                    <SelectTrigger style={{ width: 150 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">管理员 admin</SelectItem>
                      <SelectItem value="user">普通用户 user</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{u.disabled ? "已停用" : "正常"}</TableCell>
                <TableCell>
                  <div className="toolbar">
                    <button
                      className="link-button"
                      disabled={busy}
                      onClick={() =>
                        void mutate({
                          action: "update",
                          id: u.id,
                          role: u.role,
                          disabled: !u.disabled,
                        })
                      }
                    >
                      {u.disabled ? "启用" : "停用"}
                    </button>
                    <button
                      className="link-button"
                      disabled={busy}
                      onClick={() => {
                        setReset(u);
                        setResetValue("");
                        setError("");
                      }}
                    >
                      重置密码
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="dialog-content">
          <DialogTitle>添加用户</DialogTitle>
          <DialogDescription>
            创建后，用户可使用账号和密码直接登录。
          </DialogDescription>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate({ action: "create", ...form })) {
                setOpen(false);
                setForm({ name: "", username: "", password: "", role: "user" });
              }
            }}
          >
            <label className="field">
              姓名
              <input
                required
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="field">
              登录账号
              <input
                required
                minLength={3}
                maxLength={64}
                autoComplete="off"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </label>
            <label className="field">
              初始密码（至少 10 位）
              <input
                type="password"
                required
                minLength={10}
                maxLength={256}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <label className="field">
              角色
              <Select
                value={form.role}
                onValueChange={(role) => setForm({ ...form, role })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">普通用户 user</SelectItem>
                  <SelectItem value="admin">管理员 admin</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {error && (
              <p className="danger-message" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy} type="submit">
              {busy ? "正在保存…" : "确认添加"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!reset}
        onOpenChange={(v) => {
          if (!v) setReset(null);
        }}
      >
        <DialogContent className="dialog-content">
          <DialogTitle>重置 {reset?.name} 的密码</DialogTitle>
          <DialogDescription>
            保存后该账号的所有已登录会话会失效。
          </DialogDescription>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate({
                  action: "password",
                  id: reset!.id,
                  password: resetValue,
                })
              ) {
                setReset(null);
                setResetValue("");
              }
            }}
          >
            <label className="field">
              新密码
              <input
                required
                type="password"
                minLength={10}
                maxLength={256}
                autoComplete="new-password"
                value={resetValue}
                onChange={(e) => setResetValue(e.target.value)}
              />
            </label>
            {error && (
              <p className="danger-message" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" type="submit" disabled={busy}>
              确认重置
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
