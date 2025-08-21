import React, { useState, useEffect } from 'react';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const Admin: React.FC = () => {
  const [tickets, setTickets] = useState<{ id: number; title: string; assigneeId?: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);

  if (localStorage.getItem('role') !== 'admin') {
    return <div>Access Denied</div>;
  }

  useEffect(() => {
    // Загрузка тикетов
    fetch(`${BASE_URL}/helpdesk/tickets`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((res) => res.json())
      .then((data) => setTickets(data.tickets || []))
      .catch((err) => console.error('Ошибка загрузки тикетов:', err));

    // Загрузка контактов
    fetch(`${BASE_URL}/contacts`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((res) => res.json())
      .then((data) => setContacts(data.contacts || []))
      .catch((err) => console.error('Ошибка загрузки контактов:', err));
  }, []);

  const handleAssignTicket = async (ticketId: number, assigneeId: string) => {
    try {
      const response = await fetch(`${BASE_URL}/admin/tickets/${ticketId}/assign`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ assignee_id: assigneeId }),
      });
      if (response.ok) {
        setTickets((prev) =>
          prev.map((ticket) =>
            ticket.id === ticketId ? { ...ticket, assigneeId } : ticket
          )
        );
      }
    } catch (err) {
      console.error('Ошибка назначения тикета:', err);
    }
  };

  return (
    <div className="p-4">
      <h2>Admin Panel</h2>
      <div>
        <h3>Manage Tickets</h3>
        <ul>
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              {ticket.title}
              <select
                value={ticket.assigneeId || ''}
                onChange={(e) => handleAssignTicket(ticket.id, e.target.value)}
              >
                <option value="">Не назначено</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Manage Contacts</h3>
        <ul>
          {contacts.map((contact) => (
            <li key={contact.id}>{contact.name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};