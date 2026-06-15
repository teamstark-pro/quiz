'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

import Cookies from 'js-cookie';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await api.auth.login({ email, password });
      Cookies.set('token', data.access_token, { expires: 30 }); // 30 days
      Cookies.set('role', data.role, { expires: 30 });
      router.push('/dashboard');
      router.refresh(); // Refresh to ensure layout/middleware see the cookies
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center mt-4">
      <div className="card" style={{ width: '400px' }}>
        <h2 className="mb-4">Login</h2>
        {error && <p style={{ color: 'var(--error)', marginBottom: '1rem' }}>{error}</p>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input 
            type="email" 
            placeholder="Email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px' }}
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px' }}
          />
          <button type="submit" className="btn-primary">Login</button>
        </form>
        <p className="mt-4">
          Don't have an account? <a href="/register">Register</a>
        </p>
      </div>
    </div>
  );
}
