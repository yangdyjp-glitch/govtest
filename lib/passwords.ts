import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
async function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
}
export function validatePassword(
  password: unknown,
): asserts password is string {
  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 256
  )
    throw new Error("密码长度须为 10–256 位");
}
export function normalizeUsername(value: unknown) {
  const username = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.@+-]{2,63}$/.test(username))
    throw new Error("账号须为 3–64 位字母、数字或 . _ @ + -");
  return username;
}
export async function hashPassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const parts = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  if (!parts || password.length > 256) return false;
  return timingSafeEqual(
    await derive(password, parts[1]),
    Buffer.from(parts[2], "hex"),
  );
}
