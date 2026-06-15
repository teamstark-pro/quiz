from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from routers import auth, folders, quizzes, attempts, ai

load_dotenv()

app = FastAPI(title="Quiz Platform API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(auth.router)
app.include_router(folders.router)
app.include_router(quizzes.router)
app.include_router(attempts.router)
app.include_router(ai.router)

@app.get("/")
async def root():
    return {"message": "Welcome to the Quiz Platform API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
