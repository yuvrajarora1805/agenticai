FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and persistent data templates
COPY . .

# Ensure storage directories exist
RUN mkdir -p /app/data/invoices/challans \
             /app/data/invoices/customer \
             /app/data/invoices/supplier \
             /app/data/policies

EXPOSE 8000

ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1

# Container healthcheck hitting the FastAPI health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["python3", "-m", "uvicorn", "src.server.app:app", "--host", "0.0.0.0", "--port", "8000"]
