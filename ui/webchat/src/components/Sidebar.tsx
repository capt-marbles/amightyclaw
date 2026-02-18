import { useState, useEffect, useRef } from 'react';

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface SearchResult {
  conversationId: string;
  title: string;
  snippet: string;
  createdAt: string;
}

interface Props {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  token: string;
}

export function Sidebar({ conversations, currentId, onSelect, onNew, token }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setResults(await res.json());
      } catch { /* ignore */ }
      setSearching(false);
    }, 300);
  }, [query, token]);

  const showSearch = query.trim().length > 0;

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      <div className="p-4 space-y-2">
        <button
          onClick={onNew}
          className="w-full bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors border border-gray-700"
        >
          + New Chat
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search messages..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {showSearch ? (
          searching ? (
            <p className="text-gray-500 text-xs px-3 py-2">Searching...</p>
          ) : results.length === 0 ? (
            <p className="text-gray-500 text-xs px-3 py-2">No results</p>
          ) : (
            results.map((r) => (
              <button
                key={`${r.conversationId}-${r.createdAt}`}
                onClick={() => { onSelect(r.conversationId); setQuery(''); }}
                className="w-full text-left px-3 py-2.5 rounded-lg mb-1 text-sm transition-colors text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
              >
                <span className="block text-gray-300 truncate">{r.title}</span>
                <span
                  className="block text-xs text-gray-500 truncate mt-0.5"
                  dangerouslySetInnerHTML={{ __html: r.snippet }}
                />
              </button>
            ))
          )
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 text-sm truncate transition-colors ${
                currentId === c.id
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              {c.title}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
