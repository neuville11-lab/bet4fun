
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
const monthKeyNow = () => todayKey().slice(0, 7);
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
function sportEmoji(sport) {
  const name = String(sport || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/baloncesto|basket|nba/.test(name)) return '🏀';
  if (/futbol americano|nfl|american football/.test(name)) return '🏈';
  if (/futbol|football|soccer|liga|laliga/.test(name)) return '⚽';
  if (/tenis|tennis/.test(name)) return '🎾';
  if (/beisbol|baseball|mlb/.test(name)) return '⚾';
  if (/hockey|nhl/.test(name)) return '🏒';
  if (/rugby/.test(name)) return '🏉';
  if (/voleibol|volleyball/.test(name)) return '🏐';
  if (/balonmano|handball/.test(name)) return '🤾';
  if (/golf/.test(name)) return '⛳';
  if (/boxeo|boxing|mma|ufc/.test(name)) return '🥊';
  if (/motor|formula|f1|moto/.test(name)) return '🏎️';
  if (/ciclismo|cycling/.test(name)) return '🚴';
  if (/natacion|swimming/.test(name)) return '🏊';
  if (/esport|e-sport|gaming/.test(name)) return '🎮';
  if (/atletismo|running/.test(name)) return '🏃';
  return '🏆';
}

function statusMarkup(bet) {
  if (bet.legs.some(leg => leg.outcome)) {
    const winners = bet.legs.filter(leg => leg.outcome === 'won').map(leg => leg.bookmaker);
    const summary = winners.length ? `Ganada en: ${winners.join(', ')}` : bet.legs.every(leg => leg.outcome === 'void') ? 'Todas las apuestas anuladas' : 'No ganada en ninguna casa';
    return `<span class="status-chip ${bet.result === 'won' ? 'won' : bet.result === 'lost' ? 'lost' : 'pending'}">Resultado · ${money(bet.actualProfit)}</span><small class="analysis-summary">${escapeHtml(summary)}</small>`;
  }
  if (bet.result === 'won') return `<span class="status-chip won">Ganadora · ${money(bet.actualProfit)}</span>`;
  if (bet.result === 'lost') return `<span class="status-chip lost">No ganadora · ${money(bet.actualProfit)}</span>`;
  if (bet.result === 'void') return '<span class="status-chip pending">Anulada</span>';
  if (needsReview(bet)) return `<span class="status-chip needs-review">Revisar ahora</span>`;
  return `<span class="status-chip pending">Evento · ${shortDate(bet.eventAt)}</span>`;
}
function reviewActions(bet) {
  if (!needsReview(bet) && !bet.legs.some(leg => leg.outcome)) return '';
  return `<div class="review-actions"><button data-analyze="${escapeHtml(bet.id)}">${bet.legs.some(leg => leg.outcome) ? 'Editar análisis' : 'Analizar apuesta'}</button></div>`;
}
function workflowMarkup(bet) {
  const id = escapeHtml(bet.id), freebet = Boolean(bet.promoEligible), received = freebet && bet.promoStatus === 'received';
  return `<div class="workflow-cell"><div class="promo-square-wrap"><button type="button" class="promo-square fb-square ${freebet ? 'selected' : ''}" role="checkbox" aria-checked="${freebet}" aria-label="${freebet ? 'Freebet marcada' : 'Marcar freebet'}" title="Marcar si esta apuesta genera una freebet" data-toggle-fb="${id}">FB</button><button type="button" class="promo-square tick-square ${received ? 'selected' : ''}" role="checkbox" aria-checked="${received}" aria-label="${received ? 'Freebet cobrada' : 'Marcar freebet como cobrada'}" title="Marcar cuando se haya cobrado la freebet" data-toggle-fb-received="${id}" ${freebet ? '' : 'disabled'}>✓</button></div></div>`;
}
function rowMarkup(bet) {
  const isDue = needsReview(bet);
  const capture = bet.captureId ? `<button class="capture-link" data-open-capture="${escapeHtml(bet.captureId)}">Ver captura adjunta</button>` : '';
  const noteButton = `<button class="bet-note-button" data-edit-note="${escapeHtml(bet.id)}">${bet.note ? 'Editar nota' : '＋ Añadir nota'}${bet.note ? '<span class="note-saved-mark" aria-label="Tiene una nota">●</span>' : ''}</button>`;
  return `<tr class="bet-row ${isDue ? 'due-row' : ''}"><td><div class="bet-title">${escapeHtml(bet.event)}</div><div class="bet-sub">${escapeHtml(bet.player)} · <span class="sport-label"><span aria-hidden="true">${sportEmoji(bet.sport)}</span> ${escapeHtml(bet.sport)}</span> · ${shortDate(bet.eventAt)}</div><div class="bet-row-tools">${capture}${noteButton}</div></td><td><span class="type-chip">${escapeHtml(bet.type)}</span></td><td><div class="legs-cell">${legsMarkup(bet)}</div>${reviewActions(bet)}</td><td class="amount">${money(totalStake(bet))}</td><td class="profit-positive">${openBet(bet) ? '+' + money(potential(bet)) : money(bet.actualProfit)}</td><td>${statusMarkup(bet)}</td><td>${workflowMarkup(bet)}</td></tr>`;
}
function bindBetActions() {
  $$('[data-review]').forEach(button => button.addEventListener('click', () => settleBet(button.dataset.id, button.dataset.review)));
  $$('[data-analyze]').forEach(button => button.addEventListener('click', () => analyzeBet(button.dataset.analyze)));
  $$('[data-toggle-fb]').forEach(button => button.addEventListener('click', () => {
    const bet = bets.find(item => item.id === button.dataset.toggleFb); if (!bet) return;
    bet.promoEligible = !bet.promoEligible; bet.promoStatus = bet.promoEligible ? 'pending' : 'none'; save();
  }));
  $$('[data-toggle-fb-received]').forEach(button => button.addEventListener('click', () => {
    const bet = bets.find(item => item.id === button.dataset.toggleFbReceived); if (!bet || !bet.promoEligible) return;
    bet.promoStatus = bet.promoStatus === 'received' ? 'pending' : 'received'; save();
  }));
  $$('[data-open-capture]').forEach(button => button.addEventListener('click', () => openLinkedCapture(button.dataset.openCapture)));
  $$('[data-edit-note]').forEach(button => button.addEventListener('click', () => editBetNote(button.dataset.editNote)));
}
function editBetNote(id) {
  const bet = bets.find(item => item.id === id); if (!bet) return;
  const backdrop = document.createElement('div'); backdrop.className = 'analysis-backdrop';
  backdrop.innerHTML = `<section class="analysis-modal note-modal" role="dialog" aria-modal="true" aria-labelledby="note-title"><div class="modal-head"><div><div class="eyebrow">APUNTE PERSONAL</div><h2 id="note-title">${escapeHtml(bet.event)}</h2></div><button type="button" class="close-button" data-close-note aria-label="Cerrar">×</button></div><p class="analysis-help">Anota lo que quieras recordar: cómo preparaste la surebet, incidencias o algo que quieras revisar más adelante.</p><form class="note-form"><label for="bet-note-text">Nota</label><textarea id="bet-note-text" maxlength="1200" placeholder="Escribe una nota para esta apuesta…">${escapeHtml(bet.note || '')}</textarea><div class="form-actions">${bet.note ? '<button type="button" class="danger-button" data-delete-note>Eliminar nota</button>' : ''}<button type="button" class="secondary-button" data-close-note>Cancelar</button><button type="submit" class="primary-button">Guardar nota</button></div></form></section>`;
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelectorAll('[data-close-note]').forEach(button => button.addEventListener('click', close));
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  backdrop.querySelector('[data-delete-note]')?.addEventListener('click', () => { bet.note = ''; bet.noteCreatedAt = ''; close(); save(); });
  backdrop.querySelector('form').addEventListener('submit', event => {
    event.preventDefault(); const value = backdrop.querySelector('textarea').value.trim();
    if (!value) { backdrop.querySelector('textarea').focus(); return; }
    if (!bet.note) { bet.noteCreatedAt = new Date().toISOString(); bet.noteMonth = monthKeyNow(); }
    bet.note = value; close(); save();
  });
  backdrop.querySelector('textarea').focus();
}
function analyzeBet(id) {
  const bet = bets.find(item => item.id === id); if (!bet) return;
  const backdrop = document.createElement('div'); backdrop.className = 'analysis-backdrop';
  backdrop.innerHTML = `<section class="analysis-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-title"><div class="modal-head"><div><div class="eyebrow">REVISIÓN DE RESULTADO</div><h2 id="analysis-title">${escapeHtml(bet.event)}</h2></div><button type="button" class="close-button" data-close-analysis aria-label="Cerrar">×</button></div><p class="analysis-help">Indica el resultado de cada selección. La plataforma calculará en qué casa se ganó y el beneficio neto. No consulta automáticamente las casas de apuestas.</p><form class="analysis-form">${bet.legs.map((leg, index) => `<label class="analysis-leg"><span><b>${escapeHtml(leg.bookmaker)}</b><small>${escapeHtml(leg.selection)}</small></span><select name="outcome-${index}" required><option value="">Selecciona resultado</option><option value="won" ${leg.outcome === 'won' ? 'selected' : ''}>Ganada</option><option value="lost" ${leg.outcome === 'lost' ? 'selected' : ''}>No ganada</option><option value="void" ${leg.outcome === 'void' ? 'selected' : ''}>Anulada</option></select></label>`).join('')}<div class="form-actions"><button type="button" class="secondary-button" data-close-analysis>Cancelar</button><button type="submit" class="primary-button">Guardar análisis</button></div></form></section>`;
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelectorAll('[data-close-analysis]').forEach(button => button.addEventListener('click', close));
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  backdrop.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const outcomes = bet.legs.map((leg, index) => backdrop.querySelector(`[name="outcome-${index}"]`).value);
    if (outcomes.some(outcome => !outcome)) return;
    let actualProfit = 0;
    bet.legs.forEach((leg, index) => {
      leg.outcome = outcomes[index];
      const stake = Number(leg.stake || 0), odds = Number(leg.odds || 0);
      if (leg.outcome === 'won') actualProfit += stake * (odds - 1);
      else if (leg.outcome === 'lost') actualProfit -= stake;
    });
    bet.actualProfit = Number(actualProfit.toFixed(2));
    bet.result = outcomes.every(outcome => outcome === 'void') ? 'void' : outcomes.includes('won') ? (actualProfit >= 0 ? 'won' : 'lost') : 'lost';
    bet.verifiedAt = new Date().toISOString();
    close(); save();
  });
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
    return `<section class="day-group"><div class="day-group-head"><div><span class="day-date">${escapeHtml(dayLabel(day))}</span><small>${dayBets.length} ${dayBets.length === 1 ? 'surebet' : 'surebets'}</small></div><div class="day-potential"><small>BENEFICIO POTENCIAL</small><b>${money(possible)}</b></div></div>${dayBets.map(b => `<div class="day-bet"><span class="day-bet-mark">${b.type === 'Surebet' ? 'S' : 'F'}</span><div class="day-bet-title"><b><span class="sport-emoji" aria-hidden="true">${sportEmoji(b.sport)}</span>${escapeHtml(b.event)}</b><small>${escapeHtml(b.player)} · ${escapeHtml(b.sport)}</small></div><strong>${openBet(b) && !needsReview(b) ? '+' + money(potential(b)) : needsReview(b) ? 'VERIFICAR' : money(b.actualProfit)}</strong></div>`).join('')}</section>`;
  }).join('') : '<div class="empty-note visible">Todavía no hay apuestas registradas.</div>';
}
function renderNextEvent() {
  const next = bets.filter(openBet).sort((a, b) => new Date(a.reviewAfter) - new Date(b.reviewAfter))[0];
  if (!next) { $('#next-event').innerHTML = '<div class="empty-next">No hay apuestas pendientes de revisión.</div>'; return; }
  const due = needsReview(next);
  $('#next-event').innerHTML = `<div class="event-card ${due ? 'event-due' : ''}"><div class="event-card-top"><span class="event-sport"><span aria-hidden="true">${sportEmoji(next.sport)}</span> ${escapeHtml(next.sport)}</span><span class="event-countdown">${due ? 'HORA DE REVISAR' : 'INICIO ' + shortDate(next.eventAt)}</span></div><h3>${escapeHtml(next.event)}</h3><p>${escapeHtml(next.player)} · ${next.legs.map(l => escapeHtml(l.bookmaker)).join(' / ')}</p><div class="event-review"><span>${due ? 'El evento ya debería haber terminado.' : 'Aviso de revisión previsto tras el partido.'}</span><b>${due ? '¡Revisar resultado!' : '⏱ ' + shortDate(next.reviewAfter)}</b></div>${reviewActions(next)}</div>`;
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
  const maxHouseAmount = Math.max(1, ...houseList.map(([, item]) => item.amount));
  $('#bookmaker-chart').innerHTML = houseList.map(([name, item]) => `<div class="visual-bar-row"><div class="visual-bar-head"><b>${escapeHtml(name)}</b><strong>${money(item.amount)}</strong></div><div class="visual-bar-track"><i class="house-bar" style="width:${Math.max(2, item.amount / maxHouseAmount * 100)}%"></i></div><small>${item.count} ${item.count === 1 ? 'apuesta individual' : 'apuestas individuales'}</small></div>`).join('');
  $('#sport-chart').innerHTML = sportList.map(([sport, item]) => `<div class="visual-bar-row"><div class="visual-bar-head"><b><span class="sport-emoji" aria-hidden="true">${sportEmoji(sport)}</span>${escapeHtml(sport)}</b><strong>${item.count} ${item.count === 1 ? 'apuesta' : 'apuestas'}</strong></div><div class="visual-bar-track"><i class="sport-bar" style="width:${Math.max(3, item.count / Math.max(1, ...sportList.map(([, value]) => value.count)) * 100)}%"></i></div><small>Beneficio potencial ${money(item.potential)}</small></div>`).join('');
  const errorRate = legsCount ? errorLegs / legsCount * 100 : 0;
  $('#error-donut').style.setProperty('--error-rate', `${errorRate}%`);
  $('#error-donut').setAttribute('aria-label', `${errorRate.toLocaleString('es-ES', { maximumFractionDigits: 1 })}% de errores humanos`);
  $('#error-donut-rate').textContent = `${errorRate.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`;
  $('#error-donut-count').textContent = `${errorLegs} de ${legsCount} apuestas`;
  $('#error-impact-visual').textContent = money(errorImpact);
  $('#bookmaker-chart-empty').classList.toggle('visible', !houseList.length);
  $('#sport-chart-empty').classList.toggle('visible', !sportList.length);
  const errors = bets.flatMap(bet => bet.legs.filter(leg => leg.humanError).map(leg => ({ bet, leg })));
  $('#error-history').innerHTML = errors.map(({ bet, leg }) => `<div class="error-row"><span class="error-mark small">!</span><div><b>${escapeHtml(leg.bookmaker)} · ${escapeHtml(leg.selection)}</b><small>${escapeHtml(bet.event)} · ${dayLabel(bet.date)}</small></div><strong>${money(leg.errorImpact)}</strong></div>`).join('');
  $('#error-empty').classList.toggle('visible', !errors.length);
  renderNoteAnalysis();
}
function renderNoteAnalysis() {
  const picker = $('#notes-month');
  if (!picker.value) picker.value = todayKey().slice(0, 7);
  const month = picker.value;
  const notes = bets.filter(bet => bet.note?.trim() && (bet.noteMonth || (bet.noteCreatedAt ? new Date(bet.noteCreatedAt).toLocaleDateString('sv-SE').slice(0, 7) : '')) === month)
    .sort((a, b) => new Date(b.noteCreatedAt) - new Date(a.noteCreatedAt));
  const stopWords = new Set('para como pero porque desde hasta sobre entre esta este estas estos una uno unas unos que con por sin del las los sus han fue son mas muy tambien cada cuando donde esto eso hay sido'.split(' '));
  const themes = new Map();
  notes.forEach(bet => {
    const words = new Set(bet.note.toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]{4,}/g) || []);
    words.forEach(word => { if (!stopWords.has(word)) themes.set(word, (themes.get(word) || 0) + 1); });
  });
  const repeated = [...themes].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $('#notes-insights').innerHTML = notes.length ? `<div class="notes-summary-card"><div class="notes-summary-number">${notes.length}</div><div><b>${notes.length === 1 ? 'nota guardada' : 'notas guardadas'} en ${escapeHtml(new Date(`${month}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }))}</b><p>${repeated.length ? `Temas que se repiten en varias notas: ${repeated.map(([word, count]) => `<span class="note-theme">${escapeHtml(word)} · ${count}</span>`).join(' ')}` : 'Aún no hay palabras clave que se repitan en varias notas.'}</p><small>Conclusiones orientativas a partir de palabras repetidas; revisa el contexto de cada nota.</small></div></div>` : '';
  $('#notes-list').innerHTML = notes.map(bet => `<article class="saved-note"><div><b>${escapeHtml(bet.event)}</b><small>${escapeHtml(bet.sport || 'Deporte sin especificar')} · ${shortDate(bet.noteCreatedAt)}</small></div><p>${escapeHtml(bet.note)}</p><button type="button" class="text-button" data-edit-note="${escapeHtml(bet.id)}">Editar nota</button></article>`).join('');
  $('#notes-empty').classList.toggle('visible', !notes.length);
  $$('#notes-list [data-edit-note]').forEach(button => button.addEventListener('click', () => editBetNote(button.dataset.editNote)));
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
  bets.push({ id: crypto.randomUUID(), date: data.get('date'), eventAt: eventAt.toISOString(), reviewAfter: reviewAfter.toISOString(), event: data.get('event').trim(), player: data.get('player').trim(), sport: data.get('sport').trim(), type: 'Surebet', result: 'pending', placed: true, promoEligible: false, promoStatus: 'none', captureId: pendingCaptureId, legs: [1, 2].map(i => ({ bookmaker: data.get(`bookmaker${i}`).trim(), region: 'ES', selection: data.get(`selection${i}`).trim(), odds: Number(data.get(`odds${i}`)), stake: Number(data.get(`stake${i}`)), profit: Number(data.get(`profit${i}`)), humanError: data.get(`error${i}`) === 'on', errorImpact: Number(data.get(`errorImpact${i}`) || 0) })) });
  save(); e.currentTarget.reset(); closeModal(); const toast = $('#toast'); toast.textContent = 'Surebet guardada'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400);
});
$('#filter-type').addEventListener('change', renderRows);
$('#notes-month').addEventListener('change', renderNoteAnalysis);
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

