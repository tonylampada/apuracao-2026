# apuracao-2026
Live TSE 2026 election-count numbers by state, plus an extrapolation of the final result.

**Live dashboard:** https://plush-temple-8f4d.here.now/ (here.now slug `plush-temple-8f4d`)

The page (`site/index.html` + `site/app.js`, no build) fetches the official TSE JSONs straight from the
browser every 60 s (TSE echoes the request Origin in CORS). Two tabs, one per round:

- **2º turno** (default, 2026-10-25; codes 6258 president / 6260 governor): Flávio vs Lula headline, state grid,
  president per state and governor only where there is a runoff (AC, AM, DF, ES, RN, TO; every other UF's
  `-c0003-e006260` file is 404). No senate. While every file has 0 votes (before polls close at 17h) the page
  shows a "apuração começa às 17h" waiting state.
- **1º turno** (codes 6257 / 6259): president, governor and senator, unchanged.

Each tab has its own "Resultado atual | Projeção" toggle (remembered per tab in localStorage). The default view is
the current TSE count only; projection mode shows the projected final result, clearly labelled as an estimate
(projected numbers only, no winner/50% verdict text).

Candidate colours are keyed by ballot number: 13 (Lula) red, 22 (Flávio) blue, then (1st round) the national
3rd/4th/5th by counted votes green/amber/pink, everyone else grey. Each state tile's background is a stacked bar
(Flávio, Lula, 3rd-5th, grey remainder) with widths = % of valid votes in the state.

## Projection
For each state (and abroad, `zz`), the uncounted sections are assumed to vote like the counted ones:
every candidate's votes are scaled by `e.te / e.est` (total electorate ÷ electorate of counted sections).
The national president projection is the sum of the per-state projections, which corrects for big or
slow states being under-counted. Caveat: assumes uniform behaviour within each state.

## Snapshot script
1st round only. Python stdlib only. Downloads president (BR + 27 UFs + zz), governor and senator (27 UFs) into
`data/<timestamp>/` with `summary.json` / `summary.csv` (uf, race, % counted, totals, top candidates, projection).

```sh
python3 scripts/snapshot.py
```

## Run locally / publish
```sh
python3 -m http.server -d site 8000            # http://localhost:8000
~/.claude/skills/here-now/scripts/publish.sh site --slug plush-temple-8f4d   # update the live page
```
When `app.js` changes, bump the `?v=` in `site/index.html` (here.now caches JS for 1h).
