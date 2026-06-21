'use client';
import Cookies from 'js-cookie';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [isQuizMode, setIsQuizMode] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!Cookies.get('token'));
    setRole(Cookies.get('role') || null);
  }, []);

  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      setIsQuizMode(window.location.pathname.includes('/quiz/') && params.get('mode') === 'quiz');
    };

    handleUrlChange();
    
    window.addEventListener('popstate', handleUrlChange);
    // Listen to Next.js route transitions by tracking pathname
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [pathname]);

  const handleLogout = () => {
    Cookies.remove('token');
    Cookies.remove('role');
    setIsLoggedIn(false);
    router.push('/login');
    router.refresh();
  };

  return (
    <html lang="en">
      <body>
        {!isQuizMode && (
          <nav className="navbar">
            <div className="container" style={{ padding: '0 1.5rem' }}>
              <div className="nav-content">
                <a href="/" className="logo">QuizMaster</a>
                <div className="nav-links">
                  <a href="/dashboard">Dashboard</a>
                  <a href="/analytics">Analytics</a>
                  {role === 'admin' && <a href="/admin">Admin Panel</a>}
                  {isLoggedIn ? (
                    <button onClick={handleLogout} className="btn-secondary" style={{ padding: '0.5rem 1.25rem', borderRadius: '10px' }}>
                       Sign Out
                    </button>
                  ) : (
                    <a href="/login" className="btn-primary" style={{ padding: '0.5rem 1.5rem', borderRadius: '10px', textShadow: 'none', color: 'white' }}>Login</a>
                  )}
                </div>
              </div>
            </div>
          </nav>
        )}
        <main style={{ paddingTop: isQuizMode ? '0' : '' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
