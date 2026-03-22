# 部署包（CI 产物）说明

CI 生成的 `ebu4-site-prod-*.tar.gz` 为 **`ebu4-site/` 目录的完整快照**，已包含：

- 生产依赖：`npm ci --omit=dev` 后的 `node_modules/`
- 源码与静态资源：`server/`、`public/` 等
- **不包含**：单元测试目录 `server/test`、本地 SQLite 数据文件、日志目录内容

## 运行环境

- 构建机为 **GitHub Actions `ubuntu-latest`（Linux x64）**，与常见云主机 ABI 一致；若目标为 **Alpine（musl）** 或 **ARM**，请在该环境重新执行 `npm ci --omit=dev` 或自行打镜像，勿直接混用本 tar 包内的原生模块。

## Gitee 流水线：`Could not find any Python` / node-gyp

`better-sqlite3` 在无可用预编译包时会调用 **node-gyp** 编译，需要系统中有 **Python3** 以及 **make、g++**。Gitee 部分构建镜像未预装 Python，会在 `npm ci` 阶段报错。

仓库内 **`scripts/ensure-node-gyp-deps.sh`** 会在 `npm ci` 前检测（root 且存在 `apt-get` 时自动 `apt-get install python3 make g++`）。`package-prod.sh` / `ci.sh` 已调用该脚本；若你的流水线**未**经过上述脚本，请在 **`npm ci` 之前**手动执行：

```bash
bash scripts/ensure-node-gyp-deps.sh
```

## 解压后

1. 复制并编辑 `.env`（参考 `.env.example`）。
2. 启动：`node server/index.js` 或使用 PM2 / systemd。
