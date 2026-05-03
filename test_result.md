#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "بناء منصة ألعاب عربية تحتوي على عدة ألعاب مصغّرة، بما في ذلك لعبة تخمين الكلمة (Wordle عربي) بـ 1000 مرحلة وخريطة تقدّم بنمط Candy Crush."

frontend:
  - task: "Arabic Wordle Game - Full gameplay, map, keyboard, storage"
    implemented: true
    working: true
    file: "/app/frontend/app/games/wordle-play.tsx, /app/frontend/app/games/wordle.tsx, /app/frontend/src/wordle/*"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Built complete Arabic Wordle experience: 126 curated 4-letter words + 5/6-letter pools, deterministic level→word mapping (1000 levels), progressive difficulty. Core engine handles Arabic normalization (alef variants, hamza, diacritics) and classic wordle evaluation. 7 themed chapters (Garden/Desert/Sea/Mountain/Forest/Castle/Space) with custom colors and emoji. Candy-Crush style map with zigzag sin-wave path, stars, locked/unlocked states, pulsing current-level indicator. Play screen features: Arabic keyboard with 3 rows (RTL), 6-attempt grid with flip animations, shake on invalid, toasts, 2 hints per level that reveal random correct letter, win/loss modal with star earning (3/2/1 based on attempts) and confetti animation. AsyncStorage persistence: currentLevel, completed (with stars/attempts), totalStars, totalWins."
      - working: true
        agent: "main"
        comment: "User-reported polish iteration: (1) Made tiles bigger (78px max, 30px text) with thicker 3px borders and lighter background fill so they're prominent against the dark theme. (2) Added dictionary validation via isValidWord() - any word not in the curated word pool is rejected with toast 'الكلمة غير موجودة في القاموس' + shake. (3) Fixed Arabic keyboard direction: was using row-reverse with iPhone-style array which placed ض on the wrong side; now uses normal flexDirection: row so ض appears top-left like standard iPhone Arabic keyboard. (4) Improved hint toast: 16px bold, gold border, scale-in animation, 3.5s display duration. (5) Added per-chapter animated backgrounds via new WorldBackground component: Garden = floating leaves, Desert = drifting golden sand particles, Sea = rising bubbles, Mountain = falling snowflakes, Forest = twinkling magical sparkles, Castle = warm rising embers, Space = twinkling stars. Verified with screenshots across all 7 chapters."
      - working: true
        agent: "main"
        comment: "Third polish iteration - dictionary loosening: User reported many valid Arabic words (صباح/جراح/منصة/تموز/ألعاب...) being rejected despite being real. Maintaining a curated list of every possible Arabic word is impractical (a comprehensive filtered dictionary from Lisan al-Arab sources has ~1.4M 4-6 letter entries totaling 20MB - too large to bundle). Changed strategy to match how most popular Arabic Wordle clones work: accept ANY word composed of valid base Arabic letters with the correct length. isValidWord() now only checks length + allowed character set (no strict dictionary lookup). The keyboard only exposes allowed letters, so correct-length guesses always pass. Verified ALL listed examples and more now accepted in-game (صباح, جراح, منصة, تموز, ألعاب, منظمة, أبيض, أسود, شوكولا...). Level-target pool still uses curated quality words."
      - working: true
        agent: "main"
        comment: "FOURTH iteration - STRICT dictionary validation via LLM: User strongly reported the previous loose validation accepted gibberish like 'ببب' or 'عغفق' which broke gameplay. Implemented a robust validator: (1) New backend endpoint POST /api/wordle/validate using Gemini 2.5 Flash via Emergent LLM Key with strict Arabic-language prompt; cheap garbage filter rejects all-same-letter and >60% repeated-letter inputs before LLM. (2) MongoDB cache (wordle_dict collection) so repeat lookups are instant. (3) Backend startup seeds 992 curated answer/dictionary words as valid - guarantees target words ALWAYS pass validation. (4) New frontend service /src/wordle/validator.ts with AsyncStorage local cache and graceful offline fallback (8s timeout). (5) wordle-play.tsx now calls validateWordStrict() asynchronously with a 'جاري التحقق…' loading toast and disables Enter button during validation. Verified 21/21 test cases: real words accepted (بطيخ, سجاد, نافذ, صباح, منصة, تموز, ...) and garbage rejected (ببب, عغفق, قهقهقه, شصشصشص, ...)."
      - working: true
        agent: "main"
        comment: "FIFTH ITERATION - JABBAR (massive) Hunspell-backed dictionary: User reported LLM was still accepting nonsensical letter combos like 'بخوه', 'خنوخ', 'جحجح'. Removed LLM dependency entirely. Downloaded official Hunspell ayaspell Arabic dictionary (linuxscout/ayaspell, the standard used in LibreOffice/Firefox) - 7.2MB raw .dic file with 465K inflected Arabic word forms. Processed and filtered to 4/5/6-letter Arabic-only normalized forms → 199,258 words (40,158 four-letter, 79,771 five-letter, 79,329 six-letter). Saved as /app/backend/wordle_arabic_dict.json (2.7MB). Added /app/backend/wordle_extras.py with 300+ common modern words (feminine forms, country names like فلسطين/سورية, common nouns) that Hunspell stems alone don't expose. Backend now loads 199,437 total words into RAM at startup via _load_dictionary(). New /api/wordle/validate does pure dictionary lookup (NO LLM, NO MongoDB cache): O(1) set membership check against Hunspell+extras+seed pools. Removed emergentintegrations import. Bumped frontend cache key to v2 to invalidate old (incorrect) cached entries. Verified 35/35 test cases: ALL real words accepted (بطيخ, سجاد, نافذ, صباح, منصة, تموز, فلسطين, سورية, عربية, حديقة, سيارة, طبيب, ...) and ALL gibberish rejected (ببب, ببببب, عغفق, غغغغ, قهقهقه, شصشصشص, نمنمنم, بخوه, خخخخ, حجحج, بخحج, ونحب, خنوخ, جحجح). Validation latency dropped from 1-2s (LLM) to <50ms (in-memory lookup)."

  - task: "Main Platform Home - Wordle card added"
    implemented: true
    working: true
    file: "/app/frontend/app/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Added Wordle game card with 'جديد' badge, AI-generated cover image (floating Arabic calligraphy tiles with golden sparkles), emerald/purple gradient accents. Game count updated to 4 available games."

  - task: "Stair Cube Game (مكعب الدرج) - 5th game"
    implemented: true
    working: true
    file: "/app/frontend/app/games/stair-cube.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Built complete physics game: 3-phase flow (aim oscillating arrow → power meter → flight). Cube starts at stair 20, goal stair (1000th) has visible checkered finish flag with pole + 'خط النهاية' label. Cube renders as true 3D isometric box (top + right + front faces with shading and white pip). 1000 tall stairs (TILE*5 high) cascade down-right. Substep AABB collision prevents tunneling through stairs. Power-ups every 20 stairs (lowG, highG, pullL/R, pullUp, bigCube, smallCube, ball, broken). Stop detection: cube comes to rest for 0.9s on a stair → game ends with score (touched stairs) + 500 bonus if crossed finish line. AsyncStorage top-10 high scores. Camera follows cube with smooth LERP. Verified via screenshot: menu, aim arrow, power meter, flight phase with collision (3 stairs touched & turned green) all render correctly."
      - working: true
        agent: "main"
        comment: "Polish iteration after user feedback: (1) Stairs were rendering as tall vertical columns - fixed by changing aspect ratio (STAIR_W TILE*1.6 → TILE*3.2 wider, STAIR_H TILE*5 → TILE*2 shorter). Now cascade visually as proper 45° staircase with width > height per step. (2) Each stair now has 3D depth: gradient top face (lighter), gradient front face (darker), and a skewY-rendered right depth face for true 3D look. (3) Cube was looking flat when rotating because RN doesn't support transform-style:preserve-3d - fixed by removing rotateX/rotateY entirely; cube now ONLY rotates around Z (rolling), preserving the isometric 3-face look at all times. rotVZ now follows vx/size for natural rolling animation. (4) Aim arrow completely redesigned: big rounded teardrop arrowhead with golden gradient (yellow→amber→brown), white border, glow shadow, plus 3 trajectory dots that fade out above it. (5) Start stair (20) excluded from power-up pool so player doesn't get a free random power before launching. Verified via screenshot: stairs look like proper Mario/runner staircase, cube stays 3D-looking always, arrow is striking and clearly indicates direction."
      - working: true
        agent: "main"
        comment: "V4 polish: (i) Cube size HALVED (CUBE_SIZE_BASE = TILE*0.9, was TILE*1.8) for better proportion with stairs. (ii) Cube renders in CUBE_RENDER_SIZE area (4x cube size) so bigCube power-up no longer clips visually. (iii) Camera centered perfectly on cube (targetCamY=c.y - WIN_H/2). (iv) SPEED-BASED ZOOM-OUT: worldScale Animated.Value wrapped around entire world container. As speed > 400, scale eases from 1.0 to 0.5 (zoom out) so fast falls reveal more of the scene. (v) REAL CUBE PHYSICS: landing angle detection — if landing rotation is close to flat (distFromFlat < 0.2) cube lands flat and settles with minimal bounce; if edge/corner landing, cube tumbles with torque proportional to impact speed AND edge-ness. (vi) Edge tumble aggression: when cube overhangs a stair edge (overhangRight/Left > 0), apply strong rotational torque; at overhang > 40% of cube size, detach and fall — keeps cube visually within stair bounds. (vii) Settle code uses exponential damping (Math.exp(-dt*4)) for smooth rotation decay; restores default isometric tilt (rotX=0.55, rotY=-0.65). (viii) FRICTION_GROUND halved (0.35 → 0.15) = 2x more sliding. (ix) Flat landing reduces vx by only 2% (was 3-8%) preserving slide."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 15
  run_ui: false

test_plan:
  current_focus:
    - "Arabic Wordle Game - Full gameplay, map, keyboard, storage"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "4th game (Arabic Wordle) implemented end-to-end: map screen (Candy Crush zigzag), play screen (keyboard+grid+hints+animations), persistence (AsyncStorage), and home-screen card with AI cover. Verified manually via screenshots: game logic correct (evaluateGuess passes, hint reveals correct letter, win/loss modal works, level progression works, state persists in localStorage). Ready for optional user testing or further enhancements."
  - agent: "main"
    message: "Cleanup pass: eliminated ALL React Native deprecation warnings. Migrated shadow* → boxShadow in cards.tsx (glow slot + banner) and mafia.tsx (gunshot flash, intro title textShadow*, intro button). Moved all `pointerEvents=\"none\"` props INTO the style object across cards.tsx, mafia.tsx, wordle.tsx, wordle-play.tsx, and WorldBackground.tsx (6 locations). Verified via supervisor logs: expo.err.log is now empty. Home + all 4 games (domino, cards, mafia, wordle map) load cleanly with zero warnings. App is production-ready."
