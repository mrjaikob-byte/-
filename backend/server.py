from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import re
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Set
import uuid
from datetime import datetime


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

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
# Wordle word validation (STRICT dictionary-based)
# ========================

ARABIC_LETTERS = set("ابتثجحخدذرزسشصضطظعغفقكلمنهويءأإآؤئىةّ")
ALLOWED_BASE = set("ابتثجحخدذرزسشصضطظعغفقكلمنهويةء")

# In-memory dictionary loaded at startup: {4: set(...), 5: set(...), 6: set(...)}
ARABIC_DICT: Dict[int, Set[str]] = {4: set(), 5: set(), 6: set()}


class ValidateWordRequest(BaseModel):
    word: str


class ValidateWordResponse(BaseModel):
    word: str
    valid: bool
    reason: Optional[str] = None


def _normalize_ar(w: str) -> str:
    """Mirror the frontend's normalizeArabic function exactly.
    - Strips diacritics and tatweel
    - Unifies alef variants (أ إ آ ٱ → ا)
    - ى → ي, ؤ → و, ئ → ي
    - KEEPS standalone ء (it's a valid letter in words like سماء, ضوء, بناء)
    - Treats ة ≡ ه (common in casual Arabic typing)"""
    w = re.sub(r"[\u064B-\u0652\u0670\u0640]", "", w)  # harakat + tatweel
    w = (w
         .replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ٱ", "ا")
         .replace("ى", "ي").replace("ئ", "ي").replace("ؤ", "و")
         .replace("ة", "ه"))  # ة ↔ ه equivalence
    return w.strip()


def _is_pure_arabic(w: str) -> bool:
    return len(w) > 0 and all(ch in ALLOWED_BASE for ch in w)


def _load_dictionary():
    """Load Hunspell-derived Arabic dictionary + extras into memory.
    All words are stored AFTER normalization (ة → ه, etc.) so lookups
    are robust against ة/ه typing variations."""
    dict_path = ROOT_DIR / "wordle_arabic_dict.json"
    if dict_path.exists():
        try:
            data = json.loads(dict_path.read_text(encoding="utf-8"))
            for k in ("4", "5", "6"):
                for w in data.get(k, []):
                    norm = _normalize_ar(w)
                    if len(norm) == int(k) and _is_pure_arabic(norm):
                        ARABIC_DICT[int(k)].add(norm)
            logger.info(
                "Arabic dict loaded: 4=%d 5=%d 6=%d",
                len(ARABIC_DICT[4]), len(ARABIC_DICT[5]), len(ARABIC_DICT[6]),
            )
        except Exception as e:
            logger.exception("Failed to load Arabic dict: %s", e)
    else:
        logger.warning("Arabic dict file missing: %s", dict_path)

    # Add extras (common modern words missing from Hunspell stems)
    try:
        from wordle_extras import ALL_EXTRAS  # type: ignore
        for length, words in ALL_EXTRAS.items():
            for w in words:
                norm = _normalize_ar(w)
                if len(norm) == length and _is_pure_arabic(norm):
                    ARABIC_DICT[length].add(norm)
        logger.info(
            "After extras: 4=%d 5=%d 6=%d",
            len(ARABIC_DICT[4]), len(ARABIC_DICT[5]), len(ARABIC_DICT[6]),
        )
    except Exception as e:
        logger.warning("Extras load failed: %s", e)

    # Add curated seed words (target answers must always be valid)
    seed_path = ROOT_DIR / "wordle_seed_words.json"
    if seed_path.exists():
        try:
            words = json.loads(seed_path.read_text(encoding="utf-8"))
            for w in words:
                norm = _normalize_ar(w)
                L = len(norm)
                if L in (4, 5, 6) and _is_pure_arabic(norm):
                    ARABIC_DICT[L].add(norm)
            logger.info(
                "After seeds: 4=%d 5=%d 6=%d",
                len(ARABIC_DICT[4]), len(ARABIC_DICT[5]), len(ARABIC_DICT[6]),
            )
        except Exception as e:
            logger.warning("Seed load failed: %s", e)


@api_router.post("/wordle/validate", response_model=ValidateWordResponse)
async def validate_wordle_word(req: ValidateWordRequest):
    raw = (req.word or "").strip()
    if not raw:
        return ValidateWordResponse(word=raw, valid=False, reason="empty")

    norm = _normalize_ar(raw)
    if not _is_pure_arabic(norm):
        return ValidateWordResponse(word=raw, valid=False, reason="non-arabic")

    L = len(norm)
    if L not in (4, 5, 6):
        return ValidateWordResponse(word=raw, valid=False, reason="length")

    # STRICT exact lookup against dictionary
    if norm in ARABIC_DICT[L]:
        return ValidateWordResponse(word=raw, valid=True, reason="dict")

    return ValidateWordResponse(word=raw, valid=False, reason="not-in-dict")


@api_router.get("/wordle/dict-stats")
async def wordle_dict_stats():
    return {
        "size_4": len(ARABIC_DICT[4]),
        "size_5": len(ARABIC_DICT[5]),
        "size_6": len(ARABIC_DICT[6]),
        "total": sum(len(v) for v in ARABIC_DICT.values()),
    }


@app.on_event("startup")
async def _on_startup():
    _load_dictionary()

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
