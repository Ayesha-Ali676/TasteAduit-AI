import React from 'react';
import { ItemResolutionEnvelope } from '../types/audit';
import { X, ShieldCheck, Database, Radio, Sparkles, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';

interface EvidenceDrawerProps {
  envelope: ItemResolutionEnvelope | null;
  onClose: () => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  envelope,
  onClose,
}) => {
  if (!envelope) return null;

  const item = envelope.item;
  const resolution = envelope.resolution;
  const resolvedEntity = resolution.resolvedEntity;
  const evidence = envelope.evidence;
  const audit = envelope.audit;

  const classification = audit?.provenance.classification ||
    evidence?.provenance.classification ||
    resolution.provenance.classification ||
    'Unverified';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-sage-dark/30 backdrop-blur-xs transition-opacity">
      {/* Backdrop click to dismiss */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Panel: Crisp White with Soft Sage Borders */}
      <div className="w-full max-w-xl bg-white border-l-2 border-sage-soft shadow-2xl flex flex-col h-full overflow-hidden text-sage-dark">
        {/* Header */}
        <div className="p-6 border-b border-sage-mint flex items-start justify-between bg-sage-mint/30">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-1 rounded bg-white text-sage-dark border border-sage-soft shadow-xs">
                <Database className="w-3.5 h-3.5 text-sage" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-sage-dark">
                Qloo Cultural Reference Signal
              </span>
            </div>
            <h2 className="text-xl font-bold text-sage-dark tracking-tight">
              {item.name}
            </h2>
            <p className="text-xs text-sage-muted mt-0.5">
              Empirical taste graph inspection &amp; provenance records
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white text-sage-dark hover:bg-sage-mint border border-sage-mint transition shadow-xs cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Classification & Grounding Status Banner */}
          <div className="p-4 rounded-2xl bg-[#FAFDF9] border border-sage-mint space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sage-dark uppercase tracking-wider">
                Grounding Classification
              </span>
              {classification === 'Supported' && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-sage-mint text-sage-dark border border-sage-soft">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sage" /> SUPPORTED
                </span>
              )}
              {classification === 'Inferred' && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> INFERRED
                </span>
              )}
              {classification === 'Unverified' && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                  <HelpCircle className="w-3.5 h-3.5 text-gray-500" /> UNVERIFIED
                </span>
              )}
            </div>

            <p className="text-xs text-sage-dark leading-relaxed italic">
              {audit ? audit.decision.explanation : 'Resolved entity evaluated against Qloo taste intelligence graph.'}
            </p>
          </div>

          {/* Resolved Entity Details */}
          {resolvedEntity && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-sage-dark flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-sage" />
                Resolved Qloo Taste Entity
              </h4>

              <div className="p-4 rounded-2xl bg-white border border-sage-mint space-y-2.5 font-mono text-xs shadow-xs">
                <div className="flex justify-between items-center text-sage-dark">
                  <span className="text-sage-muted">Canonical Name:</span>
                  <span className="text-sage-dark font-bold font-sans">{resolvedEntity.name}</span>
                </div>
                <div className="flex justify-between items-center text-sage-dark">
                  <span className="text-sage-muted">Entity ID:</span>
                  <span className="text-sage-dark font-semibold">{resolvedEntity.id}</span>
                </div>
                <div className="flex justify-between items-center text-sage-dark">
                  <span className="text-sage-muted">Type / Category:</span>
                  <span className="text-sage-dark">{resolvedEntity.type}</span>
                </div>
                {resolvedEntity.popularity !== undefined && (
                  <div className="flex justify-between items-center text-sage-dark">
                    <span className="text-sage-muted">Qloo Popularity:</span>
                    <span className="text-sage-dark font-bold">
                      {(resolvedEntity.popularity * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
                {resolvedEntity.tags && resolvedEntity.tags.length > 0 && (
                  <div className="pt-2 border-t border-sage-mint">
                    <span className="text-sage-muted text-[11px] block mb-1.5">Cultural Tags:</span>
                    <div className="flex flex-wrap gap-1">
                      {resolvedEntity.tags.map((t, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-sage-mint/50 text-sage-dark border border-sage-mint text-[11px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Retrieved Signals / Affinities */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sage-dark flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sage" />
              Retrieved Affinity Signals
            </h4>

            {evidence && evidence.signals && evidence.signals.length > 0 ? (
              <div className="space-y-2">
                {evidence.signals.map((sig, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-white border border-sage-mint flex items-center justify-between text-xs font-mono shadow-xs"
                  >
                    <div>
                      <span className="text-sage-dark font-bold mr-2">[{sig.signalType}]</span>
                      <span className="text-sage-dark font-sans font-medium">{sig.relatedEntityName || 'Entity Reference'}</span>
                      {sig.relationship && (
                        <span className="text-sage-muted ml-1.5 text-[11px]">({sig.relationship})</span>
                      )}
                    </div>
                    {sig.value !== undefined && (
                      <span className="font-bold text-sage-dark bg-sage-mint px-2 py-0.5 rounded border border-sage-soft">
                        {(sig.value * 100).toFixed(1)}% affinity
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#FAFDF9] border border-sage-mint text-xs text-sage-muted italic">
                TasteAudit could not find sufficient empirical Qloo signals for this claim. Rather than guessing, it is recorded honestly as unverified.
              </div>
            )}
          </div>

          {/* Provenance & API Metadata */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sage-dark flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-sage" />
              Evidence Provenance &amp; Isolation
            </h4>

            <div className="p-4 rounded-2xl bg-white border border-sage-mint space-y-2 text-[11px] font-mono text-sage-muted shadow-xs">
              <div className="flex justify-between">
                <span>Signal Source:</span>
                <span className="text-sage-dark font-semibold">Qloo Cultural AI Graph</span>
              </div>
              <div className="flex justify-between">
                <span>API Endpoint:</span>
                <span className="text-sage-dark">
                  {evidence?.provenance.endpoint || 'hackathon.api.qloo.com/v2/search'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Correlation ID:</span>
                <span className="text-sage-dark truncate max-w-[200px]">
                  {evidence?.provenance.correlationId || resolution.provenance.correlationId || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Credential Security:</span>
                <span className="text-sage-dark font-bold">Strictly Isolated Server-Side</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-sage-mint bg-sage-mint/20 flex items-center justify-between text-xs text-sage-muted">
          <span>Powered by Qloo cultural intelligence</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-sage-dark hover:bg-sage text-white font-bold transition shadow-xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
