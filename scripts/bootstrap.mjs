import { randomBytes, scryptSync } from "node:crypto";
import { writeFileSync } from "node:fs";
const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16).toString("hex");
const hash = `scrypt$${salt}$${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 67108864 }).toString("hex")}`;
// Next expands dollar signs in dotenv values; escape the hash separators.
writeFileSync(
  ".env.local",
  `INITIAL_ADMIN_USERNAME=admin\nINITIAL_ADMIN_PASSWORD_HASH=${hash.replaceAll("$", "\\$")}\n`,
  { flag: "wx", mode: 0o600 },
);
writeFileSync(
  ".admin-credentials.txt",
  `账号：admin\n密码：${password}\n登录后请通过右上角钥匙按钮修改密码。\n`,
  { flag: "wx", mode: 0o600 },
);
console.log("已创建 .env.local，初始密码已保存到 .admin-credentials.txt。");
