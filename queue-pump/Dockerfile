FROM node:22-alpine

WORKDIR /app

# Only copy the tiny pump worker (no npm install needed).
COPY queue-pump/worker.mjs ./worker.mjs

ENV NODE_ENV=production

CMD ["node", "worker.mjs"]


