FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --upgrade pip \
 && pip install \
        "fastapi>=0.115" \
        "uvicorn[standard]>=0.32" \
        "pydantic>=2.7" \
        "python-jose[cryptography]>=3.3" \
        "httpx>=0.27" \
        "orjson>=3.10" \
        "jsonschema>=4.22" \
        "python-multipart>=0.0.9"

COPY app ./app
COPY schema ./schema
COPY seed ./seed

# Data volume for JSON assets/installs.
VOLUME ["/data"]
ENV MARKET_STORAGE_ROOT=/data/marketplace

EXPOSE 8137

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8137/healthz').read()" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8137"]
