from pydantic import BaseModel, EmailStr, Field, ConfigDict
from pydantic_core import core_schema
from typing import List, Optional, Any
from datetime import datetime
from bson import ObjectId

class PyObjectId(ObjectId):
    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: Any, handler: Any
    ) -> core_schema.CoreSchema:
        return core_schema.json_or_python_schema(
            json_schema=core_schema.str_schema(),
            python_schema=core_schema.union_schema([
                core_schema.is_instance_schema(ObjectId),
                core_schema.chain_schema([
                    core_schema.str_schema(),
                    core_schema.no_info_plain_validator_function(cls.validate),
                ]),
            ]),
            serialization=core_schema.plain_serializer_function_ser_schema(
                lambda x: str(x),
                when_used='always'
            ),
        )

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid objectid")
        return ObjectId(v)

class MongoBaseModel(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True
    )

class User(MongoBaseModel):
    name: str
    email: EmailStr
    password_hash: str
    role: str = "user"  # "admin" or "user"
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)

class Folder(MongoBaseModel):
    name: str
    parent_folder_id: Optional[PyObjectId] = None
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)

class Question(BaseModel):
    text: str
    options: List[str]
    correct_option_index: int
    explanation: Optional[str] = None

class Quiz(MongoBaseModel):
    title: str
    folder_id: PyObjectId
    questions: List[Question]
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)

class Attempt(MongoBaseModel):
    user_id: Optional[PyObjectId] = None
    quiz_id: PyObjectId
    mode: str  # "practice" or "quiz"
    time_taken_seconds: int
    score: int
    total_questions: int
    responses: List[Optional[int]]
    question_times: Optional[List[int]] = None # Time in seconds per question
    status: str = "completed"  # "in_progress" or "completed"
    current_question_index: int = 0
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
