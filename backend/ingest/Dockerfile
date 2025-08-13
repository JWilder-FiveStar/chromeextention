FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# No lockfile present; use install. Commit package-lock.json later for reproducibility.
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
