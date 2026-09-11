# 公考研习

公务员考试桌面网页答题应用。宋体中文、Times New Roman 数字与字母，黑白灰黄界面。

## 使用

1. 登录研习空间。首次进入私有站点的所有者为 admin。
2. 在“题库管理”导入 Excel、Markdown 或 Word，预览并修正后保存；也可先添加 8 道功能演示题。
3. 在“在线答题”开始练习。支持跳过、前后翻页、左侧跳题、待检查和自动保存。
4. 全部作答后交卷，在“结果分析”查看首次正确率、修改正确率、每题累计用时与答案变化。
5. 修改正确与最终错误自动进入“错题集”，可发起重做。

user 仅有答题、结果和错题三个页面。admin 另有题库与用户管理，可查看全部用户结果。

## 本地开发

需要 Node.js 22.13 或以上版本。优先使用 PowerShell 7。

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_flat_wilson_fisk.sql
npm run dev
```

迁移命令只在新数据库上执行一次。已有本地数据时直接 `npm run dev`。浏览器打开终端显示的地址，通常是 `http://127.0.0.1:5173`。本地登录由开发环境模拟；线上使用 ChatGPT 平台身份。

此 Windows 环境的 npm 命令包装器若报 `npm-prefix.js` 路径错误，可直接调用：

```powershell
node node_modules/vinext/dist/cli.js dev --port 5173 --hostname 127.0.0.1
node node_modules/vinext/dist/cli.js build
```

## 检查

```powershell
npm test
npm run typecheck
```

完整接口测试使用独立数据库，避免污染练习数据：

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/test-state --file drizzle/0000_flat_wilson_fisk.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/test-state --ip 127.0.0.1 --port 8788 --inspector-port 0
# 另开终端
node tests/integration.mjs
```

## 说明

- 原始上传文件不保存，题目及答题记录保存在 D1。
- Word 目前导入文字，图片和复杂公式需整理后导入。
- 新发布站点默认仅所有者可访问；多人使用需要开放对应站点访问权限，并在应用内登记账号。
- 使用规则、架构、验证范围与已知边界见 [IMPLEMENTATION.md](./IMPLEMENTATION.md)。
