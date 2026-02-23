FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared utilities
COPY ../shared /app/shared

# Copy service code
COPY . .

ENV PYTHONUNBUFFERED=1

EXPOSE 5008

CMD ["python", "handler.py"]
