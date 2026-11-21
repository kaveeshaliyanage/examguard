FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs default-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin runner

WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app ./app

USER runner
ENV HOME=/tmp

EXPOSE 8000

HEALTHCHECK --interval=20s --timeout=5s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=3)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
