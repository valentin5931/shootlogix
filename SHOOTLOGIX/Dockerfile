FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data/uploads

ENV PORT=8080
ENV PYTHONUNBUFFERED=1

# Use gunicorn config file which reads PORT from environment in Python
# This avoids any shell variable expansion issues
CMD ["gunicorn", "wsgi:app", "-c", "gunicorn.conf.py"]
