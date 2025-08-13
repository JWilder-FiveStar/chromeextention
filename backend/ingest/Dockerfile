FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# Now using npm ci with committed package-lock.json for reproducible builds
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
