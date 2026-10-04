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

function candRows(list, opts) {
  const max = Math.max(...list.map(c => opts.projPct ? Math.max(c.pct, c.ppct) : c.pct), 1);
  return `<div class="colh"><span>votos · % atual</span><span>${opts.projPct ? "projeção" : "proj. votos"}</span></div>` +
    list.map((c, i) => `<div class="cand">
      <span class="nm">${esc(c.nome)} <small>${esc(c.sg)}</small>${c.eleito ? '<span class="tag el">eleito</span>' : ""}</span>
      <span class="v">${fmt(c.votos)} · <b>${pct(c.pct)}</b></span>
      <span class="pj">${opts.projPct ? pct(c.ppct) : fmt(c.proj)}</span>
      <span class="bars">${opts.projPct ? `<i class="p" style="width:${c.ppct / max * 100}%"></i>` : ""}<i class="a" style="width:${c.pct / max * 100}%"></i></span>
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

function verdict(list, key) {
  const [a, b] = list;
  if (!a) return "";
  return a[key] > 50 ? `Projeção: ${esc(a.nome)} vence no 1º turno` : `Projeção: 2º turno entre ${esc(a.nome)} e ${esc(b?.nome ?? "?")}`;
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
  $("#br").innerHTML = `<h2>Presidente · Brasil</h2>${kpis(br)}
    <div class="verdict">${br.fim ? "Apuração encerrada" : verdict([...list].sort((a, b) => b.ppct - a.ppct), "ppct")}</div>
    <div class="note" style="margin-bottom:6px">Barra escura = % atual; barra clara = % projetado (soma das projeções por estado).${missing ? ` <b>${missing} estado(s) sem dados nesta rodada.</b>` : ""}</div>
    ${candRows(list, {projPct: true})}`;
}

function renderGrid() {
  const key = $("#sort").value;
  const ufs = UFS.filter(u => pres[u]).sort((a, b) => key === "uf" ? a.localeCompare(b) : key === "te" ? pres[b].te - pres[a].te : pres[a].pst - pres[b].pst);
  $("#grid").innerHTML = ufs.map(u => {
    const r = pres[u], l = r.cands[0];
    return `<button class="uf${u === sel ? " sel" : ""}" style="--p:${r.pst / 100}" data-uf="${u}">
      <b>${u.toUpperCase()}</b><span class="pc">${pct(r.pst)}</span>
      <span class="ld">${l ? esc(l.nome) + " " + l.pct.toFixed(1) + "%" : "—"}</span></button>`;
  }).join("");
}

function raceBlock(title, r) {
  if (!r) return `<div><h3>${title}</h3><div class="note">sem dados</div></div>`;
  let v = "";
  if (r.fim) v = "Apuração encerrada";
  else if (title === "Governador") v = verdict(r.cands, "pct");
  else if (title === "Senador") v = `Projeção (${r.vagas} vaga${r.vagas > 1 ? "s" : ""}): ` + r.cands.slice(0, r.vagas).map(c => esc(c.nome)).join(", ");
  return `<div><h3>${title} · ${pct(r.pst)} apurado</h3><div class="verdict">${v}</div>${candRows(r.cands, {projPct: false})}</div>`;
}

function renderUF() {
  const p = pres[sel], x = ufRaces[sel] || {};
  $("#ufbody").className = "";
  $("#ufbody").innerHTML = (p ? kpis(p) + `<div class="note">Fator de projeção: ×${p.f.toLocaleString("pt-BR", {maximumFractionDigits: 2})} (votos atuais → total esperado). Atualizado ${esc(p.hora)}.</div>` : "") +
    `<div class="cols">${raceBlock("Presidente", p)}${sel === "zz" ? "" : raceBlock("Governador", x.gov) + raceBlock("Senador", x.sen)}</div>`;
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
$("#grid").onclick = e => { const b = e.target.closest(".uf"); if (b) select(b.dataset.uf); };
refresh();
setInterval(refresh, REFRESH);
