from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
from security import create_access_token, get_password_hash, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES
from database import db
from models import User, PyObjectId
from pydantic import BaseModel, EmailStr
import os

router = APIRouter(prefix="/auth", tags=["auth"])

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str

@router.post("/register", response_model=Token)
async def register(user_in: UserRegister):
    user_exists = await db.users.find_one({"email": user_in.email})
    if user_exists:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if this is the first user, if so, make them admin
    count = await db.users.count_documents({})
    role = "admin" if count == 0 else "user"
    
    hashed_password = get_password_hash(user_in.password)
    user_dict = {
        "name": user_in.name,
        "email": user_in.email,
        "password_hash": hashed_password,
        "role": role,
        "created_at": None # Model will handle default
    }
    
    new_user = await db.users.insert_one(user_dict)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_in.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "role": role}

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await db.users.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "role": user["role"]}
