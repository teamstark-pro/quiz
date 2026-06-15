from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from security import get_current_user
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/ai", tags=["ai"])

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

class AIRequest(BaseModel):
    question_text: str
    options: list[str]
    user_query: str  # e.g., "Summarize this" or "Explain the correct answer"

@router.post("/ask")
async def ask_ai(req: AIRequest, user: dict = Depends(get_current_user)):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="Groq API key not configured")

    prompt = f"""
    Context: You are an AI assistant helping a student with a quiz.
    Question: {req.question_text}
    Options: {', '.join(req.options)}
    
    Student's Request: {req.user_query}
    
    Please provide a concise and helpful response. 
    Language Policy:
    - Respond in the SAME LANGUAGE as the student's request or the question text.
    - If the question or request is in Hindi (Devanagari), respond FULLY in Hindi.
    - If the question or request is in English, respond in English.
    
    Use Markdown for formatting:
    - Use **bold** for emphasis or key terms.
    - Use bullet points for lists.
    - Use ### for small headings if needed.
    - If explaining options, use a list format.
    """

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                GROQ_URL,
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {"role": "system", "content": "You are a helpful educational assistant."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.7,
                    "max_tokens": 500
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Error from Groq API")
            
            data = response.json()
            return {"answer": data["choices"][0]["message"]["content"]}
            
        except httpx.ReadTimeout:
            raise HTTPException(status_code=504, detail="AI service timed out")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

class AIComparisonRequest(BaseModel):
    user_score: int
    user_time: int
    peer_avg_score: float
    peer_avg_time: float
    total_questions: int

@router.post("/analyze-performance")
async def analyze_performance(req: AIComparisonRequest, user: dict = Depends(get_current_user)):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="Groq API key not configured")

    prompt = f"""
    Context: You are an AI educational coach analyzing a student's performance compared to their peers.
    
    Student's Performance:
    - Score: {req.user_score}/{req.total_questions}
    - Time: {req.user_time} seconds
    
    Peer Average Performance:
    - Average Score: {req.peer_avg_score:.2f}/{req.total_questions}
    - Average Time: {req.peer_avg_time:.2f} seconds
    
    Task:
    1. Compare the student's score and speed with the peer average.
    2. Provide encouraging and constructive feedback.
    3. Suggest areas for improvement based on speed vs accuracy.
    4. Keep it concise, professional, and motivating.
    
    Language Policy: Respond in English unless the student's native context implies otherwise. Use Markdown.
    """

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {"role": "system", "content": "You are a motivating educational coach."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.7,
                    "max_tokens": 500
                },
                timeout=30.0
            )
            data = response.json()
            return {"analysis": data["choices"][0]["message"]["content"]}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@router.get("/humorous-motivation")
async def get_humorous_motivation(user: dict = Depends(get_current_user)):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="Groq API key not configured")

    prompt = """
    Task: Generate a single, short, humorous motivational quote for a student.
    Tone: Humorous, "Tough Love", slightly insulting but funny, Hinglish (Hindi + English).
    Context: The student is using a quiz app to study. 
    Examples: 
    - "Abe usne 50 question solve kar liye, tu yahan baith ke interface dekh raha hai? Chal padh!"
    - "Duniya aage nikal gayi, aur tu abhi bhi 'What is 2+2' pe atka hai? Sharam kar, aur start kar!"
    - "Padh le bhai, varna naukri nahi, sirf 'Naukri.com' ki notifications milengi."
    
    Rules:
    - ONLY return the quote.
    - Use Hinglish (Hindi written in Roman script + English).
    - Keep it under 20 words.
    - Make it funny and slightly "shitty" in a humorous way.
    """

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {"role": "system", "content": "You are a witty, slightly rude but funny desi coach."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.9,
                    "max_tokens": 100
                },
                timeout=30.0
            )
            data = response.json()
            return {"quote": data["choices"][0]["message"]["content"].strip('"')}
        except Exception as e:
            return {"quote": "Abe padh le, varna system hang ho jayega tera! (Error: AI logic failed)"}
