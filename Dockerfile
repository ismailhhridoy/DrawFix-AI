FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ---- runtime ----
FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src/engine ./src/engine
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/tsconfig.json ./tsconfig.json

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

RUN npm install -g tsx

CMD ["tsx", "server.ts"]
