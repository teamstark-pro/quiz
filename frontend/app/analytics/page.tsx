'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<any>(null);
  const [topicAnalysis, setTopicAnalysis] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [deepAnalysis, setDeepAnalysis] = useState<any>(null);
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
      const historyData = await api.attempts.getHistory();
      setHistory(historyData);
      
      try {
        const deepData = await api.attempts.getDeepAnalysis();
        setDeepAnalysis(deepData);
      } catch (err) {
        console.error("Failed to load deep analysis", err);
      }
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

      {deepAnalysis && deepAnalysis.has_data && (
        <div className="grid mb-6" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
          gap: '1.5rem', 
          marginBottom: '2rem' 
        }}>
          {/* AI Tutor Card */}
          <div className="card" style={{ 
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(167, 139, 250, 0.03) 100%)',
            borderColor: 'rgba(129, 140, 248, 0.25)',
            boxShadow: '0 0 20px rgba(129, 140, 248, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.75rem' }}>🤖</span>
                  <h3 style={{ fontWeight: 800, fontSize: '1.25rem', color: 'white' }}>AI Performance Review</h3>
                </div>
                {deepAnalysis.current_streak > 0 && (
                  <span style={{ 
                    background: 'rgba(239, 68, 68, 0.1)', 
                    color: '#f87171', 
                    padding: '0.4rem 0.8rem', 
                    borderRadius: '20px', 
                    fontSize: '0.75rem', 
                    fontWeight: 800, 
                    border: '1px solid rgba(239, 68, 68, 0.2)' 
                  }}>
                    🔥 {deepAnalysis.current_streak} Day Streak
                  </span>
                )}
              </div>
              <div className="markdown-body" style={{ color: '#cbd5e1', lineHeight: '1.6' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{deepAnalysis.ai_feedback}</ReactMarkdown>
              </div>
            </div>
          </div>

          {/* Speed vs Accuracy Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '1.75rem' }}>⏱️</span>
                <h3 style={{ fontWeight: 800, fontSize: '1.25rem', color: 'white' }}>Speed vs. Accuracy Matrix</h3>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {Object.entries(deepAnalysis.speed_intervals).map(([key, data]: [string, any]) => {
                  const barColor = key === 'steady' ? 'var(--success)' : key === 'slow' ? 'var(--primary)' : 'var(--error)';
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--foreground)' }}>{data.label}</span>
                        <span style={{ color: 'var(--muted)' }}>
                          {data.correct}/{data.total} correct ({data.accuracy}%)
                        </span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${data.accuracy}%`, height: '100%', background: barColor, borderRadius: '4px' }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ 
              background: 'rgba(255,255,255,0.01)', 
              borderRadius: '12px', 
              padding: '1rem', 
              border: '1px solid var(--border)',
              fontSize: '0.85rem',
              color: 'var(--muted)',
              marginTop: 'auto'
            }}>
              <p style={{ marginBottom: '0.5rem' }}>
                ⏱️ Avg response time on <strong style={{ color: 'white' }}>Correct</strong> answers: <strong style={{ color: 'var(--success)' }}>{deepAnalysis.avg_correct_time}s</strong>
              </p>
              <p style={{ marginBottom: '0.75rem' }}>
                ⏱️ Avg response time on <strong style={{ color: 'white' }}>Incorrect</strong> answers: <strong style={{ color: 'var(--error)' }}>{deepAnalysis.avg_incorrect_time}s</strong>
              </p>
              <p style={{ fontStyle: 'italic', fontSize: '0.8rem', color: 'var(--secondary)' }}>
                {deepAnalysis.avg_correct_time > deepAnalysis.avg_incorrect_time 
                  ? "💡 Insight: Taking more time on tough questions increases your chance of getting them right! Keep it up."
                  : "💡 Insight: You seem to get stuck on incorrect answers. Consider skipping if a question takes too long!"}
              </p>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 600px) {
          .hide-on-mobile {
            display: none !important;
          }
          .history-item {
            flex-direction: column !important;
            align-items: flex-start !important;
            padding: 1rem !important;
          }
          .history-item-actions {
            width: 100% !important;
            justify-content: space-between !important;
            border-top: 1px solid var(--border) !important;
            padding-top: 0.75rem !important;
            margin-top: 0.5rem !important;
          }
          .history-stats {
            align-items: flex-start !important;
          }
        }
      ` }} />

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
                    <th className="hide-on-mobile" style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Tries</th>
                    <th className="hide-on-mobile" style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>Initial</th>
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
                        <td className="hide-on-mobile" style={{ padding: '1.25rem 1rem' }}><span className="badge badge-primary">{item.attempts_count}</span></td>
                        <td className="hide-on-mobile" style={{ padding: '1.25rem 1rem', opacity: 0.6 }}>{initialPct}%</td>
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

          <div className="card" style={{ marginTop: '2rem' }}>
            <h3 style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: '1.5rem' }}>Attempts History</h3>
            <div className="flex flex-col gap-4">
              {history.length === 0 && (
                <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
                  You haven't attempted any quizzes yet.
                </p>
              )}
              {history.map((item, idx) => {
                const dateStr = item.created_at 
                  ? new Date(item.created_at).toLocaleDateString(undefined, { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) 
                  : 'N/A';
                  
                const maxScore = item.total_questions * 2;
                
                return (
                  <div key={idx} className="history-item">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--foreground)' }}>{item.quiz_title}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span className={`badge ${item.mode === 'practice' ? 'badge-primary' : 'badge-success'}`} style={{ fontSize: '0.65rem' }}>
                          {item.mode === 'practice' ? 'Practice' : 'Exam'}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                          📅 {dateStr}
                        </span>
                      </div>
                    </div>
                    
                    <div className="history-item-actions" style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                      <div className="history-stats" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ fontWeight: 800, color: item.score >= 0 ? 'var(--success)' : 'var(--error)', fontSize: '1.1rem' }}>
                          {item.score} <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 400 }}>/ {maxScore} pts</span>
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                          ⏱️ {Math.floor(item.time_taken_seconds / 60)}m {item.time_taken_seconds % 60}s
                        </span>
                      </div>
                      
                      <button 
                        className="btn-primary" 
                        style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem', borderRadius: '8px' }}
                        onClick={() => window.location.href = `/quiz/${item.quiz_id}?attemptId=${item.id}`}
                      >
                        🔎 Review Analysis
                      </button>
                    </div>
                  </div>
                );
              })}
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
