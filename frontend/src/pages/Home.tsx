import React, { useState } from 'react';
import { AuditForm } from '../components/AuditForm';
import { AuditResultsPlaceholder } from '../components/AuditResultsPlaceholder';
import { AuditFormData, AuditResponse } from '../types/audit';
import { submitAudit } from '../lib/api';
import { Compass } from 'lucide-react';

export const Home: React.FC = () => {
  const [response, setResponse] = useState<AuditResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (data: AuditFormData) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await submitAudit(data);
      setResponse(res);
      setHasSubmitted(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'An unexpected error occurred while communicating with backend.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-3 max-w-2xl mx-auto pt-4 pb-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-950/70 text-indigo-400 text-xs font-medium border border-indigo-800/80 mb-1">
          <Compass className="w-3.5 h-3.5" />
          <span>Cultural Intelligence & Recommendation QA</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
          Make every AI recommendation <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-300">culturally accountable</span>
        </h2>
        <p className="text-sm text-slate-400">
          Audit AI-generated lifestyle, dining, music, and travel recommendations against structured taste intelligence from Qloo.
        </p>
      </div>

      {/* Error alert if backend communication fails */}
      {errorMsg && (
        <div className="p-4 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-sm">
          <strong>Request Failed: </strong> {errorMsg}
        </div>
      )}

      {/* Primary Interaction Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5">
          <AuditForm onSubmit={handleSubmit} isLoading={isLoading} />
        </div>
        <div className="lg:col-span-7">
          <AuditResultsPlaceholder response={response} hasSubmitted={hasSubmitted} />
        </div>
      </div>
    </main>
  );
};
