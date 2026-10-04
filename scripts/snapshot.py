#!/usr/bin/env python3
"""Download TSE 2026 1st-round results (president, governor, senator) for BR + every UF
into data/<timestamp>/, plus summary.json / summary.csv with a uniform-swing projection."""
import csv, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://resultados.tse.jus.br/oficial/ele2026"
UFS = "ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to".split()
RACES = [("presidente", "6257", "0001", ["br"] + UFS + ["zz"]),
         ("governador", "6259", "0003", UFS),
         ("senador", "6259", "0005", UFS)]


def num(s):
    return float(str(s).replace(",", ".")) if s not in (None, "") else 0.0


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "apuracao-2026"}), timeout=30) as r:
        return json.load(r)


def factor(d):
    """Scale counted -> full: electorate of all sections / electorate of counted sections."""
    est, te = num(d["e"]["est"]), num(d["e"]["te"])
    if est:
        return te / est
    st, ts = num(d["s"]["st"]), num(d["s"]["ts"])
    return ts / st if st else 0.0


def cands(d):
    out = [{"n": c["n"], "nome": c["nmu"], "votos": int(num(c["vap"])), "pct": num(c["pvap"]), "eleito": c["e"] == "s"}
           for a in d["carg"][0]["agr"] for p in a["par"] for c in p["cand"]]
    return sorted(out, key=lambda c: -c["votos"])


def main():
    out = os.path.join(os.path.dirname(__file__), "..", "data", time.strftime("%Y%m%d-%H%M%S"))
    os.makedirs(out, exist_ok=True)
    jobs = [(race, uf, f"{BASE}/{ele}/dados/{uf}/{uf}-c{cargo}-e00{ele}-u.json") for race, ele, cargo, ufs in RACES for uf in ufs]
    with ThreadPoolExecutor(4) as ex:
        docs = list(ex.map(lambda j: get(j[2]), jobs))
    rows = []
    for (race, uf, _), d in zip(jobs, docs):
        with open(os.path.join(out, f"{race}-{uf}.json"), "w") as f:
            json.dump(d, f, ensure_ascii=False)
        f = factor(d)
        cs = cands(d)
        for c in cs:
            c["proj"] = round(c["votos"] * f)
        rows.append({"uf": uf, "race": race, "gerado": f"{d['dg']} {d['hg']}", "pst": num(d["s"]["pst"]),
                     "eleitorado": int(num(d["e"]["te"])), "total": int(num(d["v"]["tv"])), "validos": int(num(d["v"]["vv"])),
                     "brancos": int(num(d["v"]["vb"])), "nulos": int(num(d["v"]["tvn"])), "fator": round(f, 4), "candidatos": cs})
    # national projected president = sum of UF + zz projections
    tot = {}
    for r in rows:
        if r["race"] == "presidente" and r["uf"] != "br":
            for c in r["candidatos"]:
                tot[c["nome"]] = tot.get(c["nome"], 0) + c["proj"]
    s = sum(tot.values()) or 1
    proj = sorted(({"nome": k, "proj": v, "pct_proj": round(100 * v / s, 2)} for k, v in tot.items()), key=lambda c: -c["proj"])
    with open(os.path.join(out, "summary.json"), "w") as f:
        json.dump({"rows": rows, "presidente_projecao_br": proj}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(out, "summary.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["uf", "race", "gerado", "pst", "eleitorado", "total", "validos", "brancos", "nulos", "fator",
                    "c1", "c1_pct", "c1_proj", "c2", "c2_pct", "c2_proj", "c3", "c3_pct", "c3_proj"])
        for r in rows:
            top = [x for c in r["candidatos"][:3] for x in (c["nome"], c["pct"], c["proj"])]
            w.writerow([r[k] for k in ("uf", "race", "gerado", "pst", "eleitorado", "total", "validos", "brancos", "nulos", "fator")] + top)
    br = next(r for r in rows if r["race"] == "presidente" and r["uf"] == "br")
    print(f"{out}: {len(rows)} files, BR {br['pst']}% apurado")
    for c, p in zip(br["candidatos"][:4], proj[:4]):
        print(f"  atual {c['nome']:<22} {c['pct']:6.2f}%   | projeção {p['nome']:<22} {p['pct_proj']:6.2f}%")


if __name__ == "__main__":
    sys.exit(main())
