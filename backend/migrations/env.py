from alembic import context
from sqlalchemy import engine_from_config, pool
from logging.config import fileConfig
import sys
import os

# Добавляем родительский каталог в sys.path для импорта моделей
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# Импорт базы и моделей
from db.database import Base
import models.db_models
import models.chat_models
import models.document_models

# Конфигурация Alembic
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Метаданные всех моделей
target_metadata = Base.metadata

def run_migrations_offline():
    """Запуск миграций без подключения к БД (генерация SQL)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """Запуск миграций с подключением к БД."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Безопасная конфигурация с проверкой зависимостей
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # отключаем автоматическое удаление таблиц
            compare_type=True,
            render_as_batch=True  # безопасно для SQLite и PostgreSQL при изменении колонок
        )

        with context.begin_transaction():
            context.run_migrations()


# Запуск миграций в зависимости от режима
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
