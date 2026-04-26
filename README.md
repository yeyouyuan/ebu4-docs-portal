# ebu7-complete

仓库根目录主要负责包装、文档和制品；实际运行的站点在 [`ebu4-site/`](./ebu4-site/)。

## 目录

- `ebu4-site/`：Node.js 应用本体，包含前台、后台、API、SQLite 存储
- `ebu4-docs.md` / `ebu4-docs-img/`：默认主文档源和图片资源
- `docs/`：部署、制品和上线检查文档
- `scripts/`：CI 与生产打包脚本
- `dist/`：已生成的打包产物

## 当前状态

当前实现已经覆盖以下主链路：

- 前台文档站：主文档、扩展页、搜索、基础 SEO
- 后台管理：文档、门户、站点设置、AI、SEO、升级、用户、角色、Redis、审计
- SQLite 单库存储：文档、站点配置、后台账号、SEO 推送日志、周报历史
- 运维能力：SQLite 备份恢复、升级制品生成、远程升级检查/应用

以下能力已集成，但仍应按实际环境联调验收：

- AI 多 Provider 接入与前台公共助手
- 搜索引擎主动推送
- 远程升级制品分发与系统覆盖升级
- WebAuthn 通行密钥

## 快速启动

```bash
npm install --prefix ebu4-site
REDIS_URL=disabled npm start
```

常用地址：

- 前台首页：`http://localhost:3000`
- 文档中心：`http://localhost:3000/docs`
- 后台登录：`http://localhost:3000/admin/login`

## 常用命令

```bash
npm start
npm --prefix ebu4-site test
npm run pack:prod
npm run ci
```

## 相关文档

- 应用说明：[`ebu4-site/README.md`](./ebu4-site/README.md)
- 部署制品：[`docs/DEPLOY-ARTIFACT.md`](./docs/DEPLOY-ARTIFACT.md)
- 上线检查：[`docs/RELEASE-CHECKLIST.md`](./docs/RELEASE-CHECKLIST.md)
- 环境变量模板：[`ebu4-site/.env.example`](./ebu4-site/.env.example)
