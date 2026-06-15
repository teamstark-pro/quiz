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
        setActiveAttemptId(activeAttempt._id);
        setShowResumeModal(true);
      } else {
        setUserResponses(new Array(quizData.questions.length).fill(null));
        setQuestionTimes(new Array(quizData.questions.length).fill(0));
        setLastQuestionStartTime(0);
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
    setActiveAttemptId(null);
    setShowResumeModal(false);
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setTimer(prev => prev + 1);
    }, 1000);
  };

  const saveProgress = async (final = false) => {
    if (!quiz || isFinished) return;
    
    // Update current question time
    const updatedTimes = [...questionTimes];
    updatedTimes[currentQuestionIndex] += (timer - lastQuestionStartTime);
    
    let score = 0;
    userResponses.forEach((res, i) => {
      if (res === quiz.questions[i].correct_option_index) score++;
    });

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
        status: final ? "completed" : "in_progress",
        current_question_index: currentQuestionIndex
      });
      if (!activeAttemptId && res._id) {
          setActiveAttemptId(res._id);
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
      status: "completed",
      current_question_index: currentQuestionIndex
    });

    // Load comparison data
    loadComparison();
  };

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
        
        <div className="flex justify-center">
            <button className="btn-primary" style={{ padding: '1rem 4rem', fontSize: '1.1rem' }} onClick={() => router.push('/dashboard')}>
                Return to Dashboard
            </button>
        </div>
      </div>
    );
  }

  const q = quiz.questions[currentQuestionIndex];

  return (
    <div className="container py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
            <div className="flex items-center gap-3 mb-1">
                <span style={{ background: mode === 'practice' ? 'var(--secondary)' : 'var(--primary)', color: 'white', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase' }}>
                    {mode} mode
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{quiz.title}</h2>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Question {currentQuestionIndex + 1} of {quiz.questions.length}</p>
        </div>
        <div className="flex items-center gap-4">
            <div className="card" style={{ padding: '0.6rem 1.2rem', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)' }}>
                <span style={{ opacity: 0.6 }}>⏱️</span>
                <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: '1.1rem' }}>
                    {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                </span>
            </div>
            <button className="btn-secondary" style={{ padding: '0.6rem 1.2rem', borderRadius: '999px', fontSize: '0.9rem' }} onClick={() => finishQuiz()}>
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
                    if (mode === 'practice' && showFeedback) {
                        background = isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
                        borderColor = isCorrect ? 'var(--success)' : 'var(--error)';
                    } else {
                        background = 'linear-gradient(135deg, var(--primary), var(--accent))';
                        borderColor = 'transparent';
                        boxShadow = '0 8px 20px var(--primary-glow)';
                    }
                } else if (mode === 'practice' && showFeedback && isCorrect) {
                    background = 'rgba(16, 185, 129, 0.1)';
                    borderColor = 'rgba(16, 185, 129, 0.5)';
                }

                return (
                    <div 
                      key={i} 
                      className="card" 
                      style={{ 
                        cursor: (mode === 'practice' && showFeedback) ? 'default' : 'pointer', 
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
                        {mode === 'practice' && showFeedback && isCorrect && <span style={{ marginLeft: 'auto', fontSize: '1.5rem' }}>✅</span>}
                        {mode === 'practice' && showFeedback && isSelected && !isCorrect && <span style={{ marginLeft: 'auto', fontSize: '1.5rem' }}>❌</span>}
                      </div>
                    </div>
                );
              })}
            </div>

            {mode === 'practice' && showFeedback && q.explanation && (
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
