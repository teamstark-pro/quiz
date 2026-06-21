'use client';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function QuizPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'practice';
  const router = useRouter();

  const [quiz, setQuiz] = useState<any>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userResponses, setUserResponses] = useState<(number | null)[]>([]);
  const [questionTimes, setQuestionTimes] = useState<number[]>([]);
  const [lastQuestionStartTime, setLastQuestionStartTime] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const timerRef = useRef<any>(null);
  const autoSaveRef = useRef<any>(null);

  useEffect(() => {
    loadQuizAndCheckProgress();
    startTimer();
    
    // Auto-save progress every 30 seconds
    autoSaveRef.current = setInterval(() => {
        saveProgress();
    }, 30000);

    return () => {
        clearInterval(timerRef.current);
        clearInterval(autoSaveRef.current);
    };
  }, []);

  const loadQuizAndCheckProgress = async () => {
    try {
      const quizData = await api.quizzes.get(id as string);
      setQuiz(quizData);
      
      const activeAttempt = await api.attempts.getActive(id as string);
      if (activeAttempt && activeAttempt.mode === mode) {
        setActiveAttemptId(activeAttempt.id || activeAttempt._id);
        setShowResumeModal(true);
      } else {
        setUserResponses(new Array(quizData.questions.length).fill(null));
        setQuestionTimes(new Array(quizData.questions.length).fill(0));
        setLastQuestionStartTime(0);
        
        const initialStatuses = new Array(quizData.questions.length).fill('not_visited');
        initialStatuses[0] = 'not_answered';
        setStatuses(initialStatuses);
      }
    } catch (err) {
      console.error(err);
      router.push('/dashboard');
    }
  };

  const resumeAttempt = async () => {
    try {
        const activeAttempt = await api.attempts.getActive(id as string);
        if (activeAttempt) {
            setUserResponses(activeAttempt.responses);
            setQuestionTimes(activeAttempt.question_times || new Array(quiz.questions.length).fill(0));
            setCurrentQuestionIndex(activeAttempt.current_question_index);
            setTimer(activeAttempt.time_taken_seconds);
            setLastQuestionStartTime(activeAttempt.time_taken_seconds);
            
            if (activeAttempt.statuses && activeAttempt.statuses.length === quiz.questions.length) {
                setStatuses(activeAttempt.statuses);
            } else {
                const initialStatuses = new Array(quiz.questions.length).fill('not_visited');
                activeAttempt.responses.forEach((resVal: any, idx: number) => {
                    if (resVal !== null) {
                        initialStatuses[idx] = 'answered';
                    }
                });
                const curIdx = activeAttempt.current_question_index || 0;
                if (initialStatuses[curIdx] === 'not_visited') {
                    initialStatuses[curIdx] = 'not_answered';
                }
                setStatuses(initialStatuses);
            }
            
            setShowResumeModal(false);
        }
    } catch (err) {
        console.error("Failed to resume", err);
        startOver();
    }
  };

  const startOver = () => {
    setUserResponses(new Array(quiz.questions.length).fill(null));
    setQuestionTimes(new Array(quiz.questions.length).fill(0));
    setLastQuestionStartTime(0);
    setCurrentQuestionIndex(0);
    setTimer(0);
    
    const initialStatuses = new Array(quiz.questions.length).fill('not_visited');
    initialStatuses[0] = 'not_answered';
    setStatuses(initialStatuses);
    
    setActiveAttemptId(null);
    setShowResumeModal(false);
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setTimer(prev => prev + 1);
    }, 1000);
  };

  const saveProgress = async (final = false, customStatuses?: string[]) => {
    if (!quiz || isFinished) return;
    
    // Update current question time
    const updatedTimes = [...questionTimes];
    updatedTimes[currentQuestionIndex] += (timer - lastQuestionStartTime);
    
    let score = 0;
    userResponses.forEach((res, i) => {
      if (res === quiz.questions[i].correct_option_index) score++;
    });

    const activeStatuses = customStatuses || statuses;

    try {
      const res = await api.attempts.submit({
        id: activeAttemptId,
        quiz_id: id,
        mode,
        time_taken_seconds: timer,
        score,
        total_questions: quiz.questions.length,
        responses: userResponses,
        question_times: updatedTimes,
        statuses: activeStatuses,
        status: final ? "completed" : "in_progress",
        current_question_index: currentQuestionIndex
      });
      const attemptId = res.id || res._id;
      if (!activeAttemptId && attemptId) {
          setActiveAttemptId(attemptId);
      }
      if (!final) {
          setQuestionTimes(updatedTimes);
          setLastQuestionStartTime(timer);
      }
    } catch (err) {
      console.error("Failed to save progress", err);
    }
  };

  const handleOptionSelect = (index: number) => {
    if (isFinished || (mode === 'practice' && showFeedback)) return;
    
    const newResponses = [...userResponses];
    newResponses[currentQuestionIndex] = index;
    setUserResponses(newResponses);

    if (mode === 'practice') {
        setShowFeedback(true);
    }
  };

  const navigateToQuestion = (idx: number) => {
    if (idx === currentQuestionIndex) return;
    
    const updatedStatuses = [...statuses];
    const currentStatus = updatedStatuses[currentQuestionIndex];
    if (currentStatus === 'not_visited') {
      updatedStatuses[currentQuestionIndex] = 'not_answered';
    }
    
    if (updatedStatuses[idx] === 'not_visited') {
      updatedStatuses[idx] = 'not_answered';
    }
    
    setStatuses(updatedStatuses);
    saveProgress(false, updatedStatuses);
    
    setCurrentQuestionIndex(idx);
    setAiResponse('');
    setShowFeedback(false);
  };

  const saveAndNext = () => {
    const updatedStatuses = [...statuses];
    const userRes = userResponses[currentQuestionIndex];
    
    if (userRes !== null) {
      updatedStatuses[currentQuestionIndex] = 'answered';
    } else {
      updatedStatuses[currentQuestionIndex] = 'not_answered';
    }
    
    setStatuses(updatedStatuses);
    
    if (currentQuestionIndex < quiz.questions.length - 1) {
      if (updatedStatuses[currentQuestionIndex + 1] === 'not_visited') {
        updatedStatuses[currentQuestionIndex + 1] = 'not_answered';
      }
      saveProgress(false, updatedStatuses);
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setAiResponse('');
      setShowFeedback(false);
    } else {
      saveProgress(false, updatedStatuses);
    }
  };

  const markForReviewAndNext = () => {
    const updatedStatuses = [...statuses];
    const userRes = userResponses[currentQuestionIndex];
    
    if (userRes !== null) {
      updatedStatuses[currentQuestionIndex] = 'answered_marked';
    } else {
      updatedStatuses[currentQuestionIndex] = 'marked';
    }
    
    setStatuses(updatedStatuses);
    
    if (currentQuestionIndex < quiz.questions.length - 1) {
      if (updatedStatuses[currentQuestionIndex + 1] === 'not_visited') {
        updatedStatuses[currentQuestionIndex + 1] = 'not_answered';
      }
      saveProgress(false, updatedStatuses);
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setAiResponse('');
      setShowFeedback(false);
    } else {
      saveProgress(false, updatedStatuses);
    }
  };

  const clearResponse = () => {
    const newResponses = [...userResponses];
    newResponses[currentQuestionIndex] = null;
    setUserResponses(newResponses);
    
    const updatedStatuses = [...statuses];
    updatedStatuses[currentQuestionIndex] = 'not_answered';
    setStatuses(updatedStatuses);
    
    saveProgress(false, updatedStatuses);
  };

  const skipQuestion = () => {
    if (currentQuestionIndex < quiz.questions.length - 1) {
      saveProgress();
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setAiResponse('');
      setShowFeedback(false);
    } else {
      finishQuiz();
    }
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < quiz.questions.length - 1) {
      saveProgress();
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setAiResponse('');
      setShowFeedback(false);
    } else {
      finishQuiz();
    }
  };

  const finishQuiz = async () => {
    clearInterval(timerRef.current);
    clearInterval(autoSaveRef.current);
    
    // Final time update
    const finalTimes = [...questionTimes];
    finalTimes[currentQuestionIndex] += (timer - lastQuestionStartTime);
    setQuestionTimes(finalTimes);

    setIsFinished(true);
    
    let score = 0;
    userResponses.forEach((res, i) => {
      if (res === quiz.questions[i].correct_option_index) score++;
    });

    await api.attempts.submit({
      id: activeAttemptId,
      quiz_id: id,
      mode,
      time_taken_seconds: timer,
      score,
      total_questions: quiz.questions.length,
      responses: userResponses,
      question_times: finalTimes,
      statuses: statuses,
      status: "completed",
      current_question_index: currentQuestionIndex
    });

    loadComparison();
  };

  useEffect(() => {
    if (quiz && quiz.time_limit_seconds && !isFinished) {
      if (timer >= quiz.time_limit_seconds) {
        alert("⏰ Time is up! Your quiz will be automatically submitted.");
        finishQuiz();
      }
    }
  }, [timer, quiz, isFinished]);

  const loadComparison = async () => {
    try {
        const comp = await api.attempts.getComparison(id as string);
        setComparisonData(comp);
        
        // Trigger AI analysis
        let score = 0;
        userResponses.forEach((res, i) => {
          if (res === quiz.questions[i].correct_option_index) score++;
        });

        setIsAiAnalyzing(true);
        const analysis = await api.ai.analyzePerformance({
            user_score: score,
            user_time: timer,
            peer_avg_score: comp.peer_summary.avg_score || 0,
            peer_avg_time: comp.peer_summary.avg_time || 0,
            total_questions: quiz.questions.length
        });
        setAiAnalysis(analysis.analysis);
        setIsAiAnalyzing(false);
    } catch (err) {
        console.error("Failed to load comparison", err);
    }
  }

  const askAI = async (query: string, questionOverride?: any) => {
    setIsAiLoading(true);
    try {
      const q = questionOverride || quiz.questions[currentQuestionIndex];
      const res = await api.ai.ask({
        question_text: q.text,
        options: q.options,
        user_query: query
      });
      if (questionOverride) {
          return res.answer;
      }
      setAiResponse(res.answer);
    } catch (err) {
      if (!questionOverride) setAiResponse("Failed to get AI response.");
      return "Error fetching AI response.";
    } finally {
      setIsAiLoading(false);
    }
  };

  const [explainingQuestionIdx, setExplainingQuestionIdx] = useState<number | null>(null);
  const [explanationText, setExplanationText] = useState('');

  const explainResultQuestion = async (idx: number) => {
      setExplainingQuestionIdx(idx);
      setExplanationText('AI is analyzing...');
      const text = await askAI("Explain this question, my answer choice, and why the correct answer is what it is.", quiz.questions[idx]);
      setExplanationText(text as string);
  }

  if (!quiz) return (
    <div className="container flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="flex flex-col items-center gap-4">
            <div style={{ width: '40px', height: '40px', border: '4px solid var(--glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <p style={{ color: 'var(--muted)', fontWeight: 600 }}>Loading Quiz...</p>
        </div>
        <style dangerouslySetInnerHTML={{ __html: `
            @keyframes spin { to { transform: rotate(360deg); } }
        ` }} />
    </div>
  );

  if (showResumeModal) {
    return (
      <div className="container flex items-center justify-center" style={{ minHeight: '70vh' }}>
        <div className="card" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>⏳</div>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>Resume Quiz?</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '2.5rem' }}>
            We found an unfinished attempt for this quiz. Would you like to resume where you left off or start fresh?
          </p>
          <div className="flex flex-col gap-3">
            <button className="btn-primary w-full" style={{ padding: '1rem' }} onClick={resumeAttempt}>
              Resume Attempt
            </button>
            <button className="btn-secondary w-full" style={{ padding: '1rem' }} onClick={startOver}>
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isFinished) {
    let score = 0;
    userResponses.forEach((res, i) => {
      if (res === quiz.questions[i].correct_option_index) score++;
    });
    const percentage = Math.round((score / quiz.questions.length) * 100);
    
    return (
      <div className="container py-12">
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            body, html {
              background: white !important;
              color: black !important;
            }
            .container {
              padding: 0 !important;
              margin: 0 !important;
              max-width: 100% !important;
            }
            button, .btn-primary, .btn-secondary, header, nav, footer, .no-print {
              display: none !important;
            }
            .card {
              background: white !important;
              color: black !important;
              border: 1px solid #ddd !important;
              box-shadow: none !important;
              page-break-inside: avoid !important;
              margin-bottom: 1.5rem !important;
              padding: 1.5rem !important;
            }
          }
        `}} />
        <div className="flex flex-col items-center mb-12">
            <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>
                {percentage >= 80 ? '🏆' : percentage >= 50 ? '👏' : '📚'}
            </div>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>{percentage >= 50 ? 'Well Done!' : 'Keep Practicing!'}</h2>
            <p style={{ color: 'var(--muted)', fontSize: '1.1rem' }}>Quiz Analysis: {quiz.title}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="card flex flex-col items-center p-8">
                <span style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Final Score</span>
                <span style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--primary)' }}>{score} / {quiz.questions.length}</span>
                {comparisonData && (
                    <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Peer Avg: <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{comparisonData.peer_summary.avg_score.toFixed(1)}</span>
                    </div>
                )}
            </div>
            <div className="card flex flex-col items-center p-8">
                <span style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Accuracy</span>
                <span style={{ fontSize: '2.5rem', fontWeight: 900, color: percentage >= 80 ? 'var(--success)' : percentage >= 50 ? 'var(--secondary)' : 'var(--error)' }}>{percentage}%</span>
            </div>
            <div className="card flex flex-col items-center p-8">
                <span style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Time</span>
                <span style={{ fontSize: '2.5rem', fontWeight: 900 }}>{Math.floor(timer / 60)}m {timer % 60}s</span>
                {comparisonData && (
                    <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Peer Avg: <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{Math.floor(comparisonData.peer_summary.avg_time / 60)}m {Math.round(comparisonData.peer_summary.avg_time % 60)}s</span>
                    </div>
                )}
            </div>
        </div>

        {(isAiAnalyzing || aiAnalysis) && (
            <div className="card mb-12" style={{ background: 'rgba(99, 102, 241, 0.05)', borderColor: 'rgba(99, 102, 241, 0.2)' }}>
                <div className="flex items-center gap-3 mb-4">
                    <span style={{ fontSize: '1.5rem' }}>🤖</span>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>AI Performance Analysis</h3>
                </div>
                {isAiAnalyzing ? (
                    <div className="flex items-center gap-3">
                        <div style={{ width: '24px', height: '24px', border: '3px solid var(--glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                        <p style={{ color: 'var(--muted)' }}>AI is comparing your results with peers...</p>
                    </div>
                ) : (
                    <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiAnalysis}</ReactMarkdown>
                    </div>
                )}
            </div>
        )}

        <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '2rem' }}>Detailed Breakdown</h3>
        <div className="flex flex-col gap-6 mb-12">
            {quiz.questions.map((q: any, i: number) => {
                const userRes = userResponses[i];
                const isCorrect = userRes === q.correct_option_index;
                const isSkipped = userRes === null;
                const timeTaken = questionTimes[i] || 0;
                const peerAvgTime = comparisonData?.avg_times_per_question[i] || 0;

                return (
                    <div key={i} className="card" style={{ borderLeft: `6px solid ${isSkipped ? 'var(--muted)' : isCorrect ? 'var(--success)' : 'var(--error)'}` }}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Question {i + 1}</h4>
                                <div className="flex gap-4 mt-2">
                                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        ⏱️ You: <strong>{timeTaken}s</strong>
                                    </div>
                                    {peerAvgTime > 0 && (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            👥 Peers: <strong>{peerAvgTime.toFixed(1)}s</strong>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span style={{ 
                                padding: '0.4rem 1rem', 
                                borderRadius: '99px', 
                                fontSize: '0.75rem', 
                                fontWeight: 800, 
                                background: isSkipped ? 'rgba(255,255,255,0.05)' : isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                color: isSkipped ? 'var(--muted)' : isCorrect ? 'var(--success)' : 'var(--error)'
                            }}>
                                {isSkipped ? 'SKIPPED' : isCorrect ? 'CORRECT' : 'INCORRECT'}
                            </span>
                        </div>
                        <p style={{ fontSize: '1.2rem', marginBottom: '1.5rem' }}>{q.text}</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                            {q.options.map((opt: string, optIdx: number) => (
                                <div key={optIdx} style={{ 
                                    padding: '1rem', 
                                    borderRadius: '12px', 
                                    background: optIdx === q.correct_option_index ? 'rgba(16, 185, 129, 0.05)' : optIdx === userRes ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255,255,255,0.02)',
                                    border: '1px solid',
                                    borderColor: optIdx === q.correct_option_index ? 'rgba(16, 185, 129, 0.2)' : optIdx === userRes ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3 \rem'
                                }}>
                                    <div style={{ 
                                        width: '24px', height: '24px', borderRadius: '50%', 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800,
                                        background: optIdx === q.correct_option_index ? 'var(--success)' : optIdx === userRes ? 'var(--error)' : 'rgba(255,255,255,0.1)'
                                    }}>
                                        {String.fromCharCode(65 + optIdx)}
                                    </div>
                                    <span style={{ opacity: (optIdx !== q.correct_option_index && optIdx !== userRes) ? 0.6 : 1 }}>{opt}</span>
                                    {optIdx === q.correct_option_index && <span style={{ marginLeft: 'auto' }}>✅</span>}
                                    {optIdx === userRes && optIdx !== q.correct_option_index && <span style={{ marginLeft: 'auto' }}>❌</span>}
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col gap-4">
                            {q.explanation && (
                                <div className="p-4" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                    <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--primary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Explanation</strong>
                                    <p style={{ fontSize: '0.95rem', color: 'var(--muted)', lineHeight: 1.5 }}>{q.explanation}</p>
                                </div>
                            )}

                            <div className="flex justify-end">
                                <button 
                                    className="btn-secondary" 
                                    style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', gap: '0.5rem' }}
                                    onClick={() => explainResultQuestion(i)}
                                >
                                    🤖 Ask AI for Explanation
                                </button>
                            </div>

                            {explainingQuestionIdx === i && (
                                <div className="p-5 mt-2" style={{ background: 'rgba(236, 72, 153, 0.05)', borderRadius: '16px', border: '1px solid rgba(236, 72, 153, 0.1)' }}>
                                    <div className="markdown-body">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{explanationText}</ReactMarkdown>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
        
        <div className="flex justify-center gap-4 no-print">
            <button className="btn-primary" style={{ padding: '1rem 4rem', fontSize: '1.1rem' }} onClick={() => window.location.href = '/dashboard'}>
                Return to Dashboard
            </button>
            <button className="btn-secondary" style={{ padding: '1rem 3rem', fontSize: '1.1rem', background: 'linear-gradient(135deg, var(--secondary), var(--accent))', borderColor: 'transparent', color: 'white' }} onClick={() => window.print()}>
                🖨️ Print / Save PDF
            </button>
        </div>
      </div>
    );
  }

  const q = quiz.questions[currentQuestionIndex];

  // Derive counts for the sidebar legend
  const answeredCount = statuses.filter(s => s === 'answered').length;
  const notAnsweredCount = statuses.filter(s => s === 'not_answered').length;
  const markedCount = statuses.filter(s => s === 'marked').length;
  const answeredMarkedCount = statuses.filter(s => s === 'answered_marked').length;
  const notVisitedCount = statuses.filter(s => s === 'not_visited').length;

  const m = Math.floor(timer / 60);
  const s = timer % 60;
  const timeString = `${m}:${s.toString().padStart(2, '0')}`;

  const remainingTimeString = quiz.time_limit_seconds ? (() => {
    const rem = Math.max(0, quiz.time_limit_seconds - timer);
    const rm = Math.floor(rem / 60);
    const rs = rem % 60;
    return `${rm}:${rs.toString().padStart(2, '0')}`;
  })() : timeString;

  if (mode === 'quiz') {
    return (
      <div className="quiz-fullscreen-layout">
        <style dangerouslySetInnerHTML={{ __html: `
          .quiz-fullscreen-layout {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 1000;
            background: #020617;
            display: flex;
            flex-direction: column;
            height: 100vh;
            width: 100vw;
            overflow: hidden;
            font-family: 'Plus Jakarta Sans', sans-serif;
          }
          .quiz-minimal-header {
            height: 60px;
            background: #0f172a;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 1.5rem;
            flex-shrink: 0;
          }
          .quiz-logo {
            font-weight: 800;
            font-size: 1.15rem;
            background: linear-gradient(135deg, #818cf8, #f472b6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .quiz-title-header {
            font-weight: 700;
            color: #f8fafc;
            font-size: 1rem;
            max-width: 40%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .quiz-header-right {
            display: flex;
            align-items: center;
            gap: 1rem;
          }
          .quiz-timer {
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            padding: 0.4rem 1rem;
            border-radius: 99px;
            font-weight: 800;
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-variant-numeric: tabular-nums;
          }
          .btn-submit-exam {
            background: #ef4444;
            color: white;
            padding: 0.5rem 1.25rem;
            border-radius: 8px;
            font-size: 0.85rem;
            font-weight: 800;
            transition: all 0.2s;
          }
          .btn-submit-exam:hover {
            background: #dc2626;
            transform: scale(1.02);
          }
          .quiz-split-container {
            display: flex;
            flex: 1;
            overflow: hidden;
            position: relative;
          }
          .quiz-left-panel {
            flex: 3;
            display: flex;
            flex-direction: column;
            background: #020617;
            overflow: hidden;
          }
          .quiz-question-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.5rem;
            background: rgba(15, 23, 42, 0.4);
            border-bottom: 1px solid rgba(255,255,255,0.08);
            flex-shrink: 0;
          }
          .q-number-label {
            font-weight: 800;
            font-size: 1.1rem;
            color: white;
          }
          .q-marking-info {
            display: flex;
            gap: 0.75rem;
            font-size: 0.8rem;
            font-weight: 700;
          }
          .mark-positive {
            color: #34d399;
            background: rgba(52, 211, 153, 0.1);
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
          }
          .mark-negative {
            color: #f87171;
            background: rgba(248, 113, 113, 0.1);
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
          }
          .quiz-question-body {
            flex: 1;
            padding: 2rem 2.5rem;
            overflow-y: auto;
          }
          .quiz-question-text {
            font-size: 1.3rem;
            font-weight: 600;
            line-height: 1.6;
            color: #f8fafc;
            margin-bottom: 2rem;
          }
          .quiz-options-list {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          .quiz-option-card {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1.1rem 1.5rem;
            border: 1px solid rgba(255,255,255,0.08);
            background: rgba(15, 23, 42, 0.6);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          .quiz-option-card:hover {
            background: rgba(255, 255, 255, 0.02);
            border-color: rgba(255, 255, 255, 0.15);
          }
          .quiz-option-card.selected {
            background: linear-gradient(135deg, rgba(129, 140, 248, 0.12), rgba(167, 139, 250, 0.12));
            border-color: #818cf8;
            box-shadow: 0 4px 15px rgba(129, 140, 248, 0.05);
          }
          .option-letter {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 0.95rem;
            color: #94a3b8;
            border: 1px solid rgba(255,255,255,0.08);
            flex-shrink: 0;
            transition: all 0.2s;
          }
          .quiz-option-card.selected .option-letter {
            background: #818cf8;
            color: white;
            border-color: transparent;
          }
          .option-text {
            font-size: 1.05rem;
            font-weight: 500;
            color: #cbd5e1;
          }
          .quiz-option-card.selected .option-text {
            color: white;
            font-weight: 600;
          }
          .quiz-question-footer {
            height: 75px;
            background: #0f172a;
            border-top: 1px solid rgba(255,255,255,0.08);
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 2rem;
            flex-shrink: 0;
          }
          .footer-left-buttons, .footer-right-buttons {
            display: flex;
            gap: 0.75rem;
            align-items: center;
          }
          .btn-quiz-footer {
            padding: 0.6rem 1.2/rem;
            border-radius: 8px;
            font-size: 0.85rem;
            font-weight: 700;
            height: 42px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
          }
          .btn-mark-review {
            background: #8b5cf6;
            color: white;
          }
          .btn-mark-review:hover {
            background: #7c3aed;
          }
          .btn-clear-response {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.08);
            color: #94a3b8;
          }
          .btn-clear-response:hover {
            background: rgba(255,255,255,0.06);
            color: white;
          }
          .btn-save-next {
            background: #10b981;
            color: white;
          }
          .btn-save-next:hover {
            background: #059669;
          }
          .btn-prev-quiz {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.08);
            color: white;
          }
          .btn-prev-quiz:hover:not(:disabled) {
            background: rgba(255,255,255,0.06);
          }
          .btn-prev-quiz:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }
          .quiz-right-panel {
            flex: 1;
            max-width: 320px;
            background: #0f172a;
            border-left: 1px solid rgba(255,255,255,0.08);
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .sidebar-profile-box {
            padding: 1.25rem;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            display: flex;
            align-items: center;
            gap: 0.75rem;
            background: rgba(15, 23, 42, 0.4);
          }
          .profile-avatar {
            font-size: 1.6rem;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(255,255,255,0.05);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .profile-details {
            display: flex;
            flex-direction: column;
          }
          .profile-name {
            font-weight: 800;
            font-size: 0.95rem;
            color: white;
          }
          .profile-status {
            font-size: 0.75rem;
            color: #34d399;
            font-weight: 600;
          }
          .sidebar-legend-grid {
            padding: 1rem;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.75rem;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            font-size: 0.75rem;
            background: rgba(2, 6, 23, 0.1);
          }
          .legend-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .legend-badge {
            width: 22px;
            height: 22px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            color: white;
            flex-shrink: 0;
          }
          .legend-label {
            color: #94a3b8;
            font-weight: 600;
          }
          .badge-answered { background: #10b981; }
          .badge-not-answered { background: #ef4444; }
          .badge-not-visited { background: #475569; }
          .badge-marked { background: #8b5cf6; }
          .badge-ans-marked { 
            background: #6366f1; 
            position: relative;
          }
          .badge-ans-marked::after {
            content: '';
            position: absolute;
            bottom: 1px;
            right: 1px;
            width: 6px;
            height: 6px;
            background: #10b981;
            border-radius: 50%;
            border: 1px solid #6366f1;
          }
          .sidebar-grid-title {
            padding: 1rem 1.25rem 0.5rem 1.25rem;
            font-size: 0.75rem;
            font-weight: 800;
            text-transform: uppercase;
            color: #64748b;
            letter-spacing: 0.05em;
          }
          .sidebar-palette-scroll {
            flex: 1;
            overflow-y: auto;
            padding: 1rem 1.25rem;
          }
          .sidebar-palette-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 0.5rem;
          }
          .palette-btn {
            height: 38px;
            border-radius: 6px;
            font-weight: 800;
            font-size: 0.85rem;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid transparent;
            transition: all 0.15s ease;
            color: white;
            cursor: pointer;
          }
          .palette-btn:hover {
            transform: scale(1.05);
          }
          .palette-btn.active-q {
            border-color: white !important;
            box-shadow: 0 0 10px rgba(255,255,255,0.4);
          }
          .btn-status-not_visited { background: #475569; }
          .btn-status-not_answered { background: #ef4444; }
          .btn-status-answered { background: #10b981; }
          .btn-status-marked { background: #8b5cf6; }
          .btn-status-answered_marked {
            background: #6366f1;
            position: relative;
          }
          .btn-status-answered_marked::after {
            content: '';
            position: absolute;
            bottom: 2px;
            right: 2px;
            width: 8px;
            height: 8px;
            background: #10b981;
            border-radius: 50%;
            border: 1.5px solid #6366f1;
          }
          .mobile-sidebar-toggle {
            display: none;
          }
          @media (max-width: 768px) {
            .quiz-split-container {
              flex-direction: column;
            }
            .quiz-left-panel {
              flex: 1;
              border-right: none;
            }
            .quiz-right-panel {
              position: fixed;
              top: 60px;
              right: 0;
              bottom: 0;
              width: 290px;
              max-width: 85%;
              z-index: 1001;
              transform: translateX(100%);
              transition: transform 0.3s ease;
              box-shadow: -10px 0 30px rgba(0,0,0,0.5);
            }
            .quiz-right-panel.open {
              transform: translateX(0);
            }
            .mobile-sidebar-toggle {
              display: flex;
              background: rgba(255,255,255,0.06);
              border: 1px solid rgba(255,255,255,0.08);
              padding: 0.4rem 0.8rem;
              border-radius: 8px;
              font-size: 0.8rem;
              font-weight: 800;
              align-items: center;
              gap: 0.3rem;
              color: white;
              cursor: pointer;
            }
            .quiz-question-body {
              padding: 1.25rem 1.25rem;
            }
            .quiz-question-text {
              font-size: 1.15rem;
              margin-bottom: 1.5rem;
            }
            .quiz-question-footer {
              flex-direction: column;
              height: auto;
              padding: 1rem;
              gap: 0.75rem;
            }
            .footer-left-buttons, .footer-right-buttons {
              width: 100%;
              justify-content: space-between;
              gap: 0.5rem;
            }
            .footer-left-buttons button, .footer-right-buttons button {
              flex: 1;
              font-size: 0.75rem;
              padding: 0.5rem 0.75rem;
            }
          }
        ` }} />
        
        {/* Minimal Header */}
        <header className="quiz-minimal-header">
          <div className="quiz-logo">QuizMaster Portal</div>
          <div className="quiz-title-header">{quiz.title}</div>
          <div className="quiz-header-right">
            <div className="quiz-timer">
              ⏱️ {remainingTimeString}
            </div>
            <button className="mobile-sidebar-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              ☰ Palette
            </button>
            <button className="btn-submit-exam" onClick={finishQuiz}>
              Submit Exam
            </button>
          </div>
        </header>

        <div className="quiz-split-container">
          {/* Main Question Panel */}
          <div className="quiz-left-panel">
            <div className="quiz-question-header">
              <span className="q-number-label">Question {currentQuestionIndex + 1} of {quiz.questions.length}</span>
              <div className="q-marking-info">
                <span className="mark-positive">+1.0</span>
                <span className="mark-negative">-0.25</span>
              </div>
            </div>

            <div className="quiz-question-body">
              <div className="quiz-question-text">{q.text}</div>
              
              <div className="quiz-options-list">
                {q.options.map((opt: string, i: number) => {
                  const isSelected = userResponses[currentQuestionIndex] === i;
                  return (
                    <div 
                      key={i} 
                      className={`quiz-option-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleOptionSelect(i)}
                    >
                      <div className="option-letter">{String.fromCharCode(65 + i)}</div>
                      <div className="option-text">{opt}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="quiz-question-footer">
              <div className="footer-left-buttons">
                <button className="btn-quiz-footer btn-mark-review" onClick={markForReviewAndNext}>
                  Mark for Review & Next
                </button>
                <button className="btn-quiz-footer btn-clear-response" onClick={clearResponse}>
                  Clear Response
                </button>
              </div>
              
              <div className="footer-right-buttons">
                <button 
                  className="btn-quiz-footer btn-prev-quiz" 
                  disabled={currentQuestionIndex === 0} 
                  onClick={() => navigateToQuestion(currentQuestionIndex - 1)}
                >
                  ← Previous
                </button>
                <button className="btn-quiz-footer btn-save-next" onClick={saveAndNext}>
                  {currentQuestionIndex === quiz.questions.length - 1 ? 'Save Response' : 'Save & Next →'}
                </button>
              </div>
            </div>
          </div>

          {/* Right Sidebar Drawer */}
          <div className={`quiz-right-panel ${isSidebarOpen ? 'open' : ''}`}>
            <div className="sidebar-profile-box">
              <div className="profile-avatar">👨‍💻</div>
              <div className="profile-details">
                <span className="profile-name">Candidate</span>
                <span className="profile-status">Exam in Progress</span>
              </div>
            </div>

            {/* Legend Stats */}
            <div className="sidebar-legend-grid">
              <div className="legend-item">
                <span className="legend-badge badge-answered">{answeredCount}</span>
                <span className="legend-label">Answered</span>
              </div>
              <div className="legend-item">
                <span className="legend-badge badge-not-answered">{notAnsweredCount}</span>
                <span className="legend-label">Not Answered</span>
              </div>
              <div className="legend-item">
                <span className="legend-badge badge-marked">{markedCount}</span>
                <span className="legend-label">Marked</span>
              </div>
              <div className="legend-item">
                <span className="legend-badge badge-ans-marked">{answeredMarkedCount}</span>
                <span className="legend-label">Ans & Marked</span>
              </div>
              <div className="legend-item" style={{ gridColumn: 'span 2' }}>
                <span className="legend-badge badge-not-visited">{notVisitedCount}</span>
                <span className="legend-label">Not Visited ({notVisitedCount})</span>
              </div>
            </div>

            <div className="sidebar-grid-title">Choose a Question</div>

            {/* Grid of Palette */}
            <div className="sidebar-palette-scroll">
              <div className="sidebar-palette-grid">
                {quiz.questions.map((_: any, i: number) => {
                  return (
                    <button 
                      key={i} 
                      className={`palette-btn btn-status-${statuses[i] || 'not_visited'} ${currentQuestionIndex === i ? 'active-q' : ''}`}
                      onClick={() => {
                        navigateToQuestion(i);
                        setIsSidebarOpen(false); // Close sidebar drawer on click in mobile
                      }}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Otherwise, render practice mode
  return (
    <div className="container py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
            <div className="flex items-center gap-3 mb-1">
                <span style={{ background: 'var(--secondary)', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase' }}>
                    practice mode
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{quiz.title}</h2>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Question {currentQuestionIndex + 1} of {quiz.questions.length}</p>
        </div>
        <div className="flex items-center gap-4">
            <div className="card" style={{ padding: '0.6rem 1.2rem', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)' }}>
                <span style={{ opacity: 0.6 }}>⏱️</span>
                <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: '1.1rem' }}>
                    {quiz.time_limit_seconds ? (
                      <>
                        {(() => {
                          const rem = Math.max(0, quiz.time_limit_seconds - timer);
                          const rm = Math.floor(rem / 60);
                          const rs = rem % 60;
                          return `${rm}:${rs.toString().padStart(2, '0')}`;
                        })()}
                      </>
                    ) : (
                      `${Math.floor(timer / 60)}:${(timer % 60).toString().padStart(2, '0')}`
                    )}
                </span>
            </div>
            <button className="btn-secondary" style={{ padding: '0.6rem 1.2rem', borderRadius: '999px', fontSize: '0.9rem' }} onClick={finishQuiz}>
                Finish & Submit
            </button>
        </div>
      </div>

      <div className="flex-responsive">
        <div style={{ flex: 3 }}>
            {/* Progress Bar */}
            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', marginBottom: '2rem', overflow: 'hidden' }}>
                <div style={{ 
                    width: `${((currentQuestionIndex + 1) / quiz.questions.length) * 100}%`, 
                    height: '100%', 
                    background: 'linear-gradient(90deg, var(--primary), var(--accent))',
                    transition: 'width 0.3s ease'
                }}></div>
            </div>

            <div className="card" style={{ marginBottom: '2rem', minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '3rem' }}>
                <p style={{ fontSize: '1.8rem', fontWeight: 700, lineHeight: 1.4 }}>{q.text}</p>
            </div>
            
            <div className="flex flex-col gap-4">
              {q.options.map((opt: string, i: number) => {
                const isSelected = userResponses[currentQuestionIndex] === i;
                const isCorrect = i === q.correct_option_index;
                
                let background = 'var(--glass)';
                let borderColor = 'var(--glass-border)';
                let boxShadow = 'var(--shadow-sm)';

                if (isSelected) {
                    if (showFeedback) {
                        background = isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
                        borderColor = isCorrect ? 'var(--success)' : 'var(--error)';
                    } else {
                        background = 'linear-gradient(135deg, var(--primary), var(--accent))';
                        borderColor = 'transparent';
                        boxShadow = '0 8px 20px var(--primary-glow)';
                    }
                } else if (showFeedback && isCorrect) {
                    background = 'rgba(16, 185, 129, 0.1)';
                    borderColor = 'rgba(16, 185, 129, 0.5)';
                }

                return (
                    <div 
                      key={i} 
                      className="card" 
                      style={{ 
                        cursor: showFeedback ? 'default' : 'pointer', 
                        padding: '1.5rem 2rem',
                        background,
                        borderColor,
                        boxShadow,
                        transition: 'all 0.2s ease',
                        transform: isSelected ? 'scale(1.01)' : 'scale(1)'
                      }}
                      onClick={() => handleOptionSelect(i)}
                    >
                      <div className="flex items-center gap-4">
                        <div style={{ 
                            width: '36px', height: '36px', borderRadius: '50%', 
                            background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', 
                            fontWeight: 800, fontSize: '1rem',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            {String.fromCharCode(65 + i)}
                        </div>
                        <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>{opt}</span>
                        {showFeedback && isCorrect && <span style={{ marginLeft: 'auto', fontSize: '1.5rem' }}>✅</span>}
                        {showFeedback && isSelected && !isCorrect && <span style={{ marginLeft: 'auto', fontSize: '1.5rem' }}>❌</span>}
                      </div>
                    </div>
                );
              })}
            </div>

            {showFeedback && q.explanation && (
                <div className="card mt-6" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.2)', padding: '1.5rem' }}>
                    <div className="flex items-center gap-2 mb-2">
                        <span style={{ fontSize: '1.2rem' }}>💡</span>
                        <strong style={{ color: 'var(--success)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.05em' }}>Explanation</strong>
                    </div>
                    <p style={{ color: '#e2e8f0', lineHeight: 1.6 }}>{q.explanation}</p>
                </div>
            )}

            <div className="flex justify-between mt-10">
              <button className="btn-secondary" style={{ padding: '0.8rem 2rem' }} disabled={currentQuestionIndex === 0} onClick={() => {
                  setCurrentQuestionIndex(prev => prev - 1);
                  setShowFeedback(false);
                  setAiResponse('');
              }}>
                 ← Previous
              </button>
              
              <div className="flex gap-3">
                  <button className="btn-secondary" style={{ padding: '0.8rem 2rem' }} onClick={skipQuestion}>
                    Skip
                  </button>
                  <button className="btn-primary" style={{ padding: '0.8rem 3rem' }} onClick={nextQuestion}>
                    {currentQuestionIndex === quiz.questions.length - 1 ? 'Finish Quiz' : 'Next Question →'}
                  </button>
              </div>
            </div>
        </div>

        <div style={{ flex: 1.2 }}>
            <div className="card" style={{ position: 'sticky', top: '40px' }}>
              <div className="flex items-center gap-3 mb-6">
                 <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(236, 72, 153, 0.1)', color: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                    🤖
                 </div>
                 <div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>AI Assistant</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Powered by Gemini</p>
                 </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <button className="btn-secondary w-full" style={{ justifyContent: 'flex-start', padding: '1rem' }} onClick={() => askAI("Summarize this question and explain what it's asking")}>
                   📝 Summarize Question
                </button>
                <button className="btn-secondary w-full" style={{ justifyContent: 'flex-start', padding: '1rem' }} onClick={() => askAI("Give me a subtle hint without revealing the answer")}>
                   💡 Get a Hint
                </button>
                <button className="btn-secondary w-full" style={{ justifyContent: 'flex-start', padding: '1rem' }} onClick={() => askAI("Explain why each option is correct or incorrect")}>
                   🔍 Deep Analysis
                </button>
                <button className="btn-secondary w-full" style={{ justifyContent: 'flex-start', padding: '1rem' }} onClick={() => askAI("Tell me more about the topic related to this question")}>
                   📚 Learn More
                </button>
              </div>

              {isAiLoading && (
                <div className="mt-8 flex flex-col items-center gap-3">
                    <div style={{ width: '32px', height: '32px', border: '4px solid var(--glass-border)', borderTopColor: 'var(--secondary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    <p style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 600 }}>Analyzing with AI...</p>
                </div>
              )}

              {aiResponse && (
                <div className="mt-8 p-5" style={{ background: 'rgba(236, 72, 153, 0.05)', borderRadius: '16px', border: '1px solid rgba(236, 72, 153, 0.1)', color: '#e2e8f0', lineHeight: 1.6 }}>
                  <div className="flex justify-between items-center mb-4 pb-2" style={{ borderBottom: '1px solid rgba(236, 72, 153, 0.1)' }}>
                    <strong style={{ color: 'var(--secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Response</strong>
                    <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem' }} onClick={() => setAiResponse('')}>Dismiss</button>
                  </div>
                  <div className="markdown-body" style={{ fontSize: '0.95rem' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {aiResponse}
                    </ReactMarkdown>
                  </div>
                  <style dangerouslySetInnerHTML={{ __html: `
                    .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: var(--secondary); margin-top: 1rem; margin-bottom: 0.5rem; }
                    .markdown-body p { margin-bottom: 1rem; }
                    .markdown-body ul, .markdown-body ol { margin-bottom: 1rem; padding-left: 1.5rem; }
                    .markdown-body li { margin-bottom: 0.25rem; }
                    .markdown-body strong { color: #fff; font-weight: 800; }
                    .markdown-body blockquote { border-left: 4px solid var(--secondary); padding-left: 1rem; color: var(--muted); font-style: italic; }
                  ` }} />
                </div>
              )}
            </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { to { transform: rotate(360deg); } }
      ` }} />
    </div>
  );
}
