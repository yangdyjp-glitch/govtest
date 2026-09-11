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

- 持久化卷挂载到 `/data`；单副本运行 SQLite，数据库和会话在服务重启、版本更新后保留。
- `PORT=8080`，域名目标端口也设为 8080。
- `DATA_DIR=/data`。
- `APP_URL=https://govtest-production.up.railway.app`，供写请求来源校验使用。
- `INITIAL_ADMIN_USERNAME=admin`。
- `INITIAL_ADMIN_PASSWORD_HASH` 为 scrypt 密码哈希，只在空数据库首次初始化时使用，格式为 `scrypt$盐值$哈希`。本地 setup 生成的 `.env.local` 对 `$` 有 dotenv 转义；设置 Railway 原始变量时去掉这些转义反斜杠。
- 生产环境保持 Secure Cookie 默认值，不设置 `COOKIE_SECURE=false`。

迁移在运行时、卷挂载后执行。`/api/health` 检查数据库并返回健康状态，缺少挂载卷或初始配置时不会报告成功。卷是持久化存储，不等同于备份；迁移或手工处理数据前应在 Railway 创建卷备份。

早期 Sites 站点使用独立 D1 数据库；切换到 Railway 不会自动复制其中的题库或答题记录。

## 验证

```powershell
npm test
npm run typecheck
npm run build
npm run test:integration
```

接口测试自动启动 8788 端口服务，使用系统临时目录中的独立数据库，验证登录、权限、判分、全部作答后交卷、并发同步、文件导入，以及进程重启后的数据保留，结束后清理测试目录。端口需空闲，测试前先构建。

## 导入说明

支持 `.xlsx`、`.xls`、UTF-8 `.md`、`.docx`、`.doc`，单文件最大 8MB，一次最多 300 题。Word 当前只导入文字，图片和复杂公式需整理后导入。上传原件不保存。

产品规则与架构见 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。
