import { useState } from 'react';
import { FactsPanel } from './FactsPanel.js';
import { ProfilesPanel } from './ProfilesPanel.js';
import { SchedulerPanel } from './SchedulerPanel.js';

interface Props {
  open: boolean;
  onClose: () => void;
  token: string;
}

const TABS = ['Facts', 'Profiles', 'Scheduler'] as const;
type Tab = (typeof TABS)[number];

export function SettingsDrawer({ open, onClose, token }: Props) {
  const [tab, setTab] = useState<Tab>('Facts');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1" onClick={onClose} />
      {/* Drawer */}
      <div className="w-[480px] bg-gray-900 border-l border-gray-800 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-xl leading-none">&times;</button>
        </div>
        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'Facts' && <FactsPanel token={token} />}
          {tab === 'Profiles' && <ProfilesPanel token={token} />}
          {tab === 'Scheduler' && <SchedulerPanel token={token} />}
        </div>
      </div>
    </div>
  );
}
