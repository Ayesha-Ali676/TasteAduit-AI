import { AuditFormData, AuditResponse } from '../types/audit';

export async function checkBackendHealth(): Promise<{ status: string; service: string }> {
  const response = await fetch('/api/health');
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return response.json();
}

export async function submitAudit(data: AuditFormData): Promise<AuditResponse> {
  const constraintsList = data.constraints
    .split('\n')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const payload = {
    recommendations: data.recommendations,
    audienceContext: data.audienceContext || undefined,
    location: data.location || undefined,
    constraints: constraintsList
  };

  const response = await fetch('/api/audit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Audit request failed with status ${response.status}`);
  }

  return response.json();
}
