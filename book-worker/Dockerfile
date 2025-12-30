FROM node:20-bookworm-slim

WORKDIR /app

# Note: PrinceXML is REQUIRED at runtime.
# This Dockerfile intentionally does NOT bundle Prince, because licensing varies.
# Provide Prince via a derived image or mount PRINCE_PATH inside the container.

# Required for assets.zip extraction in Linux containers
RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip \
  && rm -rf /var/lib/apt/lists/*

COPY book-worker/ ./book-worker/

ENV NODE_ENV=production

CMD ["node", "./book-worker/worker.mjs"]


