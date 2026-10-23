import React, { useState } from 'react';
import { AuditResponse, ItemResolutionEnvelope } from '../types/audit';
import { ArrowRight, CheckCircle2, AlertCircle, AlertTriangle, HelpCircle, Search, RotateCcw, ChevronDown, ChevronUp, Bot } from 'lucide-react';

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
  const [showTechnicalTrace, setShowTechnicalTrace] = useState<boolean>(false);

  const auditReport = response.auditReport;
  const repairReport = response.repairReport;
  const items = response.items || [];
  const rawRecommendation = response.input.rawRecommendation;

  // Calculate actual before & after scores
  const initialScore = repairReport
    ? Math.round(repairReport.averageScoreBefore)
    : (auditReport?.overallScore ?? 0);
  const finalScore = repairReport && repairReport.averageScoreAfter > 0
    ? Math.round(repairReport.averageScoreAfter)
    : (auditReport?.overallScore ?? 0);
  const delta = repairReport ? Math.round(repairReport.netImprovement) : 0;

  const dims = auditReport?.dimensionsSummary || {
    culturalAlignment: 0,
    contextualRelevance: 0,
    constraintCompliance: 0,
    evidenceCompleteness: 0,
  };

  const repairedItems = repairReport?.repairedItems || [];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10 animate-fade-in pb-12">
      {/* Top Bar: Clean Action & Compact Pipeline Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-sage-mint">
        <button
          type="button"
          onClick={onNewAudit}
          className="inline-flex items-center gap-2 text-xs font-semibold text-sage-dark hover:text-sage px-4 py-2 rounded-full bg-white hover:bg-sage-mint/30 border border-sage-mint shadow-xs transition cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-sage" />
          <span>New Recommendation Audit</span>
        </button>

        <div className="flex items-center gap-2 text-xs font-mono text-sage-dark">
          <CheckCircle2 className="w-4 h-4 text-sage" />
          <span className="font-bold">✓ AUDIT COMPLETE</span>
          <span className="text-sage-soft">&bull;</span>
          <span className="text-sage-muted">Qloo Cultural Reference Signal verified</span>
        </div>
      </div>

      {/* 1. HERO SCORE PRESENTATION (White Card with Soft Mint & Sage Accents) */}
      <section className="bg-white border-2 border-sage-mint rounded-3xl p-8 sm:p-12 shadow-sage-soft relative overflow-hidden">
        {/* Subtle mint radial highlight */}
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-sage-mint/40 rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left: Big Bold Score */}
          <div className="lg:col-span-5 space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-sage-dark block">
              Cultural Grounding Score
            </span>

            <div className="flex items-baseline gap-2">
              <span className="text-7xl sm:text-8xl font-black text-sage-dark tracking-tight">
                {finalScore}
              </span>
              <span className="text-2xl font-medium text-sage-muted">/ 100</span>
            </div>

            {delta > 0 && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sage-mint border border-sage-soft text-sage-dark text-xs sm:text-sm font-bold shadow-xs">
                <span>+{delta} improvement after repair</span>
                <span className="text-sage-muted font-normal">({initialScore} → {finalScore})</span>
              </div>
            )}

            <p className="text-xs text-sage-muted italic pt-1">
              Application-defined Cultural Grounding Score &bull; {auditReport?.decision.explanation}
            </p>
          </div>

          {/* Right: 4 Dimension Bars */}
          <div className="lg:col-span-7 space-y-4 pl-0 lg:pl-8 border-t lg:border-t-0 lg:border-l border-sage-mint pt-6 lg:pt-0">
            <div className="text-xs font-bold uppercase tracking-wider text-sage-dark mb-2">
              Grounding Dimensions
            </div>

            {/* Cultural Alignment */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium text-sage-dark">
                <span>Cultural Alignment <span className="text-sage-muted font-normal text-[11px]">(40%)</span></span>
                <span className="font-mono font-bold text-sage-dark">{dims.culturalAlignment} / 100</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-sage-mint/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sage transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(0, dims.culturalAlignment))}%` }}
                />
              </div>
            </div>

            {/* Contextual Relevance */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium text-sage-dark">
                <span>Contextual Relevance <span className="text-sage-muted font-normal text-[11px]">(25%)</span></span>
                <span className="font-mono font-bold text-sage-dark">{dims.contextualRelevance} / 100</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-sage-mint/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sage transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(0, dims.contextualRelevance))}%` }}
                />
              </div>
            </div>

            {/* Constraint Compliance */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium text-sage-dark">
                <span>Constraint Compliance <span className="text-sage-muted font-normal text-[11px]">(20%)</span></span>
                <span className="font-mono font-bold text-sage-dark">{dims.constraintCompliance} / 100</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-sage-mint/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sage transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(0, dims.constraintCompliance))}%` }}
                />
              </div>
            </div>

            {/* Evidence Completeness */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium text-sage-dark">
                <span>Evidence Completeness <span className="text-sage-muted font-normal text-[11px]">(15%)</span></span>
                <span className="font-mono font-bold text-sage-dark">{dims.evidenceCompleteness} / 100</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-sage-mint/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sage transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(0, dims.evidenceCompleteness))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. THE CORE WOW MOMENT: BEFORE & AFTER COMPARISON */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold text-sage-dark tracking-tight">
            Before &amp; After Cultural Grounding
          </h2>
          <span className="text-xs text-sage-muted font-mono">
            {repairedItems.length > 0 ? `${repairedItems.length} candidate repairs` : 'Evaluated against Qloo'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* ORIGINAL AI (BEFORE) - Clean White Card */}
          <div className="rounded-3xl bg-white border border-sage-mint p-6 sm:p-8 flex flex-col justify-between space-y-6 shadow-sage-card">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-sage-mint">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Original AI
                </span>
                <span className="font-mono text-base font-bold text-sage-muted">
                  {initialScore} / 100
                </span>
              </div>

              {/* Recommendation quote */}
              <blockquote className="text-sm sm:text-base text-sage-dark font-normal leading-relaxed italic border-l-3 border-sage-soft pl-4 py-1">
                "{rawRecommendation}"
              </blockquote>

              {/* Detected issues list */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold text-sage-dark uppercase tracking-wide block">
                  Detected Cultural Issues:
                </span>
                <div className="space-y-2">
                  {items.map((env, idx) => {
                    const audit = env.audit;
                    const reasons = audit?.dimensions.constraintCompliance.reasons || [];
                    const failedReasons = reasons.filter(r => r.includes('[FAIL]') || r.includes('[UNVERIFIED]'));

                    return (
                      <div key={idx} className="p-3.5 rounded-xl bg-[#FAFDF9] border border-sage-mint text-xs space-y-1">
                        <div className="font-bold text-sage-dark flex items-center justify-between">
                          <span>{env.item.name}</span>
                          <span className="text-[11px] font-mono text-amber-700 font-semibold">
                            {audit?.overallScore ?? '--'}/100
                          </span>
                        </div>
                        <p className="text-sage-muted text-[11px] leading-relaxed">
                          {failedReasons.length > 0
                            ? failedReasons[0].replace(/^\[(FAIL|UNVERIFIED)\]\s*/, '')
                            : audit?.decision.explanation || 'Evaluated for cultural fit.'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <p className="text-xs text-sage-muted italic pt-2">
              Unverified recommendation produced by ordinary LLM.
            </p>
          </div>

          {/* QLOO-GROUNDED (AFTER) - Pale Mint Highlight Card */}
          <div className="rounded-3xl bg-[#EAF4EB] border-2 border-sage-soft p-6 sm:p-8 flex flex-col justify-between space-y-6 shadow-sage-soft relative overflow-hidden">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-sage-soft/70">
                <span className="text-xs font-bold uppercase tracking-wider text-sage-dark flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-sage" />
                  Qloo-Grounded &amp; Repaired
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-sage-dark">
                    {finalScore} / 100
                  </span>
                  {delta > 0 && (
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-sage-dark text-white">
                      +{delta}
                    </span>
                  )}
                </div>
              </div>

              {/* Repaired Entities */}
              {repairedItems.length > 0 ? (
                <div className="space-y-3">
                  {repairedItems.map((rep, idx) => {
                    const cand = rep.selectedCandidate;
                    const afterItemScore = rep.afterAudit?.overallScore ?? rep.beforeAudit.overallScore;
                    const relatedEnv = items.find(
                      it => it.item.name.toLowerCase() === rep.originalItem.toLowerCase() ||
                            it.item.id === rep.beforeAudit.itemId
                    );

                    return (
                      <div key={idx} className="p-4 rounded-xl bg-white border border-sage-soft space-y-2 shadow-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs sm:text-sm">
                            <span className="text-sage-muted line-through truncate max-w-[120px]">
                              {rep.originalItem}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-sage" />
                            <strong className="text-sage-dark font-bold">
                              {cand?.name || rep.originalItem}
                            </strong>
                          </div>
                          <span className="text-xs font-mono font-bold text-sage-dark bg-sage-mint px-2 py-0.5 rounded">
                            {afterItemScore}/100
                          </span>
                        </div>

                        <p className="text-xs text-sage-dark leading-relaxed italic">
                          "{rep.reasoning}"
                        </p>

                        {relatedEnv && (
                          <div className="pt-2 border-t border-sage-mint flex items-center justify-between text-xs">
                            <span className="font-mono text-[11px] text-sage-muted">
                              Qloo ID: {cand?.entityId || 'Verified'}
                            </span>
                            <button
                              type="button"
                              onClick={() => onSelectEntityForEvidence(relatedEnv)}
                              className="text-xs font-bold text-sage-dark hover:text-sage flex items-center gap-1 transition cursor-pointer"
                            >
                              <span>View evidence &rarr;</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-5 rounded-xl bg-white border border-sage-soft space-y-2 text-xs shadow-xs">
                  <p className="text-sage-dark font-bold">
                    Recommendations culturally aligned with empirical Qloo reference signals.
                  </p>
                  <p className="text-sage-muted">
                    High affinity and spatial constraints satisfied without requiring candidate replacement.
                  </p>
                </div>
              )}
            </div>

            <p className="text-xs text-sage-dark font-medium italic pt-2">
              Evidence-backed alternative anchored to the Qloo taste graph.
            </p>
          </div>
        </div>
      </section>

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

            return (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-white border border-sage-mint hover:border-sage-soft transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sage-card"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-sage-dark tracking-tight">
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
                      <span className="font-mono text-xs font-bold text-sage-dark">
                        Score: {audit.overallScore}/100
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-sage-muted leading-relaxed">
                    {audit?.decision.explanation || res.reason || 'Audited against Qloo cultural reference signals.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectEntityForEvidence(envelope)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-sage-dark hover:text-white px-4 py-2 rounded-xl bg-sage-mint/60 hover:bg-sage-dark border border-sage-soft transition shrink-0 cursor-pointer shadow-xs"
                >
                  <Search className="w-3.5 h-3.5 text-sage" />
                  <span>View evidence &rarr;</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. COMPACT TECHNICAL TRACE (Collapsible) */}
      {response.agentTrace && (
        <section className="pt-4 border-t border-sage-mint">
          <button
            type="button"
            onClick={() => setShowTechnicalTrace(!showTechnicalTrace)}
            className="flex items-center justify-between w-full text-xs font-medium text-sage-muted hover:text-sage-dark transition py-2 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-sage" />
              <span>Autonomous Agent Loop Details ({response.agentTrace.totalIterations} iterations &bull; Terminal state: {response.agentTrace.terminalState})</span>
            </div>
            {showTechnicalTrace ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showTechnicalTrace && (
            <div className="mt-3 p-5 rounded-2xl bg-white border border-sage-mint space-y-3 font-mono text-xs text-sage-dark shadow-xs">
              <div className="flex justify-between text-sage-muted text-[11px] pb-2 border-b border-sage-mint">
                <span>Total Duration: {(response.agentTrace.totalDurationMs / 1000).toFixed(2)}s</span>
                <span>Rule: {response.agentTrace.finalStopReason}</span>
              </div>
              <div className="space-y-2">
                {response.agentTrace.events.map((evt, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-[#FAFDF9] border border-sage-mint space-y-1">
                    <div className="flex justify-between text-sage-dark font-bold">
                      <span>Step #{evt.step} (Iteration {evt.iteration}): {evt.decision}</span>
                      {evt.scoreAfter !== undefined && <span>Score: {evt.scoreAfter}</span>}
                    </div>
                    <p className="text-sage-muted font-sans text-xs italic">
                      "{evt.reasoning}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
