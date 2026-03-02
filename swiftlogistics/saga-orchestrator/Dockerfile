# Saga Orchestrator Dockerfile
FROM python:3.11-slim

# Disable Python output buffering for real-time logs
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY orchestrator.py .

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 5007

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c "import socket; s=socket.socket(); s.connect(('localhost', 5007)); s.close()" || exit 1

CMD ["python", "orchestrator.py"]
