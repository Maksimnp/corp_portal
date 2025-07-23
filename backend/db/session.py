from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

DATABASE_URL = "postgresql+asyncpg://user:password@localhost/corp_portal"
engine = create_async_engine(DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# === frontend/src/pages/Contacts.tsx ===
import { useState, useEffect } from 'react';

export default function ContactsPage() {
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetch(`/contacts?query=${query}`)
        .then(res => res.json())
        .then(data => setContacts(data));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="p-4">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="border p-2 rounded w-full"
        placeholder="Поиск по сотрудникам..."
      />
      <ul className="mt-4">
        {contacts.map((c: any) => (
          <li key={c.id} className="p-2 border-b">
            <div className="font-bold">{c.full_name}</div>
            <div>{c.position}, {c.department}</div>
            <div>📞 {c.phone_internal} | {c.phone_city} | {c.phone_mobile}</div>
            <div>✉ {c.email}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}