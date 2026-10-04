# apuracao-2026
Live TSE 2026 election-count numbers by state, plus an extrapolation of the final result.

**Live dashboard:** https://plush-temple-8f4d.here.now/ (here.now slug `plush-temple-8f4d`)

The page (`site/index.html` + `site/app.js`, no build) fetches the official TSE JSONs straight from the
browser every 60 s (TSE echoes the request Origin in CORS) and shows president for Brazil, a state grid,
and president/governor/senator per state. The default view is the current TSE count only; a
"Resultado atual | Projeção" toggle (remembered in localStorage) switches to the projection of the final
1st-round result, clearly labelled as an estimate (projected numbers only, no winner/50% verdict text).

Candidate colours are keyed by ballot number: 13 (Lula) red, 22 (Flávio) blue, then the national 3rd/4th/5th
by counted votes green/amber/pink, everyone else grey. Each state tile's background is a stacked bar
(Flávio, Lula, 3rd-5th, grey remainder) with widths = % of valid votes in the state.

## Projection
For each state (and abroad, `zz`), the uncounted sections are assumed to vote like the counted ones:
every candidate's votes are scaled by `e.te / e.est` (total electorate ÷ electorate of counted sections).
The national president projection is the sum of the per-state projections, which corrects for big or
slow states being under-counted. Caveat: assumes uniform behaviour within each state.

## Snapshot script
Python stdlib only. Downloads president (BR + 27 UFs + zz), governor and senator (27 UFs) into
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
