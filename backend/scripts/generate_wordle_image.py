"""
Generate the Wordle game hero banner using Gemini Nano Banana.
Run: python /app/backend/scripts/generate_wordle_image.py
"""
import asyncio
import os
import sys
import base64
from pathlib import Path

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

from emergentintegrations.llm.chat import LlmChat, UserMessage

OUT_DIR = Path("/app/frontend/assets/images")
OUT_DIR.mkdir(parents=True, exist_ok=True)

MODEL_ID = "gemini-3.1-flash-image-preview"
API_KEY = os.getenv("EMERGENT_LLM_KEY")

PROMPT = (
    "A stunning, premium hero banner illustration for an Arabic word-guessing mobile game. "
    "Floating wooden scrabble-like tiles with elegant Arabic calligraphy letters (random letters, no specific word), "
    "arranged dynamically in mid-air with motion blur. Some tiles are glowing emerald green, "
    "some warm amber gold, some charcoal. Deep royal purple and magenta gradient background with bokeh light particles. "
    "Golden sparkles and light rays streaming across. A subtle winding golden path in the background suggesting levels. "
    "Ultra-detailed 3D render, cinematic lighting, professional mobile game cover art, vibrant and magical atmosphere, no text labels. 16:9 aspect ratio."
)


async def main():
    if not API_KEY:
        print("ERROR: EMERGENT_LLM_KEY not set")
        sys.exit(1)
    print("Generating wordle hero image...")
    chat = LlmChat(
        api_key=API_KEY,
        session_id="gen-wordle",
        system_message="You are a professional concept-art illustrator."
    )
    chat.with_model("gemini", MODEL_ID).with_params(modalities=["image", "text"])

    msg = UserMessage(text=PROMPT)
    text, images = await chat.send_message_multimodal_response(msg)

    if not images:
        print("No image returned")
        sys.exit(1)

    img = images[0]
    mime = img.get("mime_type", "image/png")
    ext = "png" if "png" in mime else "jpg"
    out_path = OUT_DIR / f"wordle.{ext}"
    data = base64.b64decode(img["data"])
    out_path.write_bytes(data)
    print(f"Saved {out_path} ({len(data)} bytes)")


if __name__ == "__main__":
    asyncio.run(main())
