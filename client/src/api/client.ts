import type { AuthUser, GenerationResult, SavedComponent } from '../types';

const API_BASE = '/api';
const TOKEN_KEY = 'scg_ai_auth_token';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const mergedHeaders = new Headers(options?.headers ?? undefined);
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;

  if (!isFormData && !mergedHeaders.has('Content-Type')) {
    mergedHeaders.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: mergedHeaders,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

export const api = {
  generate: (
    prompt: string,
    componentType: string,
    refinement?: object | null,
    orgMetadata?: object | null,
    attachments?: object[],
    architecturePreference?: 'auto' | 'single' | 'nested',
    strictImageMatch?: boolean,
    signal?: AbortSignal
  ): Promise<GenerationResult> => {
    // Strip dataUrl before sending — it's only used for UI thumbnails.
    // Sending it doubles the image payload for no benefit.
    const cleanAttachments = attachments?.map((a) => {
      const { dataUrl: _drop, ...rest } = a as Record<string, unknown>;
      return rest;
    });
    return request('/generate', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        prompt,
        componentType,
        refinement,
        orgMetadata,
        attachments: cleanAttachments,
        architecturePreference,
        strictImageMatch,
      }),
    });
  },

  components: {
    list: (params?: { componentType?: string; search?: string }): Promise<SavedComponent[]> => {
      const qs = params
        ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString()
        : '';
      return request(`/components${qs}`, { headers: getAuthHeaders() });
    },
    get: (id: string): Promise<SavedComponent> => request(`/components/${id}`, { headers: getAuthHeaders() }),
    save: (data: object): Promise<SavedComponent> =>
      request('/components', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(data) }),
    update: (id: string, data: object): Promise<SavedComponent> =>
      request(`/components/${id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(data) }),
    delete: (id: string): Promise<{ success: boolean }> =>
      request(`/components/${id}`, { method: 'DELETE', headers: getAuthHeaders() }),
  },

  salesforce: {
    connect: (data: object) => request('/salesforce/connect', { method: 'POST', body: JSON.stringify(data) }),
    oauthInit: (loginUrl: string): Promise<{ authUrl: string }> =>
      request('/salesforce/oauth/init', { method: 'POST', body: JSON.stringify({ loginUrl }) }),
    metadata: (sessionId: string, objectNames?: string[]) => {
      const params = new URLSearchParams({ sessionId });
      if (objectNames && objectNames.length > 0) {
        params.set('objectNames', objectNames.join(','));
      }
      return request(`/salesforce/metadata?${params.toString()}`);
    },
    disconnect: (sessionId: string) =>
      request('/salesforce/disconnect', { method: 'POST', body: JSON.stringify({ sessionId }) }),
  },

  deploy: {
    downloadPackage: async (generatedData: object, name: string): Promise<Blob> => {
      const res = await fetch(`${API_BASE}/deploy/package`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generatedData, name }),
      });
      if (!res.ok) throw new Error('Package download failed');
      return res.blob();
    },
    toSalesforce: (sessionId: string, generatedData: object) =>
      request('/deploy/salesforce', { method: 'POST', body: JSON.stringify({ sessionId, generatedData }) }),
  },

  auth: {
    signup: (name: string, email: string, password: string): Promise<AuthResponse> =>
      request('/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
    login: (email: string, password: string): Promise<AuthResponse> =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    me: (token: string): Promise<{ user: AuthUser }> =>
      request('/auth/me', { method: 'GET', headers: { Authorization: `Bearer ${token}` } }),
    logout: (token: string): Promise<{ success: boolean }> =>
      request('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
  },

  health: () => request('/health'),
};
