// Tile-based level data and physics for "بطل بغداد".
// Tile size = 1 unit. Game world coords are in tiles.
// Rendered tiles scale to TILE_PX pixels.

export const TILE_PX = 36; // pixels per tile when rendered
export const GRAVITY = 38; // tiles/s^2
export const PLAYER_W = 0.85; // tiles
export const PLAYER_H = 1.15; // tiles
export const RUN_ACCEL = 22; // tiles/s^2
export const RUN_MAX = 7.5; // tiles/s
export const JUMP_VEL = -13; // tiles/s
export const FRICTION = 12;

// Tile types
export const T_EMPTY = 0;
export const T_GROUND = 1; // sand/dirt block
export const T_BRICK = 2;  // breakable terracotta brick
export const T_QUESTION = 3; // ? block (reveals slingshot or date)
export const T_PIPE_L = 4; // pipe left half
export const T_PIPE_R = 5; // pipe right half
export const T_FLAG = 6; // end-of-level flag pole
export const T_USED = 7; // used question/brick block

export type Enemy = {
  id: string;
  type: "fox" | "crow";
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  dir: 1 | -1;
};

export type Coin = {
  id: string;
  x: number;
  y: number;
  collected: boolean;
};

// Solid tiles block movement
export function isSolid(t: number): boolean {
  return t === T_GROUND || t === T_BRICK || t === T_QUESTION || t === T_USED || t === T_PIPE_L || t === T_PIPE_R;
}

export type Level = {
  width: number;
  height: number;
  tiles: number[][]; // [y][x]
  enemies: Enemy[];
  coins: Coin[];
  spawn: { x: number; y: number };
  flagX: number;
  // Where question blocks contain slingshot vs date
  slingshotBlocks: Array<{ x: number; y: number }>;
};

// Helper to build a level from a string map
function buildLevel(rows: string[], opts: {
  enemies: Enemy[];
  coins: Coin[];
  spawn: { x: number; y: number };
  slingshotBlocks: Array<{ x: number; y: number }>;
}): Level {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const tiles: number[][] = [];
  let flagX = width - 3;
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    const r = rows[y].padEnd(width, " ");
    for (let x = 0; x < width; x++) {
      const c = r[x];
      let t = T_EMPTY;
      if (c === "#") t = T_GROUND;
      else if (c === "B") t = T_BRICK;
      else if (c === "?") t = T_QUESTION;
      else if (c === "[") t = T_PIPE_L;
      else if (c === "]") t = T_PIPE_R;
      else if (c === "F") {
        t = T_EMPTY;
        flagX = x;
      }
      row.push(t);
    }
    tiles.push(row);
  }
  return {
    width,
    height,
    tiles,
    enemies: opts.enemies,
    coins: opts.coins,
    spawn: opts.spawn,
    flagX,
    slingshotBlocks: opts.slingshotBlocks,
  };
}

/**
 * Level 1 - "أزقة بغداد"
 * Wide horizontal level, ground floor with question blocks above,
 * a couple of pipes, some bricks, and a fox + crow.
 *
 * Legend:
 *  ' ' = empty
 *  '#' = solid ground
 *  'B' = breakable brick
 *  '?' = question block
 *  '[' = pipe left, ']' = pipe right
 *  'F' = flag position
 */
const L1_ROWS = [
  "                                                                                                                  ",
  "                                                                                                                  ",
  "                                                                                                                  ",
  "                                                                                                                  ",
  "                                                                                                                  ",
  "                                                                                                                  ",
  "                                                                                                                  ",
  "                          ?                                                                                       ",
  "                                                                                                                  ",
  "             ?BB?B           BBB?BB              ??B               B?B               ?BBB?                        ",
  "                                                                                                                  ",
  "                                                                                                                  ",
  "                                              []                                       []                         ",
  "                              []              []           []          [][]           [][]                       F",
  "##############     ###################################################################################################",
  "##############     ###################################################################################################",
];

// We need to compute slingshot block positions: first ? in each level gives slingshot.
// We'll mark the very first ? as slingshot, the rest as dates.
function findFirstQuestion(rows: string[]): { x: number; y: number } | null {
  for (let y = 0; y < rows.length; y++) {
    const idx = rows[y].indexOf("?");
    if (idx !== -1) return { x: idx, y };
  }
  return null;
}

const L1_FIRST_Q = findFirstQuestion(L1_ROWS)!;

export const LEVEL_1: Level = buildLevel(L1_ROWS, {
  spawn: { x: 2, y: 12 },
  enemies: [
    { id: "f1", type: "fox", x: 25, y: 13, vx: -1.5, vy: 0, alive: true, dir: -1 },
    { id: "c1", type: "crow", x: 50, y: 9, vx: -1.0, vy: 0, alive: true, dir: -1 },
    { id: "f2", type: "fox", x: 70, y: 13, vx: -1.5, vy: 0, alive: true, dir: -1 },
    { id: "c2", type: "crow", x: 90, y: 8, vx: -1.0, vy: 0, alive: true, dir: -1 },
    { id: "f3", type: "fox", x: 100, y: 13, vx: -1.5, vy: 0, alive: true, dir: -1 },
  ],
  coins: [
    { id: "co1", x: 14, y: 8, collected: false },
    { id: "co2", x: 17, y: 8, collected: false },
    { id: "co3", x: 30, y: 8, collected: false },
    { id: "co4", x: 33, y: 8, collected: false },
    { id: "co5", x: 36, y: 8, collected: false },
    { id: "co6", x: 50, y: 8, collected: false },
    { id: "co7", x: 53, y: 8, collected: false },
    { id: "co8", x: 70, y: 8, collected: false },
    { id: "co9", x: 73, y: 8, collected: false },
    { id: "co10", x: 90, y: 8, collected: false },
    { id: "co11", x: 92, y: 8, collected: false },
    { id: "co12", x: 94, y: 8, collected: false },
  ],
  slingshotBlocks: [L1_FIRST_Q], // first ? gives the slingshot
});

export const LEVELS: Level[] = [LEVEL_1];
