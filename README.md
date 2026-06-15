# Quiz Platform

A full-stack quiz platform with nested folders, dual-format uploads, AI assistance, and detailed analytics.

## Tech Stack
- **Backend:** FastAPI (Python), MongoDB (Motor), Groq AI API.
- **Frontend:** Next.js (TypeScript), Vanilla CSS.

## Setup

### Backend
1. `cd backend`
2. `python3 -m venv venv`
3. `source venv/bin/activate`
4. `pip install -r requirements.txt`
5. Create/Edit `.env` file with your credentials:
   - `MONGODB_URL`
   - `SECRET_KEY`
   - `GROQ_API_KEY`
6. Run: `python3 main.py`

### Frontend
1. `cd frontend`
2. `npm install`
3. Run: `npm run dev`

## Features
- **Admin Panel:** Create nested folders (Subject -> Chapter -> Topic) and upload quizzes in JSON or HTML.
- **Practice Mode:** Untimed with a stopwatch and Groq AI assistant for hints/summaries.
- **Quiz Mode:** Timed attempt with strict scoring.
- **Analytics:** Overall summary and topic-wise improvement analysis (first vs. latest attempt).
- **Authentication:** Simple email/password registration and login.
