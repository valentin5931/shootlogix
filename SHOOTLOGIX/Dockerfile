FROM python:3.11-slim

# Install system dependencies for PyMuPDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p /data/uploads

# Default port (Railway overrides via $PORT)
ENV PORT=8080
EXPOSE 8080

# Start with gunicorn — use shell form so $PORT is expanded
CMD gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120
