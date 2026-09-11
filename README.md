# 公考研习

公务员考试桌面网页答题应用。宋体中文、Times New Roman 数字与字母，黑白灰黄界面。

正式地址：https://govtest-production.up.railway.app

## 使用

1. 使用管理员提供的账号和密码登录。右上角钥匙按钮可以修改自己的密码。
2. admin 在“题库管理”导入 Excel、Markdown 或 Word，预览并修正后保存；也可添加 8 道功能演示题。
3. 在“在线答题”开始练习。支持跳过、前后翻页、左侧跳题、待检查和自动保存。
4. 全部作答后交卷，在“结果分析”查看首次正确率、修改正确率、每题累计用时与答案变化。
5. 修改正确与最终错误自动进入“错题集”，可发起重做。

user 仅有答题、结果和错题三个页面。admin 另有题库与用户管理，可创建账号、重置密码、停用用户和查看全部用户结果。

## 本地开发

需要 Node.js 24，Windows 优先使用 PowerShell 7。

```powershell
npm ci
npm run setup
npm run dev
```

访问 http://localhost:5173。初始账号为 admin，随机密码保存在 `.admin-credentials.txt`。setup 只运行一次，拒绝覆盖已有 `.env.local`；这两个文件均不提交 Git。首次请求自动创建数据库并执行迁移，本地数据位于 `.data/govtest.sqlite`。

## Railway 部署

GitHub main 分支通过 Railway 自动部署。仓库根目录的 `Dockerfile` 使用 Node.js 24 与 Next.js standalone 服务。Railway 服务设置使用 Dockerfile 构建，健康检查为 `/api/health`、等待上限 180 秒，失败重启最多 5 次。

- 正式数据库为 Supabase PostgreSQL，使用独立 `govtest` schema。Railway 开启 IPv6 出站连接，以访问 Supabase 直连地址。
- `DATABASE_URL` 在 Railway 变量中配置 PostgreSQL 连接串，密码只在服务端使用，不写入前端或仓库。
- `DATABASE_SCHEMA=govtest`，连接池最多 5 个连接。SSL 验证证书与主机名，Supabase CA 证书位于 `db/certs/`；其他服务可使用 `DATABASE_CA_CERT` 配置 CA。
- `PORT=8080`，域名目标端口也设为 8080。
- `APP_URL=https://govtest-production.up.railway.app`，供写请求来源校验使用。
- `INITIAL_ADMIN_USERNAME=admin`。
- `INITIAL_ADMIN_PASSWORD_HASH` 为 scrypt 密码哈希，只在空数据库首次初始化时使用，格式为 `scrypt$盐值$哈希`。本地 setup 生成的 `.env.local` 对 `$` 有 dotenv 转义；设置 Railway 原始变量时去掉这些转义反斜杠。
- 生产环境保持 Secure Cookie 默认值，不设置 `COOKIE_SECURE=false`。

PostgreSQL 迁移位于 `db/postgres/`，在首次运行时通过事务与数据库锁执行。`/api/health` 验证实际数据库访问，正常返回 `storage: postgresql`。应用 schema 不对公开角色授权，业务表启用 RLS 且没有匿名访问策略，所有业务访问经过后端鉴权。

从 Railway SQLite 切换时保留 `/data` 卷，设置 `MIGRATE_SQLITE_PATH=/data/govtest.sqlite`。仅在目标无管理员且业务表为空时迁移，复制前生成 `.before-supabase` 备份，复制后逐表逐字段核对，并保留账号、密码哈希、会话和全部答题历史。数据复制与迁移标记在同一 PostgreSQL 事务中提交，后续重启不会重复导入。旧 SQLite 与备份文件继续保留；切换后的新记录只写入 PostgreSQL。

早期 Sites 站点使用独立 D1 数据库；切换到 Railway 不会自动复制其中的题库或答题记录。

## 验证

```powershell
npm test
npm run typecheck
npm run build
npm run test:integration
```

接口测试自动启动 8788 端口服务，使用系统临时目录中的独立数据库，验证登录、权限、判分、全部作答后交卷、并发同步、文件导入，以及进程重启后的数据保留，结束后清理测试目录。端口需空闲，测试前先构建。

设置 `TEST_DATABASE_URL` 后，接口测试会改用随机命名的 `govtest_test_*` PostgreSQL schema，结束后只清理本次测试 schema。同时设置 `TEST_MIGRATE_SQLITE=1` 可验证从 SQLite 迁移到 PostgreSQL 后原有账号、会话与成绩保持一致。测试连接需具备创建 schema 的权限。

## 导入说明

支持 `.xlsx`、`.xls`、UTF-8 `.md`、`.docx`、`.doc`，单文件最大 8MB，一次最多 300 题。Word 当前只导入文字，图片和复杂公式需整理后导入。上传原件不保存。

产品规则与架构见 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。
