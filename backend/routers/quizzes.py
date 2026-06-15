from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional
from database import db
from models import Quiz, Question, PyObjectId
from security import get_current_user, get_current_admin
from bson import ObjectId
import json
from bs4 import BeautifulSoup
from datetime import datetime

router = APIRouter(prefix="/quizzes", tags=["quizzes"])

def parse_html_quiz(html_content: str) -> List[Question]:
    soup = BeautifulSoup(html_content, 'html.parser')
    questions = []
    
    # Expected structure: 
    # <div class="question">
    #   <p class="text">Question text</p>
    #   <ul class="options">
    #     <li>Option 1</li>
    #     <li>Option 2</li>
    #   </ul>
    #   <span class="correct">0</span>
    #   <p class="explanation">Explanation text</p>
    # </div>
    
    q_divs = soup.find_all('div', class_='question')
    for q_div in q_divs:
        text = q_div.find('p', class_='text').get_text(strip=True)
        options = [li.get_text(strip=True) for li in q_div.find('ul', class_='options').find_all('li')]
        correct_index = int(q_div.find('span', class_='correct').get_text(strip=True))
        
        explanation_el = q_div.find('p', class_='explanation')
        explanation = explanation_el.get_text(strip=True) if explanation_el else None
        
        questions.append(Question(
            text=text,
            options=options,
            correct_option_index=correct_index,
            explanation=explanation
        ))
    
    return questions

class ManualQuizRequest(BaseModel):
    title: str
    folder_id: str
    content: str
    format: str  # "json" or "html"

@router.post("/create-manual", response_model=Quiz)
async def create_manual_quiz(
    req: ManualQuizRequest,
    admin: dict = Depends(get_current_admin)
):
    if req.format == "json":
        try:
            questions_data = json.loads(req.content)
            questions = [Question(**q) for q in questions_data]
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")
    elif req.format == "html":
        try:
            questions = parse_html_quiz(req.content)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid HTML structure: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use 'json' or 'html'")

    quiz_dict = {
        "title": req.title,
        "folder_id": ObjectId(req.folder_id),
        "questions": [q.model_dump() for q in questions],
        "created_at": datetime.utcnow()
    }
    
    result = await db.quizzes.insert_one(quiz_dict)
    quiz_dict["_id"] = result.inserted_id
    return quiz_dict

@router.post("/upload", response_model=Quiz)
async def upload_quiz(
    title: str = Form(...),
    folder_id: str = Form(...),
    file: UploadFile = File(...),
    admin: dict = Depends(get_current_admin)
):
    content = await file.read()
    
    if file.filename and file.filename.endswith('.json'):
        try:
            questions_data = json.loads(content)
            questions = [Question(**q) for q in questions_data]
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")
    elif file.filename and file.filename.endswith('.html'):
        try:
            questions = parse_html_quiz(content.decode('utf-8'))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid HTML structure: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Use .json or .html")

    quiz_dict = {
        "title": title,
        "folder_id": ObjectId(folder_id),
        "questions": [q.model_dump() for q in questions],
        "created_at": datetime.utcnow()
    }
    
    result = await db.quizzes.insert_one(quiz_dict)
    quiz_dict["_id"] = result.inserted_id
    return quiz_dict

@router.get("/", response_model=List[Quiz])
async def list_quizzes(folder_id: str, user: dict = Depends(get_current_user)):
    query_id = folder_id
    if ObjectId.is_valid(folder_id):
        query_id = ObjectId(folder_id)
        
    cursor = db.quizzes.find({"folder_id": query_id})
    quizzes = await cursor.to_list(length=100)
    return quizzes

@router.get("/{quiz_id}", response_model=Quiz)
async def get_quiz(quiz_id: str, user: dict = Depends(get_current_user)):
    quiz = await db.quizzes.find_one({"_id": ObjectId(quiz_id)})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    # If not practice mode and not admin, hide correct answers? 
    # Actually, let's keep it simple for now and just return the quiz.
    # We can filter answers on the frontend or have a separate endpoint for attempts.
    return quiz

@router.delete("/{quiz_id}")
async def delete_quiz(quiz_id: str, admin: dict = Depends(get_current_admin)):
    result = await db.quizzes.delete_one({"_id": ObjectId(quiz_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return {"message": "Quiz deleted"}
