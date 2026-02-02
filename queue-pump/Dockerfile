FROM node:22-alpine AS build

WORKDIR /app/queue-pump

COPY queue-pump/package.json queue-pump/package-lock.json ./
RUN npm ci

COPY queue-pump/tsconfig.json ./
COPY queue-pump/src ./src

RUN npm run build && npm prune --omit=dev

FROM node:22-alpine

WORKDIR /app/queue-pump

COPY --from=build /app/queue-pump/package.json /app/queue-pump/package-lock.json ./
COPY --from=build /app/queue-pump/node_modules ./node_modules
COPY --from=build /app/queue-pump/dist ./dist

ENV NODE_ENV=production

CMD ["node", "dist/runner.js"]


