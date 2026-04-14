# 站点设置企业化改造（MVP）

本文用于指导 `站点设置` 面板从“即时生效配置页”升级为“企业可控发布系统”。

## 1. 目标与范围

MVP 目标：

- 配置修改不再直接生效，支持草稿与发布。
- 支持历史版本、差异查看、回滚。
- 高风险配置具备二次确认与审计。
- 保存/发布前具备基本校验与健康检查。

本期仅覆盖 `site_settings`（不含 landing/tools/seo 全量配置）。

## 2. 功能清单（MVP）

### 2.1 草稿与发布

- `草稿保存`：仅更新草稿，不影响线上。
- `发布生效`：将草稿复制为“当前生效版本”。
- `发布确认`：高风险字段变更时弹窗确认。

高风险字段（MVP）：

- `homepage.enabled`
- `maintenance.enabled`
- `maintenance.fullSite`
- `embed.aiChatHtml`

### 2.2 版本历史与回滚

- 展示最近 N 条发布记录（时间、操作者、摘要）。
- 查看任意版本的配置详情。
- 一键回滚到某个版本（回滚后生成新版本，不覆盖历史）。

### 2.3 校验与检查

发布前进行：

- 字段校验（必填、长度、枚举、URL 合法性）。
- 风险校验（如 `fullSite=true` 时提示影响范围）。
- 健康检查（发布后立即探测）：
  - `/api/health`
  - `/docs`
  - `/`（根据 `homepage.enabled` 预期结果校验）

### 2.4 审计

- 每次草稿保存、发布、回滚均记录审计日志。
- 审计包含：
  - 操作者
  - 动作类型
  - 版本号
  - 差异摘要（字段名列表）

## 3. 数据模型设计

## 3.1 site_settings_drafts（草稿）

建议存储到 SQLite 新表（避免继续只靠单 KV 字段）：

- `id` INTEGER PK
- `scope` TEXT NOT NULL DEFAULT 'default'
- `content_json` TEXT NOT NULL
- `updated_by_user_id` INTEGER NULL
- `updated_by_username` TEXT NULL
- `updated_at` TEXT NOT NULL (ISO)

约束：

- `scope` 唯一（MVP 单站点可只保留 `default` 一条）

## 3.2 site_settings_releases（发布版本）

- `id` INTEGER PK
- `scope` TEXT NOT NULL DEFAULT 'default'
- `version_no` INTEGER NOT NULL
- `content_json` TEXT NOT NULL
- `summary` TEXT NULL
- `risk_flags_json` TEXT NULL
- `created_by_user_id` INTEGER NULL
- `created_by_username` TEXT NULL
- `created_at` TEXT NOT NULL (ISO)

索引建议：

- `idx_site_settings_releases_scope_version` (`scope`, `version_no` DESC)
- `idx_site_settings_releases_scope_created_at` (`scope`, `created_at` DESC)

## 3.3 兼容现有 site_settings KV

发布成功后：

- 仍同步写入现有 `site_settings` KV（保持运行时读取逻辑不变，降低改动风险）。

后续可再逐步把运行时读取改为“优先发布表，KV 作为兜底”。

## 4. API 草案（/api/admin/site-settings/*）

### 4.1 草稿

- `GET /api/admin/site-settings/draft`
  - 返回当前草稿（不存在则返回当前生效配置快照）。
- `PUT /api/admin/site-settings/draft`
  - body: `{ content: {...} }`
  - 行为：保存草稿并返回校验结果。

### 4.2 发布

- `POST /api/admin/site-settings/publish`
  - body:
    - `summary?: string`
    - `confirmRisk?: boolean`
  - 行为：
    - 校验草稿
    - 识别风险项
    - 未确认风险时返回 `409` + `riskFlags`
    - 确认后发布，写 release + 同步 KV + 返回版本号

### 4.3 历史

- `GET /api/admin/site-settings/releases?limit=20&cursor=...`
  - 返回发布历史列表（含 `nextCursor`）。
- `GET /api/admin/site-settings/releases/:id`
  - 返回指定版本详情。

### 4.4 回滚

- `POST /api/admin/site-settings/releases/:id/rollback`
  - 行为：读取旧版本内容，生成一条新发布版本并生效。

### 4.5 校验与探活

- `POST /api/admin/site-settings/validate`
  - body: `{ content: {...} }`
  - 返回字段错误与警告。
- `POST /api/admin/site-settings/health-check`
  - body: `{ content?: {...} }`（可选，不传则检查当前生效配置）
  - 返回关键路径健康结果。

## 5. 前端 UI 结构草案（站点设置面板）

新增四块区域：

- `当前状态`
  - 当前生效版本号、发布时间、发布人。
- `草稿编辑`
  - 现有配置表单（保持你当前布局）。
  - 按钮：保存草稿、校验、发布。
- `发布历史`
  - 列表 + 详情抽屉 + 回滚按钮。
- `发布结果`
  - 发布后健康检查结果（成功/失败路径）。

按钮文案建议：

- `保存草稿`
- `发布生效`
- `查看差异`
- `回滚到此版本`

## 6. 权限矩阵（MVP）

- `admin`
  - 草稿编辑 / 发布 / 回滚 / 查看历史 全部允许。
- `editor`
  - 草稿编辑允许；
  - 发布与回滚默认禁止（后续可按能力开关放开）。

可复用现有角色能力模型增加开关：

- `siteSettingsPublish`
- `siteSettingsRollback`
- `siteSettingsHistoryView`

## 7. 实施顺序（建议）

第 1 步（后端能力）：

- 新增表结构与 repository 方法。
- 新增草稿/发布/历史/回滚 API。
- 加入校验与风险标记逻辑。

第 2 步（前端接入）：

- 站点设置面板加入“草稿/发布/历史”操作。
- 对接风险确认弹窗与结果提示。

第 3 步（可靠性）：

- 发布后自动健康检查。
- 审计详情补充字段 diff。

## 8. 验收标准

- 修改配置后，不发布时线上行为不变。
- 发布后 `/api/admin/site-settings` 与运行时行为一致。
- 能查看历史版本并成功回滚。
- 审计中能看到草稿保存、发布、回滚记录。