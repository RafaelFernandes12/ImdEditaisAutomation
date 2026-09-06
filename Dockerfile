# syntax=docker/dockerfile:1

########################
# Stage 1 — build
########################
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Puppeteer/whatsapp-web.js use the Chromium installed in the runtime stage,
# so there is no need to download the bundled browser here.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY tsconfig*.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# `prisma-client` generator writes to ./generated/prisma, which src imports.
RUN yarn prisma generate && yarn build

########################
# Stage 2 — runtime
########################
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Chromium + the fonts/libs whatsapp-web.js needs to render WhatsApp Web.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Everything is owned by `node`: the Prisma CLI refuses to run when it cannot
# write to node_modules/@prisma/engines.
# node_modules is copied whole (not --production) because the Prisma CLI is a
# devDependency and the entrypoint runs `prisma migrate deploy`.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/generated ./generated
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json prisma.config.ts ./

# whatsapp-web.js LocalAuth writes its session here (mounted as a volume).
RUN mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache \
    && chown -R node:node /app /app/.wwebjs_auth /app/.wwebjs_cache

USER node

EXPOSE 7638

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
