'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const [folders, setFolders] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [currentFolder, setCurrentFolder] = useState<any>(null);
  const [path, setPath] = useState<any[]>([{ _id: null, name: 'Library' }]);
  const [dailyStats, setDailyStats] = useState<any>(null);
  const [quote, setQuote] = useState('');
  const router = useRouter();

  useEffect(() => {
    loadContent(null);
    loadDailyStats();
    loadQuote();
  }, []);

  const loadDailyStats = async () => {
    try {
      const stats = await api.attempts.getDailyStats();
      setDailyStats(stats);
    } catch (err) {
      console.error(err);
    }
  }

  const loadQuote = async () => {
    try {
      const res = await api.ai.getHumorousMotivation();
      setQuote(res.quote);
    } catch (err) {
      console.error(err);
    }
  }

  const loadContent = async (folderId: string | null, folderName?: string) => {
    try {
      const folderList = await api.folders.list(folderId || undefined);
      setFolders(folderList);
      
      if (folderId) {
        const quizList = await api.quizzes.list(folderId);
        setQuizzes(quizList);
        
        // Update path
        if (folderName) {
            const index = path.findIndex(p => p._id === folderId);
            if (index !== -1) {
                setPath(path.slice(0, index + 1));
            } else {
                setPath([...path, { _id: folderId, name: folderName }]);
            }
        }
        
        const folderDetails = await api.folders.get(folderId);
        setCurrentFolder(folderDetails);
      } else {
        setQuizzes([]);
        setCurrentFolder(null);
        setPath([{ _id: null, name: 'Library' }]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container" style={{ paddingBottom: '5rem' }}>
      <header style={{ marginBottom: '2.5rem' }}>
        <h1 className="hero-title" style={{ marginBottom: '0.5rem' }}>Welcome back!</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem' }}>Ready to crush it today?</p>
      </header>

      {quote && (
          <div className="card mb-8" style={{ 
            background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.1), rgba(129, 140, 248, 0.1))',
            borderColor: 'rgba(244, 114, 182, 0.2)',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
              <span style={{ fontSize: '2rem' }}>👺</span>
              <div>
                <strong style={{ fontSize: '0.75rem', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '0.25rem' }}>DESI COACH SAYS:</strong>
                <p style={{ fontSize: '1.1rem', fontWeight: 700, fontStyle: 'italic', color: 'var(--foreground)' }}>"{quote}"</p>
              </div>
          </div>
      )}

      <div className="flex-responsive" style={{ gap: '2rem' }}>
        <div style={{ flex: 2 }}>
            <div className="breadcrumb" style={{ marginBottom: '2rem', padding: '0.6rem 1.25rem' }}>
                {path.map((crumb, i) => (
                <span key={crumb._id || 'root'} className="flex items-center">
                    <span 
                    className={`breadcrumb-item ${i === path.length - 1 ? 'active' : ''}`} 
                    onClick={() => loadContent(crumb._id)}
                    style={{ fontSize: '0.85rem' }}
                    >
                    {crumb.name === 'Library' ? '🏠' : crumb.name}
                    </span>
                    {i < path.length - 1 && <span style={{ margin: '0.4rem', opacity: 0.3 }}>/</span>}
                </span>
                ))}
            </div>

            <section className="mb-4">
                <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.5rem' }}>
                {currentFolder ? '📂 ' + currentFolder.name : '📚 Subjects'}
                </h2>

                {folders.length === 0 && quizzes.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', borderStyle: 'dashed' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🏜️</div>
                    <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>Nothing here yet</h3>
                    <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Check other folders or come back later.</p>
                </div>
                )}
                
                <div className="folder-grid">
                {folders.map(folder => (
                    <div key={folder._id} className="card folder-card" onClick={() => loadContent(folder._id, folder.name)} style={{ padding: '1.25rem 1.5rem', cursor: 'pointer' }}>
                    <span style={{ fontSize: '1.75rem' }}>📁</span>
                    <div className="flex flex-col">
                        <strong style={{ fontSize: '1.05rem' }}>{folder.name}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Topic Folder</span>
                    </div>
                    </div>
                ))}
                </div>

                {quizzes.length > 0 && (
                <div style={{ marginTop: '2.5rem' }}>
                    <h3 style={{ marginBottom: '1.25rem', fontWeight: 800, fontSize: '1.2rem' }}>Available Quizzes</h3>
                    <div className="folder-grid">
                    {quizzes.map(quiz => (
                        <div key={quiz._id} className="card quiz-card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.7))' }}>
                        <div className="flex items-center gap-4">
                            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', boxShadow: '0 4px 10px var(--primary-glow)' }}>
                            📝
                            </div>
                            <div className="flex flex-col">
                            <strong style={{ fontSize: '1.1rem' }}>{quiz.title}</strong>
                            <div className="flex gap-2 mt-1">
                                <span className="badge badge-primary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.6rem' }}>{quiz.questions.length} Qs</span>
                            </div>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                            <button className="btn-primary w-full" onClick={() => router.push(`/quiz/${quiz._id}?mode=practice`)} style={{ padding: '0.7rem' }}>
                            Practice
                            </button>
                            <button className="btn-secondary w-full" onClick={() => router.push(`/quiz/${quiz._id}?mode=quiz`)} style={{ padding: '0.7rem' }}>
                            Quiz
                            </button>
                        </div>
                        </div>
                    ))}
                    </div>
                </div>
                )}
            </section>
        </div>

        <div style={{ flex: 1 }}>
            <div className="card" style={{ padding: '1.5rem', position: 'sticky', top: '100px' }}>
                <div className="flex items-center gap-3 mb-6">
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(52, 211, 153, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                        🔥
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Daily Progress</h3>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="p-4" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>QUESTIONS TODAY</span>
                        <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--success)', margin: '0.5rem 0' }}>{dailyStats?.user_solved || 0}</div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Keep it up!</p>
                    </div>

                    <div>
                        <h4 style={{ fontSize: '0.85rem', color: 'var(--foreground)', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                           🏆 PEER GROUP TODAY
                        </h4>
                        <div className="flex flex-col gap-2">
                            {dailyStats?.daily_leaderboard.map((peer: any, idx: number) => (
                                <div key={idx} style={{ 
                                    padding: '0.75rem 1rem', 
                                    borderRadius: '12px', 
                                    background: peer.is_me ? 'rgba(129, 140, 248, 0.1)' : 'rgba(255,255,255,0.02)',
                                    border: peer.is_me ? '1px solid var(--primary)' : '1px solid var(--border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span style={{ fontSize: '0.8rem', opacity: 0.5, fontWeight: 800 }}>#{idx + 1}</span>
                                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{peer.name}</span>
                                        {peer.is_me && <span className="badge badge-primary" style={{ fontSize: '0.5rem' }}>YOU</span>}
                                    </div>
                                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--success)' }}>{peer.solved}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
