# EBU4 文档站

EBU4 是一个基于 Node.js / Express 的文档站与后台管理应用，不是纯静态站。当前代码包含前台文档站、后台管理、SQLite 单库存储、SEO、AI 接入、SQLite 备份恢复和升级制品构建。

## 运行要求

- Node.js 20+
- `npm`

## 快速启动

```bash
cd ebu4-site
npm install
node --test server/test
REDIS_URL=disabled npm start
```

如果本地没有保存外部 Redis 配置，也可以直接执行 `npm start`。

默认地址：

- 前台首页：`http://localhost:3000`
- 文档中心：`http://localhost:3000/docs`
- 后台登录：`http://localhost:3000/admin/login`
- 后台控制台：`http://localhost:3000/admin`

## 当前能力

### 前台

- 多主文档与章节浏览
- 扩展页与基础权限级别控制
- 文档全文搜索
- 注册 / 邀请码
- SEO 输出：title、description、canonical、OG、Twitter、JSON-LD
- 前台公共 AI 助手入口

### 后台

- 数据看板、文档管理、工具导航、门户首页、站点设置
- AI 接入：Provider、公共助手、联网搜索、连通性测试
- SEO：配置、sitemap 生成、主动推送日志
- 系统升级：检查、应用、构建 `public/upgrade/*`
- SQLite 备份恢复
- 用户、角色、审计、Redis、菜单显示
- 周报助手：抓取、生成、历史、导出、批量删除

## 当前交付边界

以下部分已具备代码实现和基础测试：

- AI 配置脱敏、输入校验、公共对话接口
- SEO 配置规范化、sitemap 生成、主动推送入口
- 升级配置校验、制品构建、升级检查 / 应用入口
- SQLite 备份创建、列表、恢复入口

以下部分默认按“已集成、待联调”看待，不应在未联调环境下直接宣称完成：

- 外部 AI Provider 连通性
- 搜索引擎主动推送到 Google / Bing / 百度
- 远程升级链路
- WebAuthn

## 存储

默认使用 SQLite：`data/site.db`

主要数据类型：

- 主文档与章节
- 扩展页
- 站点设置 / SEO / AI / 角色等 KV 配置
- 后台用户与通行密钥
- SEO 推送日志
- 个人周报历史

兼容文件模式：

- `SITE_STORAGE=file`
- `EXTRA_PAGES_USE_JSON=1`

## 关键目录

- `server/`：服务端路由、存储、升级、SEO、AI、后台逻辑
- `public/`：前端页面、脚本、样式、升级制品目录
- `server/test/`：`node:test` 测试
- `data/`：SQLite、备份和运行数据
- `logs/`：审计与运行日志

## 常用命令

```bash
npm start
npm run dev
npm test
npm run export-docs-bundle
```

## 发布前最小检查

1. `node --test server/test`
2. `REDIS_URL=disabled npm start`
3. 手工检查：首页、文档页、后台登录、AI、SEO、升级、备份恢复

更完整的上线清单见 [`../docs/RELEASE-CHECKLIST.md`](../docs/RELEASE-CHECKLIST.md)。
