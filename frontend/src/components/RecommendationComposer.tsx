import React, { useState } from 'react';
import { AuditFormData } from '../types/audit';
import { ArrowRight, Loader2, Sparkles, MapPin, Users, Sliders, AlertCircle } from 'lucide-react';

interface RecommendationComposerProps {
  onSubmit: (data: AuditFormData) => void;
  isLoading: boolean;
  stagesExecuted?: string[];
}

interface Scenario {
  id: string;
  name: string;
  tag: string;
  isFlagship?: boolean;
  data: AuditFormData;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'venuepulse',
    name: 'VenuePulse',
    tag: 'Should this venue book Artist X?',
    isFlagship: true,
    data: {
      recommendations: 'Book Underground Inc or Pulp Fiction for an indie cultural cinema and alternative music retrospective showcase',
      audienceContext: 'Alternative rock aficionados, indie film buffs, festivalgoers aged 24-38',
      location: 'Brooklyn, New York, US',
      constraints: 'must feature authentic 90s alternative culture · no commercial pop franchises · strict venue acoustic compliance',
      enableAgent: true
    }
  },
  {
    id: 'travel',
    name: 'Travel & Dining',
    tag: 'Shoreditch Vinyl Cafés',
    data: {
      recommendations: 'Recommend 3 neighborhood coffee shops in Shoreditch, London with artisanal vinyl listening spaces.',
      audienceContext: 'Creative professionals, audiophiles in their late 20s',
      location: 'Shoreditch, London, UK',
      constraints: 'must feature vinyl audio setups · must have single-origin pour-overs · no loud commercial chains',
      enableAgent: true
    }
  },
  {
    id: 'music',
    name: 'Music Taste',
    tag: 'Modal Jazz Heritage',
    data: {
      recommendations: 'Recommend iconic modal jazz and hard bop artists connected to the Miles Davis taste cluster',
      audienceContext: 'Serious jazz aficionados and vintage vinyl collectors',
      location: 'New York City, NY',
      constraints: 'authentic 1950s-1960s acoustic jazz · no smooth contemporary jazz · high historical affinity',
      enableAgent: true
    }
  }
];

export const RecommendationComposer: React.FC<RecommendationComposerProps> = ({
  onSubmit,
  isLoading,
  stagesExecuted = []
}) => {
  // Empty by default on page load — user types their own values
  const [formData, setFormData] = useState<AuditFormData>({
    recommendations: '',
    audienceContext: '',
    location: '',
    constraints: '',
    enableAgent: true
  });
  const [activeScenarioId, setActiveScenarioId] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Scenario shortcut populates editable values
  const handleSelectScenario = (sc: Scenario) => {
    setActiveScenarioId(sc.id);
    setFormData({ ...sc.data });
    setValidationError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.recommendations.trim()) {
      setValidationError('Please enter an AI recommendation to audit.');
      return;
    }
    setValidationError(null);
    onSubmit(formData);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Quick Scenario Chips */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 text-xs font-semibold text-sage-dark">
          <Sparkles className="w-3.5 h-3.5 text-sage" />
          <span>TRY A SCENARIO:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SCENARIOS.map((sc) => {
            const isSelected = activeScenarioId === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => handleSelectScenario(sc)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-sage-dark text-white font-bold shadow-sm'
                    : 'bg-white hover:bg-sage-mint/40 text-sage-dark border border-sage-mint shadow-xs'
                }`}
              >
                {sc.isFlagship && <span>⭐</span>}
                <span>{sc.name}</span>
                <span className={`text-[11px] ${isSelected ? 'text-sage-mint' : 'text-sage-muted'}`}>
                  &middot; {sc.tag}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Single Composer Canvas: Crisp White with Soft Sage Border */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border-2 border-sage-soft/70 rounded-3xl p-6 sm:p-8 shadow-sage-soft space-y-6 transition-all"
      >
        {/* Large AI Recommendation Textarea */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="recommendation-input"
              className="text-xs font-bold tracking-wider uppercase text-sage-dark"
            >
              AI RECOMMENDATION
            </label>
            <span className="text-xs text-sage-muted">
              Required
            </span>
          </div>

          <textarea
            id="recommendation-input"
            rows={3}
            value={formData.recommendations}
            onChange={(e) => {
              setFormData({ ...formData, recommendations: e.target.value });
              if (validationError) setValidationError(null);
            }}
            placeholder="e.g. Recommend 3 movies similar to Pulp Fiction"
            className="w-full bg-[#FAFDF9] border border-sage-mint focus:border-sage focus:ring-2 focus:ring-sage/20 rounded-2xl p-4 sm:p-5 text-base sm:text-lg text-sage-dark placeholder-sage-soft transition leading-relaxed resize-none font-normal outline-none"
          />

          {validationError && (
            <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium pt-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        {/* Context Fields in Clean White/Light-Mint */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {/* Audience */}
          <div className="p-3 rounded-xl bg-[#FAFDF9] border border-sage-mint focus-within:border-sage focus-within:ring-1 focus-within:ring-sage/30 transition">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-sage-dark uppercase tracking-wide mb-1">
              <Users className="w-3 h-3 text-sage" />
              <span>AUDIENCE</span>
            </div>
            <input
              type="text"
              value={formData.audienceContext}
              onChange={(e) => {
                setFormData({ ...formData, audienceContext: e.target.value });
              }}
              placeholder="e.g. Young urban professionals"
              className="w-full bg-transparent text-xs text-sage-dark placeholder-sage-soft outline-none font-medium"
            />
          </div>

          {/* Location */}
          <div className="p-3 rounded-xl bg-[#FAFDF9] border border-sage-mint focus-within:border-sage focus-within:ring-1 focus-within:ring-sage/30 transition">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-sage-dark uppercase tracking-wide mb-1">
              <MapPin className="w-3 h-3 text-sage" />
              <span>LOCATION</span>
            </div>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => {
                setFormData({ ...formData, location: e.target.value });
              }}
              placeholder="e.g. New York, USA"
              className="w-full bg-transparent text-xs text-sage-dark placeholder-sage-soft outline-none font-medium"
            />
          </div>

          {/* Constraints */}
          <div className="p-3 rounded-xl bg-[#FAFDF9] border border-sage-mint focus-within:border-sage focus-within:ring-1 focus-within:ring-sage/30 transition">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-sage-dark uppercase tracking-wide mb-1">
              <Sliders className="w-3 h-3 text-sage" />
              <span>CONSTRAINTS</span>
            </div>
            <input
              type="text"
              value={formData.constraints}
              onChange={(e) => {
                setFormData({ ...formData, constraints: e.target.value });
              }}
              placeholder="e.g. Must be a cult classic and suitable for a 90s crime cinema theme"
              className="w-full bg-transparent text-xs text-sage-dark placeholder-sage-soft outline-none font-medium"
            />
          </div>
        </div>

        {/* ONE DOMINANT CTA: Dark Sage & Sage Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 px-8 rounded-2xl font-bold text-base sm:text-lg text-white bg-sage-dark hover:bg-sage active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-sage-button transition-all flex items-center justify-center gap-3 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-white" />
                <span>Auditing with Qloo Taste Graph...</span>
              </>
            ) : (
              <>
                <span className="tracking-wide">✦ AUDIT WITH QLOO</span>
                <ArrowRight className="w-5 h-5 ml-1" />
              </>
            )}
          </button>
        </div>

        {/* Compact, subtle execution tracker during loading */}
        {isLoading && (
          <div className="pt-2 text-center text-xs font-mono text-sage-muted flex items-center justify-center gap-2 flex-wrap">
            <span className={stagesExecuted.includes('PARSE') ? 'text-sage-dark font-bold' : 'text-sage-muted'}>
              {stagesExecuted.includes('PARSE') ? '✓' : '◉'} Parse
            </span>
            <span className="text-sage-soft">&rarr;</span>
            <span className={stagesExecuted.includes('RESOLVE') ? 'text-sage-dark font-bold' : 'text-sage-muted'}>
              {stagesExecuted.includes('RESOLVE') ? '✓' : stagesExecuted.includes('PARSE') ? '◉' : '○'} Resolve
            </span>
            <span className="text-sage-soft">&rarr;</span>
            <span className={stagesExecuted.includes('RETRIEVE') ? 'text-sage-dark font-bold' : 'text-sage-muted'}>
              {stagesExecuted.includes('RETRIEVE') ? '✓' : stagesExecuted.includes('RESOLVE') ? '◉' : '○'} Retrieve
            </span>
            <span className="text-sage-soft">&rarr;</span>
            <span className={stagesExecuted.includes('AUDIT') ? 'text-sage-dark font-bold' : 'text-sage-muted'}>
              {stagesExecuted.includes('AUDIT') ? '✓' : stagesExecuted.includes('RETRIEVE') ? '◉' : '○'} Audit
            </span>
            <span className="text-sage-soft">&rarr;</span>
            <span className={stagesExecuted.includes('REPAIR') ? 'text-sage-dark font-bold' : 'text-sage-muted'}>
              {stagesExecuted.includes('REPAIR') ? '✓' : stagesExecuted.includes('AUDIT') ? '◉' : '○'} Repair
            </span>
            <span className="text-sage-soft">&rarr;</span>
            <span className={stagesExecuted.includes('RE-AUDIT') ? 'text-sage-dark font-bold' : 'text-sage-muted'}>
              {stagesExecuted.includes('RE-AUDIT') ? '✓' : stagesExecuted.includes('REPAIR') ? '◉' : '○'} Re-audit
            </span>
          </div>
        )}
      </form>
    </div>
  );
};
