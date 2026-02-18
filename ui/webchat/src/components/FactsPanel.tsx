import { useState, useEffect, useCallback } from 'react';

interface Fact {
  id: string;
  content: string;
  category: string;
  createdAt: string;
}

interface Props {
  token: string;
}

const CATEGORIES = ['general', 'preference', 'biographical', 'project', 'instruction'];

export function FactsPanel({ token }: Props) {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    const res = await fetch('/api/facts', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setFacts(await res.json());
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (f: Fact) => {
    setEditing(f.id);
    setEditContent(f.content);
    setEditCategory(f.category);
  };

  const saveEdit = async () => {
    if (!editing) return;
    await fetch(`/api/facts/${editing}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: editContent, category: editCategory }),
    });
    setEditing(null);
    load();
  };

  const deleteFact = async (id: string) => {
    await fetch(`/api/facts/${id}`, { method: 'DELETE', headers });
    load();
  };

  return (
    <div className="space-y-3">
      <p className="text-gray-400 text-sm">Auto-extracted facts about you. Edit or delete as needed.</p>
      {facts.length === 0 && <p className="text-gray-500 text-sm">No facts yet.</p>}
      {facts.map((f) => (
        <div key={f.id} className="bg-gray-800 rounded-lg p-3">
          {editing === f.id ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white resize-none"
                rows={2}
              />
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={saveEdit} className="bg-blue-600 hover:bg-blue-500 text-white text-xs rounded px-3 py-1">Save</button>
                <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-200 text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="text-gray-200 text-sm flex-1">{f.content}</p>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEdit(f)} className="text-gray-500 hover:text-blue-400 text-xs">Edit</button>
                  <button onClick={() => deleteFact(f.id)} className="text-gray-500 hover:text-red-400 text-xs">Delete</button>
                </div>
              </div>
              <span className="inline-block mt-1 text-xs bg-gray-700 text-gray-400 rounded px-2 py-0.5">{f.category}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
