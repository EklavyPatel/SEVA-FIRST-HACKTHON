# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS client
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src ./src
COPY shared ./shared
COPY public ./public
RUN npm run build

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIRECTORY=/app/data
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=dependencies /app/server/node_modules ./server/node_modules
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node src/lib/i18n.js ./src/lib/i18n.js
COPY --chown=node:node scripts/check-research.mjs scripts/reconcile-photos.mjs ./scripts/
COPY --chown=node:node --from=client /app/dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=15s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/ready',{signal:AbortSignal.timeout(13000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
