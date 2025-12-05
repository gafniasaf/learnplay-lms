import React from 'react';

type Metric = {
  label: string;
  value: string;
  trend: string;
  positive?: boolean;
};

const metrics: Metric[] = [
  { label: 'Active Leads', value: '248', trend: '+12% vs last week', positive: true },
  { label: 'Meetings Booked', value: '36', trend: '+4 today', positive: true },
  { label: 'Deals Closing', value: '12', trend: '-1 vs forecast' },
];

const activities = [
  { time: '10:24 AM', detail: 'Synced 3 emails from hubspot@sync.io' },
  { time: '09:03 AM', detail: 'Leah Chen moved “Acme Design” to Proposal' },
  { time: 'Yesterday', detail: 'Priya added “Northwind Labs” + notes' },
];

export function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-10 space-y-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-300">Mini-CRM Demo</p>
          <h1 className="text-4xl font-bold mt-2">Pipeline Overview</h1>
          <p className="text-slate-400 mt-2">
            Track your inbound leads, meetings, and active deals in one board.
          </p>
        </div>
        <div className="space-x-3">
          <button className="rounded-full border border-slate-700 px-5 py-3 text-sm">Sync Inbox</button>
          <button className="rounded-full bg-emerald-500 px-5 py-3 text-sm text-slate-900 font-semibold">
            Add Contact
          </button>
        </div>
      </header>

      <section className="grid gap-5 md:grid-cols-3">
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 space-y-3"
          >
            <p className="text-sm text-slate-400">{metric.label}</p>
            <p className="text-5xl font-semibold">{metric.value}</p>
            <p className={`text-sm ${metric.positive ? 'text-emerald-300' : 'text-rose-300'}`}>
              {metric.trend}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Lead Sources</h2>
            <button className="text-sm text-emerald-300">View Report</button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Inbound forms</span>
              <span className="text-slate-400">58%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Events</span>
              <span className="text-slate-400">24%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Referrals</span>
              <span className="text-slate-400">18%</span>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent Activity</h2>
            <button className="text-sm text-emerald-300">Timeline</button>
          </div>
          <ul className="space-y-3">
            {activities.map((activity) => (
              <li key={activity.detail} className="text-sm">
                <p className="text-slate-400">{activity.time}</p>
                <p>{activity.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;


