import React, { useState } from 'react';
import { Hero } from '../components/Hero';
import { RecommendationComposer } from '../components/RecommendationComposer';
import { AuditResultsView } from '../components/AuditResultsView';
import { EvidenceDrawer } from '../components/EvidenceDrawer';
import { AuditFormData, AuditResponse, ItemResolutionEnvelope } from '../types/audit';
import { submitAudit } from '../lib/api';
import { AlertCircle } from 'lucide-react';

export const Home: React.FC = () => {
  const [response, setResponse] = useState<AuditResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedEnvelope, setSelectedEnvelope] = useState<ItemResolutionEnvelope | null>(null);

  // Monotonic request sequence ID ref to prevent stale response race conditions
  const activeRequestId = React.useRef<number>(0);

  const handleSubmit = async (data: AuditFormData) => {
    const currentReqId = ++activeRequestId.current;
    setIsLoading(true);
    setErrorMsg(null);
    setResponse(null); // Reset previous audit result immediately so stale results cannot linger
    setSelectedEnvelope(null); // Clear evidence drawer data
    try {
      const res = await submitAudit(data);
      // Ignore response if a newer submission was started while this was in flight
      if (currentReqId !== activeRequestId.current) {
        return;
      }
      setResponse(res);
      setHasSubmitted(true);
      // Smooth scroll to top of results
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (currentReqId !== activeRequestId.current) {
        return;
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while communicating with the TasteAudit backend.'
      );
    } finally {
      if (currentReqId === activeRequestId.current) {
        setIsLoading(false);
      }
    }
  };

  const handleNewAudit = () => {
    activeRequestId.current++;
    setHasSubmitted(false);
    setResponse(null);
    setSelectedEnvelope(null);
    setErrorMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">
      {/* Error Notice in light theme */}
      {errorMsg && (
        <div className="max-w-4xl mx-auto p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold text-rose-950">Audit Request Notice: </strong>
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* STATE 1: INITIAL COMPOSER & HERO (When not yet audited or resetting) */}
      {!hasSubmitted && (
        <div className="space-y-10 sm:space-y-12">
          {/* Concise, Powerful Light Hero */}
          <Hero />

          {/* Primary Recommendation Composer Workspace */}
          <RecommendationComposer
            onSubmit={handleSubmit}
            isLoading={isLoading}
            stagesExecuted={response?.stagesExecuted}
          />

          {/* Elegant, Quiet Empty State in Light Sage */}
          <div className="text-center pt-2 pb-6">
            <p className="text-xs text-sage-muted tracking-wide font-normal">
              Paste an AI recommendation and test its cultural fit &bull; Powered by Qloo taste graph
            </p>
          </div>
        </div>
      )}

      {/* STATE 2: THE RESULTS EXPERIENCE (When audit completes) */}
      {hasSubmitted && response && (
        <AuditResultsView
          response={response}
          onNewAudit={handleNewAudit}
          onSelectEntityForEvidence={(env) => setSelectedEnvelope(env)}
        />
      )}

      {/* Slide-over Evidence Drawer */}
      <EvidenceDrawer
        envelope={selectedEnvelope}
        onClose={() => setSelectedEnvelope(null)}
      />
    </main>
  );
};

export default Home;
