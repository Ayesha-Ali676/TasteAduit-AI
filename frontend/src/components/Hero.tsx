import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

export const Hero: React.FC = () => {
  return (
    <section className="text-center max-w-3xl mx-auto space-y-6 pt-6 sm:pt-10">
      {/* Subtle Eyebrow */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sage-mint/60 border border-sage-soft/60 text-sage-dark text-xs font-semibold tracking-wider uppercase shadow-xs">
        <Sparkles className="w-3.5 h-3.5 text-sage" />
        <span>AI Recommendation QA &times; Qloo Cultural Intelligence</span>
      </div>

      {/* Main Headline */}
      <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-sage-dark leading-[1.12]">
        AI recommendations sound convincing.{' '}
        <span className="block text-sage font-black">
          But do they actually fit?
        </span>
      </h1>

      {/* Supporting Copy */}
      <p className="text-base sm:text-lg text-sage-muted max-w-2xl mx-auto leading-relaxed font-normal">
        TasteAudit uses Qloo's cultural intelligence to audit, explain, and repair AI-generated recommendations.
      </p>

      {/* Workflow Pills */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm font-semibold tracking-wider text-sage-muted">
        <span className="px-3 py-1 rounded-full bg-sage-mint border border-sage-soft text-sage-dark shadow-xs font-bold">
          PASTE
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-sage" />
        <span className="px-3 py-1 rounded-full bg-sage-mint border border-sage-soft text-sage-dark shadow-xs font-bold">
          AUDIT
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-sage" />
        <span className="px-3 py-1 rounded-full bg-sage-mint border border-sage-soft text-sage-dark shadow-xs font-bold">
          REPAIR
        </span>
      </div>
    </section>
  );
};
