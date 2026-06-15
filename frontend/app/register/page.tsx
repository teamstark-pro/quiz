'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

import Cookies from 'js-cookie';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await api.auth.register({ name, email, password });
      Cookies.set('token', data.access_token, { expires: 30 });
      Cookies.set('role', data.role, { expires: 30 });
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center mt-4">
      <div className="card" style={{ width: '400px' }}>
        <h2 className="mb-4">Register</h2>
        {error && <p style={{ color: 'var(--error)', marginBottom: '1rem' }}>{error}</p>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input 
            type="text" 
            placeholder="Name" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            required 
            style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px' }}
          />
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
          <button type="submit" className="btn-primary">Register</button>
        </form>
        <p className="mt-4">
          Already have an account? <a href="/login">Login</a>
        </p>
      </div>
    </div>
  );
}
