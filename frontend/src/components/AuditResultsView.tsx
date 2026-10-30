import React, { useState } from 'react';
import { AuditResponse, ItemResolutionEnvelope } from '../types/audit';
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Search,
  RotateCcw,
  Bot,
  Sparkles,
  TrendingUp,
  Sliders,
  Check,
  ZoomIn
} from 'lucide-react';
import { ImageLightboxModal } from './ImageLightboxModal';
import { CulturalCoverageView } from './CulturalCoverageView';

interface AuditResultsViewProps {
  response: AuditResponse;
  onNewAudit: () => void;
  onSelectEntityForEvidence: (envelope: ItemResolutionEnvelope) => void;
}

export const AuditResultsView: React.FC<AuditResultsViewProps> = ({
  response,
  onNewAudit,
  onSelectEntityForEvidence,
}) => {
  const auditReport = response.auditReport;
  const repairReport = response.repairReport;
  const agentTrace = response.agentTrace;
  const items = response.items || [];
  const rawRecommendation = response.input.rawRecommendation;

  // Lightbox modal state for large Qloo visual experience
  const [lightboxData, setLightboxData] = useState<{
    isOpen: boolean;
    imageUrl?: string;
    entityName: string;
    category?: string;
  }>({
    isOpen: false,
    entityName: '',
  });

  const openLightbox = (imageUrl: string, entityName: string, category?: string) => {
    setLightboxData({
      isOpen: true,
      imageUrl,
      entityName,
      category,
    });
  };

  const closeLightbox = () => {
    setLightboxData((prev) => ({ ...prev, isOpen: false }));
  };

  const getTopVerifiedTags = (envelope?: ItemResolutionEnvelope, limit = 4): string[] => {
    if (!envelope) return [];
    const entityTags = envelope.resolution.resolvedEntity?.tags || [];
    if (entityTags.length > 0) return entityTags.slice(0, limit);

    const signalTags = envelope.evidence?.signals
      ?.filter(s => s.signalType === 'cultural_tag' || s.signalType === 'taste_affinity')
      ?.map(s => s.relatedEntityName || '')
      ?.filter(Boolean) || [];

    return Array.from(new Set(signalTags)).slice(0, limit);
  };

  /**
   * Dynamic layout density configurations derived purely from candidate count.
   * Ensures recommendation cards auto-fit the panel height on desktop while
   * maintaining readability and touch targets on mobile/narrow screens.
   */
  const getDynamicDensity = (count: number) => {
    if (count <= 1) {
      return {
        desktopGridRows: 'minmax(0, auto)',
        gap: '0.75rem',
        cardPadding: 'p-4 sm:p-5',
        imageSize: 'w-16 h-16 sm:w-20 sm:h-20',
        titleSize: 'text-sm sm:text-base font-bold',
        badgeSize: 'text-[11px] font-bold px-2.5 py-0.5',
        tagCount: 4,
        tagPadding: 'px-2 py-0.5 text-[11px]',
        btnSize: 'text-xs font-bold',
        isScrollable: false,
      };
    } else if (count <= 3) {
      // 2-3 recommendations: expand comfortably to fill available panel height
      return {
        desktopGridRows: `repeat(${count}, minmax(0, 1fr))`,
        gap: count === 2 ? '0.875rem' : '0.625rem',
        cardPadding: count === 2 ? 'p-4 sm:p-4.5' : 'p-3 sm:p-3.5',
        imageSize: count === 2 ? 'w-16 h-16 sm:w-18 sm:h-18' : 'w-14 h-14 sm:w-16 sm:h-16',
        titleSize: 'text-sm sm:text-base font-bold',
        badgeSize: 'text-[11px] font-bold px-2 py-0.5',
        tagCount: 3,
        tagPadding: 'px-1.5 py-0.5 text-[10px]',
        btnSize: 'text-xs font-bold',
        isScrollable: false,
      };
    } else if (count === 4) {
      // 4 recommendations: moderately more compact, all 4 fit evenly
      return {
        desktopGridRows: 'repeat(4, minmax(0, 1fr))',
        gap: '0.5rem',
        cardPadding: 'p-2.5 sm:p-3',
        imageSize: 'w-12 h-12 sm:w-14 sm:h-14',
        titleSize: 'text-xs sm:text-sm font-bold',
        badgeSize: 'text-[10px] font-bold px-1.5 py-0.5',
        tagCount: 2,
        tagPadding: 'px-1.5 py-0.2 text-[10px]',
        btnSize: 'text-xs font-bold',
        isScrollable: false,
      };
    } else if (count === 5) {
      // 5 recommendations: compact fit, clean, never microscopic
      return {
        desktopGridRows: 'repeat(5, minmax(0, 1fr))',
        gap: '0.375rem',
        cardPadding: 'p-2 sm:p-2.5',
        imageSize: 'w-11 h-11 sm:w-12 sm:h-12',
        titleSize: 'text-xs sm:text-xs font-bold',
        badgeSize: 'text-[9.5px] font-bold px-1.5 py-0.2',
        tagCount: 2,
        tagPadding: 'px-1 py-0.2 text-[9px]',
        btnSize: 'text-[11px] font-bold',
        isScrollable: false,
      };
    } else {
      // > 5 recommendations: preserve usability with min-height and graceful scroll
      return {
        desktopGridRows: `repeat(${count}, minmax(76px, auto))`,
        gap: '0.375rem',
        cardPadding: 'p-2 sm:p-2.5',
        imageSize: 'w-11 h-11 sm:w-12 sm:h-12',
        titleSize: 'text-xs font-bold',
        badgeSize: 'text-[9.5px] font-bold px-1.5 py-0.2',
        tagCount: 1,
        tagPadding: 'px-1 py-0.2 text-[9px]',
        btnSize: 'text-[11px] font-bold',
        isScrollable: true,
      };
    }
  };

  // Determine scores strictly from backend response & candidate baselines
  const verifiedInitialScores = items
    .filter((it) => it.resolution?.status === 'resolved' && (it.initialAudit ?? it.audit) && (it.initialAudit ?? it.audit)?.decision.status !== 'insufficient_evidence')
    .map((env) => (env.initialAudit ?? env.audit)!.overallScore);

  const candidateBaselineAvg = verifiedInitialScores.length > 0
    ? Math.round(verifiedInitialScores.reduce((a, b) => a + b, 0) / verifiedInitialScores.length)
    : 0;

  const initialScore = repairReport
    ? Math.round(repairReport.averageScoreBefore)
    : (agentTrace?.initialOverallScore ?? (candidateBaselineAvg > 0 ? candidateBaselineAvg : (auditReport?.overallScore ?? 0)));

  const finalScore = repairReport && repairReport.averageScoreAfter > 0
    ? Math.round(repairReport.averageScoreAfter)
    : (agentTrace?.finalOverallScore ?? (auditReport?.overallScore ?? 0));

  // Score delta must ALWAYS strictly equal finalScore - initialScore
  const scoreDelta = finalScore - initialScore;

  const dims = auditReport?.dimensionsSummary || {
    culturalAlignment: 0,
    contextualRelevance: 0,
    constraintCompliance: 0,
    evidenceCompleteness: 0,
  };

  const repairedItems = repairReport?.repairedItems || [];
  const hasAttemptedRepair =
    (repairedItems.length > 0 && repairedItems.some(r => !!r.selectedCandidate)) ||
    (agentTrace?.events?.some(e => e.decision === 'REPAIR') ?? false);

  const hasSuccessfulRepair =
    (repairedItems.length > 0 && scoreDelta > 0 && repairedItems.some(r => r.verifiedImprovement || (r.scoreDelta ?? 0) > 0)) ||
    (scoreDelta > 0 && (agentTrace?.events?.some(e => e.decision === 'REPAIR' && (e.scoreDelta ?? 0) > 0) ?? false));

  const hasEvidenceStrengthened =
    !hasSuccessfulRepair &&
    scoreDelta > 0 &&
    (agentTrace?.events?.some(e => e.decision === 'MORE_EVIDENCE' && (e.scoreDelta ?? 0) > 0) ?? false);

  const isZeroImprovementRepair = hasAttemptedRepair && scoreDelta <= 0;

  const isZeroImprovementEvidence =
    !hasSuccessfulRepair &&
    !hasAttemptedRepair &&
    scoreDelta <= 0 &&
    (agentTrace?.events?.some(e => e.decision === 'MORE_EVIDENCE') ?? false);

  const isProviderFailure = agentTrace?.finalStopReason === 'provider_failure' && !hasSuccessfulRepair;

  const isAlreadyGrounded =
    scoreDelta === 0 &&
    !hasAttemptedRepair &&
    !hasEvidenceStrengthened &&
    !isZeroImprovementEvidence &&
    !isProviderFailure &&
    ((agentTrace?.terminalState === 'ACCEPTED') || auditReport?.decision.status === 'supported');

  const isCulturallyVerified =
    (agentTrace?.terminalState === 'ACCEPTED' || auditReport?.decision.status === 'supported') &&
    finalScore >= 70;

  // Human-friendly status derived deterministically from final score & agent loop outcome
  const getScoreStatus = (score: number) => {
    if (hasSuccessfulRepair) {
      return {
        label: 'Repaired successfully',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
        explanation: 'Recommendations were successfully repaired with culturally grounded alternatives from the Qloo taste graph.'
      };
    } else if (hasEvidenceStrengthened) {
      return {
        label: 'Evidence strengthened',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
        explanation: 'Cultural grounding was verified and strengthened with additional empirical evidence from the Qloo taste graph.'
      };
    } else if (isZeroImprovementRepair) {
      return {
        label: 'No improvement — original grounded result preserved',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500',
        explanation: 'Repair candidate evaluated; deterministic re-audit found no improvement. Original grounded result preserved.'
      };
    } else if (isZeroImprovementEvidence) {
      return {
        label: 'Additional evidence found — no score improvement',
        badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
        dotClass: 'bg-blue-500',
        explanation: 'Additional Qloo evidence was retrieved, confirming cultural context with no change to the baseline score.'
      };
    } else if (isProviderFailure) {
      return {
        label: 'Provider unavailable — deterministic audit preserved',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500',
        explanation: 'AI reasoning layer was unavailable; deterministic Qloo cultural audit preserved without fabrication.'
      };
    } else if (isAlreadyGrounded) {
      return {
        label: 'Already grounded',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
        explanation: 'Recommendations already demonstrate strong cultural grounding against the Qloo taste graph without modification.'
      };
    } else if (score >= 80 && agentTrace?.terminalState === 'ACCEPTED') {
      return {
        label: 'Strong Cultural Fit',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
        explanation: 'Recommendations are supported by verified cultural evidence in the Qloo taste graph.'
      };
    } else if (score >= 60) {
      return {
        label: 'Partially Grounded',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500',
        explanation: 'Some recommendations are supported, while others need stronger evidence or constraint alignment.'
      };
    } else {
      return {
        label: 'Insufficient Evidence',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        dotClass: 'bg-rose-500',
        explanation: auditReport?.decision.explanation ||
          'Some recommendations could not be confidently validated against available cultural evidence.'
      };
    }
  };

  const statusInfo = getScoreStatus(finalScore);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Top Bar: Clean Action & Pipeline Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-sage-mint">
        <button
          type="button"
          onClick={onNewAudit}
          className="inline-flex items-center gap-2 text-xs font-semibold text-sage-dark hover:text-sage px-4 py-2 rounded-full bg-white hover:bg-sage-mint/30 border border-sage-mint shadow-xs transition cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-sage" />
          <span>New Recommendation Audit</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-sage-dark">
          <CheckCircle2 className="w-4 h-4 text-sage" />
          <span className="font-bold">AUDIT COMPLETE</span>
          <span className="text-sage-soft">&bull;</span>
          <span className="text-sage-muted">Verified against Qloo Taste Graph</span>
        </div>
      </div>

      {/* 11. "HOW IT WORKS" MICRO GUIDE */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-sage-mint shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sage-dark shrink-0">
          <Sparkles className="w-4 h-4 text-sage" />
          <span>How TasteAudit Works</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 text-xs">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-sage-mint text-sage-dark font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
            <div>
              <strong className="text-sage-dark block font-semibold">Paste</strong>
              <span className="text-sage-muted text-[11px]">Your AI recommendation</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-sage-mint text-sage-dark font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
            <div>
              <strong className="text-sage-dark block font-semibold">Verify</strong>
              <span className="text-sage-muted text-[11px]">Qloo checks cultural context</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-sage-mint text-sage-dark font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
            <div>
              <strong className="text-sage-dark block font-semibold">Ground</strong>
              <span className="text-sage-muted text-[11px]">Agent repairs weak items</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-sage-mint text-sage-dark font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
            <div>
              <strong className="text-sage-dark block font-semibold">Explain</strong>
              <span className="text-sage-muted text-[11px]">Evidence behind the result</span>
            </div>
          </div>
        </div>
      </div>

      {/* 1. HUMAN-FRIENDLY SCORE HEADER & TECHNICAL DIMENSIONS */}
      <section className="bg-white border-2 border-sage-mint rounded-3xl p-6 sm:p-10 shadow-sage-soft relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-sage-mint/30 rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left: Overall Score + Status + Short Explanation */}
          <div className="lg:col-span-5 space-y-3.5">
            <span className="text-xs font-bold uppercase tracking-widest text-sage-muted block">
              Cultural Grounding Score
            </span>

            <div className="flex items-baseline gap-3">
              <span className="text-6xl sm:text-7xl font-black text-sage-dark tracking-tight">
                {finalScore}
              </span>
              <span className="text-2xl font-medium text-sage-muted">/ 100</span>

              {/* Status Badge */}
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusInfo.badgeClass}`}>
                <span className={`w-2 h-2 rounded-full ${statusInfo.dotClass}`} />
                {statusInfo.label}
              </span>
            </div>

            {/* Multi-Recommendation Summary */}
            {items.length > 1 && (
              <div className="text-xs font-bold text-sage-dark flex items-center gap-2 pt-0.5">
                <span className="px-2.5 py-0.5 rounded-full bg-sage-mint/60 border border-sage-soft text-sage-dark">
                  Verified: {auditReport?.verifiedItemsCount ?? items.filter(it => it.resolution?.status === 'resolved' && it.audit && it.audit.decision.status !== 'insufficient_evidence').length} / {items.length}{items.some(it => it.resolution?.status === 'unresolved') ? ` • Unverified: ${items.filter(it => it.resolution?.status === 'unresolved').length}` : ''}{items.some(it => it.resolution?.status === 'ambiguous') ? ` • Ambiguous: ${items.filter(it => it.resolution?.status === 'ambiguous').length}` : ''}
                </span>
                {scoreDelta === 0 && (
                  <span className="text-sage-muted font-normal text-[11px]">
                    (Average verified score)
                  </span>
                )}
              </div>
            )}

            {/* Score Delta if action occurred */}
            {scoreDelta > 0 ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sage-mint/80 border border-sage-soft text-sage-dark text-xs font-bold shadow-xs">
                <TrendingUp className="w-3.5 h-3.5 text-sage" />
                <span>{hasSuccessfulRepair ? `Repaired successfully (+${scoreDelta})` : `Evidence strengthened (+${scoreDelta})`}</span>
                <span className="text-sage-muted font-normal">({initialScore} → {finalScore})</span>
              </div>
            ) : isZeroImprovementRepair ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-xs">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>{initialScore} → {finalScore} — No improvement — original grounded result preserved</span>
              </div>
            ) : isZeroImprovementEvidence ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold shadow-xs">
                <Search className="w-3.5 h-3.5 text-blue-600" />
                <span>Additional evidence found — no score improvement ({initialScore} → {finalScore})</span>
              </div>
            ) : isAlreadyGrounded ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sage-mint/80 border border-sage-soft text-sage-dark text-xs font-bold shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-sage" />
                <span>Already grounded ({finalScore}/100)</span>
              </div>
            ) : null}

            <p className="text-sm text-sage-dark leading-relaxed font-normal pt-1">
              {statusInfo.explanation}
            </p>

            <div className="pt-1 flex items-center gap-2 text-[11px] text-sage-muted">
              <span>Source: Qloo Cultural Intelligence Graph</span>
              <span>&bull;</span>
              <span>Strict Server-Side Isolation</span>
            </div>
          </div>

          {/* Right: Technical Grounding Dimensions (Secondary) */}
          <div className="lg:col-span-7 space-y-3.5 pl-0 lg:pl-8 border-t lg:border-t-0 lg:border-l border-sage-mint pt-6 lg:pt-0">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-sage-dark mb-1">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-sage" />
                Grounding Dimensions
              </span>
              <span className="text-[11px] text-sage-muted font-normal lowercase">Deterministic weights</span>
            </div>

            {/* Cultural Alignment */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-sage-dark">
                <span>Cultural Alignment <span className="text-sage-muted font-normal text-[11px]">(40%)</span></span>
                <span className="font-bold text-sage-dark">{dims.culturalAlignment} / 100</span>
              </div>
              <div className="w-full h-2 rounded-full bg-sage-mint/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sage transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(0, dims.culturalAlignment))}%` }}
                />
              </div>
            </div>

            {/* Contextual Relevance */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-sage-dark">
                <span>Contextual Relevance <span className="text-sage-muted font-normal text-[11px]">(25%)</span></span>
                <span className="font-bold text-sage-dark">{dims.contextualRelevance} / 100</span>
              </div>
              <div className="w-full h-2 rounded-full bg-sage-mint/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sage transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(0, dims.contextualRelevance))}%` }}
                />
              </div>
            </div>

            {/* Constraint Compliance */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-sage-dark">
                <span>Constraint Compliance <span className="text-sage-muted font-normal text-[11px]">(20%)</span></span>
                <span className="font-bold text-sage-dark">{dims.constraintCompliance} / 100</span>
              </div>
              <div className="w-full h-2 rounded-full bg-sage-mint/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sage transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(0, dims.constraintCompliance))}%` }}
                />
              </div>
            </div>

            {/* Evidence Completeness */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-sage-dark">
                <span>Evidence Completeness <span className="text-sage-muted font-normal text-[11px]">(15%)</span></span>
                <span className="font-bold text-sage-dark">{dims.evidenceCompleteness} / 100</span>
              </div>
              <div className="w-full h-2 rounded-full bg-sage-mint/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sage transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(0, dims.evidenceCompleteness))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. BEFORE & AFTER EXPERIENCE */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold text-sage-dark tracking-tight">
            Before &amp; After Cultural Grounding
          </h2>
          <span className="text-xs text-sage-muted">
            {hasSuccessfulRepair
              ? `${repairedItems.filter(r => (r.scoreDelta ?? 0) > 0).length} successful repair${repairedItems.length > 1 ? 's' : ''}`
              : isZeroImprovementRepair
              ? 'No improvement — original grounded result preserved'
              : 'Verified against Qloo Graph'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* ORIGINAL AI RECOMMENDATION (BEFORE) */}
          <div className="rounded-3xl bg-white border border-sage-mint p-6 sm:p-7 flex flex-col justify-between space-y-5 shadow-sage-card">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-sage-mint">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Original AI Recommendation
                </span>
                <span className="text-sm font-bold text-sage-muted">
                  Pre-grounding baseline: {initialScore} / 100
                </span>
              </div>

              {/* Recommendation quote */}
              <blockquote className="text-sm sm:text-base text-sage-dark font-normal leading-relaxed italic border-l-3 border-sage-soft pl-4 py-1">
                "{rawRecommendation}"
              </blockquote>

              {/* Original Request Context if provided */}
              {(response.input.audienceContext || response.input.location || (response.input.constraints && response.input.constraints.length > 0)) && (
                <div className="p-3 rounded-xl bg-[#FAFDF9] border border-sage-mint/80 space-y-1.5 text-xs">
                  <span className="text-[11px] font-bold text-sage-muted uppercase tracking-wider block">
                    Original Request Context:
                  </span>
                  <div className="space-y-1 text-sage-dark">
                    {response.input.audienceContext && (
                      <div className="truncate"><strong className="text-sage-muted font-medium">Audience:</strong> {response.input.audienceContext}</div>
                    )}
                    {response.input.location && (
                      <div className="truncate"><strong className="text-sage-muted font-medium">Location:</strong> {response.input.location}</div>
                    )}
                    {response.input.constraints && response.input.constraints.length > 0 && (
                      <div className="truncate"><strong className="text-sage-muted font-medium">Constraints:</strong> {response.input.constraints.join(' · ')}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Detected issues list */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-bold text-sage-dark uppercase tracking-wide block">
                  Detected Cultural Issues:
                </span>
                <div className="space-y-2">
                  {items.map((env, idx) => {
                    const audit = env.initialAudit ?? env.audit;
                    const reasons = audit?.dimensions.constraintCompliance.reasons || [];
                    const failedReasons = reasons.filter(r => r.includes('[FAIL]') || r.includes('[UNVERIFIED]'));

                    // STRICT IMAGE OWNERSHIP RULE: Original AI Recommendation has NO Qloo image (imageUrl is undefined)
                    return (
                      <div key={idx} className="p-3.5 rounded-xl bg-[#FAFDF9] border border-sage-mint text-xs flex items-start gap-3">
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="font-bold text-sage-dark flex items-center justify-between">
                            <span className="truncate">{env.item.name}</span>
                            <span className="text-xs font-bold text-amber-700 shrink-0">
                              {env.resolution?.status !== 'resolved' || audit?.decision.status === 'insufficient_evidence'
                                ? `Pre-grounding baseline: ${audit?.overallScore ?? 0}/100`
                                : `Pre-grounding baseline: ${audit?.overallScore ?? initialScore}/100`}
                            </span>
                          </div>
                          <p className="text-sage-muted text-[11px] leading-relaxed line-clamp-2">
                            {failedReasons.length > 0
                              ? failedReasons[0].replace(/^\[(FAIL|UNVERIFIED)\]\s*/, '')
                              : audit?.decision.explanation || 'Evaluated against Qloo taste intelligence.'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <p className="text-xs text-sage-muted italic pt-1">
              Pre-grounding recommendation produced without cultural verification.
            </p>
          </div>

          {/* RIGHT-HAND RESULT CARD (AFTER / AUDIT OUTCOME) */}
          <div className={`rounded-3xl border-2 p-6 sm:p-7 flex flex-col shadow-sage-soft relative overflow-hidden ${
            hasSuccessfulRepair || (isCulturallyVerified && !isZeroImprovementRepair)
              ? 'bg-[#EAF4EB] border-sage-soft'
              : 'bg-[#FAFDF9] border-amber-200/80'
          }`}>
            {/* Top Header Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-sage-soft/70 shrink-0 mb-3.5">
                <span className="text-xs font-bold uppercase tracking-wider text-sage-dark flex items-center gap-1.5">
                  {hasSuccessfulRepair || hasEvidenceStrengthened || (isCulturallyVerified && !isZeroImprovementRepair) ? (
                    <CheckCircle2 className="w-4 h-4 text-sage" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                  {hasSuccessfulRepair
                    ? 'Repaired successfully'
                    : hasEvidenceStrengthened
                    ? 'Evidence strengthened'
                    : isZeroImprovementRepair
                    ? 'No improvement — original grounded result preserved'
                    : isZeroImprovementEvidence
                    ? 'Additional evidence found — no score improvement'
                    : isAlreadyGrounded
                    ? 'Already grounded'
                    : isCulturallyVerified
                    ? 'Culturally Grounded Result'
                    : 'Insufficient Evidence'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-sage-dark">
                    {finalScore} / 100
                  </span>
                  {scoreDelta > 0 ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sage-dark text-white">
                      +{scoreDelta} {hasSuccessfulRepair ? 'Repaired successfully' : 'Evidence strengthened'}
                    </span>
                  ) : isZeroImprovementRepair ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                      {initialScore} → {finalScore} — No improvement
                    </span>
                  ) : isZeroImprovementEvidence ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                      {initialScore} → {finalScore} — No score change
                    </span>
                  ) : isAlreadyGrounded ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sage-mint text-sage-dark border border-sage-soft">
                      Already grounded
                    </span>
                  ) : null}
                </div>
              </div>

            {/* Dynamic Content Area: takes available space between header and footer */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Repaired Entities (Shown ONLY if repair actually succeeded) */}
              {hasSuccessfulRepair && repairedItems.length > 0 ? (
                <div className="flex-1 flex flex-col min-h-0 space-y-3.5 overflow-y-auto pr-0.5">
                  {repairedItems.map((rep, idx) => {
                    const cand = rep.selectedCandidate;
                    const afterItemScore = rep.afterAudit?.overallScore ?? rep.beforeAudit.overallScore;
                    const relatedEnv = items.find(
                      it => it.item.name.toLowerCase() === rep.originalItem.toLowerCase() ||
                            it.item.id === rep.beforeAudit.itemId
                    );

                    const itemImageUrl = cand?.imageUrl || relatedEnv?.resolution.resolvedEntity?.imageUrl;
                    const topTags = relatedEnv ? getTopVerifiedTags(relatedEnv, 4) : [];

                    return (
                      <div key={idx} className="p-4 sm:p-5 rounded-2xl bg-white border border-sage-soft space-y-3.5 shadow-xs">
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                          {itemImageUrl && (
                            <div
                              className="relative w-full sm:w-36 h-36 rounded-xl overflow-hidden border border-sage-soft bg-sage-soft/20 shadow-xs shrink-0 cursor-pointer group"
                              onClick={() => openLightbox(itemImageUrl, cand?.name || rep.originalItem, cand?.type)}
                              title="Click to enlarge image"
                            >
                              <img
                                src={itemImageUrl}
                                alt={cand?.name || rep.originalItem}
                                loading="lazy"
                                onError={(e) => {
                                  (e.currentTarget as HTMLElement).style.display = 'none';
                                }}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/90 text-sage-dark shadow-sm">
                                  <ZoomIn className="w-3 h-3 text-sage" /> Enlarge
                                </span>
                              </div>
                            </div>
                          )}

                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-xs sm:text-sm">
                                <span className="text-sage-muted line-through truncate max-w-[120px]">
                                  {rep.originalItem}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-sage shrink-0" />
                                <strong className="text-sage-dark font-bold truncate">
                                  {cand?.name || rep.originalItem}
                                </strong>
                              </div>
                              <span className="text-xs font-bold text-sage-dark bg-sage-mint px-2.5 py-0.5 rounded-full shrink-0 border border-sage-soft">
                                {rep.beforeAudit.overallScore} → {afterItemScore}/100
                              </span>
                            </div>

                            {rep.scoreDelta !== undefined && rep.scoreDelta <= 0 && (
                              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                                <strong>Repair attempted, but deterministic re-audit found no improvement. The Agent stopped safely.</strong>
                              </div>
                            )}

                            <p className="text-xs text-sage-dark leading-relaxed italic">
                              "{rep.reasoning}"
                            </p>

                            {/* Verified Qloo Signals */}
                            {topTags.length > 0 && (
                              <div className="pt-1 flex flex-wrap gap-1.5">
                                {topTags.map((t, tIdx) => (
                                  <span
                                    key={tIdx}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-sage-dark bg-sage-mint/40 border border-sage-mint px-2 py-0.5 rounded-md"
                                  >
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="pt-2 border-t border-sage-mint flex items-center justify-between text-xs">
                              <span className="text-[11px] text-sage-muted">
                                Qloo Entity: <strong className="text-sage-dark">{cand?.name || 'Verified'}</strong>
                              </span>
                              {relatedEnv && (
                                <button
                                  type="button"
                                  onClick={() => onSelectEntityForEvidence(relatedEnv)}
                                  className="text-xs font-bold text-sage-dark hover:text-sage flex items-center gap-1 transition cursor-pointer"
                                >
                                  <span>View evidence &rarr;</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                (() => {
                  const verifiedCount = items.filter(
                    it => it.resolution?.status === 'resolved' && it.audit && it.audit.decision.status !== 'insufficient_evidence'
                  ).length;

                  // ALL CANDIDATE GROUNDED SETS (1, 2, 3, 4, 5+ recommendations)
                  if (items.length > 0) {
                    const density = getDynamicDensity(items.length);

                    return (
                      <div className="flex-1 flex flex-col min-h-0">
                        {/* Aggregate summary badge */}
                        <div className="p-3 sm:p-3.5 rounded-2xl bg-white border border-sage-soft flex items-center justify-between gap-2 shadow-xs shrink-0 mb-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="text-xs font-bold text-sage-dark">
                              {verifiedCount === items.length
                                ? `All ${verifiedCount} of ${items.length} ${items.length === 1 ? 'recommendation' : 'recommendations'} culturally grounded`
                                : `${verifiedCount} of ${items.length} ${items.length === 1 ? 'recommendation' : 'recommendations'} culturally grounded`}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-sage-dark bg-sage-mint/60 border border-sage-soft px-2.5 py-0.5 rounded-full shrink-0">
                            Aggregate: ${finalScore}/100
                          </span>
                        </div>

                        {/* Recommendation list: dynamically auto-fits remaining vertical space */}
                        <div
                          className={`flex-1 min-h-0 dynamic-recommendation-grid ${
                            density.isScrollable ? 'overflow-y-auto pr-1' : ''
                          }`}
                          style={{
                            '--item-count': items.length,
                            '--grid-gap': density.gap,
                            '--desktop-grid-rows': density.desktopGridRows,
                          } as React.CSSProperties}
                        >
                          {items.map((env, idx) => {
                            const res = env.resolution;
                            const entity = res.resolvedEntity;
                            const imgUrl = entity?.imageUrl;
                            const itemScore = env.audit?.overallScore ?? 0;
                            const topTags = getTopVerifiedTags(env, density.tagCount);
                            const isResolved = res.status === 'resolved';

                            return (
                              <div
                                key={idx}
                                className={`${density.cardPadding} rounded-2xl bg-white border border-sage-soft shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-h-0 transition-all`}
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  {imgUrl ? (
                                    <div
                                      className={`relative ${density.imageSize} rounded-xl overflow-hidden border border-sage-mint bg-sage-soft/20 shadow-xs shrink-0 cursor-pointer group aspect-square`}
                                      onClick={() => openLightbox(imgUrl, entity?.name || env.item.name, entity?.type)}
                                      title="Click to enlarge"
                                    >
                                      <img
                                        src={imgUrl}
                                        alt={entity?.name || env.item.name}
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
                                    <div className={`${density.imageSize} rounded-xl bg-sage-mint/50 border border-sage-soft flex items-center justify-center shrink-0 aspect-square`}>
                                      <CheckCircle2 className="w-5 h-5 text-sage" />
                                    </div>
                                  )}

                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <strong className={`${density.titleSize} text-sage-dark truncate block`}>
                                        {entity?.name || env.item.name}
                                      </strong>
                                      <span className={`${density.badgeSize} rounded-full border shrink-0 ${
                                        isResolved
                                          ? 'bg-sage-mint/80 text-sage-dark border-sage-soft'
                                          : 'bg-gray-100 text-gray-700 border-gray-200'
                                      }`}>
                                        Verified Qloo grounding: ${itemScore}/100 &bull; ${isResolved ? 'SUPPORTED' : 'UNVERIFIED'}
                                      </span>
                                    </div>

                                    {topTags.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {topTags.map((tag, tIdx) => (
                                          <span
                                            key={tIdx}
                                            className={`inline-flex items-center gap-0.5 font-medium text-sage-dark bg-sage-mint/40 border border-sage-mint rounded ${density.tagPadding}`}
                                          >
                                            <Check className="w-2.5 h-2.5 text-emerald-600" />
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => onSelectEntityForEvidence(env)}
                                  className={`${density.btnSize} text-sage-dark hover:text-sage flex items-center gap-1 transition cursor-pointer shrink-0 self-end sm:self-center`}
                                >
                                  <span>View evidence</span>
                                  <ArrowRight className="w-3.5 h-3.5 text-sage" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // Empty fallback if items array is empty
                  return (
                    <div className="p-5 rounded-xl bg-white border border-sage-soft space-y-2 text-xs shadow-xs">
                      <div className="flex items-center gap-2 text-sage-dark font-bold text-sm">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Recommendations Culturally Verified</span>
                      </div>
                      <p className="text-sage-dark leading-relaxed">
                        The requested recommendations exhibit strong alignment with empirical Qloo taste signals without requiring candidate substitution.
                      </p>
                    </div>
                  );
                })()
              )}
            </div>

            <p className="text-xs text-sage-dark font-medium italic pt-3 shrink-0">
              {hasSuccessfulRepair
                ? 'Evidence-backed alternative anchored to the Qloo taste intelligence graph.'
                : isZeroImprovementRepair
                ? 'Repair candidate evaluated; deterministic audit preserved baseline score.'
                : isCulturallyVerified
                ? 'Empirically supported recommendation aligned with Qloo taste signals.'
                : 'Cultural baseline preserved without speculative modifications.'}
            </p>
          </div>
        </div>
      </section>

      {/* 4 & 5. AGENT LOOP VISUALIZATION (Human-Readable Visual Flow) */}
      {agentTrace && (
        <section className="bg-white border-2 border-sage-soft/70 rounded-3xl p-6 sm:p-8 shadow-sage-soft space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-sage-mint">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-sage-mint text-sage-dark">
                <Bot className="w-5 h-5 text-sage-dark" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-sage-dark tracking-tight">
                  TasteAudit Autonomous Agent Flow
                </h3>
                <p className="text-xs text-sage-muted">
                  Bounded Stage 6 Orchestration Loop &bull; {agentTrace.totalIterations} iteration(s) &bull; Terminal State:{' '}
                  <strong className={agentTrace.terminalState === 'ACCEPTED' ? 'text-emerald-700' : 'text-sage-dark'}>
                    {agentTrace.terminalState}
                  </strong>
                </p>
              </div>
            </div>

            {/* Score Delta Badge */}
            {scoreDelta > 0 && (
              <div className="px-3 py-1 rounded-full bg-sage-mint border border-sage-soft text-sage-dark text-xs font-bold shadow-xs">
                {agentTrace.initialOverallScore} → {agentTrace.finalOverallScore} (+{scoreDelta} score improvement)
              </div>
            )}
          </div>

          {/* Sequential Timeline of Agent Steps */}
          <div className="space-y-4 pt-1">
            {agentTrace.events.map((evt, idx) => {
              const isLast = idx === agentTrace.events.length - 1;

              return (
                <div key={idx} className="relative flex items-start gap-3 sm:gap-4">
                  {/* Vertical connector line */}
                  {!isLast && (
                    <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-sage-mint -mb-4 pointer-events-none" />
                  )}

                  {/* Step Icon Badge */}
                  <div className="w-8 h-8 rounded-full bg-[#FAFDF9] border-2 border-sage-soft flex items-center justify-center shrink-0 z-10 shadow-xs">
                    {evt.decision === 'ACCEPT' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    {evt.decision === 'REPAIR' && <RotateCcw className="w-4 h-4 text-sage" />}
                    {evt.decision === 'MORE_EVIDENCE' && <Search className="w-4 h-4 text-blue-600" />}
                    {evt.decision === 'STOP' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                  </div>

                  {/* Step Card Content */}
                  <div className="flex-1 p-4 rounded-2xl bg-[#FAFDF9] border border-sage-mint space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-sage-muted">
                          Step {evt.step} (Iteration {evt.iteration})
                        </span>
                        <span className="text-sage-soft">&bull;</span>

                        {/* Decision Pill */}
                        {evt.decision === 'ACCEPT' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            ✓ ACCEPTED
                          </span>
                        )}
                        {evt.decision === 'REPAIR' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sage-mint text-sage-dark border border-sage-soft">
                            ↻ REPAIR
                          </span>
                        )}
                        {evt.decision === 'MORE_EVIDENCE' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                            🔎 MORE EVIDENCE
                          </span>
                        )}
                        {evt.decision === 'STOP' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            ■ STOPPED
                          </span>
                        )}
                      </div>

                      {evt.scoreAfter !== undefined && (
                        <span className="text-xs font-bold text-sage-dark">
                          {evt.scoreBefore !== undefined && evt.scoreBefore !== evt.scoreAfter
                            ? `Score: ${evt.scoreBefore} → ${evt.scoreAfter}/100`
                            : `Score: ${evt.scoreAfter}/100`}
                        </span>
                      )}
                    </div>

                    {/* Human readable decision description */}
                    <div className="text-xs text-sage-dark leading-relaxed">
                      {evt.decision === 'ACCEPT' && (
                        <p className="font-semibold text-emerald-900">
                          Recommendation already met the grounding threshold or verified improvement was achieved.
                        </p>
                      )}
                      {evt.decision === 'REPAIR' && (
                        <p className="font-semibold text-sage-dark">
                          Recommendation required stronger cultural grounding. Verified Qloo replacement evaluated.
                        </p>
                      )}
                      {evt.decision === 'MORE_EVIDENCE' && (
                        <p className="font-semibold text-blue-900">
                          Additional empirical Qloo evidence was requested to resolve ambiguity.
                        </p>
                      )}
                      {evt.decision === 'STOP' && (
                        <p className="font-semibold text-amber-900">
                          Agent loop concluded: {evt.stopReason || agentTrace.finalStopReason || 'Halted bounded loop safely.'}
                        </p>
                      )}
                    </div>

                    {/* Reasoning explanation */}
                    <p className="text-xs text-sage-muted italic bg-white p-2.5 rounded-xl border border-sage-mint">
                      "{evt.reasoning}"
                    </p>

                    {/* Action summary */}
                    {evt.actionPerformed?.action && (
                      <div className="text-[11px] text-sage-muted pt-1 flex flex-wrap items-center gap-1.5">
                        <strong className="text-sage-dark font-medium">Action:</strong>
                        <span>{evt.actionPerformed.action}</span>
                        {evt.targetItemName && (
                          <span className="text-sage-dark font-semibold">
                            on "{evt.targetItemName}"
                            {evt.actionPerformed.targetScoreBefore !== undefined && evt.actionPerformed.targetScoreAfter !== undefined && (
                              <span className="font-normal text-sage-muted"> ({evt.actionPerformed.targetScoreBefore} → {evt.actionPerformed.targetScoreAfter}/100)</span>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Loop Summary Footer */}
          <div className="p-3.5 rounded-xl bg-sage-mint/30 border border-sage-soft flex flex-wrap items-center justify-between text-xs text-sage-dark gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Terminal Result:</span>
              <span>{agentTrace.finalStopReason || `Loop completed with state ${agentTrace.terminalState}`}</span>
            </div>
            <div className="text-sage-muted text-[11px]">
              Execution Time: {(agentTrace.totalDurationMs / 1000).toFixed(2)}s
            </div>
          </div>
        </section>
      )}

      {/* CULTURAL COVERAGE & BLIND SPOT INTELLIGENCE */}
      {response.culturalCoverage && (
        <CulturalCoverageView
          coverage={response.culturalCoverage}
          onOpenLightbox={openLightbox}
          onSelectAlternativeForEvidence={(alt) => {
            const matchingEnv = items.find(it => it.resolution?.resolvedEntity?.id === alt.entityId);
            if (matchingEnv) {
              onSelectEntityForEvidence(matchingEnv);
            } else {
              onSelectEntityForEvidence({
                item: { id: alt.entityId, name: alt.name, category: alt.type },
                resolution: {
                  query: alt.name,
                  status: 'resolved',
                  resolvedEntity: {
                    id: alt.entityId,
                    name: alt.name,
                    type: alt.type || 'urn:entity:creative_work',
                    category: 'entity',
                    imageUrl: alt.imageUrl,
                    tags: [alt.uncoveredDirection],
                    source: 'qloo',
                    retrievedAt: new Date().toISOString()
                  },
                  candidates: [],
                  provenance: {
                    entityId: alt.entityId,
                    qlooType: alt.type || 'urn:entity:creative_work',
                    source: 'qloo',
                    operation: 'blind_spot_alternative',
                    correlationId: 'alt_view',
                    retrievedAt: new Date().toISOString(),
                    classification: 'Supported' as const,
                    resolutionStatus: 'resolved' as const
                  }
                },
                evidence: {
                  status: 'supported',
                  entityId: alt.entityId,
                  entityName: alt.name,
                  signals: [
                    {
                      signalType: 'taste_affinity',
                      relatedEntityName: alt.name,
                      value: alt.affinity,
                      tags: [alt.uncoveredDirection]
                    }
                  ],
                  summary: { signalsCount: 1, hasLocationSignal: false },
                  provenance: {
                    source: 'qloo',
                    endpoint: '/v2/insights',
                    operation: 'blind_spot_alternative',
                    correlationId: 'alt_view',
                    retrievedAt: new Date().toISOString(),
                    queryMetadata: {},
                    classification: 'Supported'
                  }
                }
              });
            }
          }}
        />
      )}

      {/* 3. AUDIT FINDINGS & EVIDENCE STATES */}
      <section className="space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-sage-dark tracking-tight">
          Audit Findings &amp; Evidence States
        </h2>

        <div className="space-y-3">
          {items.map((envelope, idx) => {
            const item = envelope.item;
            const res = envelope.resolution;
            const audit = envelope.audit;
            const evidence = envelope.evidence;

            const classification = audit?.provenance.classification ||
              evidence?.provenance.classification ||
              res.provenance.classification ||
              'Unverified';

            const imageUrl = res.resolvedEntity?.imageUrl;
            const topTags = getTopVerifiedTags(envelope, 4);

            return (
              <div
                key={idx}
                className="p-5 sm:p-6 rounded-2xl bg-white border border-sage-mint hover:border-sage-soft transition flex flex-col sm:flex-row sm:items-start justify-between gap-5 shadow-sage-card"
              >
                <div className="flex flex-col sm:flex-row items-start gap-4 flex-1 min-w-0">
                  {imageUrl && (
                    <div
                      className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden border border-sage-mint bg-sage-soft/20 shadow-xs shrink-0 cursor-pointer group"
                      onClick={() => openLightbox(imageUrl, item.name, res.resolvedEntity?.type)}
                      title="Click to enlarge image"
                    >
                      <img
                        src={imageUrl}
                        alt={item.name}
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/90 text-sage-dark shadow-sm">
                          <ZoomIn className="w-3 h-3 text-sage" /> Enlarge
                        </span>
                      </div>
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-medium tracking-tight pointer-events-none">
                        Qloo
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-base sm:text-lg font-bold text-sage-dark tracking-tight truncate">
                        {item.name}
                      </span>

                      {/* Status Pill */}
                      {classification === 'Supported' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sage-mint text-sage-dark border border-sage-soft">
                          <CheckCircle2 className="w-3 h-3 text-sage" /> SUPPORTED
                        </span>
                      )}
                      {classification === 'Inferred' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-600" /> INFERRED
                        </span>
                      )}
                      {classification === 'Unverified' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                          <HelpCircle className="w-3 h-3 text-gray-500" /> UNVERIFIED
                        </span>
                      )}

                      {audit && (
                        <span className="text-xs font-bold text-sage-dark">
                          Score: {audit.overallScore}/100
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-sage-muted leading-relaxed">
                      {audit?.decision.explanation || res.reason || 'Audited against Qloo cultural reference signals.'}
                    </p>

                    {/* Top verified Qloo signals */}
                    {topTags.length > 0 && (
                      <div className="pt-1 flex flex-wrap items-center gap-1.5">
                        {topTags.map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-sage-dark bg-sage-mint/40 border border-sage-mint px-2 py-0.5 rounded-md"
                          >
                            <Check className="w-3 h-3 text-emerald-600" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-[11px] text-sage-muted flex items-center gap-2 pt-0.5">
                      <span>Visual reference &bull; Qloo verified metadata</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectEntityForEvidence(envelope)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-sage-dark hover:text-white px-4 py-2 rounded-xl bg-sage-mint/60 hover:bg-sage-dark border border-sage-soft transition shrink-0 cursor-pointer shadow-xs self-start sm:self-center"
                >
                  <Search className="w-3.5 h-3.5 text-sage" />
                  <span>View evidence &rarr;</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Lightbox Modal */}
      <ImageLightboxModal
        isOpen={lightboxData.isOpen}
        imageUrl={lightboxData.imageUrl}
        entityName={lightboxData.entityName}
        category={lightboxData.category}
        onClose={closeLightbox}
      />
    </div>
  );
};
