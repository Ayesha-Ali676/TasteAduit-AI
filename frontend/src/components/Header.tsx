import React, { useEffect, useState } from 'react';
import { checkBackendHealth } from '../lib/api';
import { ShieldCheck, Activity } from 'lucide-react';

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
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10 px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-600 rounded-lg text-white">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              TasteAudit AI
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                Phase 2 Scaffold
              </span>
            </h1>
            <p className="text-xs text-slate-400">Cultural QA for AI Recommendations</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs">
            <Activity className={`w-4 h-4 ${backendStatus === 'connected' ? 'text-emerald-400' : backendStatus === 'checking' ? 'text-amber-400' : 'text-rose-400'}`} />
            <span className="text-slate-400">Backend API:</span>
            <span className={`font-medium ${backendStatus === 'connected' ? 'text-emerald-400' : backendStatus === 'checking' ? 'text-amber-400' : 'text-rose-400'}`}>
              {backendStatus === 'connected' ? 'Healthy' : backendStatus === 'checking' ? 'Connecting...' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
