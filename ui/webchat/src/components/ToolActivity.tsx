import { useState } from 'react';

interface ToolEvent {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  result?: string;
}

interface Props {
  events: ToolEvent[];
}

export function ToolActivity({ events }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) return null;

  return (
    <div className="mx-4 mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
      >
        <span className={`transform transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
        {events.length} tool call{events.length !== 1 ? 's' : ''}
      </button>
      {expanded && (
        <div className="mt-1 space-y-1">
          {events.map((ev) => (
            <div key={ev.toolCallId} className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 text-xs">
              <div className="text-blue-400 font-mono">{ev.toolName}</div>
              {ev.args && (
                <pre className="text-gray-400 mt-1 whitespace-pre-wrap break-all">
                  {JSON.stringify(ev.args, null, 2)}
                </pre>
              )}
              {ev.result && (
                <pre className="text-gray-300 mt-1 whitespace-pre-wrap break-all border-t border-gray-700 pt-1">
                  {ev.result.length > 500 ? ev.result.slice(0, 500) + '...' : ev.result}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
