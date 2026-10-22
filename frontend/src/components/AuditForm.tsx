import React, { useState } from 'react';
import { AuditFormData } from '../types/audit';
import { Sparkles, ArrowRight } from 'lucide-react';

interface AuditFormProps {
  onSubmit: (data: AuditFormData) => void;
  isLoading: boolean;
}

export const AuditForm: React.FC<AuditFormProps> = ({ onSubmit, isLoading }) => {
  const [formData, setFormData] = useState<AuditFormData>({
    recommendations: 'Recommend 3 neighborhood coffee shops in Shoreditch, London with artisanal vinyl listening spaces.',
    audienceContext: 'Creative professionals, audiophiles in their late 20s',
    location: 'Shoreditch, London, UK',
    constraints: 'must feature vinyl audio setups\nmust have single-origin pour-overs\nno loud commercial chains'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.recommendations.trim()) return;
    onSubmit(formData);
  };

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 shadow-xl backdrop-blur-sm">
      <div className="flex items-center space-x-2 mb-4">
        <Sparkles className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-semibold text-white">Input Recommendation Set</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="recommendations" className="block text-sm font-medium text-slate-300 mb-1">
            AI Recommendations <span className="text-rose-400">*</span>
          </label>
          <textarea
            id="recommendations"
            rows={3}
            required
            value={formData.recommendations}
            onChange={(e) => setFormData({ ...formData, recommendations: e.target.value })}
            placeholder="Paste the raw AI recommendations you want to culturally evaluate..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="audienceContext" className="block text-sm font-medium text-slate-300 mb-1">
              Target Audience / Cultural Context
            </label>
            <input
              id="audienceContext"
              type="text"
              value={formData.audienceContext}
              onChange={(e) => setFormData({ ...formData, audienceContext: e.target.value })}
              placeholder="e.g. Gen Z fashion lovers, Jazz purists, local foodies"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-medium text-slate-300 mb-1">
              Geographic Location
            </label>
            <input
              id="location"
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g. Kyoto, Japan or Shoreditch, London"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>
        </div>

        <div>
          <label htmlFor="constraints" className="block text-sm font-medium text-slate-300 mb-1">
            Cultural Constraints & Guardrails <span className="text-xs text-slate-400">(one per line)</span>
          </label>
          <textarea
            id="constraints"
            rows={2}
            value={formData.constraints}
            onChange={(e) => setFormData({ ...formData, constraints: e.target.value })}
            placeholder="e.g. independent venues only&#10;budget under $30&#10;authentic local culinary tradition"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 transition cursor-pointer"
          >
            {isLoading ? (
              <span>Auditing Pipeline...</span>
            ) : (
              <>
                <span>Audit & Repair</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
