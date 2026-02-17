interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface Props {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function Sidebar({ conversations, currentId, onSelect, onNew }: Props) {
  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      <div className="p-4">
        <button
          onClick={onNew}
          className="w-full bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors border border-gray-700"
        >
          + New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {conversations.map((c) => (
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
        ))}
      </div>
    </div>
  );
}
