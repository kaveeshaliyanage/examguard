FROM python:3.12-slim

ARG INSTALL_SEMANTIC=false

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt requirements-semantic.txt ./
RUN if [ "$INSTALL_SEMANTIC" = "true" ]; then \
        pip install -r requirements-semantic.txt; \
    else \
        pip install -r requirements.txt; \
    fi

COPY app ./app

EXPOSE 8000

HEALTHCHECK --interval=20s --timeout=5s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=3)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
