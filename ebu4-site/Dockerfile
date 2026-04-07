# 在镜像内安装依赖，确保 better-sqlite3 与当前 Node/OS 架构匹配。
# 构建：docker build -t ebu4-docs .
# 运行：docker run -p 3000:3000 -v ./data:/app/data ebu4-docs
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
