'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<any>(null);
  const [topicAnalysis, setTopicAnalysis] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const summaryData = await api.attempts.getSummary();
      setSummary(summaryData);
      const topicData = await api.attempts.getTopicAnalysis();
      setTopicAnalysis(topicData);
      const lbData = await api.attempts.getLeaderboard();
      setLeaderboard(lbData);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
        <div className="container flex items-center justify-center" style={{ minHeight: '60vh' }}>
            <div className="flex flex-col items-center gap-4">
                <div className="spinner-small"></div>
                <p style={{ color: 'var(--muted)', fontWeight: 600 }}>Loading Analytics...</p>
            </div>
        </div>
    );
  }

  const userRank = leaderboard.findIndex(l => l.is_user) + 1;

  return (
    <div className="container">
      <header style={{ marginBottom: '3rem' }}>
        <h1 className="hero-title">Performance Analytics</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1.1rem' }}>Track your progress and climb the leaderboard.</p>
      </header>
      
      {summary && (
        <div className="grid mt-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
          <div className="card">
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Attempts</span>
            <p style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.5rem' }}>{summary.total_attempts}</p>
          </div>
          <div className="card">
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Global Rank</span>
            <p style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--secondary)', marginTop: '0.5rem' }}>{userRank > 0 ? `#${userRank}` : '?'}</p>
          </div>
          <div className="card">
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Avg Accuracy</span>
            <p style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.5rem' }}>{summary.average_score?.toFixed(1) || 0}%</p>
          </div>
          <div className="card">
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Study Time</span>
            <p style={{ fontSize: '2.5rem', fontWeight: 800, marginTop: '0.5rem' }}>{Math.floor(summary.total_time / 60)}<span style={{ fontSize: '1rem', color: 'var(--muted)' }}>m</span></p>
          </div>
        </div>
      )}

      <div className="flex-responsive">
        <div style={{ flex: 2 }}>
          <div className="card mb-6">
            <div className="flex justify-between items-center mb-6">
                <h3 style={{ fontWeight: 800, fontSize: '1.25rem' }}>Topic Improvement</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Topic</th>
                    <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Tries</th>
                    <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Initial</th>
                    <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Best</th>
                    <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {topicAnalysis.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>No quiz attempts yet. Start practicing to see your growth!</td></tr>
                  )}
                  {topicAnalysis.map((item, i) => {
                    const initialPct = Math.round((item.first_score / item.total_questions) * 100);
                    const currentPct = Math.round((item.last_score / item.total_questions) * 100);
                    const improvement = currentPct - initialPct;

                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                        <td style={{ padding: '1.25rem 1rem', fontWeight: 700 }}>{item.quiz_title}</td>
                        <td style={{ padding: '1.25rem 1rem' }}><span className="badge badge-primary">{item.attempts_count}</span></td>
                        <td style={{ padding: '1.25rem 1rem', opacity: 0.6 }}>{initialPct}%</td>
                        <td style={{ padding: '1.25rem 1rem', fontWeight: 800 }}>{currentPct}%</td>
                        <td style={{ padding: '1.25rem 1rem' }}>
                          <div style={{ width: '100px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginBottom: '4px' }}>
                             <div style={{ width: `${currentPct}%`, height: '100%', background: currentPct >= 80 ? 'var(--success)' : currentPct >= 50 ? 'var(--secondary)' : 'var(--error)' }}></div>
                          </div>
                          <span style={{ 
                            color: improvement >= 0 ? '#34d399' : '#f87171',
                            fontWeight: 800,
                            fontSize: '0.75rem'
                          }}>
                            {improvement >= 0 ? '↑' : '↓'} {Math.abs(improvement)}% improvement
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div className="card">
            <h3 className="mb-6" style={{ fontWeight: 800, fontSize: '1.25rem' }}>Global Leaderboard</h3>
          <div className="flex flex-col gap-4">
            {leaderboard.length === 0 && (
                <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>Waiting for contenders...</p>
            )}
            {leaderboard.map((item, i) => (
              <div key={i} className="flex justify-between items-center p-4" style={{ 
                  background: item.is_user ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.02)', 
                  borderRadius: '12px', 
                  border: item.is_user ? '1px solid var(--primary)' : '1px solid var(--border)' 
              }}>
                <div className="flex items-center gap-3">
                  <div style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '50%', 
                    background: i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : 'rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    color: i < 3 ? '#000' : 'inherit'
                  }}>
                    {i + 1}
                  </div>
                  <span style={{ fontWeight: 600 }}>{item.username} {item.is_user && '(You)'}</span>
                </div>
                <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{item.total_score} <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>pts</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
