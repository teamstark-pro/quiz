import Cookies from 'js-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request(path: string, options: RequestInit = {}) {
  const token = Cookies.get('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: 'no-store',
    ...options,
    headers,
  });

  if (response.status === 401) {
    // If not authenticated, we might want to redirect, 
    // but we'll let the component handle it or throw
    throw new Error('Not authenticated');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
    let message = error.detail || 'API request failed';
    if (typeof message === 'object') {
        message = JSON.stringify(message);
    }
    throw new Error(message);
  }

  return response.json();
}

export const api = {
  auth: {
    login: (data: any) => {
        // FormData for login because OAuth2PasswordRequestForm expects it
        const formData = new URLSearchParams();
        formData.append('username', data.email);
        formData.append('password', data.password);
        return fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            body: formData,
        }).then(res => res.ok ? res.json() : res.json().then(e => { throw new Error(e.detail) }));
    },
    register: (data: any) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    verifyAdmin: (password: string) => request('/auth/admin-verify', { method: 'POST', body: JSON.stringify({ password }) }),
  },
  folders: {
    list: (parentId?: string) => request(`/folders/?parent_id=${parentId || ''}`),
    create: (data: any) => request('/folders/', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request(`/folders/${id}`),
    delete: (id: string) => request(`/folders/${id}`, { method: 'DELETE' }),
  },
  quizzes: {
    list: (folderId?: string) => request(`/quizzes/?folder_id=${folderId || ''}`),
    get: (id: string) => request(`/quizzes/${id}`),
    createManual: (data: any) => request('/quizzes/create-manual', { method: 'POST', body: JSON.stringify(data) }),
    upload: (formData: FormData) => fetch(`${API_BASE_URL}/quizzes/upload`, {
        method: 'POST',
        body: formData,
        headers: {
            'Authorization': `Bearer ${Cookies.get('token')}`
        }
    }).then(res => res.ok ? res.json() : res.json().then(e => { throw new Error(e.detail) })),
    combine: (data: { quiz_ids: string[], title: string, folder_id?: string, question_limit?: number, time_limit_seconds?: number }) => request('/quizzes/combine', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/quizzes/${id}`, { method: 'DELETE' }),
  },
  attempts: {
    submit: (data: any) => request('/attempts/', { method: 'POST', body: JSON.stringify(data) }),
    getActive: (quizId: string) => request(`/attempts/active/${quizId}`),
    getSummary: () => request('/attempts/summary'),
    getTopicAnalysis: () => request('/attempts/topic-analysis'),
    getLeaderboard: () => request('/attempts/leaderboard'),
    getComparison: (quizId: string) => request(`/attempts/comparison/${quizId}`),
    getDailyStats: (tzOffset?: number) => request(`/attempts/daily-stats?tz_offset=${tzOffset !== undefined ? tzOffset : ''}`),
  },
  ai: {
    ask: (data: any) => request('/ai/ask', { method: 'POST', body: JSON.stringify(data) }),
    analyzePerformance: (data: any) => request('/ai/analyze-performance', { method: 'POST', body: JSON.stringify(data) }),
    getHumorousMotivation: () => request('/ai/humorous-motivation'),
  }
};
