import React from 'react';
import { AuditResponse } from '../types/audit';
import { Award, ArrowLeftRight, FileSearch, ShieldAlert, CheckCircle2, AlertTriangle, HelpCircle, Check } from 'lucide-react';

interface AuditResultsPlaceholderProps {
  response: AuditResponse | null;
  hasSubmitted: boolean;
}

export const AuditResultsPlaceholder: React.FC<AuditResultsPlaceholderProps> = ({
  response,
  hasSubmitted
}) => {
  const summary = response?.resolutionSummary;
  const evidenceSummary = response?.evidenceSummary;
  const items = response?.items || [];
  const [expandedEvidence, setExpandedEvidence] = React.useState<Record<string, boolean>>({});

  const toggleEvidence = (id: string) => {
    setExpandedEvidence((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const auditReport = response?.auditReport;

  return (
    <div className="space-y-6">
      {/* Status Notice */}
      <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/60 text-xs text-slate-400 flex items-start space-x-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold text-slate-200">Active Pipeline Stages: </span>
          <span className="text-emerald-400 font-medium">Stage 1 (PARSE)</span>,{' '}
          <span className="text-emerald-400 font-medium">Stage 2 (RESOLVE)</span>,{' '}
          <span className="text-emerald-400 font-medium">Stage 3 (RETRIEVE)</span>, and{' '}
          <span className="text-emerald-400 font-medium">Stage 4 (AUDIT)</span> are active.
          Deterministic 4-dimensional scoring evaluates cultural alignment, contextual relevance, constraint compliance, and evidence completeness without LLM hallucination.
        </div>
      </div>

      {/* Entity Resolution & Evidence Retrieval Panel (Active) */}
      {hasSubmitted && items.length > 0 && (
        <div className="bg-slate-800/70 border border-indigo-500/30 rounded-xl p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-700/60">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileSearch className="w-4 h-4 text-indigo-400" />
                Qloo Cultural Grounding & Audit Results
              </h3>
              <p className="text-xs text-slate-400">
                Grounding concepts against Qloo's taste graph and empirical affinities
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {summary && (
                <>
                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                    {summary.resolvedCount} Resolved
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800">
                    {summary.ambiguousCount} Ambiguous
                  </span>
                </>
              )}
              {evidenceSummary && (
                <span className="px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800 font-medium">
                  {evidenceSummary.supportedCount} Supported Evidence
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {items.map(({ item, resolution, evidence, audit }, index) => {
              const isResolved = resolution.status === 'resolved';
              const isAmbiguous = resolution.status === 'ambiguous';
              const isSupported = evidence?.status === 'supported';
              const itemKey = item.id || `item_${index}`;
              const isExpanded = Boolean(expandedEvidence[itemKey]);

              return (
                <div
                  key={itemKey}
                  className="p-3.5 bg-slate-900/80 rounded-lg border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">
                        {item.name}
                      </span>
                      {audit && (
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono font-semibold">
                          Score: {audit.overallScore}/100
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isResolved && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                          <Check className="w-3 h-3" /> Resolved
                        </span>
                      )}
                      {isAmbiguous && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                          <AlertTriangle className="w-3 h-3" /> Ambiguous
                        </span>
                      )}
                      {!isResolved && !isAmbiguous && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          <HelpCircle className="w-3 h-3" /> Unresolved
                        </span>
                      )}

                      {audit?.decision.status === 'supported' && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                          Supported
                        </span>
                      )}
                      {audit?.decision.status === 'inferred' && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-semibold">
                          Needs Review
                        </span>
                      )}
                      {audit?.decision.status === 'insufficient_evidence' && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700">
                          Insufficient Evidence
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Resolution Details */}
                  {isResolved && resolution.resolvedEntity && (
                    <div className="text-xs text-slate-400 space-y-1 bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
                      <div className="text-slate-300 font-medium">
                        {resolution.resolvedEntity.name}
                        <span className="text-indigo-400 ml-2 font-mono text-[11px]">
                          [{resolution.resolvedEntity.type}]
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono flex flex-wrap gap-x-3">
                        <span>ID: {resolution.resolvedEntity.id}</span>
                        {resolution.resolvedEntity.popularity !== undefined && (
                          <span>Qloo Popularity: {(resolution.resolvedEntity.popularity * 100).toFixed(1)}%</span>
                        )}
                        <span>Provenance: {resolution.provenance.classification}</span>
                      </div>
                    </div>
                  )}

                  {/* Deterministic Audit Dimension Breakdown (Stage 4) */}
                  {audit && (
                    <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs space-y-2">
                      <div className="flex items-center justify-between font-semibold text-slate-300">
                        <span>Grounding Assessment:</span>
                        <span className="text-indigo-400 font-mono text-[11px]">{audit.decision.label}</span>
                      </div>
                      <p className="text-slate-400 text-xs italic">
                        "{audit.decision.explanation}"
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                        <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                          <div className="text-slate-500 text-[10px]">Cultural (40%)</div>
                          <div className="font-bold text-slate-200">{audit.dimensions.culturalAlignment.score}/100</div>
                        </div>
                        <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                          <div className="text-slate-500 text-[10px]">Context (25%)</div>
                          <div className="font-bold text-slate-200">{audit.dimensions.contextualRelevance.score}/100</div>
                        </div>
                        <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                          <div className="text-slate-500 text-[10px]">Constraints (20%)</div>
                          <div className="font-bold text-slate-200">{audit.dimensions.constraintCompliance.score}/100</div>
                        </div>
                        <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                          <div className="text-slate-500 text-[10px]">Evidence (15%)</div>
                          <div className="font-bold text-slate-200">{audit.dimensions.evidenceCompleteness.score}/100</div>
                        </div>
                      </div>

                      {/* Constraint Compliance Detail */}
                      {audit.dimensions.constraintCompliance.reasons.length > 0 && (
                        <div className="pt-2 border-t border-slate-800/80 space-y-1">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Constraint Compliance:
                          </div>
                          <div className="space-y-1">
                            {audit.dimensions.constraintCompliance.reasons.map((r, rIdx) => {
                              const isPass = r.includes('[PASS]');
                              const isFail = r.includes('[FAIL]');
                              const isUnverified = r.includes('[UNVERIFIED]');
                              const isNeutral = r.includes('neutral') || r.includes('No explicit constraints');

                              return (
                                <div key={rIdx} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                                  {isPass && (
                                    <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-mono shrink-0">
                                      Passed
                                    </span>
                                  )}
                                  {isFail && (
                                    <span className="px-1.5 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-mono shrink-0">
                                      Failed
                                    </span>
                                  )}
                                  {isUnverified && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[10px] font-mono shrink-0">
                                      Unverified
                                    </span>
                                  )}
                                  {isNeutral && (
                                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-mono shrink-0">
                                      No explicit constraints
                                    </span>
                                  )}
                                  <span className="text-slate-400">
                                    {r.replace(/^\[(PASS|FAIL|UNVERIFIED)\]\s*/, '')}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stage 3 Evidence Card */}
                  {isSupported && evidence && (
                    <div className="p-3 bg-indigo-950/20 border border-indigo-900/40 rounded-lg text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-medium">✓ Supporting cultural signal found</span>
                          {evidence.summary.averageAffinity !== undefined && (
                            <span className="text-slate-400 font-mono">
                              (Avg affinity: {(evidence.summary.averageAffinity * 100).toFixed(1)}%)
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleEvidence(itemKey)}
                          className="px-2 py-0.5 rounded bg-indigo-900/60 hover:bg-indigo-800/80 text-indigo-200 border border-indigo-700 text-[11px] transition"
                        >
                          {isExpanded ? 'Hide Evidence' : 'View Evidence'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="pt-2 border-t border-indigo-900/30 space-y-2 text-[11px]">
                          <div className="font-semibold text-slate-300">Retrieved Signals:</div>
                          <div className="space-y-1">
                            {evidence.signals.map((sig, sIdx) => (
                              <div
                                key={sIdx}
                                className="flex items-center justify-between p-1.5 rounded bg-slate-900/90 border border-slate-800 font-mono text-slate-300"
                              >
                                <div>
                                  <span className="text-indigo-400 mr-2">[{sig.signalType}]</span>
                                  <span>{sig.relatedEntityName || 'Signal'}</span>
                                  {sig.relationship && (
                                    <span className="text-slate-500 ml-2 text-[10px]">
                                      ({sig.relationship})
                                    </span>
                                  )}
                                </div>
                                {sig.value !== undefined && (
                                  <span className="text-emerald-400 font-bold">
                                    {(sig.value * 100).toFixed(1)}% affinity
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono pt-1">
                            Endpoint: {evidence.provenance.endpoint} | Correlation: {evidence.provenance.correlationId}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!isSupported && (
                    <div className="p-2.5 bg-slate-950/40 rounded border border-slate-800/50 text-xs text-slate-400">
                      <span className="italic text-slate-400">
                        Insufficient Qloo evidence. No unsupported conclusion was made.
                      </span>
                    </div>
                  )}

                  {isAmbiguous && (
                    <div className="text-xs text-slate-400 space-y-2 bg-slate-950/60 p-2.5 rounded border border-amber-900/30">
                      <p className="text-amber-300/90 text-xs">
                        {resolution.reason}
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {resolution.candidates.slice(0, 4).map((cand) => (
                          <span
                            key={cand.id}
                            className="px-2 py-0.5 bg-slate-800 rounded text-[11px] text-slate-300 border border-slate-700"
                          >
                            {cand.name} ({cand.type.replace(/^urn:(entity|tag):/, '')})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isResolved && !isAmbiguous && (
                    <div className="text-xs text-slate-400 bg-slate-950/60 p-2 rounded">
                      <p className="italic text-slate-500">{resolution.reason}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid of Results (Active Stage 4 Audit + Subsequent Stage Placeholders) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cultural Grounding Score & Confidence */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-400" />
              Cultural Grounding Score
            </h3>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">
              Deterministic Weights
            </span>
          </div>

          <div className="p-4 bg-slate-900/80 rounded-lg text-center border border-slate-800">
            <div className="text-4xl font-extrabold text-indigo-400">
              {auditReport ? auditReport.overallScore : '--'}
              <span className="text-base font-normal text-slate-500"> / 100</span>
            </div>
            <p className="text-xs text-slate-300 mt-2 font-medium">
              {auditReport ? auditReport.decision.label : 'Submit recommendation to audit'}
            </p>
            {auditReport && (
              <p className="text-[11px] text-slate-400 mt-1 italic">
                {auditReport.decision.explanation}
              </p>
            )}
          </div>

          <div className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Cultural Alignment (40%)</span>
              <span className="font-mono text-slate-300">
                {auditReport ? `${auditReport.dimensionsSummary.culturalAlignment}/100` : '--'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Contextual Relevance (25%)</span>
              <span className="font-mono text-slate-300">
                {auditReport ? `${auditReport.dimensionsSummary.contextualRelevance}/100` : '--'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Constraint Compliance (20%)</span>
              <span className="font-mono text-slate-300">
                {auditReport ? `${auditReport.dimensionsSummary.constraintCompliance}/100` : '--'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Evidence Completeness (15%)</span>
              <span className="font-mono text-slate-300">
                {auditReport ? `${auditReport.dimensionsSummary.evidenceCompleteness}/100` : '--'}
              </span>
            </div>
          </div>
        </div>

        {/* Before & After Comparison */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-lg">
          <div className="flex items-center space-x-2 mb-3">
            <ArrowLeftRight className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-200">Before & After Repair</h3>
          </div>

          <div className="space-y-3">
            <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800">
              <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider block mb-1">
                Before (Original Recommendation)
              </span>
              <p className="text-xs text-slate-300 italic">
                {hasSubmitted && response
                  ? response.input.rawRecommendation
                  : 'Awaiting recommendation submission to evaluate...'}
              </p>
            </div>

            <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block mb-1">
                After (Evidence-Backed Repair)
              </span>
              <p className="text-xs text-slate-400 italic">
                Alternative recommendations with verified Qloo provenance will appear in Stage 5 (REPAIR).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Repair Explanation & Audit Safeguards */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-lg">
        <div className="flex items-center space-x-2 mb-3">
          <ShieldAlert className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">Cultural Safeguards & Provenance</h3>
        </div>

        <div className="p-4 bg-slate-900/80 rounded-lg border border-slate-800 text-xs text-slate-400 flex items-center">
          <p className="italic">
            Qloo credentials remain strictly isolated server-side. Search and resolution calls execute via bounded timeouts against the official Hackathon API endpoint (`hackathon.api.qloo.com`).
          </p>
        </div>
      </div>
    </div>
  );
};
