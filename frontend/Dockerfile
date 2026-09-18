# ==============================================================================
# Veriscore Frontend Multi-Stage Dockerfile
# Stage 1: Build React/Vite production bundle
# Stage 2: Serve static files with high-performance Nginx reverse-proxy
# ==============================================================================

# --- Stage 1: Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definitions and install cleanly
COPY frontend/package*.json ./
RUN npm ci

# Copy source code and build production assets
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Production Runtime Stage ---
FROM nginx:1.27-alpine AS runner

# Remove default nginx website
RUN rm -rf /usr/share/nginx/html/*

# Copy built production assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration (reverse-proxy & security rules)
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Container Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
