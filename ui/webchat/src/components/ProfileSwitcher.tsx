interface Profile {
  name: string;
  provider: string;
  model: string;
}

interface Props {
  profiles: Profile[];
  current: string;
  onChange: (name: string) => void;
}

export function ProfileSwitcher({ profiles, current, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      {profiles.map((p) => (
        <button
          key={p.name}
          onClick={() => onChange(p.name)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            current === p.name
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          }`}
          title={`${p.provider} / ${p.model}`}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
