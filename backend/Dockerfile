# ---- Backend Dockerfile ----
FROM node:20-alpine

WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

# Run as non-root user (security best practice)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 5000

CMD ["node", "server.js"]
