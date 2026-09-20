#!/bin/sh
# ==============================================================================
# Runtime Config Injection Entrypoint
# Writes BACKEND_URL into a JS config file that the frontend reads at load time.
# This avoids the nginx reverse proxy entirely — the browser calls the backend
# directly via its public URL (CORS is already enabled on the backend).
# ==============================================================================

CONFIG_FILE="/usr/share/nginx/html/__runtime_config.js"

echo "window.__RUNTIME_CONFIG__ = { API_URL: \"${BACKEND_URL:-}\" };" > "$CONFIG_FILE"

echo "[entrypoint] Wrote runtime config → API_URL=${BACKEND_URL:-'(not set)'}"

# Hand off to the official nginx entrypoint
exec /docker-entrypoint.sh nginx -g 'daemon off;'
