interface Props {
  toolCallId: string;
  command: string;
  onRespond: (toolCallId: string, approved: boolean) => void;
}

export function ConfirmDialog({ toolCallId, command, onRespond }: Props) {
  return (
    <div className="mx-4 mb-3 bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-4">
      <p className="text-yellow-400 text-sm font-medium mb-2">Command execution request</p>
      <pre className="bg-gray-900 rounded-lg p-3 text-sm text-gray-200 font-mono whitespace-pre-wrap break-all mb-3">
        {command}
      </pre>
      <div className="flex gap-2">
        <button
          onClick={() => onRespond(toolCallId, true)}
          className="bg-green-700 hover:bg-green-600 text-white text-sm rounded-lg px-4 py-1.5 font-medium transition-colors"
        >
          Approve
        </button>
        <button
          onClick={() => onRespond(toolCallId, false)}
          className="bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg px-4 py-1.5 font-medium transition-colors"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
