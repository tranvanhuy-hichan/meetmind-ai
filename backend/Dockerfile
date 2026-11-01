FROM python:3.12-slim

# LibreOffice turns uploaded Word/PowerPoint files into PDF.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-impress fonts-dejavu fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY core core
COPY adapters adapters
COPY app app
COPY prompts prompts
RUN pip install --no-cache-dir ".[postgres]"

# Plain asyncio loop on purpose: uvloop cannot start the LibreOffice subprocess on Python 3.14 and is not needed here.
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--loop", "asyncio"]
