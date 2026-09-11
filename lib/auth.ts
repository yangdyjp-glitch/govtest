import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { database } from "./database";
import { HttpError } from "./http";
import {
  hashPassword,
  normalizeUsername,
  validatePassword,
  verifyPassword,
} from "./passwords";
import type { User } from "./domain";
const cookieName = "govtest_session";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const sessionAge = 7 * 24 * 60 * 60;
function cookieOptions() {
  return {
    httpOnly: true,
    secure:
      process.env.COOKIE_SECURE !== "false" &&
      process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: sessionAge,
  };
}
export async function sessionUser(): Promise<User | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return null;
  return database()
    .prepare(
      "SELECT u.*,c.username FROM sessions s JOIN users u ON u.id=s.user_id JOIN credentials c ON c.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?",
    )
    .bind(digest(token), Date.now())
    .first<User>();
}
export async function login(usernameInput: unknown, passwordInput: unknown) {
  let username: string;
  try {
    username = normalizeUsername(usernameInput);
  } catch {
    throw new HttpError(401, "账号或密码不正确");
  }
  if (typeof passwordInput !== "string" || passwordInput.length > 256)
    throw new HttpError(401, "账号或密码不正确");
  const d = database(),
    key = digest(username),
    now = Date.now();
  await d
    .prepare(
      "INSERT INTO login_attempts (key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.expires_at<? THEN 1 ELSE login_attempts.attempts+1 END, expires_at=CASE WHEN login_attempts.expires_at<? THEN excluded.expires_at ELSE login_attempts.expires_at END",
    )
    .bind(key, now + 15 * 60000, now, now)
    .run();
  const attempts = await d
    .prepare("SELECT attempts FROM login_attempts WHERE key=?")
    .bind(key)
    .first<{ attempts: number }>();
  if (attempts!.attempts > 10)
    throw new HttpError(429, "尝试次数过多，请 15 分钟后重试");
  const account = await d
    .prepare(
      "SELECT c.*,u.disabled FROM credentials c JOIN users u ON u.id=c.user_id WHERE c.username=?",
    )
    .bind(username)
    .first<{ password_hash: string; user_id: string; disabled: number }>();
  // A fixed, valid dummy hash gives unknown accounts the same password-work cost.
  const hash =
    account?.password_hash || `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;
  const valid = await verifyPassword(passwordInput, hash);
  if (!valid || !account || account.disabled)
    throw new HttpError(401, "账号或密码不正确");
  const token = randomBytes(32).toString("base64url");
  await d.batch([
    d.prepare("DELETE FROM login_attempts WHERE key=?").bind(key),
    d.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
    d
      .prepare(
        "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)",
      )
      .bind(digest(token), account.user_id, now + sessionAge * 1000),
  ]);
  (await cookies()).set(cookieName, token, cookieOptions());
}
export async function logout() {
  const jar = await cookies(),
    token = jar.get(cookieName)?.value;
  if (token)
    await database()
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(digest(token))
      .run();
  jar.set(cookieName, "", { ...cookieOptions(), maxAge: 0 });
}
export async function createAccount(input: {
  username: unknown;
  password: unknown;
  name: unknown;
  role: unknown;
}) {
  let username: string;
  try {
    username = normalizeUsername(input.username);
    validatePassword(input.password);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const name = String(input.name || "").trim();
  if (
    !name ||
    name.length > 80 ||
    !["admin", "user"].includes(String(input.role))
  )
    throw new HttpError(400, "请填写姓名和有效角色");
  const d = database();
  if (
    await d
      .prepare("SELECT user_id FROM credentials WHERE username=?")
      .bind(username)
      .first()
  )
    throw new HttpError(409, "该账号已存在");
  const hash = await hashPassword(input.password as string),
    id = crypto.randomUUID();
  await d.batch([
    d
      .prepare(
        "INSERT INTO users (id,email,name,role,created_at) VALUES (?,?,?,?,?)",
      )
      .bind(id, username, name, input.role, new Date().toISOString()),
    d
      .prepare(
        "INSERT INTO credentials (user_id,username,password_hash) VALUES (?,?,?)",
      )
      .bind(id, username, hash),
  ]);
  return { id };
}
export async function resetPassword(userId: string, password: unknown) {
  try {
    validatePassword(password);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  if (
    !(await database()
      .prepare("SELECT user_id FROM credentials WHERE user_id=?")
      .bind(userId)
      .first())
  )
    throw new HttpError(404, "账号不存在");
  const hash = await hashPassword(password as string);
  await database().batch([
    database()
      .prepare("UPDATE credentials SET password_hash=? WHERE user_id=?")
      .bind(hash, userId),
    database().prepare("DELETE FROM sessions WHERE user_id=?").bind(userId),
  ]);
}
export async function changePassword(
  userId: string,
  oldPassword: unknown,
  password: unknown,
) {
  const account = await database()
    .prepare("SELECT password_hash FROM credentials WHERE user_id=?")
    .bind(userId)
    .first<{ password_hash: string }>();
  if (
    typeof oldPassword !== "string" ||
    !account ||
    !(await verifyPassword(oldPassword, account.password_hash))
  )
    throw new HttpError(400, "原密码不正确");
  await resetPassword(userId, password);
  await logout();
}
