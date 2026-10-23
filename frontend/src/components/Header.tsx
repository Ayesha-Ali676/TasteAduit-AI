import React, { useEffect, useState } from 'react';
import { checkBackendHealth } from '../lib/api';

export const Header: React.FC = () => {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  useEffect(() => {
    checkBackendHealth()
      .then((res) => {
        if (res.status === 'ok') {
          setBackendStatus('connected');
        } else {
          setBackendStatus('disconnected');
        }
      })
      .catch(() => setBackendStatus('disconnected'));
  }, []);

  return (
    <header className="border-b border-sage-mint/80 bg-white/85 backdrop-blur-md sticky top-0 z-40 transition-colors">
      <div className="max-w-5xl mx-auto px-6 h-18 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-bold tracking-tight text-sage-dark">
            TasteAudit <span className="text-sage font-extrabold">AI</span>
          </span>
          <span className="hidden sm:inline text-xs text-sage-muted font-normal tracking-wide">
            Cultural QA for AI Recommendations
          </span>
        </div>

        {/* Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-sage-mint/40 border border-sage-mint text-xs">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                backendStatus === 'connected'
                  ? 'bg-sage animate-pulse'
                  : backendStatus === 'checking'
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-sage-dark">
              {backendStatus === 'connected' ? 'QLOO CONNECTED' : backendStatus === 'checking' ? 'QLOO CONNECTING' : 'QLOO OFFLINE'}
            </span>
          </div>

          <span className="hidden md:inline text-xs text-sage-muted font-normal">
            Powered by <strong className="text-sage-dark font-semibold">Qloo</strong>
          </span>
        </div>
      </div>
    </header>
  );
};
