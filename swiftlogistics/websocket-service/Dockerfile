FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Disable Python output buffering for real-time logging
ENV PYTHONUNBUFFERED=1

EXPOSE 5006

CMD ["python", "-u", "app.py"]
