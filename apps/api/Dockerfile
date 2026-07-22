FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api apps/api
RUN npm run build --workspace @anitabia/api \
  && cp apps/api/src/database/schema.sql apps/api/dist/database/schema.sql

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist

EXPOSE 4000

CMD ["sh", "-c", "node apps/api/dist/database/migrate.js && node apps/api/dist/database/seed.js && node apps/api/dist/server.js"]
