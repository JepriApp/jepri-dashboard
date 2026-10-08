# Imagen de staging para jepri-dashboard. Pensada para correr en un servidor propio
# detrás de un reverse proxy con HTTPS ya existente (Tarea 3 de tasks/todo.md) — Vercel
# sigue siendo el despliegue de producción y no usa este archivo.
#
# Build:
#   docker build \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=http://10.85.96.51:8000 \
#     --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key del self-hosted> \
#     -t jepri-dashboard:staging .
#
# Las variables NEXT_PUBLIC_* se inyectan en el bundle de cliente en build-time (Next.js
# las inlinea), no en runtime — por eso van como --build-arg y no solo en el .env del
# contenedor. El resto de variables (TELEGRAM_*, SIIGO_*, etc.) sí son runtime, van en
# docker-compose.yml vía env_file.

FROM node:24-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@latest --activate \
    && pnpm install --frozen-lockfile

FROM base AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# Habilita las imágenes del storage self-hosted en este build de producción (next.config.ts)
ENV ALLOW_SELF_HOSTED_SUPABASE_IMAGES=true

RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
