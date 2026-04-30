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
        comment: "Built complete Arabic Wordle experience: 126 curated 4-letter words + 5/6-letter pools, deterministic level→word mapping (1000 levels), progressive difficulty. Core engine handles Arabic normalization (alef variants, hamza, diacritics) and classic wordle evaluation. 7 themed chapters (Garden/Desert/Sea/Mountain/Forest/Castle/Space) with custom colors and emoji. Candy-Crush style map with zigzag sin-wave path, stars, locked/unlocked states, pulsing current-level indicator. Play screen features: Arabic keyboard with 3 rows (RTL), 6-attempt grid with flip animations, shake on invalid, toasts, 2 hints per level that reveal random correct letter, win/loss modal with star earning (3/2/1 based on attempts) and confetti animation. AsyncStorage persistence: currentLevel, completed (with stars/attempts), totalStars, totalWins. Full flow tested via automated screenshots: typing, submitting, win modal with 3 stars, level advance to next level, map showing earned stars and chapter progress. AI-generated cover image using Gemini nano-banana."

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
