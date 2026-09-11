import { changePassword, login, logout } from "@/lib/auth";
import {
  currentUser,
  guarded,
  HttpError,
  json,
  sameOrigin,
} from "@/lib/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return guarded(async () => {
    sameOrigin(req);
    const action = new URL(req.url).pathname.split("/").at(-1);
    if (action === "logout") {
      await logout();
      return json({ ok: true });
    }
    if (Number(req.headers.get("content-length") || 0) > 4096)
      throw new HttpError(413, "请求过大");
    let body;
    try {
      const text = await req.text();
      if (text.length > 4096) throw new Error();
      body = JSON.parse(text);
    } catch {
      throw new HttpError(400, "请求格式错误");
    }
    if (action === "login") {
      await login(body.username, body.password);
      return json({ ok: true });
    }
    if (action === "password") {
      const user = await currentUser();
      await changePassword(user.id, body.oldPassword, body.password);
      return json({ ok: true });
    }
    throw new HttpError(404, "操作不存在");
  });
}
