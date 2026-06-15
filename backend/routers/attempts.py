from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from database import db
from models import Attempt, PyObjectId
from security import get_current_user
from bson import ObjectId
from datetime import datetime

router = APIRouter(prefix="/attempts", tags=["attempts"])

@router.post("/", response_model=Attempt)
async def submit_attempt(attempt: Attempt, user: dict = Depends(get_current_user)):
    # Use model_dump instead of dict()
    attempt_dict = attempt.model_dump(by_alias=True, exclude={"id"})
    attempt_dict["user_id"] = user["_id"]
    attempt_dict["updated_at"] = datetime.utcnow()
    
    # Validation: Ensure quiz exists
    quiz = await db.quizzes.find_one({"_id": attempt_dict["quiz_id"]})
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    # Check if we are updating an existing attempt
    # The frontend sends 'id', which Pydantic might put in attempt.id
    if attempt.id:
        # Update existing attempt
        await db.attempts.update_one(
            {"_id": ObjectId(attempt.id), "user_id": user["_id"]},
            {"$set": {k: v for k, v in attempt_dict.items() if k != "_id"}}
        )
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

@router.get("/summary")
async def get_overall_summary(user: dict = Depends(get_current_user)):
    # Simple aggregation for overall analysis
    pipeline = [
        {"$match": {"user_id": user["_id"]}},
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
    return summary[0] if summary else {
        "total_attempts": 0,
        "average_score": 0,
        "total_time": 0,
        "highest_score": 0
    }

@router.get("/topic-analysis")
async def get_topic_analysis(user: dict = Depends(get_current_user)):
    # Compare first and last attempt per quiz
    pipeline = [
        {"$match": {"user_id": user["_id"]}},
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
    
    # Hydrate with quiz titles
    for item in analysis:
        quiz = await db.quizzes.find_one({"_id": item["quiz_id"]})
        item["quiz_title"] = quiz["title"] if quiz else "Unknown Quiz"
        item["improvement"] = item["last_score"] - item["first_score"]
        
    return analysis

@router.get("/daily-stats")
async def get_daily_stats(user: dict = Depends(get_current_user)):
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
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
    pipeline = [
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
    
    # Hydrate with usernames
    for res in results:
        u = await db.users.find_one({"_id": res["_id"]})
        res["username"] = u["name"] if u else "Anonymous"
        res["is_user"] = res["_id"] == user["_id"]
    
    return results

@router.get("/comparison/{quiz_id}")
async def get_quiz_comparison(quiz_id: str, user: dict = Depends(get_current_user)):
    # Aggregation for peer comparison
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
    avg_times_per_question = {item["_id"]: item["avg_time"] async for item in cursor_q}

    return {
        "peer_summary": summary,
        "avg_times_per_question": avg_times_per_question
    }
