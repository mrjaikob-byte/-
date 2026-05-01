from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime

from emergentintegrations.llm.chat import LlmChat, UserMessage


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


# ========================
# Wordle word validation
# ========================

ARABIC_LETTERS = set("ابتثجحخدذرزسشصضطظعغفقكلمنهويءأإآؤئىةّ")


class ValidateWordRequest(BaseModel):
    word: str


class ValidateWordResponse(BaseModel):
    word: str
    valid: bool
    reason: Optional[str] = None


def _normalize_ar(w: str) -> str:
    # Strip diacritics and common variants for cache key
    w = re.sub(r"[\u064B-\u0652\u0670\u0640]", "", w)  # harakat + tatweel
    w = w.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    w = w.replace("ى", "ي").replace("ئ", "ي")
    w = w.replace("ؤ", "و")
    w = w.replace("ة", "ه")
    return w.strip()


def _is_pure_arabic(w: str) -> bool:
    return len(w) > 0 and all(ch in ARABIC_LETTERS for ch in w)


def _is_obvious_garbage(w: str) -> bool:
    """Reject repeated letters and keyboard mashing cheaply before hitting LLM."""
    n = len(w)
    if n == 0:
        return True
    # same letter repeated >= 3 times in a row, or all same letters
    if len(set(w)) == 1:
        return True
    # more than 60% same letter
    from collections import Counter
    most = Counter(w).most_common(1)[0][1]
    if n >= 4 and most / n > 0.6:
        return True
    return False


async def _llm_validate_arabic(word: str) -> bool:
    """Ask Gemini: is this a real Arabic word?"""
    if not EMERGENT_LLM_KEY:
        logger.warning("EMERGENT_LLM_KEY missing - defaulting to True")
        return True
    system = (
        "أنت مُدقِّق قاموس عربي صارم. "
        "مهمتك: تحديد ما إذا كانت الكلمة المُعطاة كلمة عربية حقيقية أم لا. "
        "تُعتبر الكلمة صحيحة إذا كانت: اسماً (فاكهة، جماد، حيوان، مكان، علم شخص أو بلد معروف)، "
        "أو فعلاً مصرَّفاً، أو صفة، أو مصدراً، أو كلمة شائعة معروفة في العربية الفصحى أو الشائعة. "
        "تُعتبر الكلمة خاطئة إذا كانت: حروفاً عشوائية، تكراراً لحرف واحد، "
        "أو تسلسلاً بلا معنى. "
        "أجِب بكلمة واحدة فقط: yes أو no. لا تُضِف أي شرح."
    )
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"wordle-{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("gemini", "gemini-2.5-flash")
        msg = UserMessage(text=f"هل كلمة «{word}» كلمة عربية حقيقية؟ أجب بـ yes أو no فقط.")
        resp = await asyncio.wait_for(chat.send_message(msg), timeout=8.0)
        text = (resp or "").strip().lower()
        # Extract yes/no
        if "yes" in text and "no" not in text[:10]:
            return True
        if "no" in text:
            return False
        # fallback: interpret as invalid
        return False
    except asyncio.TimeoutError:
        logger.warning(f"LLM timeout validating '{word}' - accepting as valid")
        return True  # graceful: don't penalise user for slow network
    except Exception as e:
        logger.exception(f"LLM validation error for '{word}': {e}")
        return True  # graceful


@api_router.post("/wordle/validate", response_model=ValidateWordResponse)
async def validate_wordle_word(req: ValidateWordRequest):
    raw = (req.word or "").strip()
    if not raw:
        return ValidateWordResponse(word=raw, valid=False, reason="empty")
    if not _is_pure_arabic(raw):
        return ValidateWordResponse(word=raw, valid=False, reason="non-arabic")
    if _is_obvious_garbage(raw):
        return ValidateWordResponse(word=raw, valid=False, reason="garbage")

    norm = _normalize_ar(raw)
    # Cache lookup (check multiple variants)
    cached = await db.wordle_dict.find_one({"key": norm})
    if cached:
        return ValidateWordResponse(word=raw, valid=bool(cached["valid"]), reason="cache")

    # LLM call
    valid = await _llm_validate_arabic(raw)

    # Save to cache (upsert)
    try:
        await db.wordle_dict.update_one(
            {"key": norm},
            {"$set": {"key": norm, "word": raw, "valid": valid, "ts": datetime.utcnow()}},
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"Cache write failed: {e}")

    return ValidateWordResponse(word=raw, valid=valid, reason="llm")


async def _seed_curated_words():
    """Pre-mark all curated answer/dictionary words as valid in the cache.
    Ensures target words are NEVER rejected by Gemini misclassification."""
    seed_path = ROOT_DIR / "wordle_seed_words.json"
    if not seed_path.exists():
        logger.warning("Seed file missing: %s", seed_path)
        return
    try:
        import json
        words = json.loads(seed_path.read_text(encoding="utf-8"))
        ops = []
        for w in words:
            if not w or not _is_pure_arabic(w):
                continue
            key = _normalize_ar(w)
            ops.append({
                "filter": {"key": key},
                "update": {"$set": {"key": key, "word": w, "valid": True, "ts": datetime.utcnow(), "seeded": True}},
                "upsert": True,
            })
        # Bulk upsert
        from pymongo import UpdateOne
        bulk = [UpdateOne(o["filter"], o["update"], upsert=True) for o in ops]
        if bulk:
            res = await db.wordle_dict.bulk_write(bulk, ordered=False)
            logger.info("Wordle dict seeded: %s upserts", res.upserted_count)
    except Exception as e:
        logger.exception("Seed failed: %s", e)


@app.on_event("startup")
async def _on_startup():
    await _seed_curated_words()

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
