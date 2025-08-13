# Root Dockerfile for Cloud Run GitHub continuous deployment
# Builds the ingest service located in backend/ingest

FROM node:20-alpine
WORKDIR /app

# Copy only package files first for layer caching
COPY backend/ingest/package*.json ./
# Using npm install (no lockfile committed yet). For deterministic builds, commit a package-lock.json and switch back to `npm ci`.
RUN npm install --omit=dev

# Copy ingest source
COPY backend/ingest/. .

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
