import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  profile?: string;
}

export function MessageBubble({ role, content, profile }: Props) {
  const isUser = role === 'user';
  const sanitized = DOMPurify.sanitize(content);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-100 border border-gray-700'
        }`}
      >
        {!isUser && profile && (
          <div className="text-xs text-gray-400 mb-1">{profile}</div>
        )}
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown>{sanitized}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
