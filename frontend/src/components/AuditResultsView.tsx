import React from 'react';
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
  Check
} from 'lucide-react';

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

  // Human-friendly status derived deterministically from final score
  const getScoreStatus = (score: number) => {
    if (score >= 80) {
      return {
        label: 'Strong Cultural Fit',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
        explanation: 'Most recommendations are supported by verified cultural evidence in the Qloo taste graph.'
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
        label: 'Needs Grounding',
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
            {scoreDelta > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sage-mint/80 border border-sage-soft text-sage-dark text-xs font-bold shadow-xs">
                <TrendingUp className="w-3.5 h-3.5 text-sage" />
                <span>+{scoreDelta} improvement after repair</span>
                <span className="text-sage-muted font-normal">({initialScore} → {finalScore})</span>
              </div>
            )}

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
            {repairedItems.length > 0 ? `${repairedItems.length} verified candidate repairs` : 'Verified against Qloo Graph'}
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
                  {initialScore} / 100
                </span>
              </div>

              {/* Recommendation quote */}
              <blockquote className="text-sm sm:text-base text-sage-dark font-normal leading-relaxed italic border-l-3 border-sage-soft pl-4 py-1">
                "{rawRecommendation}"
              </blockquote>

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

                    const classification = audit?.provenance.classification || env.resolution.provenance.classification;

                    return (
                      <div key={idx} className="p-3.5 rounded-xl bg-[#FAFDF9] border border-sage-mint text-xs flex items-start gap-3">
                        {env.resolution.resolvedEntity?.imageUrl && (
                          <img
                            src={env.resolution.resolvedEntity.imageUrl}
                            alt={env.item.name}
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                            className="w-12 h-12 rounded-lg object-cover border border-sage-mint shrink-0 shadow-xs"
                          />
                        )}
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="font-bold text-sage-dark flex items-center justify-between">
                            <span className="flex items-center gap-1.5 truncate">
                              {env.item.name}
                              {classification === 'Unverified' && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-700 border border-gray-200 shrink-0">
                                  Unverified
                                </span>
                              )}
                            </span>
                            <span className="text-xs font-bold text-amber-700 shrink-0">
                              {audit?.overallScore ?? '--'}/100
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
              Unverified recommendation produced by generative LLM without cultural grounding.
            </p>
          </div>

          {/* QLOO-GROUNDED RESULT (AFTER) */}
          <div className="rounded-3xl bg-[#EAF4EB] border-2 border-sage-soft p-6 sm:p-7 flex flex-col justify-between space-y-5 shadow-sage-soft relative overflow-hidden">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-sage-soft/70">
                <span className="text-xs font-bold uppercase tracking-wider text-sage-dark flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-sage" />
                  Qloo-Grounded Result
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-sage-dark">
                    {finalScore} / 100
                  </span>
                  {scoreDelta > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sage-dark text-white">
                      +{scoreDelta}
                    </span>
                  )}
                </div>
              </div>

              {/* Repaired Entities or Verified Status */}
              {repairedItems.length > 0 ? (
                <div className="space-y-3">
                  {repairedItems.map((rep, idx) => {
                    const cand = rep.selectedCandidate;
                    const afterItemScore = rep.afterAudit?.overallScore ?? rep.beforeAudit.overallScore;
                    const relatedEnv = items.find(
                      it => it.item.name.toLowerCase() === rep.originalItem.toLowerCase() ||
                            it.item.id === rep.beforeAudit.itemId
                    );

                    const itemImageUrl = cand?.imageUrl || relatedEnv?.resolution.resolvedEntity?.imageUrl;

                    return (
                      <div key={idx} className="p-4 rounded-xl bg-white border border-sage-soft space-y-2.5 shadow-xs">
                        <div className="flex items-start gap-3">
                          {itemImageUrl && (
                            <img
                              src={itemImageUrl}
                              alt={cand?.name || rep.originalItem}
                              loading="lazy"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                              className="w-12 h-12 rounded-lg object-cover border border-sage-soft shrink-0 shadow-xs"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-xs sm:text-sm">
                                <span className="text-sage-muted line-through truncate max-w-[110px]">
                                  {rep.originalItem}
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 text-sage shrink-0" />
                                <strong className="text-sage-dark font-bold truncate">
                                  {cand?.name || rep.originalItem}
                                </strong>
                              </div>
                              <span className="text-xs font-bold text-sage-dark bg-sage-mint px-2 py-0.5 rounded shrink-0">
                                {afterItemScore}/100
                              </span>
                            </div>
                            <p className="text-xs text-sage-dark leading-relaxed italic pt-1">
                              "{rep.reasoning}"
                            </p>
                          </div>
                        </div>

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
                    );
                  })}
                </div>
              ) : (
                <div className="p-5 rounded-xl bg-white border border-sage-soft space-y-2 text-xs shadow-xs">
                  <div className="flex items-center gap-2 text-sage-dark font-bold text-sm">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Recommendations Culturally Verified</span>
                  </div>
                  <p className="text-sage-dark leading-relaxed">
                    The requested recommendations exhibit strong alignment with empirical Qloo taste signals without requiring candidate substitution.
                  </p>
                </div>
              )}
            </div>

            <p className="text-xs text-sage-dark font-medium italic pt-1">
              Evidence-backed alternative anchored to the Qloo taste intelligence graph.
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

            return (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-white border border-sage-mint hover:border-sage-soft transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sage-card"
              >
                <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                  {res.resolvedEntity?.imageUrl && (
                    <img
                      src={res.resolvedEntity.imageUrl}
                      alt={item.name}
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover border border-sage-mint shrink-0 shadow-xs mt-0.5"
                    />
                  )}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-base font-bold text-sage-dark tracking-tight truncate">
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
                  </div>
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
    </div>
  );
};
