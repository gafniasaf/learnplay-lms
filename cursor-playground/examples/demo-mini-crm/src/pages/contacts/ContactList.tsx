import React from 'react';

type Contact = {
  name: string;
  email: string;
  status: 'lead' | 'customer' | 'inactive';
};

const contacts: Contact[] = [
  { name: 'Leah Chen', email: 'leah@northwind.ai', status: 'customer' },
  { name: 'Priya Sethi', email: 'priya@glow.tech', status: 'lead' },
  { name: 'Mark Ellis', email: 'mark@acme.design', status: 'lead' },
  { name: 'Ivy Patel', email: 'ivy@cirrus.dev', status: 'inactive' },
];

const statusClass: Record<Contact['status'], string> = {
  customer: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30',
  lead: 'bg-amber-500/15 text-amber-300 border border-amber-400/40',
  inactive: 'bg-slate-700/50 text-slate-200 border border-slate-500/40',
};

export function ContactList() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-10 space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-300">Contacts</p>
          <h1 className="text-4xl font-bold mt-2">Pipeline Contacts</h1>
          <p className="text-slate-400 mt-2">
            Sort and qualify every lead before they reach your pipeline.
          </p>
        </div>
        <div className="space-x-3">
          <button className="rounded-full border border-slate-700 px-5 py-3 text-sm">Import CSV</button>
          <button className="rounded-full bg-emerald-500 px-5 py-3 text-sm text-slate-900 font-semibold">
            Add Contact
          </button>
        </div>
      </header>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wide">
            <tr>
              <th className="px-6 py-4 font-medium">Name</th>
              <th className="px-6 py-4 font-medium">Email</th>
              <th className="px-6 py-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.email} className="border-t border-slate-800">
                <td className="px-6 py-4 text-base font-medium">{contact.name}</td>
                <td className="px-6 py-4">{contact.email}</td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[contact.status]}`}>
                    {contact.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ContactList;

