import React from 'react';
import { Header } from './components/Header';
import { Home } from './pages/Home';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <Header />
      <div className="flex-1">
        <Home />
      </div>
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <p>TasteAudit AI &bull; Cultural QA for AI Recommendations &bull; Powered by Qloo Taste Graph</p>
      </footer>
    </div>
  );
};

export default App;
