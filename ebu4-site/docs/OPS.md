# 运维与部署说明

## 生产环境安全（必做）

1. **设置强密码**  
   - 环境变量 **`ADMIN_PASSWORD`**：至少 **8 字符**，且**不得**为默认开发值 `ebu4-admin-dev`。  
   - 当 **`NODE_ENV=production`** 或 **`EBU4_STRICT_PRODUCTION=1`** 时，若未满足上述条件，**进程将拒绝启动**。

2. **密钥与配置**  
   - 不要将 `.env`、数据库文件、账号 JSON 提交到版本库。  
   - 生产环境通过密钥管理或编排平台注入环境变量。

## Redis（多实例 / 在线用户一致性）

### 当前行为

- **后台管理会话**（登录 Cookie）仍为**进程内存**；多副本时，用户可能落在不同实例上，需会话粘滞（Sticky Session）或使用同域单入口。  
- **后台「在线用户」心跳**已支持 **Redis**：**环境变量 `REDIS_URL` 优先**；未设置时，可在后台侧栏 **「Redis」** 启用并填写连接串，写入 **`site_kv.site_settings`（或文件模式 `public/data/site-settings.json`）** 的 `redis` 字段，保存后进程会**立即按新配置重连**。均未配置时回退为**单进程内存**，各副本互不可见。

### 强制要求连接 Redis

若部署为多副本且希望启动失败于「Redis 不可用」（避免静默回退内存），设置：

```bash
export REQUIRE_REDIS=1
# 或
export EBU4_REQUIRE_REDIS=1
export REDIS_URL=redis://127.0.0.1:6379
```

也可不设置 `REDIS_URL`，仅在后台「Redis」中启用并填写地址；启动时会尝试连接；**无任何可用地址或无法连接则退出**。

### 健康检查

`GET /api/health` 返回字段 **`redis`**（由 `presence-store.getStatus()`）：

- `urlConfigured`：是否配置了可用地址（**`REDIS_URL` 或站点设置中启用且非空 URL**）  
- `connected`：是否已成功连接  
- `source`：`env` | `database` | `none`（有效地址来自环境变量、站点配置或无）  
- `effectiveBackend`：`redis` | `disconnected` | `memory`  
- `listUsesBackend`：在线列表实际使用的后端（Redis 失败时与 `memory` 一致）

另返回 **`cache`**（`redis-cache` 模块）：`hits` / `misses` / `totalRequests` / `hitRate` / `contentEpoch`（主文档或扩展页等变更时递增，用于缓存键失效）。

### HTTP 响应缓存（Redis）

在 **已成功连接 Redis** 时，以下公开接口会对 JSON 结果做短期缓存（TTL 约 1h，搜索约 2min），键随 **`contentEpoch`** 失效：

- `GET /api/sections`、`GET /api/sections/:id`（按访客 `clearance` 分键）  
- `GET /api/pages`、`GET /api/pages/:slug`  
- `GET /api/search?q=…`  
- `GET /data/landing.json`、`/data/tools-nav.json`、`/data/seo.json`

响应头 **`X-EBU4-Cache: hit`** 表示 Redis 命中，**`miss`** 表示回源后写入缓存。未配置 Redis 时不设置该头、且不统计命中。

管理员可在后台 **Redis** 页查看命中统计并重置计数；保存主文档、扩展页、工具/门户/SEO 等会 **递增 `contentEpoch`** 使旧缓存键自然过期。

## 相关环境变量（节选）

| 变量 | 说明 |
|------|------|
| `NODE_ENV` | `production` 时启用生产安全配置（强密码校验） |
| `EBU4_STRICT_PRODUCTION` | 设为 `1` 时与 `NODE_ENV=production` 同样强制 `ADMIN_PASSWORD` |
| `ADMIN_PASSWORD` | 管理员密码种子 / 兼容旧版单密码登录；生产必填且足够长 |
| `REDIS_URL` | 可选；若设置则在线心跳**始终优先**使用该地址 |
| `REQUIRE_REDIS` / `EBU4_REQUIRE_REDIS` | 设为 `1` 时必须存在可用 Redis 地址（环境变量或后台站点配置）并可连接 |

更多见项目根目录 `README.md`。

## 远程升级（去中心化）

- 任意实例可在 **`public/upgrade/manifest.json`** 提供清单（随静态资源发布）；其他实例在后台 **「系统升级」** 填写对等根 URL（`baseUrl`），由**服务端**拉取 manifest 并比对版本。
- **文档指纹**：本机 `docsVersion` 为 SQLite 主文档 + `tools_nav` / `landing` / `seo` 内容的哈希前缀；发布方 manifest 的 `docsVersion` 需与打包内容一致，否则对端会判定有更新。
- **文档制品**：JSON 格式 **`ebu4-docs-bundle-v1`**（字段见实现 `applyDocsBundle`）；应用前自动备份 `data/site.db`。
- **打包本地内容（生成文档制品）**：在 **`ebu4-site`** 目录执行  
  `npm run export-docs-bundle`  
  或 `node scripts/export-docs-bundle.js [输出路径]`（默认写入 `public/upgrade/docs-bundle.json`）。脚本从 **`SITE_SQLITE_PATH`** 或默认 `data/site.db` 读取主文档与 `tools_nav` / `landing` / `seo`，输出制品并打印 **`docsVersion`（指纹）** 与 **`sha256`**，用于填写 `manifest.json` 的 `docsVersion` 与 `components.docs.artifacts[].sha256`。  
  **或在后台「系统升级」** 使用 **「本机一键生成升级清单」**：勾选文档/系统制品后生成并写入 `docs-bundle.json`、`system-artifact.tar.gz` 与 `manifest.json`（与 CLI 等价思路；系统包会排除 `public/upgrade/`，清单与制品仍通过站点静态 URL 提供）。
- **系统制品**：当前仅支持 **`.tar.gz`**，解压后需含顶层 **`server/`**、**`public/`**、**`package.json`**（与部署根目录对齐）。**`public/`** 中应包含 **`js/lazy-images.js`**（全站图片懒加载，各 HTML 已引用）及更新后的 **`sw.js`**（PWA 预缓存列表含该脚本）；打发行包时请与 CI 产物（如 `scripts/package-prod.sh`）目录树一致。应用系统升级时，若制品未带 **`lazy-images.js`**，服务端会尝试用**升级前**的该文件或 **`data/backups/upgrade-system-*/public/`** 备份补全；仍缺失时需手动从仓库拷贝。应用后可设置 **`UPGRADE_RESTART_CMD`**（如 `pm2 restart app`）触发进程替换；未配置时可将 **`UPGRADE_AUTO_EXIT_ON_APPLY=1`** 与 Docker `--restart` / systemd `Restart=` / pm2 等配合，使进程在 API 响应结束后 **`exit(0)`** 并由守护策略自动拉起。后台「应用系统更新」在 **`needs_restart`** 时会**轮询 `/api/health`**（公开接口，无需 Cookie）直至恢复，并在检测区展示 **`appVersion` / 存储状态**。**`UPGRADE_ROLLBACK_CMD`** 为最后手段回退脚本（可选）。
- **自动检测**：`site_settings.upgrade.autoUpdate` 开启后由进程内定时器按间隔执行检测/可选自动应用；生产环境建议 **HTTPS** + 可选 **Bearer** 与受信对等地址。

