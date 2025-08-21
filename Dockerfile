# Используем официальный образ Python
FROM python:3.9-slim

# Устанавливаем системные зависимости, включая компилятор
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libldap2-dev \
    libsasl2-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем requirements.txt
COPY requirements.txt .

# Устанавливаем Python-зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь проект
COPY . .

# Добавляем корень проекта в PYTHONPATH
ENV PYTHONPATH=/app

# Указываем команду для запуска
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "2000"]