import { useState, useEffect, useCallback } from 'react';

interface CronJob {
  id: string;
  name: string;
  cron: string;
  message: string;
  profile: string;
  enabled: boolean;
  lastRun?: string;
}

interface Props {
  token: string;
}

export function SchedulerPanel({ token }: Props) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', cron: '', message: '', profile: 'free' });

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    const res = await fetch('/api/cron', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setJobs(await res.json());
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const addJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/cron', { method: 'POST', headers, body: JSON.stringify(form) });
    if (res.ok) {
      setShowForm(false);
      setForm({ name: '', cron: '', message: '', profile: 'free' });
      load();
    }
  };

  const toggle = async (name: string, enabled: boolean) => {
    await fetch(`/api/cron/${name}`, { method: 'PATCH', headers, body: JSON.stringify({ enabled }) });
    load();
  };

  const remove = async (name: string) => {
    await fetch(`/api/cron/${name}`, { method: 'DELETE', headers });
    load();
  };

  return (
    <div className="space-y-3">
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg px-4 py-2 font-medium"
        >
          + Add Job
        </button>
      )}

      {showForm && (
        <form onSubmit={addJob} className="bg-gray-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white" required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Cron Expression</label>
              <input value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })}
                placeholder="*/30 * * * *"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white" required />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Message</label>
            <input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white" required />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Profile</label>
            <input value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white" required />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm rounded px-4 py-1.5">Create</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-200 text-sm">Cancel</button>
          </div>
        </form>
      )}

      {jobs.length === 0 && !showForm && <p className="text-gray-500 text-sm">No scheduled jobs.</p>}

      {jobs.map((j) => (
        <div key={j.id} className="bg-gray-800 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-white text-sm font-medium">{j.name}</span>
              <span className="text-gray-500 text-xs ml-2 font-mono">{j.cron}</span>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => toggle(j.name, !j.enabled)}
                className={`text-xs rounded px-2 py-0.5 ${j.enabled ? 'bg-green-800 text-green-300' : 'bg-gray-700 text-gray-400'}`}
              >
                {j.enabled ? 'On' : 'Off'}
              </button>
              <button onClick={() => remove(j.name)} className="text-gray-500 hover:text-red-400 text-xs">Delete</button>
            </div>
          </div>
          <p className="text-gray-400 text-xs mt-1">{j.message}</p>
          {j.lastRun && <p className="text-gray-600 text-xs mt-0.5">Last run: {new Date(j.lastRun).toLocaleString()}</p>}
        </div>
      ))}
    </div>
  );
}
