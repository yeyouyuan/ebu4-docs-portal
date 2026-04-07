# 在镜像内安装依赖，确保 better-sqlite3 与当前 Node/OS 架构匹配。
#
# 构建上下文必须是本目录（含 public/docs.html），勿用仓库根目录：
#   cd ebu4-site && docker build -t ebu4-docs .
#
# 运行示例（仅挂载数据；勿将空目录挂到 /app/public，否则会覆盖镜像内静态页导致 ENOENT）：
#   docker run -p 3000:3000 -v ./data:/app/data ebu4-docs
#
# 不要将宿主机的 node_modules 挂载覆盖 /app/node_modules。

FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server/index.js"]
