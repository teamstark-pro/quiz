from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from database import db
from models import Attempt, PyObjectId
from security import get_current_user
from bson import ObjectId
from datetime import datetime, timedelta, date
import os

router = APIRouter(prefix="/attempts", tags=["attempts"])

@router.post("/", response_model=Attempt)
async def submit_attempt(attempt: Attempt, user: dict = Depends(get_current_user)):
    # Use model_dump instead of dict()
    attempt_dict = attempt.model_dump(by_alias=True, exclude={"id"})
    
    # Ensure quiz_id is stored as ObjectId, not string
    if isinstance(attempt_dict.get("quiz_id"), str):
        attempt_dict["quiz_id"] = ObjectId(attempt_dict["quiz_id"])
        
    attempt_dict["user_id"] = user["_id"]
    attempt_dict["updated_at"] = datetime.utcnow()
    
    # Validation: Ensure quiz exists
    quiz = await db.quizzes.find_one({"_id": attempt_dict["quiz_id"]})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    # Check if we are updating an existing attempt
    # The frontend sends 'id', which Pydantic might put in attempt.id
    if attempt.id:
        # Update existing attempt - preserve original created_at
        update_fields = {k: v for k, v in attempt_dict.items() if k not in ["_id", "created_at"]}
        await db.attempts.update_one(
            {"_id": ObjectId(attempt.id), "user_id": user["_id"]},
            {"$set": update_fields}
        )
        # Load the original attempt from the DB to get the original created_at
        existing = await db.attempts.find_one({"_id": ObjectId(attempt.id)})
        if existing:
            attempt_dict["created_at"] = existing.get("created_at")
        attempt_dict["_id"] = attempt.id
        return attempt_dict
    else:
        # Create new attempt
        result = await db.attempts.insert_one(attempt_dict)
        attempt_dict["_id"] = result.inserted_id
        return attempt_dict

@router.get("/active/{quiz_id}", response_model=Optional[Attempt])
async def get_active_attempt(quiz_id: str, user: dict = Depends(get_current_user)):
    attempt = await db.attempts.find_one({
        "user_id": user["_id"],
        "quiz_id": ObjectId(quiz_id),
        "status": "in_progress"
    }, sort=[("updated_at", -1)])
    return attempt

@router.get("/quiz/{quiz_id}", response_model=List[Attempt])
async def get_quiz_attempts(quiz_id: str, user: dict = Depends(get_current_user)):
    cursor = db.attempts.find({"user_id": user["_id"], "quiz_id": ObjectId(quiz_id)})
    attempts = await cursor.to_list(length=100)
    return attempts

@router.get("/history")
async def get_user_attempts_history(user: dict = Depends(get_current_user)):
    cursor = db.attempts.find({"user_id": user["_id"]}).sort("created_at", -1)
    attempts = await cursor.to_list(length=100)
    
    cleaned_attempts = []
    for att in attempts:
        quiz = await db.quizzes.find_one({"_id": att["quiz_id"]})
        cleaned_attempts.append({
            "id": str(att["_id"]),
            "quiz_id": str(att["quiz_id"]),
            "quiz_title": quiz["title"] if quiz else "Unknown Quiz",
            "mode": att["mode"],
            "time_taken_seconds": att["time_taken_seconds"],
            "score": att["score"],
            "total_questions": att["total_questions"],
            "responses": att["responses"],
            "question_times": att.get("question_times"),
            "statuses": att.get("statuses"),
            "question_order": att.get("question_order"),
            "option_orders": att.get("option_orders"),
            "status": att["status"],
            "created_at": att["created_at"].isoformat() if att.get("created_at") else None
        })
    return cleaned_attempts

@router.get("/detail/{attempt_id}")
async def get_attempt_detail(attempt_id: str, user: dict = Depends(get_current_user)):
    attempt = await db.attempts.find_one({"_id": ObjectId(attempt_id), "user_id": user["_id"]})
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    quiz = await db.quizzes.find_one({"_id": attempt["quiz_id"]})
    
    return {
        "id": str(attempt["_id"]),
        "quiz_id": str(attempt["quiz_id"]),
        "quiz_title": quiz["title"] if quiz else "Unknown Quiz",
        "mode": attempt["mode"],
        "time_taken_seconds": attempt["time_taken_seconds"],
        "score": attempt["score"],
        "total_questions": attempt["total_questions"],
        "responses": attempt["responses"],
        "question_times": attempt.get("question_times"),
        "statuses": attempt.get("statuses"),
        "question_order": attempt.get("question_order"),
        "option_orders": attempt.get("option_orders"),
        "status": attempt["status"],
        "created_at": attempt["created_at"].isoformat() if attempt.get("created_at") else None
    }

@router.get("/deep-analysis")
async def get_deep_performance_analysis(user: dict = Depends(get_current_user)):
    # Load all completed attempts for the user
    cursor = db.attempts.find({"user_id": user["_id"], "status": "completed"}).sort("created_at", 1)
    attempts = await cursor.to_list(length=200)
    
    if not attempts:
        return {
            "has_data": False,
            "message": "Not enough attempt history. Complete some quizzes first to generate analysis!"
        }
        
    # Variables for calculations
    total_questions_answered = 0
    total_correct = 0
    
    # Speed intervals: correct/total per interval
    speed_intervals = {
        "fast": {"correct": 0, "total": 0, "label": "Fast (<10s)"},
        "steady": {"correct": 0, "total": 0, "label": "Steady (10-25s)"},
        "slow": {"correct": 0, "total": 0, "label": "Deliberate (>25s)"}
    }
    
    # Correct vs incorrect average speed
    correct_times = []
    incorrect_times = []
    skipped_times = []
    
    # Topic performance
    topic_stats = {} # quiz_id -> {title, total_score, max_score, count}
    
    for att in attempts:
        quiz = await db.quizzes.find_one({"_id": att["quiz_id"]})
        if not quiz:
            continue
            
        questions = quiz.get("questions", [])
        q_order = att.get("question_order") or list(range(len(questions)))
        responses = att.get("responses", [])
        q_times = att.get("question_times") or [0] * len(questions)
        
        # Topic tracking
        q_id_str = str(att["quiz_id"])
        if q_id_str not in topic_stats:
            topic_stats[q_id_str] = {
                "title": quiz["title"],
                "score_sum": 0,
                "max_score_sum": 0,
                "attempts_count": 0
            }
        topic_stats[q_id_str]["score_sum"] += att["score"]
        topic_stats[q_id_str]["max_score_sum"] += att["total_questions"] * 2
        topic_stats[q_id_str]["attempts_count"] += 1
        
        # Question-by-question analysis
        for visual_idx, orig_idx in enumerate(q_order):
            if orig_idx >= len(questions) or orig_idx >= len(responses):
                continue
                
            q_item = questions[orig_idx]
            user_res = responses[orig_idx]
            q_time = q_times[orig_idx] if orig_idx < len(q_times) else 0
            
            is_correct = user_res == q_item["correct_option_index"]
            is_skipped = user_res is None
            
            total_questions_answered += 1
            if is_correct:
                total_correct += 1
                correct_times.append(q_time)
            elif is_skipped:
                skipped_times.append(q_time)
            else:
                incorrect_times.append(q_time)
                
            # Speed grouping
            if not is_skipped:
                if q_time < 10:
                    speed_key = "fast"
                elif q_time <= 25:
                    speed_key = "steady"
                else:
                    speed_key = "slow"
                
                speed_intervals[speed_key]["total"] += 1
                if is_correct:
                    speed_intervals[speed_key]["correct"] += 1
                    
    # Format Topic Performance
    topic_performance = []
    for qid, stats in topic_stats.items():
        avg_pct = round((stats["score_sum"] / stats["max_score_sum"]) * 100) if stats["max_score_sum"] > 0 else 0
        topic_performance.append({
            "quiz_id": qid,
            "title": stats["title"],
            "accuracy": avg_pct,
            "attempts": stats["attempts_count"]
        })
    # Sort topics by accuracy
    topic_performance.sort(key=lambda x: x["accuracy"])
    
    strongest_topic = topic_performance[-1] if topic_performance else None
    weakest_topic = topic_performance[0] if topic_performance else None
    
    # Calculate averages
    avg_correct_time = sum(correct_times) / len(correct_times) if correct_times else 0.0
    avg_incorrect_time = sum(incorrect_times) / len(incorrect_times) if incorrect_times else 0.0
    avg_skipped_time = sum(skipped_times) / len(skipped_times) if skipped_times else 0.0
    
    # Calculate interval accuracies
    for key, data in speed_intervals.items():
        data["accuracy"] = round((data["correct"] / data["total"]) * 100, 1) if data["total"] > 0 else 0.0
        
    # Study streak calculation (based on date)
    dates = sorted(list(set([att["created_at"].date() for att in attempts if att.get("created_at")])))
    today = date.today()
    
    current_streak = 0
    if dates:
        last_date = dates[-1]
        if last_date == today or last_date == today - timedelta(days=1):
            current_streak = 1
            check_date = last_date
            for d in reversed(dates[:-1]):
                if d == check_date - timedelta(days=1):
                    current_streak += 1
                    check_date = d
                elif d == check_date:
                    continue
                else:
                    break
                    
    # Generate AI tutoring text if GROQ key is set
    ai_feedback = "No AI analysis available at this moment. Solve more quizzes!"
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    if GROQ_API_KEY and len(attempts) >= 1:
        prompt = f"""
        You are a supportive educational AI tutor. Analyze this student's quiz analytics and write a concise study recommendation.
        
        Student stats:
        - Overall Quiz Accuracy: {round((total_correct/total_questions_answered)*100, 1) if total_questions_answered > 0 else 0}%
        - Strongest Quiz: {strongest_topic['title'] if strongest_topic else 'N/A'} ({strongest_topic['accuracy'] if strongest_topic else 0}% accuracy)
        - Weakest Quiz: {weakest_topic['title'] if weakest_topic else 'N/A'} ({weakest_topic['accuracy'] if weakest_topic else 0}% accuracy)
        - Average time spent on correct answers: {round(avg_correct_time, 1)} seconds
        - Average time spent on incorrect answers: {round(avg_incorrect_time, 1)} seconds
        - Speed-Accuracy Breakdown:
          * Fast (<10s): {speed_intervals['fast']['accuracy']}% accuracy ({speed_intervals['fast']['total']} attempts)
          * Steady (10-25s): {speed_intervals['steady']['accuracy']}% accuracy ({speed_intervals['steady']['total']} attempts)
          * Deliberate (>25s): {speed_intervals['slow']['accuracy']}% accuracy ({speed_intervals['slow']['total']} attempts)
          
        Task:
        1. Give a 2-sentence summary of their learning behavior (e.g. are they rushing, do they need to take more time, or are they balanced?).
        2. Give 2 concrete actionable study recommendations for their weakest areas.
        Keep your response under 150 words, using bullet points for recommendations. Use markdown formatting.
        """
        try:
            import httpx
            GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
            response = httpx.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {"role": "system", "content": "You are a motivating educational coach."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.7,
                    "max_tokens": 300
                },
                timeout=10.0
            )
            if response.status_code == 200:
                data = response.json()
                ai_feedback = data["choices"][0]["message"]["content"]
        except Exception as e:
            ai_feedback = f"AI Tutor analysis is temporarily unavailable. Error: {str(e)}"
            
    return {
        "has_data": True,
        "overall_accuracy": round((total_correct/total_questions_answered)*100, 1) if total_questions_answered > 0 else 0.0,
        "total_questions_answered": total_questions_answered,
        "total_correct": total_correct,
        "avg_correct_time": round(avg_correct_time, 1),
        "avg_incorrect_time": round(avg_incorrect_time, 1),
        "avg_skipped_time": round(avg_skipped_time, 1),
        "speed_intervals": speed_intervals,
        "strongest_topic": strongest_topic,
        "weakest_topic": weakest_topic,
        "current_streak": current_streak,
        "ai_feedback": ai_feedback
    }

@router.get("/summary")
async def get_overall_summary(user: dict = Depends(get_current_user)):
    # Simple aggregation for overall analysis (completed attempts only)
    pipeline = [
        {"$match": {"user_id": user["_id"], "status": "completed"}},
        {"$group": {
            "_id": None,
            "total_attempts": {"$sum": 1},
            "average_score": {"$avg": "$score"},
            "total_time": {"$sum": "$time_taken_seconds"},
            "highest_score": {"$max": "$score"}
        }}
    ]
    cursor = db.attempts.aggregate(pipeline)
    summary = await cursor.to_list(length=1)
    if summary:
        res = summary[0]
        return {
            "total_attempts": int(res.get("total_attempts", 0)),
            "average_score": float(res.get("average_score", 0)) if res.get("average_score") is not None else 0.0,
            "total_time": int(res.get("total_time", 0)),
            "highest_score": float(res.get("highest_score", 0)) if res.get("highest_score") is not None else 0.0
        }
    return {
        "total_attempts": 0,
        "average_score": 0.0,
        "total_time": 0,
        "highest_score": 0.0
    }

@router.get("/topic-analysis")
async def get_topic_analysis(user: dict = Depends(get_current_user)):
    # Compare first and last attempt per quiz (completed attempts only)
    pipeline = [
        {"$match": {"user_id": user["_id"], "status": "completed"}},
        {"$sort": {"created_at": 1}},
        {"$group": {
            "_id": "$quiz_id",
            "first_score": {"$first": "$score"},
            "last_score": {"$last": "$score"},
            "total_questions": {"$first": "$total_questions"},
            "attempts_count": {"$sum": 1},
            "quiz_id": {"$first": "$quiz_id"}
        }}
    ]
    cursor = db.attempts.aggregate(pipeline)
    analysis = await cursor.to_list(length=100)
    
    cleaned_analysis = []
    for item in analysis:
        quiz_id = item.get("quiz_id")
        quiz = await db.quizzes.find_one({"_id": quiz_id}) if quiz_id else None
        
        cleaned_item = {
            "id": str(item.get("_id")) if item.get("_id") else None,
            "first_score": float(item.get("first_score", 0)),
            "last_score": float(item.get("last_score", 0)),
            "total_questions": int(item.get("total_questions", 0)),
            "attempts_count": int(item.get("attempts_count", 0)),
            "quiz_id": str(quiz_id) if quiz_id else None,
            "quiz_title": quiz["title"] if quiz else "Unknown Quiz",
            "improvement": float(item.get("last_score", 0) - item.get("first_score", 0))
        }
        cleaned_analysis.append(cleaned_item)
        
    return cleaned_analysis

@router.get("/daily-stats")
async def get_daily_stats(tz_offset: Optional[int] = 0, user: dict = Depends(get_current_user)):
    offset_mins = tz_offset if tz_offset is not None else 0
    local_now = datetime.utcnow() - timedelta(minutes=offset_mins)
    local_today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start = local_today_start + timedelta(minutes=offset_mins)
    
    # User stats today
    pipeline_user = [
        {"$match": {
            "user_id": user["_id"],
            "created_at": {"$gte": today_start}
        }},
        {"$project": {
            "solved_count": {
                "$size": {
                    "$filter": {
                        "input": "$responses",
                        "as": "res",
                        "cond": {"$ne": ["$$res", None]}
                    }
                }
            }
        }},
        {"$group": {
            "_id": None,
            "total_solved": {"$sum": "$solved_count"}
        }}
    ]
    cursor_user = db.attempts.aggregate(pipeline_user)
    user_res = await cursor_user.to_list(length=1)
    user_solved = user_res[0]["total_solved"] if user_res else 0

    # Peer group leaderboard for today
    pipeline_peers = [
        {"$match": {
            "created_at": {"$gte": today_start}
        }},
        {"$project": {
            "user_id": 1,
            "solved_count": {
                "$size": {
                    "$filter": {
                        "input": "$responses",
                        "as": "res",
                        "cond": {"$ne": ["$$res", None]}
                    }
                }
            }
        }},
        {"$group": {
            "_id": "$user_id",
            "total_solved": {"$sum": "$solved_count"}
        }},
        {"$sort": {"total_solved": -1}},
        {"$limit": 5}
    ]
    cursor_peers = db.attempts.aggregate(pipeline_peers)
    peer_results = await cursor_peers.to_list(length=5)
    
    # Hydrate peer names
    leaderboard = []
    for res in peer_results:
        u = await db.users.find_one({"_id": res["_id"]})
        leaderboard.append({
            "name": u["name"] if u else "Anonymous",
            "solved": res["total_solved"],
            "is_me": res["_id"] == user["_id"]
        })

    return {
        "user_solved": user_solved,
        "daily_leaderboard": leaderboard
    }

@router.get("/leaderboard")
async def get_leaderboard(user: dict = Depends(get_current_user)):
    # Only completed attempts count for the leaderboard
    pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {
            "_id": "$user_id",
            "total_score": {"$sum": "$score"},
            "total_attempts": {"$sum": 1},
            "avg_score": {"$avg": "$score"}
        }},
        {"$sort": {"total_score": -1}},
        {"$limit": 10}
    ]
    cursor = db.attempts.aggregate(pipeline)
    results = await cursor.to_list(length=10)
    
    cleaned_results = []
    for res in results:
        res_id = res.get("_id")
        u = await db.users.find_one({"_id": res_id}) if res_id else None
        
        cleaned_res = {
            "id": str(res_id) if res_id else None,
            "total_score": float(res.get("total_score", 0)),
            "total_attempts": int(res.get("total_attempts", 0)),
            "avg_score": float(res.get("avg_score", 0)),
            "username": u["name"] if u else "Anonymous",
            "is_user": res_id == user["_id"] if res_id else False
        }
        cleaned_results.append(cleaned_res)
        
    return cleaned_results

@router.get("/comparison/{quiz_id}")
async def get_quiz_comparison(quiz_id: str, user: dict = Depends(get_current_user)):
    # Aggregation for peer comparison (completed attempts only)
    pipeline = [
        {"$match": {"quiz_id": ObjectId(quiz_id), "status": "completed"}},
        {"$group": {
            "_id": None,
            "avg_score": {"$avg": "$score"},
            "avg_time": {"$avg": "$time_taken_seconds"},
            "total_attempts": {"$sum": 1}
        }}
    ]
    cursor = db.attempts.aggregate(pipeline)
    summary_results = await cursor.to_list(length=1)
    summary = summary_results[0] if summary_results else {
        "avg_score": 0,
        "avg_time": 0,
        "total_attempts": 0
    }
    if "_id" in summary:
        summary["_id"] = str(summary["_id"]) if summary["_id"] else None

    # Average time per question
    pipeline_q = [
        {"$match": {"quiz_id": ObjectId(quiz_id), "status": "completed", "question_times": {"$exists": True, "$ne": None}}},
        {"$unwind": {"path": "$question_times", "includeArrayIndex": "q_index"}},
        {"$group": {
            "_id": "$q_index",
            "avg_time": {"$avg": "$question_times"}
        }},
        {"$sort": {"_id": 1}}
    ]
    cursor_q = db.attempts.aggregate(pipeline_q)
    avg_times_per_question = {str(item["_id"]): item["avg_time"] async for item in cursor_q}

    return {
        "peer_summary": summary,
        "avg_times_per_question": avg_times_per_question
    }
