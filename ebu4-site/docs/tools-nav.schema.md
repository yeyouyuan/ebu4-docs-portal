# tools-nav.json 结构说明

门户 [`landing.html`](../public/landing.html) 通过 `GET /data/tools-nav.json` 读取。

## 顶层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `site` | object | 站点名、域名、备案等展示信息 |
| `categories` | string[] | 分类标签顺序；未列出的分类会排在后面 |
| `items` | array | 工具条目 |
| `favicon_map` | object | 可选：`域名 → data:image/... base64`，体积可能很大 |

## `items[]` 条目

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 展示名称 |
| `url` | string | 完整链接（含 `https://`） |
| `category` | string | 分类名，缺省为「其他」 |
| `description` | string | 可选，副标题/描述 |
| `domain` | string | 可选，用于匹配 `favicon_map` |
| `favicon_base64` | string | 可选，条目级图标 |

后台「工具导航」结构化保存走 `PUT /api/admin/tools-nav`，会保留已有 `favicon_map`。
