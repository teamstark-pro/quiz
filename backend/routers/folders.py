from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from database import db
from models import Folder, PyObjectId
from security import get_current_user, get_current_admin
from bson import ObjectId

router = APIRouter(prefix="/folders", tags=["folders"])

@router.post("/", response_model=Folder)
async def create_folder(folder: Folder, admin: dict = Depends(get_current_admin)):
    folder_dict = folder.model_dump(by_alias=True, exclude={"id"})
    
    if folder_dict.get("parent_folder_id"):
        p_id = folder_dict["parent_folder_id"]
        # Ensure it's an ObjectId if it's a valid string
        if isinstance(p_id, str) and ObjectId.is_valid(p_id):
            p_id = ObjectId(p_id)
        elif not isinstance(p_id, ObjectId):
            # If it's not a string and not an ObjectId, it might be null or something else
            p_id = None
            
        if p_id:
            parent = await db.folders.find_one({"_id": p_id})
            if not parent:
                raise HTTPException(status_code=404, detail="Parent folder not found")
            folder_dict["parent_folder_id"] = p_id
        else:
            folder_dict["parent_folder_id"] = None
    else:
        folder_dict["parent_folder_id"] = None

    result = await db.folders.insert_one(folder_dict)
    folder_dict["_id"] = result.inserted_id
    return folder_dict

@router.get("/", response_model=List[Folder])
async def list_folders(parent_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if parent_id and parent_id != "null" and parent_id != "":
        try:
            query["parent_folder_id"] = ObjectId(parent_id)
        except:
            query["parent_folder_id"] = parent_id
    else:
        query["parent_folder_id"] = None
    
    cursor = db.folders.find(query)
    folders = await cursor.to_list(length=100)
    return folders

@router.get("/{folder_id}", response_model=Folder)
async def get_folder(folder_id: str, user: dict = Depends(get_current_user)):
    # Robust check for various ID formats
    query_id = folder_id
    if ObjectId.is_valid(folder_id):
        query_id = ObjectId(folder_id)
        
    folder = await db.folders.find_one({"_id": query_id})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder

async def get_all_descendant_folder_ids(folder_id: ObjectId) -> List[ObjectId]:
    descendants = [folder_id]
    cursor = db.folders.find({"parent_folder_id": folder_id})
    async for subfolder in cursor:
        descendants.extend(await get_all_descendant_folder_ids(subfolder["_id"]))
    return descendants

@router.delete("/{folder_id}")
async def delete_folder(folder_id: str, admin: dict = Depends(get_current_admin)):
    query_id = folder_id
    if ObjectId.is_valid(folder_id):
        query_id = ObjectId(folder_id)

    # Find the folder first
    folder = await db.folders.find_one({"_id": query_id})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # 1. Get all descendant folder IDs (including the current one)
    all_folder_ids = await get_all_descendant_folder_ids(query_id)
    
    # 2. Find all quizzes in these folders
    quizzes_cursor = db.quizzes.find({"folder_id": {"$in": all_folder_ids}})
    quiz_ids = [q["_id"] async for q in quizzes_cursor]
    
    # 3. Delete attempts for these quizzes
    if quiz_ids:
        await db.attempts.delete_many({"quiz_id": {"$in": quiz_ids}})
    
    # 4. Delete the quizzes
    if quiz_ids:
        await db.quizzes.delete_many({"_id": {"$in": quiz_ids}})
    
    # 5. Delete the folders
    result = await db.folders.delete_many({"_id": {"$in": all_folder_ids}})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Folder not found")
        
    return {"message": f"Folder and its {len(all_folder_ids)-1} subfolders, {len(quiz_ids)} quizzes deleted"}
