# ==============================================================================
# Veriscore Backend API Gateway Dockerfile
# Lightweight Node.js 20 Alpine, non-root user, production optimized
# ==============================================================================
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=5000 \
    HOST=0.0.0.0

WORKDIR /app

# Install curl for container health check
RUN apk add --no-cache curl

# Install dependencies using clean install
COPY backend-api/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application source code
COPY backend-api/ ./

# Use built-in non-root node user
USER node

EXPOSE 5000

# Container Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

CMD ["node", "server.js"]
