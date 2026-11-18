const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const STORAGE_KEY = 'bet4fun-bets';
const initialBets = [{
  id: 'bet4fun-lakers-jazz-2026-11-18', date: '2026-11-18', eventAt: '2026-11-19T03:00:00.000Z', reviewAfter: '2026-11-19T06:00:00.000Z',
  event: 'Los Angeles Lakers – Utah Jazz', player: 'Quentin Grimes', sport: 'Baloncesto / NBA', type: 'Surebet', result: 'pending', actualProfit: 0, placed: true, promoEligible: false, promoStatus: 'none',
  legs: [
    { bookmaker: 'PokerStars', region: 'ES', selection: 'Superior a 3.5 Prórroga - asistencias', odds: 2.9, stake: 30, profit: 2, humanError: false, errorImpact: 0 },
    { bookmaker: 'Winamax', region: 'ES', selection: 'Inferior a 3.5 Prórroga - asistencias', odds: 1.58, stake: 55, profit: 1.9, humanError: false, errorImpact: 0 }
  ]
}];
let bets = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || initialBets;
bets = bets.map(bet => ({ ...bet, placed: bet.placed ?? true, promoEligible: bet.promoEligible ?? false, promoStatus: bet.promoStatus || (bet.promoEligible ? 'pending' : 'none'), legs: bet.legs.map(leg => ({ ...leg, humanError: leg.humanError ?? false, errorImpact: Number(leg.errorImpact || 0) })) }));
localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
let captureDbPromise;
let captureObjectUrls = [];
let pendingCaptureId = null;
let pendingCaptureName = '';

const money = value => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const openBet = bet => bet.result === 'pending';
const needsReview = bet => openBet(bet) && Date.now() >= new Date(bet.reviewAfter).getTime();
const totalStake = bet => bet.legs.reduce((sum, leg) => sum + Number(leg.stake || 0), 0);
const potential = bet => Math.min(...bet.legs.map(leg => Number(leg.profit || 0)));
const legsMarkup = bet => bet.legs.map(leg => {
  const code = leg.bookmaker.toLowerCase() === 'pokerstars' ? 'ps' : leg.bookmaker.toLowerCase() === 'winamax' ? 'wx' : 'bk';
  const mark = code === 'ps' ? 'PS' : code === 'wx' ? 'W' : escapeHtml(leg.bookmaker.slice(0, 2).toUpperCase());
  return `<div class="leg-line"><span class="book-logo ${code}">${mark}</span><div class="leg-copy"><b>${escapeHtml(leg.bookmaker)} <small>(${escapeHtml(leg.region || 'ES')})</small></b><span>${escapeHtml(leg.selection)}</span></div><span class="leg-odds">${Number(leg.odds).toFixed(3)}</span><span class="leg-stake">${money(leg.stake)}</span><span class="leg-profit">+${money(leg.profit)}</span></div>`;
}).join('');
const dayLabel = key => new Date(`${key}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = value => new Date(value).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function statusMarkup(bet) {
  if (bet.result === 'won') return `<span class="status-chip won">Ganadora · ${money(bet.actualProfit)}</span>`;
  if (bet.result === 'lost') return `<span class="status-chip lost">No ganadora · ${money(bet.actualProfit)}</span>`;
  if (bet.result === 'void') return '<span class="status-chip pending">Anulada</span>';
  if (needsReview(bet)) return `<span class="status-chip needs-review">Revisar ahora</span>`;
  return `<span class="status-chip pending">Evento · ${shortDate(bet.eventAt)}</span>`;
}
function reviewActions(bet) {
  if (!needsReview(bet)) return '';
  return `<div class="review-actions"><button data-review="won" data-id="${escapeHtml(bet.id)}">Ganadora</button><button data-review="lost" data-id="${escapeHtml(bet.id)}">No ganadora</button><button data-review="void" data-id="${escapeHtml(bet.id)}">Anulada</button></div>`;
}
function workflowMarkup(bet) {
  const placement = bet.placed ? `<span class="workflow-pill placed">Apuesta realizada ✓</span><button class="link-mini" data-placement="${escapeHtml(bet.id)}" data-value="false">Deshacer</button>` : `<button class="workflow-button" data-placement="${escapeHtml(bet.id)}" data-value="true">Marcar realizada</button>`;
  if (!bet.promoEligible) return `<div class="workflow-cell">${placement}<button class="link-mini" data-add-promo="${escapeHtml(bet.id)}">Vincular bono</button></div>`;
  let bonus = '';
  if (bet.promoStatus === 'received') bonus = `<span class="workflow-pill received">Freebet recibida ✓</span><button class="link-mini" data-promo="pending" data-id="${escapeHtml(bet.id)}">Deshacer resultado</button>`;
  else if (bet.promoStatus === 'not_received') bonus = `<span class="workflow-pill missed">No recibida</span><button class="link-mini" data-promo="pending" data-id="${escapeHtml(bet.id)}">Deshacer resultado</button>`;
  else bonus = bet.placed ? `<span class="workflow-pill waiting">Bono pendiente</span><div class="promo-actions"><button data-promo="received" data-id="${escapeHtml(bet.id)}">Recibido</button><button data-promo="not_received" data-id="${escapeHtml(bet.id)}">No recibido</button></div>` : '<span class="workflow-pill waiting">Marca primero la apuesta como realizada</span>';
  return `<div class="workflow-cell">${placement}<div class="bonus-workflow"><small>PROMO / FREEBET</small>${bonus}<button class="link-mini" data-remove-promo="${escapeHtml(bet.id)}">Quitar bono</button></div></div>`;
}
function rowMarkup(bet) {
  const isDue = needsReview(bet);
  const capture = bet.captureId ? `<button class="capture-link" data-open-capture="${escapeHtml(bet.captureId)}">Ver captura adjunta</button>` : '';
  return `<tr class="bet-row ${isDue ? 'due-row' : ''}"><td><div class="bet-title">${escapeHtml(bet.event)}</div><div class="bet-sub">${escapeHtml(bet.player)} · ${escapeHtml(bet.sport)} · ${shortDate(bet.eventAt)}</div>${capture}</td><td><span class="type-chip">${escapeHtml(bet.type)}</span></td><td><div class="legs-cell">${legsMarkup(bet)}</div>${reviewActions(bet)}</td><td class="amount">${money(totalStake(bet))}</td><td class="profit-positive">${openBet(bet) ? '+' + money(potential(bet)) : money(bet.actualProfit)}</td><td>${statusMarkup(bet)}</td><td>${workflowMarkup(bet)}</td></tr>`;
}
function bindBetActions() {
  $$('[data-review]').forEach(button => button.addEventListener('click', () => settleBet(button.dataset.id, button.dataset.review)));
  $$('[data-placement]').forEach(button => button.addEventListener('click', () => {
    const bet = bets.find(item => item.id === button.dataset.placement); if (bet) { bet.placed = button.dataset.value === 'true'; save(); }
  }));
  $$('[data-promo]').forEach(button => button.addEventListener('click', () => {
    const bet = bets.find(item => item.id === button.dataset.id); if (bet) { bet.promoStatus = button.dataset.promo; save(); }
  }));
  $$('[data-add-promo]').forEach(button => button.addEventListener('click', () => {
    const bet = bets.find(item => item.id === button.dataset.addPromo); if (bet) { bet.promoEligible = true; bet.promoStatus = 'pending'; save(); }
  }));
  $$('[data-remove-promo]').forEach(button => button.addEventListener('click', () => {
    const bet = bets.find(item => item.id === button.dataset.removePromo); if (bet) { bet.promoEligible = false; bet.promoStatus = 'none'; save(); }
  }));
  $$('[data-open-capture]').forEach(button => button.addEventListener('click', () => openLinkedCapture(button.dataset.openCapture)));
}
function renderRows() {
  const sorted = [...bets].sort((a, b) => b.date.localeCompare(a.date) || new Date(b.eventAt) - new Date(a.eventAt));
  const filtered = $('#filter-type')?.value || 'Todas';
  const visible = sorted.filter(b => filtered === 'Todas' || b.type === filtered);
  $('#recent-rows').innerHTML = sorted.slice(0, 5).map(rowMarkup).join('');
  $('#all-rows').innerHTML = visible.map(rowMarkup).join('');
  $('#empty-note').classList.toggle('visible', !sorted.length);
  $('#list-empty').classList.toggle('visible', !visible.length);
  $('#list-summary').textContent = `${visible.length} ${visible.length === 1 ? 'apuesta registrada' : 'apuestas registradas'}`;
}
function renderDays() {
  const grouped = new Map();
  [...bets].sort((a, b) => b.date.localeCompare(a.date)).forEach(bet => grouped.set(bet.date, [...(grouped.get(bet.date) || []), bet]));
  const entries = [...grouped.entries()];
  $('#day-groups').innerHTML = entries.length ? entries.map(([day, dayBets]) => {
    const possible = dayBets.filter(b => openBet(b) && !needsReview(b)).reduce((s, b) => s + potential(b), 0);
    return `<section class="day-group"><div class="day-group-head"><div><span class="day-date">${escapeHtml(dayLabel(day))}</span><small>${dayBets.length} ${dayBets.length === 1 ? 'surebet' : 'surebets'}</small></div><div class="day-potential"><small>BENEFICIO POTENCIAL</small><b>${money(possible)}</b></div></div>${dayBets.map(b => `<div class="day-bet"><span class="day-bet-mark">${b.type === 'Surebet' ? 'S' : 'F'}</span><div class="day-bet-title"><b>${escapeHtml(b.event)}</b><small>${escapeHtml(b.player)} · ${escapeHtml(b.sport)}</small></div><strong>${openBet(b) && !needsReview(b) ? '+' + money(potential(b)) : needsReview(b) ? 'VERIFICAR' : money(b.actualProfit)}</strong></div>`).join('')}</section>`;
  }).join('') : '<div class="empty-note visible">Todavía no hay apuestas registradas.</div>';
}
function renderNextEvent() {
  const next = bets.filter(openBet).sort((a, b) => new Date(a.reviewAfter) - new Date(b.reviewAfter))[0];
  if (!next) { $('#next-event').innerHTML = '<div class="empty-next">No hay apuestas pendientes de revisión.</div>'; return; }
  const due = needsReview(next);
  $('#next-event').innerHTML = `<div class="event-card ${due ? 'event-due' : ''}"><div class="event-card-top"><span class="event-sport">${escapeHtml(next.sport)}</span><span class="event-countdown">${due ? 'HORA DE REVISAR' : 'INICIO ' + shortDate(next.eventAt)}</span></div><h3>${escapeHtml(next.event)}</h3><p>${escapeHtml(next.player)} · ${next.legs.map(l => escapeHtml(l.bookmaker)).join(' / ')}</p><div class="event-review"><span>${due ? 'El evento ya debería haber terminado.' : 'Aviso de revisión previsto tras el partido.'}</span><b>${due ? '¡Revisar resultado!' : '⏱ ' + shortDate(next.reviewAfter)}</b></div>${reviewActions(next)}</div>`;
}
function renderData() {
  const houses = new Map(), sports = new Map();
  let legsCount = 0, errorLegs = 0, errorImpact = 0;
  bets.forEach(bet => {
    const sport = bet.sport || 'Sin especificar';
    const group = sports.get(sport) || { count: 0, potential: 0 };
    group.count += 1;
    if (openBet(bet) && !needsReview(bet)) group.potential += potential(bet);
    sports.set(sport, group);
    bet.legs.forEach(leg => {
      legsCount += 1;
      const house = houses.get(leg.bookmaker) || { count: 0, amount: 0 };
      house.count += 1; house.amount += Number(leg.stake || 0); houses.set(leg.bookmaker, house);
      if (leg.humanError) { errorLegs += 1; errorImpact += Number(leg.errorImpact || 0); }
    });
  });
  const houseList = [...houses.entries()].sort((a, b) => b[1].amount - a[1].amount);
  const sportList = [...sports.entries()].sort((a, b) => b[1].count - a[1].count);
  $('#bookmaker-count').textContent = houseList.length;
  $('#bookmaker-volume').textContent = money(bets.reduce((sum, bet) => sum + totalStake(bet), 0));
  $('#error-rate').innerHTML = `${legsCount ? (errorLegs / legsCount * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '0'}<span class="unit">%</span>`;
  $('#error-count').textContent = `${errorLegs} de ${legsCount} apuestas individuales con error`;
  $('#error-impact').textContent = money(errorImpact);
  $('#bookmaker-rows').innerHTML = houseList.map(([name, item]) => `<tr><td><span class="bookmaker-name">${escapeHtml(name)}</span></td><td>${item.count}</td><td class="amount">${money(item.amount)}</td><td><div class="data-share"><i style="width:${item.amount / Math.max(1, ...houseList.map(([, v]) => v.amount)) * 100}%"></i></div></td></tr>`).join('');
  $('#sport-rows').innerHTML = sportList.map(([sport, item]) => `<tr><td><span class="bookmaker-name">${escapeHtml(sport)}</span></td><td>${item.count}</td><td class="profit-positive">${money(item.potential)}</td></tr>`).join('');
  $('#bookmaker-empty').classList.toggle('visible', !houseList.length);
  $('#sport-empty').classList.toggle('visible', !sportList.length);
  const errors = bets.flatMap(bet => bet.legs.filter(leg => leg.humanError).map(leg => ({ bet, leg })));
  $('#error-history').innerHTML = errors.map(({ bet, leg }) => `<div class="error-row"><span class="error-mark small">!</span><div><b>${escapeHtml(leg.bookmaker)} · ${escapeHtml(leg.selection)}</b><small>${escapeHtml(bet.event)} · ${dayLabel(bet.date)}</small></div><strong>${money(leg.errorImpact)}</strong></div>`).join('');
  $('#error-empty').classList.toggle('visible', !errors.length);
}
function updateDashboard() {
  const today = todayKey(), todayBets = bets.filter(b => b.date === today);
  const potentialToday = todayBets.filter(b => openBet(b) && !needsReview(b)).reduce((s, b) => s + potential(b), 0);
  const pending = bets.filter(openBet).length;
  $('#total-profit').textContent = money(potentialToday);
  $('#pending-count').textContent = pending;
  $('#total-staked').textContent = money(todayBets.reduce((s, b) => s + totalStake(b), 0));
  $('#daily-count').textContent = todayBets.length;
  $('#promo-page-earned').textContent = money(bets.filter(b => b.type === 'Freebet' && b.result === 'won').reduce((s, b) => s + Number(b.actualProfit || 0), 0));
  $('#promo-count').textContent = bets.filter(b => b.type === 'Freebet').length;
  $('#bet-count').textContent = bets.length;
  renderRows(); renderDays(); renderNextEvent(); renderData(); bindBetActions();
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(bets)); updateDashboard(); }
function settleBet(id, result) {
  const bet = bets.find(b => b.id === id); if (!bet) return;
  let actualProfit = 0;
  if (result !== 'void') {
    const defaultValue = result === 'won' ? potential(bet) : -totalStake(bet);
    const answer = window.prompt('Introduce el beneficio neto real de esta surebet (€). Usa un importe negativo si hubo pérdida.', defaultValue.toFixed(2));
    if (answer === null || answer.trim() === '' || !Number.isFinite(Number(answer.replace(',', '.')))) return;
    actualProfit = Number(answer.replace(',', '.'));
  }
  bet.result = result; bet.actualProfit = actualProfit; bet.verifiedAt = new Date().toISOString(); save();
}
function openModal() {
  const form = $('#bet-form'); form.reset(); form.elements.date.value = todayKey();
  const soon = new Date(Date.now() + 3600000); soon.setMinutes(0, 0, 0);
  form.elements.eventAt.value = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}T${String(soon.getHours()).padStart(2, '0')}:00`;
  let hint = $('#capture-link-hint');
  if (!hint) { hint = document.createElement('div'); hint.id = 'capture-link-hint'; hint.className = 'form-hint capture-linked-hint'; form.prepend(hint); }
  hint.hidden = !pendingCaptureId;
  hint.textContent = pendingCaptureId ? `La captura «${pendingCaptureName}» quedará adjunta a esta apuesta.` : '';
  $('#modal').classList.add('open'); $('#modal').setAttribute('aria-hidden', 'false'); form.elements.event.focus();
}
function closeModal() { $('#modal').classList.remove('open'); $('#modal').setAttribute('aria-hidden', 'true'); pendingCaptureId = null; pendingCaptureName = ''; }
function showPage(name) {
  $$('.page').forEach(page => page.classList.toggle('active-page', page.id === `page-${name}`));
  $$('.nav-item').forEach(link => link.classList.toggle('active', link.dataset.page === name));
  $('#crumb-name').textContent = ({ dashboard: 'Resumen', apuestas: 'Mis apuestas', promos: 'Freebets', datos: 'Datos', capturas: 'Capturas' })[name] || 'Resumen';
  history.replaceState(null, '', `#${name}`);
  if (name === 'capturas') return renderCaptures();
}

$('#today').textContent = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
$$('.nav-item').forEach(link => link.addEventListener('click', e => { e.preventDefault(); showPage(link.dataset.page); }));
$$('[data-page-link]').forEach(link => link.addEventListener('click', () => showPage(link.dataset.pageLink)));
$$('[data-open-form]').forEach(button => button.addEventListener('click', openModal));
$('#close-modal').addEventListener('click', closeModal); $('#cancel-modal').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target === $('#modal')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('#bet-form').addEventListener('submit', e => {
  e.preventDefault(); const data = new FormData(e.currentTarget);
  const eventAt = new Date(data.get('eventAt'));
  const reviewAfter = new Date(eventAt.getTime() + 3 * 60 * 60 * 1000);
  const promoEligible = data.get('promoEligible') === 'yes';
  bets.push({ id: crypto.randomUUID(), date: data.get('date'), eventAt: eventAt.toISOString(), reviewAfter: reviewAfter.toISOString(), event: data.get('event').trim(), player: data.get('player').trim(), sport: data.get('sport').trim(), type: 'Surebet', result: 'pending', placed: data.get('placed') === 'yes', promoEligible, promoStatus: promoEligible ? 'pending' : 'none', captureId: pendingCaptureId, legs: [1, 2].map(i => ({ bookmaker: data.get(`bookmaker${i}`).trim(), region: 'ES', selection: data.get(`selection${i}`).trim(), odds: Number(data.get(`odds${i}`)), stake: Number(data.get(`stake${i}`)), profit: Number(data.get(`profit${i}`)), humanError: data.get(`error${i}`) === 'on', errorImpact: Number(data.get(`errorImpact${i}`) || 0) })) });
  save(); e.currentTarget.reset(); closeModal(); const toast = $('#toast'); toast.textContent = 'Surebet guardada'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400);
});
$('#filter-type').addEventListener('change', renderRows);
showPage(location.hash.slice(1) && $(`#page-${location.hash.slice(1)}`) ? location.hash.slice(1) : 'dashboard');
updateDashboard(); setInterval(updateDashboard, 30000);

function openCaptureDb() {
  if (captureDbPromise) return captureDbPromise;
  captureDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('bet4fun-local-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('screenshots', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  return captureDbPromise;
}
async function captureRequest(mode, action) {
  const db = await openCaptureDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('screenshots', mode), store = tx.objectStore('screenshots');
    let request;
    try { request = action(store); } catch (error) { reject(error); return; }
    if (request) { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }
    tx.oncomplete = () => { if (!request) resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}
async function renderCaptures() {
  const grid = $('#capture-grid'); if (!grid) return;
  try {
    const files = await captureRequest('readonly', store => store.getAll());
    captureObjectUrls.forEach(url => URL.revokeObjectURL(url)); captureObjectUrls = [];
    $('#capture-count').textContent = `${files.length} ${files.length === 1 ? 'archivo' : 'archivos'}`;
    $('#capture-empty').classList.toggle('visible', !files.length);
    grid.innerHTML = files.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(file => {
      const url = URL.createObjectURL(file.blob); captureObjectUrls.push(url);
      const linkedBet = bets.find(bet => bet.captureId === file.id);
      const action = linkedBet ? `<button class="capture-use linked" data-open-bet-capture="${escapeHtml(file.id)}">Adjunta a ${escapeHtml(linkedBet.event)}</button>` : `<button class="capture-use" data-incorporate-capture="${escapeHtml(file.id)}">Incorporar como apuesta</button>`;
      return `<article class="capture-card" data-capture-card="${escapeHtml(file.id)}"><img src="${url}" alt="Captura de ${escapeHtml(file.name)}"><div class="capture-info"><b title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</b><small>${shortDate(file.createdAt)}</small>${action}<button data-delete-capture="${escapeHtml(file.id)}" aria-label="Eliminar ${escapeHtml(file.name)}">Eliminar</button></div></article>`;
    }).join('');
    $$('[data-incorporate-capture]').forEach(button => button.addEventListener('click', async () => {
      const file = await captureRequest('readonly', store => store.get(button.dataset.incorporateCapture));
      if (!file) return;
      pendingCaptureId = file.id; pendingCaptureName = file.name; openModal();
    }));
    $$('[data-open-bet-capture]').forEach(button => button.addEventListener('click', () => openLinkedCapture(button.dataset.openBetCapture)));
    $$('[data-delete-capture]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.deleteCapture;
      bets.filter(bet => bet.captureId === id).forEach(bet => { bet.captureId = null; });
      save(); await captureRequest('readwrite', store => store.delete(id)); renderCaptures();
    }));
  } catch (error) {
    $('#capture-empty').textContent = 'No se pudieron cargar las capturas en este navegador.';
    $('#capture-empty').classList.add('visible');
  }
}
async function openLinkedCapture(id) {
  await showPage('capturas');
  const card = document.querySelector(`[data-capture-card="${CSS.escape(id)}"]`);
  if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('capture-highlight'); setTimeout(() => card.classList.remove('capture-highlight'), 1800); }
}
async function addCaptureFiles(fileList) {
  const files = [...fileList].filter(file => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type));
  for (const file of files) await captureRequest('readwrite', store => store.add({ id: crypto.randomUUID(), name: file.name, type: file.type, blob: file, createdAt: new Date().toISOString() }));
  if (files.length) { renderCaptures(); const toast = $('#toast'); toast.textContent = `${files.length} captura${files.length === 1 ? '' : 's'} guardada${files.length === 1 ? '' : 's'} en este navegador`; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); }
}
const fileInput = $('#screenshot-files'), uploadZone = $('#upload-zone');
$('#choose-captures').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { addCaptureFiles(fileInput.files); fileInput.value = ''; });
uploadZone.addEventListener('click', event => { if (event.target.closest('button')) return; fileInput.click(); });
uploadZone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); } });
uploadZone.addEventListener('dragover', event => { event.preventDefault(); uploadZone.classList.add('drag-active'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-active'));
uploadZone.addEventListener('drop', event => { event.preventDefault(); uploadZone.classList.remove('drag-active'); addCaptureFiles(event.dataTransfer.files); });

