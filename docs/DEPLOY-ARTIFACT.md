# 部署包（CI 产物）说明

CI 生成的 `ebu4-site-prod-*.tar.gz` 为 **`ebu4-site/` 目录的完整快照**，已包含：

- 生产依赖：`npm ci --omit=dev` 后的 `node_modules/`
- 源码与静态资源：`server/`、`public/` 等
- **不包含**：单元测试目录 `server/test`、本地 SQLite 数据文件、日志目录内容

## 运行期三类产物

部署与升级时需要分清三类文件：

1. **站点运行目录**
   也就是解压后的 `ebu4-site/` 本体，包含 `server/`、`public/`、`node_modules/`。
2. **SQLite 数据与备份目录**
   默认在 `data/` 下，核心文件是 `data/site.db`，备份文件命名为 `site.db.bak-时间戳`。
3. **升级制品目录**
   位于 `public/upgrade/`，当前包括：
   - `docs-bundle.json`
   - `system-artifact.tar.gz`
   - `manifest.json`

## 运行环境

- 构建机为 **GitHub Actions `ubuntu-latest`（Linux x64）**，与常见云主机 ABI 一致；若目标为 **Alpine（musl）** 或 **ARM**，请在该环境重新执行 `npm ci --omit=dev` 或自行打镜像，勿直接混用本 tar 包内的原生模块。

## Gitee 流水线：`Could not find any Python` / node-gyp / Node 18

1. **优先使用 Node 20**：`ebu4-site` 依赖的 `better-sqlite3@12.x` 对 **Node 18 不提供**官方预编译包（日志里会出现 `No prebuilt binaries found (target=18.x)`），会退回到 **node-gyp 源码编译**，既慢又依赖 Python。请在 Gitee **Nodejs 构建**任务中选择 **Node 20**（与 `ebu4-site/.nvmrc` 一致），YAML 里 `nodeVersion: '20'` 若被忽略，需在**可视化界面**里改版本。

2. **Python / 编译器**：若仍走编译路径，`scripts/package-prod.sh` 会通过 **`scripts/lib-ci-env.sh`** 在 root + apt 环境下自动 `apt-get install python3 make g++`。亦可单独执行：

```bash
bash scripts/ensure-node-gyp-deps.sh
```

3. **`getcwd() failed`**：多为工作目录异常；脚本已先 `cd` 到仓库根再执行命令。

## 解压后

1. 复制并编辑 `.env`（参考 `.env.example`）。
2. 启动：`node server/index.js` 或使用 PM2 / systemd。
3. 若本地或测试环境不希望连接已保存的 Redis，使用 `REDIS_URL=disabled node server/index.js`。

## 运维注意事项

- 生产环境必须设置 `ADMIN_PASSWORD`。
- 若开启严格生产模式（`NODE_ENV=production` 或 `EBU4_STRICT_PRODUCTION=1`），弱口令或默认口令会直接阻止启动。
- 执行 SQLite 恢复前，后台会自动再备份当前库；恢复后需要确认文档重载正常。
- 系统升级失败时应优先保留 `data/` 和 `logs/`，只回滚站点运行目录。

更完整的上线检查请看 [`RELEASE-CHECKLIST.md`](./RELEASE-CHECKLIST.md)。
