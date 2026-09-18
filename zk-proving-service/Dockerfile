# ==============================================================================
# Veriscore ZK Proving Microservice Dockerfile
# Multi-arch ready, security-hardened, non-root execution
# ==============================================================================
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/app \
    PYTHONPATH=/app/zk-proving-service

WORKDIR /app

# Install essential system runtime libraries (libgomp for ONNX/Torch, curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY zk-proving-service/requirements.txt /app/zk-proving-service/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/zk-proving-service/requirements.txt

# Copy source code, models, and initial pipeline artifacts
COPY zk-proving-service/ /app/zk-proving-service/
COPY models/ /app/models/
COPY model-pipeline/ /app/model-pipeline/

# Ensure artifacts directory exists and is writable
RUN mkdir -p /app/artifacts/proofs

# Create a non-root user for security best practices
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

USER appuser

WORKDIR /app/zk-proving-service

EXPOSE 8000

# Container Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8000"]
