import React from 'react';
import { Header } from './components/Header';
import { Home } from './pages/Home';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-sage-canvas text-sage-dark flex flex-col font-sans">
      <Header />
      <div className="flex-1">
        <Home />
      </div>
      <footer className="border-t border-sage-mint py-8 text-center text-xs text-sage-muted bg-white/70 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sage-dark font-medium">
            <span className="w-2 h-2 rounded-full bg-sage" />
            <span className="font-bold">TasteAudit AI</span>
            <span className="text-sage-muted">&mdash; Cultural QA for AI Recommendations</span>
          </div>
          <div className="text-sage-muted text-xs font-normal">
            Powered by <strong className="text-sage-dark font-semibold">Qloo</strong> cultural intelligence &bull; Qloo Agentic Hackathon 2026
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
