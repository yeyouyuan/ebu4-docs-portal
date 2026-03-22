# 项目根目录

本目录 **`ebu7-complete`** 为 **Git 仓库根**（已包含 `ebu4-site/`、`ebu4-docs.md`、配图与 `.github/workflows`）。日常在根目录执行 `git add` / `git commit` / `git push` 即可推送整包。

网站与 Node 服务在 **`ebu4-site/`** 子目录（`package.json`、`npm start` 均在此）。

在**本目录**也可启动：

```bash
npm install   # 若尚未在 ebu4-site 安装依赖，请先：cd ebu4-site && npm install
npm start
```

上述命令会转发到 `ebu4-site` 的 `npm start`。

环境变量与 API 说明见 [`ebu4-site/README.md`](ebu4-site/README.md) 与 [`ebu4-site/.env.example`](ebu4-site/.env.example)。

## 持续集成（CI）

- **GitHub**：`.github/workflows/ci.yml` 仅在代码托管在 **GitHub** 时由 GitHub Actions 执行（`push` / `PR` 至 `main` / `master`，亦可在 Actions 里 **Run workflow** 手动触发）。任务等价于在 `ebu4-site/` 下执行 `npm ci && npm test`。
- **仅使用 Gitee**：不会运行上述 GitHub Actions（Gitee 与 GitHub 为不同平台）。可在本机或 Gitee 企业版流水线中执行与 CI 相同命令，或直接运行仓库根目录脚本：

```bash
bash scripts/ci.sh
```

# 泛微 Ecology E9 二次开发技术支持网站

基于 Ecology E9 二次开发文档构建的在线技术支持网站。

## 功能

- 📚 11 章节文档浏览，支持章节导航和页面目录（TOC）
- 🔍 全文搜索（Ctrl+K 快捷键）
- 💻 代码语法高亮（Java、JavaScript、XML、JSON、Bash）
- 🖼️ 文档配图在线查看
- 📱 响应式设计，支持移动端
- ⬅️➡️ 上一章/下一章翻页导航

## 快速启动

```bash
cd ebu4-site
npm install
npm test          # 可选：运行单元测试
node server/index.js
```

- **门户首页**：http://localhost:3000/ 或 http://localhost:3000/index（靛蓝金风格落地页）
- **文档中心**：http://localhost:3000/docs（`#/home` 为文档内欢迎页）
- **后台登录**：http://localhost:3000/admin/login（**请优先用此地址**；含用户名与密码表单）。未带会话 Cookie 时访问 `/admin` 会 **302 重定向** 到登录页，避免浏览器沿用旧缓存里的「单密码」页面。
- 若仍看到旧版「仅填 ADMIN_PASSWORD」界面：对当前站点 **强制刷新**（Chrome：`⌘⇧R` / `Ctrl+Shift+R`）或清除本站缓存后再打开 `/admin/login`。
- 后台左侧菜单顺序由 **`GET/PUT /api/admin/menu-order`** 持久化（SQLite：`site_kv.admin_menu_order`；文件模式：`public/data/admin-menu-order.json`）。**所有登录用户**加载同一顺序；**仅管理员**可在侧栏拖动保存或恢复默认。另有侧栏 **「菜单显示」** 面板，可用 **拖动列表行**、上移/下移与「保存到服务器」调整顺序（拖动后由管理员自动同步到服务器）。

## 企业级存储（默认 SQLite 单库）

默认将所有可结构化内容写入 **一个 SQLite 文件**（`better-sqlite3`），便于备份与迁移。

| 表 / 键 | 内容 |
|---------|------|
| `main_document` | 主文档完整 Markdown（原 `ebu4-docs.md`） |
| `site_kv` 键 `tools_nav` | 工具导航大 JSON（原 `public/data/tools-nav.json`） |
| `site_kv` 键 `landing` | 门户落地配置（原 `landing.json`） |
| `site_kv` 键 `seo` | SEO 与 robots/sitemap 配置（原 `seo.json`） |
| `site_kv` 键 `site_settings` | 站点开关（维护模式、**注册形式** `registration.mode`：`invitation` / `open`、可选 **`redis`** 连接，后台「站点设置」/「Redis」） |
| `site_kv` 键 `role_profiles` | **角色配置总表**（各角色显示名、模块权限、数据范围、安全等级与说明；可新增自定义角色；文件模式 `data/role-profiles.json`） |
| `site_kv` 键 `editor_module_access` 等 | 旧版独立键；首次读取 `role_profiles` 时若无数据，会从这些键 **一次性迁移** 进 `editor` 角色配置 |
| `site_kv` 键 `public_visit_stats` | 前台页面浏览 PV（JSON；文件模式见 `public/data/visit-stats.json`） |
| `admin_users` | 后台账号（用户名、密码哈希、**角色标识** `role` 为任意已配置角色 id，如 `admin` / `editor` / 自定义；禁用标记） |
| `extra_pages` | 扩展页（原 `extra-pages.json`） |

- **库文件路径**：默认 `ebu4-site/data/site.db`，可用 **`SITE_SQLITE_PATH`** 或旧版 **`SQLITE_PATH`** 覆盖。
- **Redis（可选，多实例建议）**：**`REDIS_URL` 环境变量优先**；未设置时可在后台 **「Redis」** 将地址写入 **`site_settings.redis`**。在线用户心跳据此连接 **Redis**；**连接成功时**，公开 **`/api/sections`、`/api/pages`、`/api/search`** 与 **`/data/*.json`** 可对 JSON 做 **Redis 缓存**（响应头 **`X-EBU4-Cache: hit|miss`**，后台 Redis 页可看命中统计）。未连接 Redis 时回退**进程内内存**且不写入缓存。若希望「无可用 Redis 则拒绝启动」，设置 **`REQUIRE_REDIS=1`**（或 **`EBU4_REQUIRE_REDIS=1`**）并确保环境变量或站点配置中已有可连接地址。详见 **`docs/OPS.md`**。
- **生产环境**：`NODE_ENV=production` 或 **`EBU4_STRICT_PRODUCTION=1`** 时，必须设置 **`ADMIN_PASSWORD`**（≥8 字符且不得为默认 `ebu4-admin-dev`），否则进程**拒绝启动**。

### 前台访客会话与安全等级

- 首次访问公开 API（如 `/api/sections`）时，服务端会下发 **`site_session`** Cookie，默认角色为 **guest**，clearance 为 **guest**，可阅读安全等级为 **public**、**guest** 的主文档章节与扩展页。
- 主文档章节可在正文开头使用 HTML 注释声明等级，例如：`<!-- ebu4-security: internal -->`（等级含 `public` / `guest` / `internal` / `important` / `core` / `restricted`）。保存后该标记会从正文中剥离，仅用于权限判断。
- 扩展页在后台可设置 **安全等级（前台）**，与上述等级体系一致。
- **邀请注册 / 自主注册**：站点设置中 `registration.mode` 为 **`invitation`**（默认）时须校验并消耗邀请码；为 **`open`** 时可无码自助注册（仍可填写邀请码以绑定码上默认角色）。具备「邀请注册」权限的账号可在**数据看板**生成邀请码，并**复制邀请链接**（`/register?invite=码`）。公开注册页：**`/register`**。

### 管理 API（节选）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/site/session` | 当前前台访客会话（role、clearance、**registrationMode**） |
| POST | `/api/register` | 注册（行为随 `registration.mode` 变化） |
| POST | `/api/admin/presence/kick` | 管理员下线指定后台会话（body: `sessionToken`） |
| GET/POST/DELETE | `/api/admin/invites` | 邀请码列表、创建、删除（需邀请注册权限） |
- **首次启动**：若库为空，会从上述 **文件** 自动导入（一次性）；之后以数据库为准。
- **旧库迁移**：若存在 `data/extra-pages.db` 且尚无 `site.db`，会 **复制** 为 `site.db` 再补建新表。
- **退回纯文件**：设置 **`SITE_STORAGE=file`** 或 **`EXTRA_PAGES_USE_JSON=1`**（与旧行为一致，扩展页也可用仅 JSON）。

前台仍请求 `/data/landing.json`、`/data/tools-nav.json`、`/data/seo.json` 时，在 SQLite 模式下由 **服务端从库中输出**，无需改前端脚本。

## 项目结构（节选）

```
ebu4-site/
├── server/
│   ├── index.js
│   ├── site-database.js    # 单库初始化、KV、主文档、扩展页表
│   ├── extra-pages-repo.js
│   └── ...
├── data/
│   └── site.db             # 默认 SQLite（勿提交，见 .gitignore）
├── public/
│   └── data/               # 文件模式或作为首次导入源
└── ...
```

## API

| 端点 | 说明 |
|------|------|
| `GET /api/sections` | 获取所有章节元数据 |
| `GET /api/sections/:id` | 获取指定章节完整内容 |
| `GET /api/search?q=关键词` | 全文搜索：主文档章节 + **已发布扩展页**；见下表 |
| `GET /sitemap.xml` | 合并 `seo.sitemapPaths` 与（默认）各扩展页 `/page/{slug}` |
| `GET /img/:filename` | 图片资源 |
| `GET /api/pages` | 已发布扩展页列表 |
| `GET /api/health` | 健康检查（含 `siteStorage`、`sqlite`、`maintenance`、**`redis`** 连接状态等） |

### 搜索与 SEO 字段（`seo.json` / `site_kv.seo`）

| 字段 | 说明 |
|------|------|
| `includeExtraPagesInSearch` | 默认 `true`。为 `false` 时 `/api/search` 仅搜主文档章节 |
| `includeExtraPagesInSitemap` | 默认 `true`。为 `false` 时 `/sitemap.xml` 不自动追加扩展页 URL |
| `sitemapPaths` | 站点固定路径列表；扩展页路径在开关为真时 **追加** 到列表后 |

`GET /api/search` 返回项含 `kind`：`section`（章节，带 `id`）或 `page`（扩展页，带 `slug`）。文档站搜索 UI 会跳转 `/page/{slug}`。

### 管理 API（节选，均需登录）

| 端点 | 说明 |
|------|------|
| `GET/PUT /api/admin/tools-nav` | 工具导航结构化读写（保留 `favicon_map`） |
| `GET/PUT /api/admin/site-settings` | 站点设置（如维护模式），存 `site_kv.site_settings` 或 `public/data/site-settings.json` |
| `GET /api/admin/audit-log?limit=` | 审计日志尾部（默认 100，最大 500） |
| `GET /api/admin/session` | 当前登录用户信息 |
| `GET/POST/PUT/DELETE /api/admin/users` | 用户列表与 CRUD（**仅管理员**）；`SITE_STORAGE=file` 时账号在 `data/admin-users.json` |
| `GET /api/admin/menu-order` | 后台侧栏菜单顺序（`order` 为 tab id 数组；未配置时为 `null`） |
| `PUT /api/admin/menu-order` | 保存菜单顺序（**仅管理员**），body：`{ "order": ["dash","md","tools",…] }` |
| `GET /api/admin/dashboard` | 数据看板：前台 PV、路径 TOP、近 14 日按天、主文档章节数 |
| `GET/PUT/POST/DELETE /api/admin/role-profiles` | 角色配置：GET 全量；PUT body `{ role, label?, moduleAccess?, dataViews?, securityLevel?, securityNote? }`；POST 新增 `{ roleId, label? }`；DELETE `/:roleId`（**仅管理员**） |
| `GET/PUT /api/admin/editor-module-access` | 兼容旧客户端，等价于对 **`editor`** 角色的 `moduleAccess` |
| `GET/PUT /api/admin/role-data-view` | 兼容旧客户端，等价于对 **`editor`** 角色的 `dataViews` |
| `GET/PUT /api/admin/role-security-doc` | 兼容旧客户端，等价于 **`editor`** 的 `securityNote` |

**后台账号**：首次启动且尚无用户时，用环境变量 **`ADMIN_PASSWORD`**（≥4 字符）自动创建用户 **`admin`**（角色 `admin`）。登录支持「用户名 + 密码」；仅填密码且等于 `ADMIN_PASSWORD` 时兼容旧版单密码登录。管理员（会话角色为 `admin`）可管理用户、配置**所有角色**的权限与说明、**新增/删除**自定义角色；其他角色按 `role_profiles` 中的模块与数据范围生效。

**通行密钥（WebAuthn）**：SQLite 表 **`admin_passkeys`** 存储与用户绑定的凭证；管理员在 **用户管理** 中可为各账号注册/删除通行密钥。登录页 **「通行密钥」** 模式输入用户名后使用本机已注册的密钥登录。生产环境建议在 `.env` 中设置 **`WEBAUTHN_RP_ID`**（站点域名，不含端口）与 **`WEBAUTHN_ORIGIN`**（完整来源，如 `https://docs.example.com`）；开发时请用 **`http://localhost:端口`** 访问以便 `rpId` 与浏览器一致。`WEBAUTHN_DISABLED=1` 可关闭相关 API。

多副本部署时**管理登录会话仍在各进程内存**（需网关会话粘滞或单入口）；**在线用户列表**可借助 Redis 与 `REDIS_URL` 一致化。详见 **`docs/OPS.md`**。审计文件为单机路径；详见上文「安全与审计」。

### 维护模式（`site_settings.maintenance`）

| 字段 | 说明 |
|------|------|
| `enabled` | 是否开启维护 |
| `fullSite` | 为 `true` 时：文档站 `/docs`、`/data/*`、`/api/sections` 等也会进入维护（API 返回 JSON 503；页面 **302 → `/maintenance`**）。**默认不勾选**：仅门户 `/`、`/index` 跳转到维护页 |
| `message` | 维护提示文案（展示在 `server/views/maintenance.html`，与门户靛蓝/金主题一致） |

访客在维护期内访问被拦截的页面会 **重定向到 `/maintenance`**（503，门户风格独立页，不依赖外链 CSS，全站维护时亦可正常显示）。管理后台与 `/api/health` 不受影响。

## 技术栈

- **后端**：Node.js + Express
- **存储**：SQLite（`better-sqlite3`）或文件回退
- **前端**：原生 JS + marked.js + highlight.js
- **部署**：单进程；备份 **`data/site.db`** 即可带走主文档、配置与扩展页（图片目录仍见 `ebu4-docs-img`）

## 安全与审计（管理后台）

| 机制 | 说明 |
|------|------|
| **会话 Cookie** | `HttpOnly`、`SameSite=Lax`；HTTPS 下加 `Secure`（依赖 `TRUST_PROXY` / `X-Forwarded-Proto` 或 `FORCE_SECURE_COOKIE`） |
| **登录防爆破** | `ADMIN_LOGIN_WINDOW_MS`（默认 15 分钟）、`ADMIN_LOGIN_MAX_FAILS`（默认 15 次/窗口） |
| **管理 API 限流** | `ADMIN_API_RATE_WINDOW_MS`（默认 60s）、`ADMIN_API_RATE_MAX`（默认每 IP 每窗口 240 次）；**不**限制 `POST /api/admin/login` |
| **请求关联** | 全站设置响应头 `X-Request-ID`；可传入符合 `[a-zA-Z0-9._-]{8,128}` 的 `X-Request-ID` 以便与网关日志对齐 |
| **安全响应头** | `/admin`、`/api/admin` 下附加 `X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy` |
| **审计日志** | JSON Lines，默认 `ebu4-site/logs/admin-audit.jsonl`；`AUDIT_LOG_PATH` 自定义；`AUDIT_LOG_ENABLED=0` 关闭。记录登录/登出、写文件、章节变更、图片上传/删除、扩展页增删改等，**不**记录密码或正文 |
| **角色与可配置模块** | 会话 **`role === 'admin'`** 的账号：用户管理、**角色管理**（`role_profiles`：各角色模块权限、数据范围、安全说明；可新增角色）、侧栏菜单顺序。任意登录角色：**系统类**（站点 / SEO / 审计）由 `capabilities` 控制；**内容数据类**由 `dataViews` 控制；`GET /api/admin/session` 另返回 `roleMeta`（显示名、安全等级、说明） |

生产环境请务必设置 **`ADMIN_PASSWORD`**（勿使用默认密码）。

### 应用结构（服务层）

| 路径 | 说明 |
|------|------|
| `server/lib/backup.js` | 文件备份与轮转（仅文件模式写盘时） |
| `server/site-database.js` | SQLite 单库：主文档、KV、扩展页 |
| `server/services/doc-admin-service.js` | 主文档章节级读写 |
| `server/services/extra-pages-admin-service.js` | 扩展页领域逻辑 |
| `server/logger.js` | 单行 JSON 日志（`LOG_JSON=0` 可改为纯文本） |

### 可观测性

| 环境变量 | 说明 |
|----------|------|
| `LOG_ADMIN_ACCESS=1` | 对 `/api/admin` 除 GET/HEAD/OPTIONS 外的请求，在响应结束后输出一行 JSON（含 `method`、`path`、`status`、`ms`、`requestId`），与审计文件互补 |

### 环境变量（节选）

| 变量 | 说明 |
|------|------|
| `SITE_SQLITE_PATH` | SQLite 文件绝对或相对路径 |
| `SITE_STORAGE=file` | 禁用单库，全部回退为 Markdown + `public/data/*.json` |
| `REDIS_URL` | 可选；后台在线心跳使用 Redis，见上文与 **`docs/OPS.md`** |
| `REQUIRE_REDIS` / `EBU4_REQUIRE_REDIS` | 设为 `1` 时必须可连接 `REDIS_URL`，否则启动失败 |
| `EBU4_STRICT_PRODUCTION` | 设为 `1` 时与生产模式相同，强制校验 `ADMIN_PASSWORD` |

复制 `.env.example` 为 `.env` 按需填写（`.env` 已加入 `.gitignore`）。**部署与多实例说明见 `docs/OPS.md`。**
