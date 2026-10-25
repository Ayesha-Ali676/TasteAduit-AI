import React, { useState } from 'react';
import { ItemResolutionEnvelope } from '../types/audit';
import { X, ShieldCheck, Database, Radio, Sparkles, CheckCircle2, AlertTriangle, HelpCircle, ChevronDown, ChevronUp, ZoomIn } from 'lucide-react';
import { ImageLightboxModal } from './ImageLightboxModal';

interface EvidenceDrawerProps {
  envelope: ItemResolutionEnvelope | null;
  onClose: () => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  envelope,
  onClose,
}) => {
  const [showAllTags, setShowAllTags] = useState<boolean>(false);
  const [showLightbox, setShowLightbox] = useState<boolean>(false);

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

  const tags = resolvedEntity?.tags || [];
  const initialTagLimit = 8;
  const displayedTags = showAllTags ? tags : tags.slice(0, initialTagLimit);
  const remainingTagsCount = Math.max(0, tags.length - initialTagLimit);

  // Helper to format signal type into human-friendly language
  const formatSignalLabel = (signalType: string, relationship?: string) => {
    if (signalType === 'taste_affinity') {
      return relationship ? `High Taste Affinity (${relationship})` : 'High Taste Affinity';
    }
    if (signalType === 'spatial_proximity' || signalType === 'location') {
      return 'Geographic / Spatial Match';
    }
    if (signalType === 'tag_correlation') {
      return 'Cultural Tag Correlation';
    }
    return signalType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-sage-dark/30 backdrop-blur-xs transition-opacity">
      {/* Backdrop click to dismiss */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Panel: Crisp White with Soft Sage Borders */}
      <div className="w-full max-w-xl bg-white border-l-2 border-sage-soft shadow-2xl flex flex-col h-full overflow-hidden text-sage-dark font-sans">
        {/* Header */}
        <div className="p-6 border-b border-sage-mint flex items-start justify-between bg-sage-mint/30">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-1 rounded bg-white text-sage-dark border border-sage-soft shadow-xs">
                <Database className="w-3.5 h-3.5 text-sage" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-sage-dark">
                Verified Cultural Evidence
              </span>
            </div>
            <h2 className="text-xl font-bold text-sage-dark tracking-tight">
              {item.name}
            </h2>
            <p className="text-xs text-sage-muted mt-0.5">
              Evidence source: Qloo Cultural Intelligence Graph
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

              <div className="p-4 rounded-2xl bg-white border border-sage-mint space-y-2.5 text-xs shadow-xs">
                {resolvedEntity.imageUrl && (
                  <div className="flex items-center gap-3 pb-3 border-b border-sage-mint">
                    <div
                      className="relative w-14 h-14 rounded-xl overflow-hidden border border-sage-mint shadow-xs bg-sage-soft/30 shrink-0 cursor-pointer group"
                      onClick={() => setShowLightbox(true)}
                      title="Click to view full image"
                    >
                      <img
                        src={resolvedEntity.imageUrl}
                        alt={resolvedEntity.name}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ZoomIn className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-sage-dark truncate">{resolvedEntity.name}</div>
                      <div className="text-[10px] text-sage-muted flex items-center gap-1 mt-0.5">
                        <span>Visual reference</span>
                        <span className="text-gray-300">•</span>
                        <span>Qloo verified metadata</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center text-sage-dark">
                  <span className="text-sage-muted">Canonical Name:</span>
                  <span className="text-sage-dark font-bold">{resolvedEntity.name}</span>
                </div>
                <div className="flex justify-between items-center text-sage-dark">
                  <span className="text-sage-muted">Entity ID:</span>
                  <span className="text-sage-dark font-mono text-[11px]">{resolvedEntity.id}</span>
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

                {/* Cultural Tags with +X More Toggle */}
                {tags.length > 0 && (
                  <div className="pt-2.5 border-t border-sage-mint">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sage-muted text-[11px] font-semibold">
                        Cultural Tags ({tags.length}):
                      </span>
                      {tags.length > initialTagLimit && (
                        <button
                          type="button"
                          onClick={() => setShowAllTags(!showAllTags)}
                          className="text-[11px] font-semibold text-sage-dark hover:text-sage flex items-center gap-1 transition cursor-pointer"
                        >
                          {showAllTags ? (
                            <>Show fewer <ChevronUp className="w-3 h-3" /></>
                          ) : (
                            <>+ {remainingTagsCount} more <ChevronDown className="w-3 h-3" /></>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {displayedTags.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-sage-mint/40 text-sage-dark border border-sage-mint text-[11px]"
                        >
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
              <div className="space-y-2.5">
                {evidence.signals.map((sig, idx) => {
                  const percentage = sig.value !== undefined ? (sig.value * 100).toFixed(1) : undefined;
                  const label = formatSignalLabel(sig.signalType, sig.relationship);

                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-white border border-sage-mint space-y-2 shadow-xs"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          <strong className="text-sage-dark font-bold text-sm block">
                            {sig.relatedEntityName || 'Entity Reference'}
                          </strong>
                          <span className="text-sage-muted text-[11px]">
                            {label}
                          </span>
                        </div>
                        {percentage !== undefined && (
                          <div className="text-right">
                            <span className="font-bold text-sage-dark text-xs bg-sage-mint px-2 py-0.5 rounded border border-sage-soft">
                              {percentage}% match
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Visual affinity score bar */}
                      {sig.value !== undefined && (
                        <div className="w-full h-1.5 rounded-full bg-sage-mint/50 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-sage transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, sig.value * 100))}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
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

            <div className="p-4 rounded-2xl bg-white border border-sage-mint space-y-2 text-[11px] text-sage-muted shadow-xs">
              <div className="flex justify-between">
                <span>Evidence Source:</span>
                <span className="text-sage-dark font-semibold">Qloo Cultural Intelligence Graph</span>
              </div>
              <div className="flex justify-between">
                <span>API Endpoint:</span>
                <span className="text-sage-dark font-mono text-[10px]">
                  {evidence?.provenance.endpoint || 'hackathon.api.qloo.com/v2/search'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Correlation ID:</span>
                <span className="text-sage-dark font-mono text-[10px] truncate max-w-[200px]">
                  {evidence?.provenance.correlationId || resolution.provenance.correlationId || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Credential Security:</span>
                <span className="text-sage-dark font-semibold">Strictly Isolated Server-Side</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-sage-mint bg-sage-mint/20 flex items-center justify-between text-xs text-sage-muted">
          <span>Evidence source: Qloo Cultural Intelligence Graph</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-sage-dark hover:bg-sage text-white font-bold transition shadow-xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {resolvedEntity && (
        <ImageLightboxModal
          isOpen={showLightbox}
          imageUrl={resolvedEntity.imageUrl}
          entityName={resolvedEntity.name}
          category={resolvedEntity.type}
          onClose={() => setShowLightbox(false)}
        />
      )}
    </div>
  );
};
