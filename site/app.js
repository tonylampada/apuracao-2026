// Apuração 2026 — reads TSE result JSONs directly (CORS is open) and projects the final count.
const BASE = "https://resultados.tse.jus.br/oficial/ele2026";
const UFS = "ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to zz".split(" ");
const NOMES = {ac:"Acre",al:"Alagoas",am:"Amazonas",ap:"Amapá",ba:"Bahia",ce:"Ceará",df:"Distrito Federal",es:"Espírito Santo",go:"Goiás",ma:"Maranhão",mg:"Minas Gerais",ms:"Mato Grosso do Sul",mt:"Mato Grosso",pa:"Pará",pb:"Paraíba",pe:"Pernambuco",pi:"Piauí",pr:"Paraná",rj:"Rio de Janeiro",rn:"Rio Grande do Norte",ro:"Rondônia",rr:"Roraima",rs:"Rio Grande do Sul",sc:"Santa Catarina",se:"Sergipe",sp:"São Paulo",to:"Tocantins",zz:"Exterior"};
const REFRESH = 60_000;

const $ = s => document.querySelector(s);
const num = s => s == null || s === "" ? 0 : parseFloat(String(s).replace(",", "."));
const fmt = n => Math.round(n).toLocaleString("pt-BR");
const pct = n => n.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + "%";
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const url = (ele, cargo, uf) => `${BASE}/${ele}/dados/${uf}/${uf}-c${cargo}-e00${ele}-u.json`;

async function get(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.json();
}

// Normalise one TSE race file. Projection factor = total electorate / electorate of counted sections.
function parse(d) {
  const te = num(d.e.te), est = num(d.e.est), ts = num(d.s.ts), st = num(d.s.st);
  const f = est ? te / est : st ? ts / st : 0;
  const cands = [];
  for (const a of d.carg[0].agr) for (const p of a.par) for (const c of p.cand)
    cands.push({n: c.n, nome: c.nmu, sg: p.sg, votos: num(c.vap), pct: num(c.pvap), eleito: c.e === "s", proj: num(c.vap) * f});
  cands.sort((a, b) => b.votos - a.votos);
  return {uf: d.cdabr, pst: num(d.s.pst), te, f, tv: num(d.v.tv), vv: num(d.v.vv), vb: num(d.v.vb), tvn: num(d.v.tvn),
          vagas: +d.carg[0].nv || 1, fim: d.tf === "s", hora: `${d.dg} ${d.hg}`, cands};
}

let pres = {};          // uf -> parsed president
const ufRaces = {};     // uf -> {gov, sen, t}
let sel = (location.hash.slice(1) || "sp").toLowerCase();
if (!UFS.includes(sel)) sel = "sp";

let mode = "atual";     // "atual" = TSE numbers only; "proj" = projection of the final 1st-round result
try { if (localStorage.getItem("modo") === "proj") mode = "proj"; } catch {}
const P = () => mode === "proj";

// Candidate colours by ballot number (captain's call): 13 Lula red, 22 Flávio blue, then the national 3rd/4th/5th
// by counted votes green/amber/pink; everyone else grey.
const CURTO = {13: "Lula", 22: "Flávio", 14: "Renan Santos"};
const curto = c => CURTO[c.n] || c.nome.split(" ").pop().toLowerCase().replace(/^./, s => s.toUpperCase());
const top5 = () => ["13", "22", ...(pres.br?.cands ?? []).map(c => c.n).filter(n => n !== "13" && n !== "22").slice(0, 3)];
const COR = ["var(--c13)", "var(--c22)", "var(--c3)", "var(--c4)", "var(--c5)"];
const cor = n => COR[top5().indexOf(n)] || "";
const cc = n => cor(n) ? ` style="--cc:${cor(n)}"` : "";

// Current mode: votes and % as TSE reports. Projection mode: projected figure first, current beside it, labelled.
function candRows(list, opts) {
  const proj = P();   // bar widths are absolute % of valid votes on a 0-100 scale
  const head = proj ? `<div class="colh"><span>atual (TSE): votos · %</span><span>${opts.projPct ? "% projetado" : "votos projetados"}</span></div>` : "";
  return head + list.map(c => `<div class="cand">
      <span class="nm"${cc(c.n)}>${cor(c.n) ? '<i class="sw"></i>' : ""}${esc(c.nome)} <small>${esc(c.sg)}</small>${c.eleito ? '<span class="tag el">eleito</span>' : ""}</span>
      <span class="v">${proj ? '<small class="lab">atual</small> ' : ""}${fmt(c.votos)} · <b>${pct(c.pct)}</b></span>
      ${proj ? `<span class="pj"><small class="lab">projetado</small> ${opts.projPct ? pct(c.ppct) : fmt(c.proj)}</span>` : "<span></span>"}
      <span class="bars"${opts.color ? cc(c.n) : ""}>${proj && opts.projPct ? `<i class="p" style="width:${c.ppct}%"></i>` : ""}<i class="a${proj ? "" : " full"}" style="width:${c.pct}%"></i></span>
    </div>`).join("");
}

function kpis(r) {
  return `<div class="kpis">
    <div class="kpi"><b>${pct(r.pst)}</b><span>seções apuradas</span></div>
    <div class="kpi"><b>${fmt(r.vv)}</b><span>válidos</span></div>
    <div class="kpi"><b>${pct(r.tv ? r.vb / r.tv * 100 : 0)}</b><span>brancos (${fmt(r.vb)})</span></div>
    <div class="kpi"><b>${pct(r.tv ? r.tvn / r.tv * 100 : 0)}</b><span>nulos (${fmt(r.tvn)})</span></div>
  </div><div class="prog"><i style="width:${r.pst}%"></i></div>`;
}

function renderBR() {
  const br = pres.br;
  if (!br) return;
  // national projection = sum of projected votes across UFs + abroad
  const tot = {};
  for (const uf of UFS) for (const c of pres[uf]?.cands ?? []) tot[c.n] = (tot[c.n] || 0) + c.proj;
  const sum = Object.values(tot).reduce((a, b) => a + b, 0) || 1;
  const list = br.cands.map(c => ({...c, ppct: (tot[c.n] || 0) / sum * 100}));
  const missing = UFS.filter(u => !pres[u]).length;
  const v = br.fim ? "Apuração encerrada" : "";
  $("#br").innerHTML = `<h2>Presidente · Brasil</h2>${kpis(br)}
    ${v ? `<div class="verdict">${v}</div>` : ""}
    ${P() ? `<div class="note" style="margin-bottom:6px">Barra escura = % atual; barra clara = % projetado (soma das projeções por estado).${missing ? ` <b>${missing} estado(s) sem dados nesta rodada.</b>` : ""}</div>` : ""}
    ${candRows(list, {projPct: true, color: true})}`;
}

function renderGrid() {
  const key = $("#sort").value;
  const ufs = UFS.filter(u => pres[u]).sort((a, b) => key === "uf" ? a.localeCompare(b) : key === "te" ? pres[b].te - pres[a].te : pres[a].pst - pres[b].pst);
  const t = top5();
  $("#leg").innerHTML = ["22", "13", ...t.slice(2)].map(n => pres.br.cands.find(c => c.n === n)).filter(Boolean)
    .map(c => `<span${cc(c.n)}><i></i>${esc(curto(c))}</span>`).join("") + `<span><i></i>outros</span>` + `<span style="color:var(--mut)">${P() ? "% projetado" : "% dos válidos"} no estado</span>`;
  $("#grid").innerHTML = ufs.map(u => {
    const r = pres[u], l = r.cands[0];
    // within a state every candidate is scaled by the same factor, so projected % == current %
    // the tile is a stacked bar: Flávio, Lula, national 3rd-5th left to right, grey remainder = everyone else
    let x = 0;
    const seg = ["22", "13", ...t.slice(2)].map(n => r.cands.find(c => c.n === n)).filter(Boolean)
      .map(c => `${cor(c.n)} ${x}% ${x = Math.min(100, x + c.pct)}%`);
    const tip = r.cands.filter(c => cor(c.n)).map(c => `${curto(c)} ${pct(c.pct)}`).join(" · ");
    return `<button class="uf${u === sel ? " sel" : ""}" style="background:linear-gradient(90deg,${[...seg, `var(--tg) ${x}% 100%`].join(",")})" data-uf="${u}" title="${esc(tip)}">
      <b>${u.toUpperCase()}</b><span class="pc">${pct(r.pst)}</span>
      <span class="ld">${l ? esc(curto(l)) + " " + pct(l.pct) : "—"}</span></button>`;
  }).join("");
}

function raceBlock(title, r, color) {
  if (!r) return `<div><h3>${title}</h3><div class="note">sem dados</div></div>`;
  const v = r.fim ? "Apuração encerrada" : "";
  return `<div><h3>${title} · ${pct(r.pst)} apurado</h3>${v ? `<div class="verdict">${v}</div>` : ""}${candRows(r.cands, {projPct: false, color})}</div>`;
}

function renderUF() {
  const p = pres[sel], x = ufRaces[sel] || {};
  $("#ufbody").className = "";
  $("#ufbody").innerHTML = (p ? kpis(p) + (P() ? `<div class="note">Fator de projeção: ×${p.f.toLocaleString("pt-BR", {maximumFractionDigits: 2})} (votos atuais → total esperado). Atualizado ${esc(p.hora)}.</div>` : "") : "") +
    `<div class="cols">${raceBlock("Presidente", p, true)}${sel === "zz" ? "" : raceBlock("Governador", x.gov) + raceBlock("Senador", x.sen)}</div>`;
}

async function loadUF(uf) {
  if (uf === "zz") return;
  const c = ufRaces[uf];
  if (c && Date.now() - c.t < REFRESH - 5000) return;
  const [g, s] = await Promise.allSettled([get(url("6259", "0003", uf)), get(url("6259", "0005", uf))]);
  ufRaces[uf] = {gov: g.value && parse(g.value), sen: s.value && parse(s.value), t: Date.now()};
}

async function refresh() {
  $("#status").textContent = "atualizando…";
  const res = await Promise.allSettled(["br", ...UFS].map(u => get(url("6257", "0001", u))));
  let fails = 0;
  res.forEach(r => r.status === "fulfilled" ? (pres[r.value.cdabr] = parse(r.value)) : fails++);
  await loadUF(sel).catch(() => fails++);
  renderBR(); renderGrid(); renderUF();
  const st = $("#status");
  st.className = fails ? "err" : "";
  st.textContent = `TSE: ${pres.br?.hora ?? "?"} · lido às ${new Date().toLocaleTimeString("pt-BR")}` + (fails ? ` · ${fails} falha(s)` : "") + " · atualiza a cada 60 s";
}

function select(uf) {
  sel = uf; history.replaceState(null, "", "#" + uf); $("#uf").value = uf;
  renderGrid(); renderUF();
  loadUF(uf).then(renderUF, () => {});
}

$("#uf").innerHTML = UFS.map(u => `<option value="${u}">${u.toUpperCase()} — ${NOMES[u]}</option>`).join("");
$("#uf").value = sel;
$("#uf").onchange = e => select(e.target.value);
$("#sort").onchange = renderGrid;
function setMode(m) {
  mode = m;
  try { localStorage.setItem("modo", m); } catch {}
  document.body.classList.toggle("proj", m === "proj");
  document.querySelectorAll("#modo button").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === m));
  if (pres.br) { renderBR(); renderGrid(); renderUF(); }
}
$("#modo").onclick = e => { const b = e.target.closest("button"); if (b) setMode(b.dataset.m); };
setMode(mode);
$("#grid").onclick = e => { const b = e.target.closest(".uf"); if (b) select(b.dataset.uf); };
refresh();
setInterval(refresh, REFRESH);
