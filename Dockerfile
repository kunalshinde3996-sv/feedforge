# FeedForge — one service: Express API + built React dashboard.

# ---- build: install all deps, build web (Vite) + server (tsc) ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY server server
COPY web web
RUN npm run build

# ---- runtime: server prod deps + compiled output only ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=./data
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace=server --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
RUN mkdir -p data && chown -R node:node data
USER node
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
