'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import Cookies from 'js-cookie';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = Cookies.get('token');
    if (token) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, []);

  return (
    <div className="flex flex-col items-center justify-center mt-4">
      <p>Redirecting...</p>
    </div>
  );
}
