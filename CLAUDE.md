# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

No build, bundler, transpiler, linter, or test framework — zero dependencies, no `package.json`. Verification is manual in a browser.

```bash
start index.html            # Windows: open directly (file:// works, no fetch/module loading)
python3 -m http.server 8000 # or any static server, then http://localhost:8000
```

There are no automated tests. After a change, load the page and check the DevTools console for errors, then exercise the affected path by hand (move/rotate near walls, line clear, level-up at 10 lines, hard drop, pause with `P`, game over + Restart button).

## Architecture

`game.js` is a plain non-module script (`'use strict'`, no IIFE) loaded at the end of `<body>`. Consequences:

- All state lives in one top-level `let` declaration (`board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId`). `init()` resets every field and is also the `restart-btn` handler — any new state field must be reset there or it leaks across games.
- DOM lookups (`getElementById`) run at parse time, so the `<script>` tag must stay after the markup, and every id it reads is a hard contract with `index.html`: `board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`.

### Piece / color encoding

A board cell holds `0` (empty) or `1–7`, and that number is simultaneously the piece type, the value baked into every cell of `PIECES[type]`, and the index into `COLORS`. Adding or reordering a piece means editing `PIECES`, `COLORS`, the cell values inside the shape matrix, and the `Math.random() * 7` range in `randomPiece()` together.

### Rendering

Two canvases, one shared `drawBlock(context, x, y, colorIndex, size, alpha)` used by both the board and the NEXT preview. `draw()` repaints everything each frame in order: grid, locked board, ghost (`alpha 0.2`), current piece. `drawNext()` centers the shape in a fixed 4×4 grid at `NB = 30`.

### Loop and pause

`loop()` is `requestAnimationFrame`-driven, accumulates `dt` into `dropAccum` and drops one row when it exceeds `dropInterval` (`dropAccum` is reset to `0`, not decremented). Pause and game over both `cancelAnimationFrame(animId)` and reuse the single `#overlay` element, swapping `#overlay-title` text between `PAUSA` and `GAME OVER`; visibility is toggled via the `hidden` class in `style.css`, not the HTML attribute. Resuming resets `lastTime` before re-entering `loop()` so the paused span isn't counted as elapsed time.

### Rotation

Not SRS. `rotateCW()` transposes + reverses, then `tryRotate()` tries horizontal kicks `[0, -1, 1, -2, 2]` and abandons the rotation if all collide. There is no floor kick and no wall-kick table per piece.

## Invariants

- `<canvas id="board">` `width`/`height` in `index.html` must equal `COLS * BLOCK` × `ROWS * BLOCK` (currently 300×600); `#next-canvas` must stay `4 * NB` square (120×120). Changing `COLS`, `ROWS`, or `BLOCK` requires editing the HTML attributes too.
- Level/speed are derived, never incremented: `level = floor(lines / 10) + 1` and `dropInterval = max(100, 1000 - (level - 1) * 90)`, both recomputed only inside `clearLines()`.
- `updateHUD()` is the only writer to the score panel; anything that mutates `score`, `lines`, or `level` must call it (the `keydown` handler calls it once at the end for all key actions).

## Conventions

All user-facing strings and README/code comments are Spanish; identifiers are English. Keep that split.
