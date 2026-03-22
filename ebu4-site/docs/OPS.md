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
