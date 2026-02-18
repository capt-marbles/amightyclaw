import { useState, useEffect, useCallback } from 'react';

interface Profile {
  name: string;
  provider: string;
  model: string;
  maxTokensPerMessage: number;
  maxTokensPerDay: number;
  temperature?: number;
  topP?: number;
  maxHistoryMessages?: number;
}

interface Props {
  token: string;
}

const PROVIDERS = ['openai', 'anthropic', 'google', 'mistral', 'ollama'];

export function ProfilesPanel({ token }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editName, setEditName] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', provider: 'openai', model: '', apiKey: '',
    maxTokensPerMessage: 4096, maxTokensPerDay: 100000,
    temperature: 0.7, topP: 1, maxHistoryMessages: 20,
  });
  const [validating, setValidating] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{ name: string; valid: boolean; error?: string } | null>(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    const res = await fetch('/api/profiles', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setProfiles(await res.json());
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const validate = async (name: string) => {
    setValidating(name);
    setValidationResult(null);
    const res = await fetch(`/api/profiles/${name}/validate`, { method: 'POST', headers });
    const result = await res.json();
    setValidationResult({ name, ...result });
    setValidating(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editName ? 'PUT' : 'POST';
    const url = editName ? `/api/profiles/${editName}` : '/api/profiles';
    await fetch(url, { method, headers, body: JSON.stringify(form) });
    setShowForm(false);
    setEditName(null);
    load();
  };

  const deleteProfile = async (name: string) => {
    await fetch(`/api/profiles/${name}`, { method: 'DELETE', headers });
    load();
  };

  const startEdit = (p: Profile) => {
    setForm({
      name: p.name, provider: p.provider, model: p.model, apiKey: '',
      maxTokensPerMessage: p.maxTokensPerMessage, maxTokensPerDay: p.maxTokensPerDay,
      temperature: p.temperature ?? 0.7, topP: p.topP ?? 1, maxHistoryMessages: p.maxHistoryMessages ?? 20,
    });
    setEditName(p.name);
    setShowForm(true);
  };

  return (
    <div className="space-y-3">
      {!showForm && (
        <button
          onClick={() => { setForm({ name: '', provider: 'openai', model: '', apiKey: '', maxTokensPerMessage: 4096, maxTokensPerDay: 100000, temperature: 0.7, topP: 1, maxHistoryMessages: 20 }); setEditName(null); setShowForm(true); }}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg px-4 py-2 font-medium"
        >
          + Add Profile
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!!editName}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white disabled:opacity-50" required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Provider</label>
              <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white">
                {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Model</label>
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white" required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">API Key</label>
              <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder={editName ? '(unchanged)' : ''}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white" required={!editName} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Temp ({form.temperature})</label>
              <input type="range" min="0" max="2" step="0.1" value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Top P ({form.topP})</label>
              <input type="range" min="0" max="1" step="0.05" value={form.topP}
                onChange={(e) => setForm({ ...form, topP: parseFloat(e.target.value) })} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">History msgs</label>
              <input type="number" value={form.maxHistoryMessages} onChange={(e) => setForm({ ...form, maxHistoryMessages: parseInt(e.target.value) })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm rounded px-4 py-1.5">{editName ? 'Update' : 'Create'}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditName(null); }} className="text-gray-400 hover:text-gray-200 text-sm">Cancel</button>
          </div>
        </form>
      )}

      {profiles.map((p) => (
        <div key={p.name} className="bg-gray-800 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-white text-sm font-medium">{p.name}</span>
              <span className="text-gray-500 text-xs ml-2">{p.provider}/{p.model}</span>
            </div>
            <div className="flex gap-2 items-center">
              {validationResult?.name === p.name && (
                <span className={`text-xs ${validationResult.valid ? 'text-green-400' : 'text-red-400'}`}>
                  {validationResult.valid ? 'Connected' : validationResult.error}
                </span>
              )}
              <button onClick={() => validate(p.name)} disabled={validating === p.name}
                className="text-gray-500 hover:text-blue-400 text-xs disabled:opacity-50">
                {validating === p.name ? '...' : 'Validate'}
              </button>
              <button onClick={() => startEdit(p)} className="text-gray-500 hover:text-blue-400 text-xs">Edit</button>
              <button onClick={() => deleteProfile(p.name)} className="text-gray-500 hover:text-red-400 text-xs">Delete</button>
            </div>
          </div>
          <div className="text-gray-500 text-xs mt-1">
            {p.maxTokensPerMessage} tokens/msg &middot; {p.maxTokensPerDay} tokens/day
            {p.temperature !== undefined && ` · temp ${p.temperature}`}
          </div>
        </div>
      ))}
    </div>
  );
}
