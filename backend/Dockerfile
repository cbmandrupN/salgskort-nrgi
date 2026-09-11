FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SALGSKORT_DATA_SOURCE=demo \
    SALGSKORT_SHARED_DATABASE_PATH=/service/data/shared.sqlite3

WORKDIR /service
COPY pyproject.toml ./
COPY app ./app
RUN python -m pip install --no-cache-dir . \
    && useradd --uid 10001 --create-home appuser \
    && mkdir -p /service/data \
    && chown appuser:appuser /service/data \
    && chmod 700 /service/data
COPY fixtures ./fixtures

USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
