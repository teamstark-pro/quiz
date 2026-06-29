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
  const [selectedQuizzes, setSelectedQuizzes] = useState<string[]>([]);
  const [showMiscModal, setShowMiscModal] = useState(false);
  const [allQuizzes, setAllQuizzes] = useState<any[]>([]);
  const [miscSelectedQuizzes, setMiscSelectedQuizzes] = useState<string[]>([]);
  const [questionLimit, setQuestionLimit] = useState<number>(20);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(15);
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedQuizForStart, setSelectedQuizForStart] = useState<any>(null);
  const [selectedModeForStart, setSelectedModeForStart] = useState<'practice' | 'quiz'>('practice');
  const [customTimeLimitMinutes, setCustomTimeLimitMinutes] = useState<number>(15);
  const router = useRouter();

  useEffect(() => {
    loadContent(null);
    loadDailyStats();
  }, []);

  const loadDailyStats = async () => {
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const stats = await api.attempts.getDailyStats(tzOffset);
      setDailyStats(stats);
    } catch (err) {
      console.error(err);
    }
  }

  const handleStartSetup = (quiz: any, mode: 'practice' | 'quiz') => {
    setSelectedQuizForStart(quiz);
    setSelectedModeForStart(mode);
    setCustomTimeLimitMinutes(Math.ceil((quiz.time_limit_seconds || 900) / 60));
    setShowStartModal(true);
  };

  const handleLaunchQuiz = () => {
    if (!selectedQuizForStart) return;
    router.push(`/quiz/${selectedQuizForStart._id}?mode=${selectedModeForStart}&timeLimit=${customTimeLimitMinutes * 60}`);
    setShowStartModal(false);
  };

  const loadContent = async (folderId: string | null, folderName?: string) => {
    try {
      setSelectedQuizzes([]);
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

  const handleCombineAndStart = async (mode: 'practice' | 'quiz') => {
    if (selectedQuizzes.length === 0) return;
    try {
      const folderName = currentFolder ? currentFolder.name : 'Library';
      const title = `Combined Quiz: ${folderName} (${new Date().toLocaleDateString()})`;
      const folderId = currentFolder?._id || '';
      
      const newQuiz = await api.quizzes.combine({
        quiz_ids: selectedQuizzes,
        title,
        folder_id: folderId
      });
      
      router.push(`/quiz/${newQuiz._id}?mode=${mode}`);
    } catch (err: any) {
      alert("Error combining quizzes: " + err.message);
    }
  };

  const loadAllQuizzes = async () => {
    try {
      const list = await api.quizzes.list();
      setAllQuizzes(list);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (showMiscModal && allQuizzes.length === 0) {
      loadAllQuizzes();
    }
  }, [showMiscModal]);

  const startMiscQuiz = async (mode: 'practice' | 'quiz') => {
    if (miscSelectedQuizzes.length === 0) return;
    try {
      const title = `Miscellaneous Test (${new Date().toLocaleDateString()})`;
      const timeLimitSeconds = timeLimitMinutes * 60;
      
      const newQuiz = await api.quizzes.combine({
        quiz_ids: miscSelectedQuizzes,
        title,
        question_limit: questionLimit,
        time_limit_seconds: timeLimitSeconds
      });
      
      router.push(`/quiz/${newQuiz._id}?mode=${mode}`);
    } catch (err: any) {
      alert("Error starting miscellaneous quiz: " + err.message);
    }
  };

  return (
    <div className="container" style={{ paddingBottom: '5rem' }}>
      <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="hero-title" style={{ marginBottom: '0.5rem' }}>Welcome back!</h1>
          <p style={{ color: 'var(--muted)', fontSize: '1rem' }}>Ready to crush it today?</p>
        </div>
        <button 
          className="btn-primary" 
          onClick={() => setShowMiscModal(true)} 
          style={{ padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg, var(--secondary), var(--accent))' }}
        >
          🎲 Miscellaneous Test
        </button>
      </header>



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
                    
                    {selectedQuizzes.length > 0 && (
                      <div className="card mb-6" style={{ 
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(236, 72, 153, 0.15))',
                        borderColor: 'var(--primary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '1.25rem 1.5rem',
                        gap: '1rem',
                        flexWrap: 'wrap',
                        borderRadius: '16px'
                      }}>
                        <div>
                          <strong style={{ fontSize: '1.1rem', color: 'var(--foreground)' }}>Combined Practice ({selectedQuizzes.length} Selected)</strong>
                          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                            Questions from selected quizzes will be merged and shuffled.
                          </p>
                        </div>
                        <div className="flex gap-3 ml-auto" style={{ alignItems: 'center' }}>
                          <button className="btn-primary" style={{ padding: '0.7rem 1.5rem' }} onClick={() => handleCombineAndStart('practice')}>
                            Practice Shuffled
                          </button>
                          <button className="btn-secondary" style={{ padding: '0.7rem 1.5rem' }} onClick={() => handleCombineAndStart('quiz')}>
                            Quiz Shuffled
                          </button>
                          <button className="btn-secondary" style={{ padding: '0.7rem 1rem', borderColor: 'transparent', background: 'transparent' }} onClick={() => setSelectedQuizzes([])}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="folder-grid">
                    {quizzes.map(quiz => (
                        <div key={quiz._id} className="card quiz-card" style={{ 
                            padding: '1.5rem', 
                            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.7))',
                            position: 'relative',
                            border: selectedQuizzes.includes(quiz._id) ? '1px solid var(--primary)' : '1px solid var(--border)'
                        }}>
                        <div style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', zIndex: 10 }}>
                            <input 
                              type="checkbox" 
                              checked={selectedQuizzes.includes(quiz._id)} 
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedQuizzes([...selectedQuizzes, quiz._id]);
                                } else {
                                  setSelectedQuizzes(selectedQuizzes.filter(id => id !== quiz._id));
                                }
                              }}
                              style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
                            />
                        </div>
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
                            <button className="btn-primary w-full" onClick={() => handleStartSetup(quiz, 'practice')} style={{ padding: '0.7rem' }}>
                            Practice
                            </button>
                            <button className="btn-secondary w-full" onClick={() => handleStartSetup(quiz, 'quiz')} style={{ padding: '0.7rem' }}>
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

      {showMiscModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '1.5rem'
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '550px',
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            maxHeight: '90vh',
            overflowY: 'auto',
            borderRadius: '16px'
          }}>
            <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--foreground)' }}>🎲 Miscellaneous Test</h3>
              <button 
                onClick={() => setShowMiscModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.05em' }}>
                SELECT TESTS TO INHERIT QUESTIONS FROM
              </label>
              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                background: 'rgba(0,0,0,0.1)'
              }}>
                {allQuizzes.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>Loading available tests...</p>
                ) : (
                  allQuizzes.map(q => (
                    <label key={q._id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--foreground)' }}>
                      <input 
                        type="checkbox"
                        checked={miscSelectedQuizzes.includes(q._id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setMiscSelectedQuizzes([...miscSelectedQuizzes, q._id]);
                          } else {
                            setMiscSelectedQuizzes(miscSelectedQuizzes.filter(id => id !== q._id));
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{q.title}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.05em' }}>
                  NO. OF QUESTIONS
                </label>
                <input 
                  type="number"
                  min={1}
                  max={100}
                  value={questionLimit}
                  onChange={(e) => setQuestionLimit(parseInt(e.target.value) || 10)}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'white' }}
                />
              </div>

              <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.05em' }}>
                  TIME LIMIT (MINS)
                </label>
                <input 
                  type="number"
                  min={1}
                  max={180}
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(parseInt(e.target.value) || 10)}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'white' }}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-4" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button 
                className="btn-secondary" 
                onClick={() => setShowMiscModal(false)}
                style={{ padding: '0.75rem 1.25rem' }}
              >
                Cancel
              </button>
              <button 
                className="btn-secondary" 
                onClick={() => startMiscQuiz('practice')}
                disabled={miscSelectedQuizzes.length === 0}
                style={{ padding: '0.75rem 1.25rem' }}
              >
                Practice Shuffled
              </button>
              <button 
                className="btn-primary" 
                onClick={() => startMiscQuiz('quiz')}
                disabled={miscSelectedQuizzes.length === 0}
                style={{ padding: '0.75rem 1.25rem' }}
              >
                Start Exam (Timed)
              </button>
            </div>
          </div>
        </div>
      )}

      {showStartModal && selectedQuizForStart && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '1.5rem'
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: '500px',
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
            borderColor: 'rgba(129, 140, 248, 0.25)',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            borderRadius: '16px'
          }}>
            <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
                📝 Setup: {selectedQuizForStart.title}
              </h3>
              <button 
                onClick={() => setShowStartModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <span className="badge badge-primary" style={{ textTransform: 'uppercase', fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}>
                  Mode: {selectedModeForStart === 'quiz' ? 'Exam (Timed)' : 'Practice (Untimed / Assisted)'}
                </span>
              </div>

              {/* Time limit setup */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.05em' }}>
                  SET TIME LIMIT (MINUTES)
                </label>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input 
                    type="number"
                    min={1}
                    max={180}
                    value={customTimeLimitMinutes}
                    onChange={(e) => setCustomTimeLimitMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ width: '100px', padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'white', fontWeight: 700 }}
                  />
                  <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>minutes</span>
                </div>
              </div>

              {/* Marking Scheme Alert Panel */}
              <div style={{
                background: 'rgba(129, 140, 248, 0.05)',
                border: '1px solid rgba(129, 140, 248, 0.15)',
                borderRadius: '12px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  ⚖️ Marking Scheme
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                  <div style={{ padding: '0.5rem', background: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.15)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', fontWeight: 600 }}>Correct</span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--success)' }}>+2.0</strong>
                  </div>
                  <div style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', fontWeight: 600 }}>Incorrect</span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--error)' }}>-0.66</strong>
                  </div>
                  <div style={{ padding: '0.5rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', fontWeight: 600 }}>Unanswered</span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--muted)' }}>0.0</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4" style={{ justifyContent: 'flex-end' }}>
              <button 
                className="btn-secondary" 
                onClick={() => setShowStartModal(false)}
                style={{ padding: '0.75rem 1.2rem' }}
              >
                Cancel
              </button>
              <button 
                className="btn-primary" 
                onClick={handleLaunchQuiz}
                style={{ padding: '0.75rem 1.5rem', textShadow: 'none' }}
              >
                🚀 Launch Test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
