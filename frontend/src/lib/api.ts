import { AuditFormData, AuditResponse } from '../types/audit';

export async function checkBackendHealth(): Promise<{ status: string; service: string }> {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}`);
    }
    return response.json();
  } catch (err) {
    throw new Error('Backend is unreachable. Please verify the API server is running on port 3001.');
  }
}

export async function submitAudit(data: AuditFormData): Promise<AuditResponse> {
  const rawConstraints = data.constraints || '';
  const constraintsList = (typeof rawConstraints === 'string'
    ? rawConstraints.split(/[\n·;]+/)
    : Array.isArray(rawConstraints) ? rawConstraints : [])
    .map((c: string) => c.trim())
    .filter((c: string) => c.length > 0);

  const payload = {
    recommendations: data.recommendations,
    audienceContext: data.audienceContext || undefined,
    location: data.location || undefined,
    constraints: constraintsList,
    enableRepair: true,
    enableAgent: data.enableAgent ?? true,
    maxIterations: 3
  };

  try {
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
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Audit request failed. Please check network connectivity or backend server status.');
  }
}
