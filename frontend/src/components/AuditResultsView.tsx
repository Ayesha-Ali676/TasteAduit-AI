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

  // Determine scores strictly from backend response
  const initialScore = repairReport
    ? Math.round(repairReport.averageScoreBefore)
    : (agentTrace?.initialOverallScore ?? auditReport?.overallScore ?? 0);

  const finalScore = repairReport && repairReport.averageScoreAfter > 0
    ? Math.round(repairReport.averageScoreAfter)
    : (agentTrace?.finalOverallScore ?? auditReport?.overallScore ?? 0);

  const scoreDelta = agentTrace?.netScoreImprovement ?? (repairReport ? Math.round(repairReport.netImprovement) : 0);

  const dims = auditReport?.dimensionsSummary || {
    culturalAlignment: 0,
    contextualRelevance: 0,
    constraintCompliance: 0,
    evidenceCompleteness: 0,
  };

  const repairedItems = repairReport?.repairedItems || [];
  const hasAttemptedRepair = repairedItems.length > 0 && repairedItems.some(r => !!r.selectedCandidate);
  const hasSuccessfulRepair = repairedItems.length > 0 && scoreDelta > 0 && repairedItems.some(r => r.verifiedImprovement || (r.scoreDelta ?? 0) > 0);
  const isZeroImprovementRepair = hasAttemptedRepair && scoreDelta <= 0;
  const isCulturallyVerified =
    (agentTrace?.terminalState === 'ACCEPTED' || auditReport?.decision.status === 'supported') &&
    finalScore >= 70;

  // Human-friendly status derived deterministically from final score & agent loop outcome
  const getScoreStatus = (score: number) => {
    if (isZeroImprovementRepair) {
      return {
        label: 'No improvement — original grounded result preserved',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500',
        explanation: 'Repair candidate evaluated; deterministic re-audit found no improvement. Original grounded result preserved.'
      };
    } else if (hasSuccessfulRepair) {
      return {
        label: 'Repaired successfully',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
        explanation: 'Recommendations were successfully repaired with culturally grounded alternatives from the Qloo taste graph.'
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

            {/* Score Delta if repair occurred */}
            {scoreDelta > 0 ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sage-mint/80 border border-sage-soft text-sage-dark text-xs font-bold shadow-xs">
                <TrendingUp className="w-3.5 h-3.5 text-sage" />
                <span>Repaired successfully (+{scoreDelta})</span>
                <span className="text-sage-muted font-normal">({initialScore} → {finalScore})</span>
              </div>
            ) : isZeroImprovementRepair ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-xs">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>{initialScore} → {finalScore} — No improvement — original grounded result preserved</span>
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
                  Audit Baseline: {initialScore} / 100
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
                    const audit = env.audit;
                    const reasons = audit?.dimensions.constraintCompliance.reasons || [];
                    const failedReasons = reasons.filter(r => r.includes('[FAIL]') || r.includes('[UNVERIFIED]'));

                    // STRICT IMAGE OWNERSHIP RULE: Original AI Recommendation has NO Qloo image (imageUrl is undefined)
                    return (
                      <div key={idx} className="p-3.5 rounded-xl bg-[#FAFDF9] border border-sage-mint text-xs flex items-start gap-3">
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="font-bold text-sage-dark flex items-center justify-between">
                            <span className="truncate">{env.item.name}</span>
                            <span className="text-xs font-bold text-amber-700 shrink-0">
                              Audit Baseline: {audit?.overallScore ?? initialScore}/100
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
          <div className={`rounded-3xl border-2 p-6 sm:p-7 flex flex-col justify-between space-y-5 shadow-sage-soft relative overflow-hidden ${
            hasSuccessfulRepair || (isCulturallyVerified && !isZeroImprovementRepair)
              ? 'bg-[#EAF4EB] border-sage-soft'
              : 'bg-[#FAFDF9] border-amber-200/80'
          }`}>
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-sage-soft/70">
                <span className="text-xs font-bold uppercase tracking-wider text-sage-dark flex items-center gap-1.5">
                  {hasSuccessfulRepair || (isCulturallyVerified && !isZeroImprovementRepair) ? (
                    <CheckCircle2 className="w-4 h-4 text-sage" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                  {hasSuccessfulRepair
                    ? 'Repaired successfully'
                    : isZeroImprovementRepair
                    ? 'No improvement — original grounded result preserved'
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
                      +{scoreDelta} Repaired successfully
                    </span>
                  ) : isZeroImprovementRepair ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                      {initialScore} → {finalScore} — No improvement
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Repaired Entities (Shown ONLY if repair actually succeeded) */}
              {hasSuccessfulRepair && repairedItems.length > 0 ? (
                <div className="space-y-4">
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
                  const verifiedEnv = items.find(
                    it => it.resolution.status === 'resolved' && it.resolution.resolvedEntity?.imageUrl
                  );
                  const verifiedEntity = verifiedEnv?.resolution.resolvedEntity;
                  const verifiedImageUrl = verifiedEntity?.imageUrl;
                  const topTags = verifiedEnv ? getTopVerifiedTags(verifiedEnv, 5) : [];

                  return verifiedImageUrl && verifiedEntity ? (
                    <div className="rounded-2xl bg-white border border-sage-soft overflow-hidden shadow-xs space-y-0">
                      {/* Large Qloo Visual Hero */}
                      <div
                        className="relative w-full h-48 sm:h-56 bg-sage-soft/20 cursor-pointer group overflow-hidden border-b border-sage-soft/70"
                        onClick={() => openLightbox(verifiedImageUrl, verifiedEntity.name, verifiedEntity.type)}
                        title="Click to view full size image"
                      >
                        <img
                          src={verifiedImageUrl}
                          alt={verifiedEntity.name}
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3.5">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/90 text-sage-dark shadow-sm">
                            <ZoomIn className="w-3.5 h-3.5 text-sage" /> Click to enlarge
                          </span>
                          <span className="text-[11px] text-white/90 bg-black/40 px-2 py-0.5 rounded-full">
                            Qloo CDN
                          </span>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-lg font-bold text-sage-dark tracking-tight">
                              {verifiedEntity.name}
                            </h4>
                            <div className="flex items-center gap-2 pt-0.5 text-xs text-sage-muted">
                              <span className={`font-semibold px-2.5 py-0.5 rounded-full border ${statusInfo.badgeClass}`}>
                                {finalScore}/100 &bull; {statusInfo.label}
                              </span>
                            </div>
                          </div>

                          {verifiedEnv && (
                            <button
                              type="button"
                              onClick={() => onSelectEntityForEvidence(verifiedEnv)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-sage-dark hover:text-sage transition cursor-pointer shrink-0 pt-1"
                            >
                              <span>View evidence</span>
                              <ArrowRight className="w-3.5 h-3.5 text-sage" />
                            </button>
                          )}
                        </div>

                        {/* Verified Cultural Signals if culturally supported */}
                        {topTags.length > 0 && isCulturallyVerified && (
                          <div className="space-y-1.5 pt-1 border-t border-sage-mint/60">
                            <span className="text-[11px] font-bold text-sage-muted uppercase tracking-wider block">
                              Verified Cultural Signals (Why this recommendation passed):
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {topTags.map((tag, tIdx) => (
                                <span
                                  key={tIdx}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FAFDF9] border border-sage-mint text-xs font-medium text-sage-dark"
                                >
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Zero improvement or unverified notice */}
                        {isZeroImprovementRepair ? (
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                            <div className="font-bold flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                              <span>No improvement ({initialScore} → {finalScore})</span>
                            </div>
                            <p className="leading-relaxed">
                              A repair candidate was evaluated, but deterministic re-audit found no score improvement. The original grounded entity was preserved without speculative replacement.
                            </p>
                          </div>
                        ) : !isCulturallyVerified ? (
                          <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                            {agentTrace?.events?.slice().reverse().find(e => e.decision === 'STOP')?.reasoning ||
                             auditReport?.decision.explanation ||
                             'Entity recognized in Qloo, but failed cultural constraints or threshold.'}
                          </p>
                        ) : null}

                        <div className="pt-2 border-t border-sage-mint/40 flex items-center justify-between text-[11px] text-sage-muted">
                          <span>Visual reference &bull; Qloo verified metadata</span>
                          <span className="italic">
                            {isZeroImprovementRepair
                              ? 'Original grounded result preserved'
                              : isCulturallyVerified
                              ? 'Grounding verified against taste graph'
                              : 'Cultural baseline preserved'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : isCulturallyVerified ? (
                    <div className="p-5 rounded-xl bg-white border border-sage-soft space-y-2 text-xs shadow-xs">
                      <div className="flex items-center gap-2 text-sage-dark font-bold text-sm">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Recommendations Culturally Verified</span>
                      </div>
                      <p className="text-sage-dark leading-relaxed">
                        The requested recommendations exhibit strong alignment with empirical Qloo taste signals without requiring candidate substitution.
                      </p>
                    </div>
                  ) : (
                    <div className="p-5 rounded-xl bg-white border border-amber-200 space-y-3 text-xs shadow-xs">
                      <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Insufficient Evidence</span>
                      </div>
                      <p className="text-sage-dark leading-relaxed">
                        {agentTrace?.events?.slice().reverse().find(e => e.decision === 'STOP')?.reasoning ||
                         auditReport?.decision.explanation ||
                         'The recommendations could not be confidently validated against available cultural evidence in the Qloo taste graph.'}
                      </p>
                      {agentTrace?.finalStopReason && (
                        <div className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 inline-block">
                          Stop reason: {agentTrace.finalStopReason}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>

            <p className="text-xs text-sage-dark font-medium italic pt-1">
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
                          Score: {evt.scoreAfter}/100
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
                      <div className="text-[11px] text-sage-muted pt-1 flex items-center gap-1.5">
                        <strong className="text-sage-dark font-medium">Action:</strong>
                        <span>{evt.actionPerformed.action}</span>
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
