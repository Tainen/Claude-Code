# Railway / Fly.io / 自前サーバーなど、Docker が使えるサービス向け。
# データベース (SQLite) は /data に置くので、/data をボリュームとして永続化すること。
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV DB_PATH=/data/voco.sqlite
ENV PORT=3000

EXPOSE 3000
CMD ["node", "src/server.js"]
