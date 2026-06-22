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
  const [questionOrder, setQuestionOrder] = useState<number[]>([]);
  const [sidebarTab, setSidebarTab] = useState<'palette' | 'ai'>('palette');
  
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

        // Shuffle question order!
        const indices = Array.from({ length: quizData.questions.length }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        setQuestionOrder(indices);
        
        const initialStatuses = new Array(quizData.questions.length).fill('not_visited');
        initialStatuses[indices[0]] = 'not_answered';
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
            
            // Resume question order
            if (activeAttempt.question_order && activeAttempt.question_order.length === quiz.questions.length) {
                setQuestionOrder(activeAttempt.question_order);
            } else {
                setQuestionOrder(Array.from({ length: quiz.questions.length }, (_, i) => i));
            }
            
            if (activeAttempt.statuses && activeAttempt.statuses.length === quiz.questions.length) {
                setStatuses(activeAttempt.statuses);
            } else {
                const initialStatuses = new Array(quiz.questions.length).fill('not_visited');
                activeAttempt.responses.forEach((resVal: any, idx: number) => {
                    if (resVal !== null) {
                        initialStatuses[idx] = 'answered';
                    }
                });
                const resumedOrder = activeAttempt.question_order || Array.from({ length: quiz.questions.length }, (_, i) => i);
                const curIdx = activeAttempt.current_question_index || 0;
                const curOrigIdx = resumedOrder[curIdx];
                if (initialStatuses[curOrigIdx] === 'not_visited') {
                    initialStatuses[curOrigIdx] = 'not_answered';
                }
                setStatuses(initialStatuses);
            }

            // Show feedback in practice mode if target question already has response
            const resumedOrder = activeAttempt.question_order || Array.from({ length: quiz.questions.length }, (_, i) => i);
            const activeVisualIndex = activeAttempt.current_question_index || 0;
            const originalIndex = resumedOrder[activeVisualIndex];
            setShowFeedback(activeAttempt.responses[originalIndex] !== null);
            
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
    setShowFeedback(false);

    // Generate new shuffled indices
    const indices = Array.from({ length: quiz.questions.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    setQuestionOrder(indices);
    
    const initialStatuses = new Array(quiz.questions.length).fill('not_visited');
    initialStatuses[indices[0]] = 'not_answered';
    setStatuses(initialStatuses);
    
    setActiveAttemptId(null);
    setShowResumeModal(false);
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setTimer(prev => prev + 1);
    }, 1000);
  };

  const saveProgress = async (final = false, customStatuses?: string[], customOrder?: number[]) => {
    if (!quiz || isFinished) return;
    
    // Update current question time mapped to original index!
    const updatedTimes = [...questionTimes];
    const origIndex = (customOrder || questionOrder)[currentQuestionIndex];
    if (origIndex !== undefined) {
        updatedTimes[origIndex] += (timer - lastQuestionStartTime);
    }
    
    let score = 0;
    userResponses.forEach((res, i) => {
      if (res === quiz.questions[i].correct_option_index) score++;
    });

    const activeStatuses = customStatuses || statuses;
    const activeOrder = customOrder || questionOrder;

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
        question_order: activeOrder,
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
    
    const origIndex = questionOrder[currentQuestionIndex];
    const newResponses = [...userResponses];
    newResponses[origIndex] = index;
    setUserResponses(newResponses);

    const updatedStatuses = [...statuses];
    updatedStatuses[origIndex] = 'answered';
    setStatuses(updatedStatuses);

    if (mode === 'practice') {
        setShowFeedback(true);
        saveProgress(false, updatedStatuses);
    }
  };

  const navigateToQuestion = (idx: number) => {
    if (idx === currentQuestionIndex) return;
    
    const currentOrigIndex = questionOrder[currentQuestionIndex];
    const targetOrigIndex = questionOrder[idx];
    
    const updatedStatuses = [...statuses];
    const currentStatus = updatedStatuses[currentOrigIndex];
    if (currentStatus === 'not_visited') {
      updatedStatuses[currentOrigIndex] = 'not_answered';
    }
    
    if (updatedStatuses[targetOrigIndex] === 'not_visited') {
      updatedStatuses[targetOrigIndex] = 'not_answered';
    }
    
    setStatuses(updatedStatuses);
    saveProgress(false, updatedStatuses);
    
    // Set feedback visible in practice if target question already has response
    setShowFeedback(userResponses[targetOrigIndex] !== null);
    
    setCurrentQuestionIndex(idx);
    setAiResponse('');
  };

  const saveAndNext = () => {
    const updatedStatuses = [...statuses];
    const origIndex = questionOrder[currentQuestionIndex];
    const userRes = userResponses[origIndex];
    
    if (userRes !== null) {
      updatedStatuses[origIndex] = 'answered';
    } else {
      updatedStatuses[origIndex] = 'not_answered';
    }
    
    setStatuses(updatedStatuses);
    
    if (currentQuestionIndex < quiz.questions.length - 1) {
      const nextOrigIndex = questionOrder[currentQuestionIndex + 1];
      if (updatedStatuses[nextOrigIndex] === 'not_visited') {
        updatedStatuses[nextOrigIndex] = 'not_answered';
      }
      saveProgress(false, updatedStatuses);
      
      setShowFeedback(userResponses[nextOrigIndex] !== null);
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setAiResponse('');
    } else {
      saveProgress(false, updatedStatuses);
    }
  };

  const markForReviewAndNext = () => {
    const updatedStatuses = [...statuses];
    const origIndex = questionOrder[currentQuestionIndex];
    const userRes = userResponses[origIndex];
    
    if (userRes !== null) {
      updatedStatuses[origIndex] = 'answered_marked';
    } else {
      updatedStatuses[origIndex] = 'marked';
    }
    
    setStatuses(updatedStatuses);
    
    if (currentQuestionIndex < quiz.questions.length - 1) {
      const nextOrigIndex = questionOrder[currentQuestionIndex + 1];
      if (updatedStatuses[nextOrigIndex] === 'not_visited') {
        updatedStatuses[nextOrigIndex] = 'not_answered';
      }
      saveProgress(false, updatedStatuses);
      
      setShowFeedback(userResponses[nextOrigIndex] !== null);
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setAiResponse('');
    } else {
      saveProgress(false, updatedStatuses);
    }
  };

  const clearResponse = () => {
    const origIndex = questionOrder[currentQuestionIndex];
    const newResponses = [...userResponses];
    newResponses[origIndex] = null;
    setUserResponses(newResponses);
    
    const updatedStatuses = [...statuses];
    updatedStatuses[origIndex] = 'not_answered';
    setStatuses(updatedStatuses);
    
    setShowFeedback(false);
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
    
    // Final time update mapped to original index!
    const finalTimes = [...questionTimes];
    const origIndex = questionOrder[currentQuestionIndex];
    if (origIndex !== undefined) {
        finalTimes[origIndex] += (timer - lastQuestionStartTime);
    }
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
      question_order: questionOrder,
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
      const origIndex = questionOrder[currentQuestionIndex];
      const q = questionOverride || quiz.questions[origIndex];
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


       const origIndex = questionOrder[currentQuestionIndex] !== undefined ? questionOrder[currentQuestionIndex] : currentQuestionIndex;
  const q = quiz.questions[origIndex];

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
            {questionOrder.map((origIdx: number, visualIndex: number) => {
                const qItem = quiz.questions[origIdx];
                const userRes = userResponses[origIdx];
                const isCorrect = userRes === qItem.correct_option_index;
                const isSkipped = userRes === null;
                const timeTaken = questionTimes[origIdx] || 0;
                const peerAvgTime = comparisonData?.avg_times_per_question[origIdx] || 0;

                return (
                    <div key={visualIndex} className="card" style={{ borderLeft: `6px solid ${isSkipped ? 'var(--muted)' : isCorrect ? 'var(--success)' : 'var(--error)'}` }}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Question {visualIndex + 1}</h4>
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
                        <p style={{ fontSize: '1.2rem', marginBottom: '1.5rem' }}>{qItem.text}</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                            {qItem.options.map((opt: string, optIdx: number) => (
                                <div key={optIdx} style={{ 
                                    padding: '1rem', 
                                    borderRadius: '12px', 
                                    background: optIdx === qItem.correct_option_index ? 'rgba(16, 185, 129, 0.05)' : optIdx === userRes ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255,255,255,0.02)',
                                    border: '1px solid',
                                    borderColor: optIdx === qItem.correct_option_index ? 'rgba(16, 185, 129, 0.2)' : optIdx === userRes ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3rem'
                                }}>
                                    <div style={{ 
                                        width: '24px', height: '24px', borderRadius: '50%', 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800,
                                        background: optIdx === qItem.correct_option_index ? 'var(--success)' : optIdx === userRes ? 'var(--error)' : 'rgba(255,255,255,0.1)'
                                    }}>
                                        {String.fromCharCode(65 + optIdx)}
                                    </div>
                                    <span style={{ opacity: (optIdx !== qItem.correct_option_index && optIdx !== userRes) ? 0.6 : 1 }}>{opt}</span>
                                    {optIdx === qItem.correct_option_index && <span style={{ marginLeft: 'auto' }}>✅</span>}
                                    {optIdx === userRes && optIdx !== qItem.correct_option_index && <span style={{ marginLeft: 'auto' }}>❌</span>}
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col gap-4">
                            {qItem.explanation && (
                                <div className="p-4" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                    <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--primary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Explanation</strong>
                                    <p style={{ fontSize: '0.95rem', color: 'var(--muted)', lineHeight: 1.5 }}>{qItem.explanation}</p>
                                </div>
                            )}

                            <div className="flex justify-end">
                                <button 
                                    className="btn-secondary" 
                                    style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', gap: '0.5rem' }}
                                    onClick={() => explainResultQuestion(origIdx)}
                                >
                                    🤖 Ask AI for Explanation
                                </button>
                            </div>

                            {explainingQuestionIdx === origIdx && (
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
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .practice-badge {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          font-size: 0.65rem;
          font-weight: 900;
          padding: 0.25rem 0.5rem;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          -webkit-text-fill-color: initial;
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
          color: white;
        }
        .btn-submit-exam {
          background: #ef4444;
          color: white;
          padding: 0.5rem 1.25rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 800;
          transition: all 0.2s;
          border: none;
          cursor: pointer;
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
        .quiz-option-card:hover:not(.disabled) {
          background: rgba(255, 255, 255, 0.02);
          border-color: rgba(255, 255, 255, 0.15);
        }
        .quiz-option-card.selected {
          background: linear-gradient(135deg, rgba(129, 140, 248, 0.12), rgba(167, 139, 250, 0.12));
          border-color: #818cf8;
          box-shadow: 0 4px 15px rgba(129, 140, 248, 0.05);
        }
        .quiz-option-card.correct {
          background: rgba(16, 185, 129, 0.15) !important;
          border-color: #10b981 !important;
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.05);
        }
        .quiz-option-card.incorrect {
          background: rgba(239, 68, 68, 0.15) !important;
          border-color: #ef4444 !important;
          box-shadow: 0 4px 15px rgba(239, 68, 68, 0.05);
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
        .quiz-option-card.correct .option-letter {
          background: #10b981 !important;
          color: white !important;
          border-color: transparent !important;
        }
        .quiz-option-card.incorrect .option-letter {
          background: #ef4444 !important;
          color: white !important;
          border-color: transparent !important;
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
        .quiz-option-card.correct .option-text {
          color: white;
          font-weight: 600;
        }
        .quiz-option-card.incorrect .option-text {
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
          padding: 0.6rem 1.25rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 700;
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
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
        .sidebar-tabs {
          display: flex;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          background: rgba(15, 23, 42, 0.6);
        }
        .sidebar-tab-btn {
          flex: 1;
          padding: 0.9rem;
          text-align: center;
          font-weight: 800;
          font-size: 0.85rem;
          color: #94a3b8;
          border: none;
          background: none;
          cursor: pointer;
          transition: all 0.2s;
          border-bottom: 2px solid transparent;
        }
        .sidebar-tab-btn:hover {
          color: white;
        }
        .sidebar-tab-btn.active {
          color: #818cf8;
          border-bottom-color: #818cf8;
          background: rgba(255, 255, 255, 0.02);
        }
        .sidebar-ai-container {
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          flex: 1;
          overflow-y: auto;
        }
        .ai-btn-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }
        .btn-ai-action {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 1rem;
          border-radius: 10px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          color: #e2e8f0;
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        .btn-ai-action:hover {
          background: rgba(129, 140, 248, 0.1);
          border-color: #818cf8;
          color: white;
        }
        .ai-response-box {
          background: rgba(129, 140, 248, 0.04);
          border: 1px solid rgba(129, 140, 248, 0.15);
          border-radius: 12px;
          padding: 1rem;
          margin-top: 0.5rem;
          position: relative;
        }
        .ai-response-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(129, 140, 248, 0.15);
          padding-bottom: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .ai-response-content {
          font-size: 0.9rem;
          line-height: 1.6;
          color: #cbd5e1;
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
        .spinner-ai {
          width: 24px;
          height: 24px;
          border: 3px solid rgba(255,255,255,0.1);
          border-top-color: #818cf8;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .mobile-sidebar-toggle {
          display: none;
        }
        .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: #818cf8; margin-top: 1rem; margin-bottom: 0.5rem; font-size: 1.1rem; }
        .markdown-body p { margin-bottom: 0.75rem; font-size: 0.85rem; }
        .markdown-body ul, .markdown-body ol { margin-bottom: 0.75rem; padding-left: 1.25rem; }
        .markdown-body li { margin-bottom: 0.25rem; font-size: 0.85rem; }
        .markdown-body strong { color: #fff; font-weight: 800; }
        .markdown-body blockquote { border-left: 3px solid #818cf8; padding-left: 0.75rem; color: var(--muted); font-style: italic; }
        
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
        <div className="quiz-logo">
          {mode === 'practice' ? (
            <>
              QuizMaster Portal <span className="practice-badge">Practice</span>
            </>
          ) : (
            "QuizMaster Portal"
          )}
        </div>
        <div className="quiz-title-header">{quiz.title}</div>
        <div className="quiz-header-right">
          <div className="quiz-timer">
            ⏱️ {remainingTimeString}
          </div>
          <button className="mobile-sidebar-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            ☰ {mode === 'practice' ? 'Menu' : 'Palette'}
          </button>
          <button className="btn-submit-exam" onClick={finishQuiz}>
            {mode === 'practice' ? 'Submit Practice' : 'Submit Exam'}
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
                const isSelected = userResponses[origIndex] === i;
                const isCorrect = i === q.correct_option_index;

                let optionClass = '';
                if (isSelected) {
                  if (mode === 'practice' && showFeedback) {
                    optionClass = isCorrect ? 'correct' : 'incorrect';
                  } else {
                    optionClass = 'selected';
                  }
                } else if (mode === 'practice' && showFeedback && isCorrect) {
                  optionClass = 'correct';
                }

                return (
                  <div 
                    key={i} 
                    className={`quiz-option-card ${optionClass} ${mode === 'practice' && showFeedback ? 'disabled' : ''}`}
                    onClick={() => handleOptionSelect(i)}
                  >
                    <div className="option-letter">{String.fromCharCode(65 + i)}</div>
                    <div className="option-text">{opt}</div>
                    {mode === 'practice' && showFeedback && isCorrect && <span style={{ marginLeft: 'auto' }}>✅</span>}
                    {mode === 'practice' && showFeedback && isSelected && !isCorrect && <span style={{ marginLeft: 'auto' }}>❌</span>}
                  </div>
                );
              })}
            </div>

            {mode === 'practice' && showFeedback && q.explanation && (
              <div style={{ 
                marginTop: '2rem', 
                padding: '1.25rem 1.5rem', 
                background: 'rgba(16, 185, 129, 0.05)', 
                border: '1px solid rgba(16, 185, 129, 0.15)', 
                borderRadius: '12px' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span>💡</span>
                  <strong style={{ color: '#10b981', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.05em' }}>Explanation</strong>
                </div>
                <p style={{ color: '#cbd5e1', fontSize: '0.95rem', lineHeight: 1.6 }}>{q.explanation}</p>
              </div>
            )}
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
          {mode === 'practice' && (
            <div className="sidebar-tabs">
              <button 
                className={`sidebar-tab-btn ${sidebarTab === 'palette' ? 'active' : ''}`}
                onClick={() => setSidebarTab('palette')}
              >
                Questions
              </button>
              <button 
                className={`sidebar-tab-btn ${sidebarTab === 'ai' ? 'active' : ''}`}
                onClick={() => setSidebarTab('ai')}
              >
                AI Help
              </button>
            </div>
          )}

          {/* Sidebar content depending on the active tab */}
          {(mode === 'quiz' || sidebarTab === 'palette') ? (
            <>
              <div className="sidebar-profile-box">
                <div className="profile-avatar">👨‍💻</div>
                <div className="profile-details">
                  <span className="profile-name">Candidate</span>
                  <span className="profile-status">
                    {mode === 'practice' ? 'Practice Session' : 'Exam in Progress'}
                  </span>
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
                    const origIdx = questionOrder[i] !== undefined ? questionOrder[i] : i;
                    const status = statuses[origIdx] || 'not_visited';
                    return (
                      <button 
                        key={i} 
                        className={`palette-btn btn-status-${status} ${currentQuestionIndex === i ? 'active-q' : ''}`}
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
            </>
          ) : (
            /* Practice Mode - AI Help Tab */
            <div className="sidebar-ai-container">
              <div className="sidebar-grid-title" style={{ padding: 0, marginBottom: '0.5rem' }}>AI Study Assistant</div>
              <div className="ai-btn-grid">
                <button className="btn-ai-action" onClick={() => askAI("Summarize this question and explain what it's asking")}>
                  📝 Summarize Question
                </button>
                <button className="btn-ai-action" onClick={() => askAI("Give me a subtle hint without revealing the answer")}>
                  💡 Get a Hint
                </button>
                <button className="btn-ai-action" onClick={() => askAI("Explain why each option is correct or incorrect")}>
                  🔍 Deep Analysis
                </button>
                <button className="btn-ai-action" onClick={() => askAI("Tell me more about the topic related to this question")}>
                  📚 Learn More
                </button>
              </div>

              {isAiLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <div className="spinner-ai"></div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 600 }}>Gemini is thinking...</span>
                </div>
              )}

              {aiResponse && (
                <div className="ai-response-box">
                  <div className="ai-response-header">
                    <strong style={{ color: '#818cf8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Explanation</strong>
                    <button 
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem' }} 
                      onClick={() => setAiResponse('')}
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="ai-response-content markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {aiResponse}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
