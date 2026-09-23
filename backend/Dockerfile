# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npx tsc prisma/seed.ts --outDir dist/prisma --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tini
RUN addgroup -S -g 10001 app && adduser -S -D -h /home/app -u 10001 -G app app
RUN mkdir -p /app/uploads && chown -R app:app /app /home/app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/generated ./generated
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --chown=app:app package.json ./
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3333/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER app
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main/server.js"]
