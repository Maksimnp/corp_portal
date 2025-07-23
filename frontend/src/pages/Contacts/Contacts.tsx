import React, { useState, useEffect } from 'react';

export const Contacts: React.FC = () => {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchContacts = async () => {
      const response = await fetch(`http://localhost:8000/contacts?query=${search}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      setContacts(data);
    };
    fetchContacts();
  }, [search]);

  return (
    <div className="p-4">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search contacts..."
        className="mb-4 p-2 border rounded w-full"
      />
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th>Name</th>
            <th>Position</th>
            <th>Department</th>
            <th>Internal Phone</th>
            <th>City Phone</th>
            <th>Mobile</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact: any) => (
            <tr key={contact.id}>
              <td>{contact.full_name}</td>
              <td>{contact.position}</td>
              <td>{contact.department}</td>
              <td>{contact.internal_phone}</td>
              <td>{contact.city_phone}</td>
              <td>{contact.mobile_phone}</td>
              <td>{contact.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
