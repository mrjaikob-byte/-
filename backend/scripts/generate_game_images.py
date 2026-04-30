"""
One-time script to generate hero images for the games platform using Gemini Nano Banana.
Run: python /app/backend/scripts/generate_game_images.py
Saves images to /app/frontend/assets/images/
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

PROMPTS = {
    "domino": (
        "A stunning, premium hero banner illustration of domino tiles. "
        "Dramatic dark cinematic lighting with deep purple and magenta gradient background. "
        "Two ivory-white domino tiles with glossy reflective surfaces, black dots, one tile "
        "casting a sharp shadow, arranged dynamically at a slight angle. Golden sparkles and "
        "light particles floating around. Ultra-detailed, 3D render quality, vibrant colors, "
        "professional mobile game cover art, centered composition, no text. 16:9 aspect ratio."
    ),
    "cards": (
        "A stunning, premium hero banner illustration of classic playing cards fanned out "
        "dramatically. Deep teal green and electric blue gradient background with rich bokeh. "
        "Five classic cards (Ace of spades prominent, hearts, diamonds, clubs, king) with "
        "glossy finishes and elegant gold edges, dynamically spread in a perfect fan. Some "
        "cards float in mid-air with a subtle motion blur. Golden light rays from above. "
        "Ultra-detailed, cinematic 3D render, professional mobile game cover art, no text. "
        "16:9 aspect ratio."
    ),
    "mafia": (
        "A stunning, premium hero banner illustration for a Mafia game. A classic black fedora "
        "hat and a vintage wooden revolver lying on a mahogany table, deep crimson red and "
        "charcoal black gradient background with moody cinematic film-noir lighting. Smoke "
        "wisps rising from the hat. A single playing card (Ace of spades) half-hidden beneath. "
        "Golden rim light. Dramatic shadows, mysterious atmosphere, ultra-detailed 3D render, "
        "professional mobile game cover art, no text, no faces. 16:9 aspect ratio."
    ),
}


async def gen_one(key: str, prompt: str):
    print(f"Generating {key}...")
    chat = LlmChat(
        api_key=API_KEY,
        session_id=f"gen-{key}",
        system_message="You are a professional concept-art illustrator."
    )
    chat.with_model("gemini", MODEL_ID).with_params(modalities=["image", "text"])

    msg = UserMessage(text=prompt)
    text, images = await chat.send_message_multimodal_response(msg)

    if not images:
        print(f"  No image returned for {key}")
        return False

    img = images[0]
    mime = img.get("mime_type", "image/png")
    ext = "png" if "png" in mime else "jpg"
    out_path = OUT_DIR / f"{key}.{ext}"
    data = base64.b64decode(img["data"])
    out_path.write_bytes(data)
    print(f"  Saved {out_path} ({len(data)} bytes)")
    return True


async def main():
    if not API_KEY:
        print("ERROR: EMERGENT_LLM_KEY not set in backend/.env")
        sys.exit(1)
    for key, prompt in PROMPTS.items():
        try:
            await gen_one(key, prompt)
        except Exception as e:
            print(f"  FAILED {key}: {e}")


if __name__ == "__main__":
    asyncio.run(main())
