import React, { useState } from 'react';
import {
  Compass,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ZoomIn,
  ShieldCheck,
  Tag
} from 'lucide-react';
import { CulturalCoverageResult, QlooGroundedAlternative } from '../types/audit';

interface CulturalCoverageViewProps {
  coverage?: CulturalCoverageResult;
  onOpenLightbox?: (imageUrl: string, entityName: string, category?: string) => void;
  onSelectAlternativeForEvidence?: (alt: QlooGroundedAlternative) => void;
}

export const CulturalCoverageView: React.FC<CulturalCoverageViewProps> = ({
  coverage,
  onOpenLightbox,
  onSelectAlternativeForEvidence
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  if (!coverage) {
    return null;
  }

  // Handle UNAVAILABLE failure isolation state
  if (coverage.status === 'UNAVAILABLE') {
    return (
      <section className="bg-white border-2 border-sage-soft/70 rounded-3xl p-6 sm:p-7 shadow-sage-soft space-y-3">
        <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-sage-muted">
          <Compass className="w-4 h-4 text-sage" />
          <span>Cultural Coverage</span>
        </div>
        <p className="text-xs text-sage-muted italic leading-relaxed">
          {coverage.summaryNote || 'Cultural coverage unavailable — the verified audit result above remains valid.'}
        </p>
      </section>
    );
  }

  // Handle INSUFFICIENT_EVIDENCE honest uncertainty state
  if (coverage.status === 'INSUFFICIENT_EVIDENCE') {
    return (
      <section className="bg-white border-2 border-sage-soft/70 rounded-3xl p-6 sm:p-7 shadow-sage-soft space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-sage-mint">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sage-mint/50 border border-sage-soft flex items-center justify-center">
              <Compass className="w-4 h-4 text-sage" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-sage-dark tracking-tight">
                Cultural Coverage &amp; Blind Spots
              </h3>
              <p className="text-xs text-sage-muted">
                See what the AI covered — and what Qloo revealed it missed.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            Evidence Insufficient
          </span>
        </div>
        <p className="text-xs text-sage-muted leading-relaxed">
          {coverage.summaryNote || 'Not enough Qloo-grounded cultural directions were available to calculate reliable coverage.'}
        </p>
      </section>
    );
  }

  const {
    coveragePercentage = 0,
    coveredDirections = [],
    blindSpots = [],
    totalSupportedDirections = 0,
    coveredDirectionsCount = 0,
    blindSpotsCount = 0,
    alternative
  } = coverage;

  return (
    <section className="bg-white border-2 border-sage-soft/80 rounded-3xl p-6 sm:p-8 shadow-sage-soft space-y-6">
      {/* 1. Header Bar: Title, Subtitle, Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-sage-mint">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sage-mint text-sage-dark flex items-center justify-center shadow-xs border border-sage-soft shrink-0">
            <Compass className="w-5 h-5 text-sage-dark" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg sm:text-xl font-bold text-sage-dark tracking-tight">
                Cultural Coverage
              </h3>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#EAF4EB] text-sage-dark border border-sage-soft">
                Qloo Intelligence
              </span>
            </div>
            <p className="text-xs sm:text-sm text-sage-muted">
              See what the AI covered — and what Qloo revealed it missed.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-sage-dark hover:text-sage px-3 py-1.5 rounded-full bg-sage-mint/30 hover:bg-sage-mint/60 border border-sage-soft transition cursor-pointer"
        >
          <span>{isExpanded ? 'Collapse' : 'Reveal Cultural Blind Spots'}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-sage" /> : <ChevronDown className="w-3.5 h-3.5 text-sage" />}
        </button>
      </div>

      {/* 2. Hero Summary Badge */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#EAF4EB] border border-sage-soft flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="text-3xl sm:text-4xl font-extrabold text-sage-dark tracking-tight">
            {coveragePercentage}%
          </div>
          <div className="space-y-0.5">
            <div className="text-xs font-bold uppercase tracking-wide text-sage-dark">
              Cultural Coverage Rate
            </div>
            <p className="text-xs text-sage-muted">
              {coveredDirectionsCount} of {totalSupportedDirections} cultural directions represented across the recommendation set
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold bg-white text-emerald-800 border border-sage-soft shadow-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            {coveredDirectionsCount} Covered
          </span>
          {blindSpotsCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              {blindSpotsCount} {blindSpotsCount === 1 ? 'Blind Spot' : 'Blind Spots'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold bg-white text-sage-dark border border-sage-soft shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-sage" />
              Comprehensive Coverage
            </span>
          )}
        </div>
      </div>

      {/* 3. Detailed Content Area (Expandable) */}
      {isExpanded && (
        <div className="space-y-6 animate-fade-in">
          {/* Two Columns: Covered vs What AI Missed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* LEFT: COVERED DIRECTIONS */}
            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-sage-mint space-y-4 shadow-xs flex flex-col justify-between">
              <div className="space-y-3.5">
                <div className="flex items-center justify-between pb-2.5 border-b border-sage-mint">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Covered Directions
                  </span>
                  <span className="text-[11px] font-semibold text-sage-muted">
                    {coveredDirections.length} verified
                  </span>
                </div>

                <div className="space-y-2.5">
                  {coveredDirections.map((dir, idx) => (
                    <div
                      key={idx}
                      className="p-3 sm:p-3.5 rounded-xl bg-[#FAFDF9] border border-sage-mint text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm font-bold text-sage-dark flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{dir.label}</span>
                        </strong>
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shrink-0">
                          COVERED
                        </span>
                      </div>
                      <p className="text-sage-muted text-[11px] leading-relaxed">
                        {dir.explanation}
                      </p>
                      {dir.representedBy && dir.representedBy.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {dir.representedBy.map((cand, cIdx) => (
                            <span
                              key={cIdx}
                              className="text-[10px] font-medium text-sage-dark bg-sage-mint/50 px-1.5 py-0.2 rounded border border-sage-soft"
                            >
                              {cand}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-sage-muted italic pt-2 border-t border-sage-mint/60">
                Grounded in direct Qloo entity attributes and verified metadata.
              </p>
            </div>

            {/* RIGHT: WHAT AI MISSED (BLIND SPOTS) */}
            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-amber-200/90 space-y-4 shadow-xs flex flex-col justify-between">
              <div className="space-y-3.5">
                <div className="flex items-center justify-between pb-2.5 border-b border-amber-200">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    What AI Missed
                  </span>
                  <span className="text-[11px] font-semibold text-amber-800">
                    {blindSpots.length} {blindSpots.length === 1 ? 'blind spot' : 'blind spots'}
                  </span>
                </div>

                {blindSpots.length > 0 ? (
                  <div className="space-y-2.5">
                    {blindSpots.map((spot, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 sm:p-4 rounded-xl bg-amber-50/50 border border-amber-200 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{spot.label}</span>
                          </strong>
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 shrink-0">
                            BLIND SPOT
                          </span>
                        </div>
                        <p className="text-sage-dark text-[11px] leading-relaxed">
                          {spot.explanation}
                        </p>
                        {spot.evidenceRefs && spot.evidenceRefs.length > 0 && (
                          <div className="text-[10px] text-sage-muted pt-1 flex flex-wrap gap-1">
                            <span className="font-semibold text-amber-900">Qloo Evidence:</span>
                            {spot.evidenceRefs.slice(0, 2).map((ref, rIdx) => (
                              <span key={rIdx} className="italic text-sage-dark bg-white/70 px-1.5 py-0.2 rounded border border-amber-200/60">
                                {ref}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-sage-mint/30 border border-sage-soft text-xs text-sage-dark space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>No Blind Spots Detected</span>
                    </div>
                    <p className="text-[11px] text-sage-muted leading-relaxed">
                      The AI recommendation set comprehensively represents all primary cultural directions identified in the Qloo taste cluster.
                    </p>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-amber-900/80 italic pt-2 border-t border-amber-200/60">
                Empirical blind spots derived from Qloo taste graph insights without hallucination.
              </p>
            </div>
          </div>

          {/* 4. QLOO-GROUNDED ALTERNATIVE (Optional ONE candidate for top blind spot) */}
          {alternative && (
            <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-[#FAFDF9] via-white to-[#FAFDF9] border-2 border-sage-soft shadow-xs space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-sage-mint">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sage" />
                  <span className="text-xs font-bold uppercase tracking-wider text-sage-dark">
                    Qloo-Grounded Alternative
                  </span>
                  <span className="text-[10px] font-semibold text-sage-muted bg-white px-2 py-0.5 rounded-full border border-sage-soft">
                    Addresses "{alternative.uncoveredDirection}"
                  </span>
                </div>
                <span className="text-[11px] text-sage-muted italic">
                  Not part of original recommendation audit score
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {alternative.imageUrl ? (
                    <div
                      className="relative w-14 h-14 rounded-xl overflow-hidden border border-sage-mint bg-sage-soft/20 shadow-xs shrink-0 cursor-pointer group aspect-square"
                      onClick={() => onOpenLightbox && onOpenLightbox(alternative.imageUrl!, alternative.name, alternative.type)}
                      title="Click to enlarge"
                    >
                      <img
                        src={alternative.imageUrl}
                        alt={alternative.name}
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ZoomIn className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-sage-mint/50 border border-sage-soft flex items-center justify-center shrink-0 aspect-square">
                      <Sparkles className="w-5 h-5 text-sage" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-base font-bold text-sage-dark truncate block">
                        {alternative.name}
                      </strong>
                      {typeof alternative.affinity === 'number' && (
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sage-mint/80 text-sage-dark border border-sage-soft shrink-0">
                          {Math.round(alternative.affinity * 100)}% Qloo Affinity
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-sage-dark leading-relaxed">
                      {alternative.rationale}
                    </p>
                    <div className="text-[10px] text-sage-muted">
                      Source: <span className="font-semibold text-sage-dark">{alternative.provenanceRef}</span>
                    </div>
                  </div>
                </div>

                {onSelectAlternativeForEvidence && (
                  <button
                    type="button"
                    onClick={() => onSelectAlternativeForEvidence(alternative)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-sage-dark hover:text-sage px-3.5 py-2 rounded-xl bg-white hover:bg-sage-mint/30 border border-sage-soft shadow-xs transition cursor-pointer shrink-0 self-end sm:self-center"
                  >
                    <span>View evidence in drawer</span>
                    <ArrowRight className="w-3.5 h-3.5 text-sage" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
