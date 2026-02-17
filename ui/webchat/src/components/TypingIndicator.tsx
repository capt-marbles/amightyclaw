export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3">
        <div className="flex space-x-1.5">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
