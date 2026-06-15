import asyncio
from database import db
from bson import ObjectId
import sys

async def make_admin(email):
    print(f"Searching for user with email: {email}")
    user = await db.users.find_one({"email": email})
    
    if not user:
        print(f"Error: User with email '{email}' not found.")
        print("Please ensure you have registered this email on the website first.")
        return

    if user.get("role") == "admin":
        print(f"User '{email}' is already an admin.")
        return

    result = await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"role": "admin"}}
    )

    if result.modified_count > 0:
        print(f"Success: User '{email}' has been promoted to admin.")
    else:
        print("Failed to update user role.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 make_admin.py <email>")
        sys.exit(1)
    
    email_to_promote = sys.argv[1]
    asyncio.run(make_admin(email_to_promote))
