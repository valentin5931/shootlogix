FROM python:3.11-slim

# Install system dependencies for PyMuPDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies
COPY SHOOTLOGIX/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY SHOOTLOGIX/ .
COPY BATEAUX/static/boat_images/ /app/static/boat_images_bateaux/ 2>/dev/null || true

# Create data directory
RUN mkdir -p /data/uploads

# Expose port
EXPOSE 8080

# Start with gunicorn
CMD ["gunicorn", "wsgi:app", "--bind", "0.0.0.0:8080", "--workers", "1", "--timeout", "120"]
