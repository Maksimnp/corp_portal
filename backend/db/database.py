# db/database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from typing import AsyncIterator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from dotenv import load_dotenv
load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_DATABASE = os.getenv("DB_DATABASE", "portal_db")
DB_USER = os.getenv("DB_USER", "portal_admin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "season")
DB_PORT = os.getenv("DB_PORT", "5432")

SQLALCHEMY_DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_DATABASE}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db_connection():
    """
    Генератор подключения к базе данных для FastAPI (через Depends).
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class Database:
    def __init__(self, db_url: str):
        self.engine = create_async_engine(db_url)
        self.async_session = sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False
        )

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self.async_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def execute(self, query):
        async with self.session() as session:
            result = await session.execute(query)
            return result

    async def fetch_one(self, query):
        result = await self.execute(query)
        return result.fetchone()

    async def fetch_all(self, query):
        result = await self.execute(query)
        return result.fetchall()

    @asynccontextmanager
    async def transaction(self):
        async with self.session() as session:
            async with session.begin():
                yield session