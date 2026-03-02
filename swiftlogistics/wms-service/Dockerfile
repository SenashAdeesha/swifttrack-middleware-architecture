# WMS Service Dockerfile (RabbitMQ Consumer)
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY consumer.py .

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Enable unbuffered Python output for Docker logs
ENV PYTHONUNBUFFERED=1

EXPOSE 5005

# Health check via HTTP
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:5005/health || exit 1

CMD ["python", "-u", "consumer.py"]
