const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const STORAGE_KEY = 'bet4fun-bets';
const ADMIN_EMAIL = 'enekogoenaga74@gmail.com';
let isAdmin = false;
const PROFILE_KEY = 'bet4fun-profile';
const LEGACY_SAMPLE_ID = 'bet4fun-lakers-jazz-2026-11-18';
const savedBets = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } })();
const legacyLocalBets = Array.isArray(savedBets) ? savedBets.filter(bet => bet.id !== LEGACY_SAMPLE_ID) : [];
let bets = legacyLocalBets;
let profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || { displayName: 'Mi cuenta', email: '', initials: '' };
bets = bets.map(bet => ({ ...bet, placed: bet.placed ?? true, promoEligible: bet.promoEligible ?? false, promoStatus: bet.promoStatus || (bet.promoEligible ? 'pending' : 'none'), legs: bet.legs.map(leg => ({ ...leg, humanError: leg.humanError ?? false, errorImpact: Number(leg.errorImpact || 0) })) }));
localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
const supabaseConfigReady = Boolean(window.BET4FUN_SUPABASE_URL && window.BET4FUN_SUPABASE_ANON_KEY);
let cloud = null, cloudUser = null, cloudQueue = Promise.resolve(), cloudLoaded = false;
if (supabaseConfigReady) { document.body.classList.add('cloud-configured'); $('#cloud-gate').hidden = false; }
let captureDbPromise;
let captureObjectUrls = [];
let pendingCaptureId = null;
let pendingCaptureName = '';
let pendingCaptureOcrText = '';

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
function profileInitials() {
  const explicit = String(profile.initials || '').trim();
  if (explicit) return explicit.slice(0, 3).toUpperCase();
  const initials = String(profile.displayName || 'Mi cuenta').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('');
  return initials.toUpperCase() || 'BF';
}
function renderProfile() {
  $('#profile-name').textContent = profile.displayName || 'Mi cuenta';
  $('#profile-email').textContent = profile.email || 'Configura tu perfil';
  $('#profile-avatar').textContent = profileInitials();
  $('#profile-edit-top').textContent = profileInitials();
}
function setCloudStatus(message, isError = false) {
  const status = $('#cloud-status'); if (!status) return;
  status.textContent = message;
  status.classList.toggle('cloud-error', isError);
  status.classList.toggle('cloud-online', !isError && Boolean(cloudUser));
  status.classList.toggle('local-mode', !cloudUser);
  const button = $('#cloud-account');
  if (button) button.textContent = cloudUser ? 'Salir' : 'Entrar con Google';
  const footer = $('#footer-storage-note');
  if (footer) footer.textContent = cloudUser ? 'Tus apuestas están sincronizadas con tu cuenta' : supabaseConfigReady ? 'Inicia sesión para sincronizar tus apuestas' : 'Los datos todavía se guardan en este dispositivo';
}
function showCloudGate(message = 'Inicia sesión con Google para cargar tus apuestas privadas.', error = false) {
  const gate = $('#cloud-gate'); if (!gate) return;
  gate.hidden = false;
  $('#cloud-gate-message').textContent = message;
  $('#cloud-gate-message').classList.toggle('cloud-error-text', error);
  document.body.classList.remove('cloud-locked');
}
function hideCloudGate() {
  $('#cloud-gate').hidden = true;
  document.body.classList.remove('cloud-locked');
}
async function loginWithGoogle() {
  if (!supabaseConfigReady) {
    window.alert('Falta configurar BET4FUN_SUPABASE_URL y BET4FUN_SUPABASE_ANON_KEY en supabase-config.js.');
    return;
  }
  try {
    if (!cloud) {
      if (!window.supabase?.createClient) throw new Error('No se pudo cargar el servicio de cuenta. Recarga la página e inténtalo de nuevo.');
      cloud = window.supabase.createClient(window.BET4FUN_SUPABASE_URL, window.BET4FUN_SUPABASE_ANON_KEY);
    }
    const callback = new URL(location.origin + location.pathname);
    callback.searchParams.set('auth_reload', Date.now().toString(36));
    const { error } = await cloud.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback.toString() } });
    if (error) throw error;
  } catch (error) {
    showCloudGate(`No se pudo iniciar sesión: ${error.message}`, true);
    setCloudStatus('Error al conectar', true);
  }
}
async function syncBetsToCloud() {
  if (!cloudUser || !cloudLoaded) return;
  if (!bets.length) { setCloudStatus('Sincronizado con la nube'); return; }
  const rows = bets.map(bet => ({ user_id: cloudUser.id, id: String(bet.id), payload: bet, updated_at: new Date().toISOString() }));
  const { error } = await cloud.from('bets').upsert(rows, { onConflict: 'user_id,id' });
  if (error) throw error;
  localStorage.setItem(`${STORAGE_KEY}:${cloudUser.id}`, JSON.stringify(bets));
  setCloudStatus('Sincronizado con la nube');
}
function setAdminAccess(user) {
  isAdmin = String(user?.email || '').trim().toLowerCase() === ADMIN_EMAIL;
  const link = $('#nav-users'), page = $('#page-usuarios');
  if (link) link.hidden = !isAdmin;
  if (page) page.hidden = !isAdmin;
  if (!isAdmin && location.hash === '#usuarios') showPage('dashboard');
}
async function loadAdminUsers() {
  if (!isAdmin || !cloud || !cloudUser) return;
  const body = $('#admin-user-rows'), count = $('#admin-user-count');
  body.innerHTML = '<tr><td colspan="4">Cargando cuentas…</td></tr>';
  count.textContent = 'Cargando…';
  const { data, error } = await cloud.rpc('admin_list_users');
  if (error) {
    count.textContent = 'No disponible';
    body.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message.includes('admin_list_users') ? 'Activa el listado privado con el SQL incluido en el repositorio.' : 'No se pudo cargar la lista de cuentas.')}</td></tr>`;
    return;
  }
  const users = Array.isArray(data) ? data : [];
  count.textContent = `${users.length} ${users.length === 1 ? 'cuenta registrada' : 'cuentas registradas'}`;
  body.innerHTML = users.length ? users.map(user => `<tr><td>${escapeHtml(user.display_name || 'Sin nombre')}</td><td>${escapeHtml(user.email || '')}</td><td>${escapeHtml(new Date(user.created_at).toLocaleString('es-ES'))}</td><td>${user.last_sign_in_at ? escapeHtml(new Date(user.last_sign_in_at).toLocaleString('es-ES')) : 'Nunca'}</td></tr>`).join('') : '<tr><td colspan="4">Todavía no hay cuentas.</td></tr>';
}
async function acceptCloudSession(session) {
  const user = session?.user;
  if (!user) {
    setAdminAccess(null);
    cloudUser = null; cloudLoaded = false; bets = [];
    updateDashboard(); showCloudGate('Inicia sesión con Google para cargar tus apuestas privadas.'); setCloudStatus('Sesión cerrada');
    return;
  }
  setAdminAccess(user);
  if (cloudUser?.id === user.id && cloudLoaded) return;
  cloudUser = user; cloudLoaded = false;
  setCloudStatus('Cargando apuestas…'); showCloudGate('Cargando tus apuestas guardadas…');
  const { data, error } = await cloud.from('bets').select('id,payload').order('created_at', { ascending: true });
  if (error) {
    const cached = localStorage.getItem(`${STORAGE_KEY}:${user.id}`);
    if (!cached) { showCloudGate(`No se pudieron cargar tus datos: ${error.message}`, true); setCloudStatus('Error de sincronización', true); return; }
    try { bets = JSON.parse(cached); } catch { bets = []; }
    cloudLoaded = true; updateDashboard(); hideCloudGate(); setCloudStatus('Sin conexión · mostrando copia local', true); return;
  }
  if (data?.length) bets = data.map(row => row.payload).filter(Boolean);
  else if (legacyLocalBets.length && window.confirm(`Esta cuenta todavía no tiene apuestas. ¿Quieres importar las ${legacyLocalBets.length} apuestas guardadas en este navegador?`)) bets = legacyLocalBets;
  else bets = [];
  bets = bets.filter(bet => bet.id !== LEGACY_SAMPLE_ID);
  bets.forEach(bet => { if (!bet.capturePath) bet.captureId = null; });
  profile = { ...profile, displayName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Mi cuenta', email: user.email || '', initials: '' };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  cloudLoaded = true; localStorage.setItem(`${STORAGE_KEY}:${user.id}`, JSON.stringify(bets));
  renderProfile(); updateDashboard(); hideCloudGate(); setCloudStatus('Sincronizando…');
  try { await syncBetsToCloud(); } catch (syncError) { setCloudStatus(`Error al sincronizar: ${syncError.message}`, true); }
}
async function initializeCloud() {
  if (!supabaseConfigReady) { setCloudStatus('Solo en este dispositivo'); return; }
  document.body.classList.add('cloud-configured'); showCloudGate('Conectando con tu cuenta…'); setCloudStatus('Conectando…');
  if (!window.supabase?.createClient) { showCloudGate('No se pudo cargar el servicio de cuenta. Comprueba tu conexión e inténtalo de nuevo.', true); setCloudStatus('Servicio no disponible', true); return; }
  cloud = window.supabase.createClient(window.BET4FUN_SUPABASE_URL, window.BET4FUN_SUPABASE_ANON_KEY, {
    auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
  });
  // Supabase usually consumes OAuth hash tokens automatically. This fallback
  // persists them explicitly in case the page was restored from browser cache.
  const oauthHash = new URLSearchParams(location.hash.slice(1));
  const accessToken = oauthHash.get('access_token');
  const refreshToken = oauthHash.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error: sessionError } = await cloud.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (sessionError) {
      showCloudGate(`No se pudo completar el inicio de sesión: ${sessionError.message}`, true);
      setCloudStatus('Error al conectar', true);
      return;
    }
    history.replaceState(null, document.title, location.pathname + location.search);
  }
  const { data, error } = await cloud.auth.getSession();
  if (error) { showCloudGate(`No se pudo comprobar la sesión: ${error.message}`, true); setCloudStatus('Error de conexión', true); return; }
  await acceptCloudSession(data.session);
  cloud.auth.onAuthStateChange((_event, session) => { queueMicrotask(() => acceptCloudSession(session)); });
}
function openProfile() {
  const form = $('#profile-form');
  form.elements.displayName.value = profile.displayName || '';
  form.elements.email.value = profile.email || '';
  form.elements.initials.value = profile.initials || '';
  $('#profile-modal').classList.add('open');
  $('#profile-modal').setAttribute('aria-hidden', 'false');
  form.elements.displayName.focus();
}
function closeProfile() {
  $('#profile-modal').classList.remove('open');
  $('#profile-modal').setAttribute('aria-hidden', 'true');
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
  return `<div class="review-actions"><button data-analyze="${escapeHtml(bet.id)}">${'Buscar resultado'}</button></div>`;
}
function workflowMarkup(bet) {
  const id = escapeHtml(bet.id), freebet = Boolean(bet.promoEligible), received = freebet && bet.promoStatus === 'received';
  return `<div class="workflow-cell"><div class="promo-square-wrap"><button type="button" class="promo-square fb-square ${freebet ? 'selected' : ''}" role="checkbox" aria-checked="${freebet}" aria-label="${freebet ? 'Freebet marcada' : 'Marcar freebet'}" title="Marcar si esta apuesta genera una freebet" data-toggle-fb="${id}">FB</button><button type="button" class="promo-square tick-square ${received ? 'selected' : ''}" role="checkbox" aria-checked="${received}" aria-label="${received ? 'Freebet cobrada' : 'Marcar freebet como cobrada'}" title="Marcar cuando se haya cobrado la freebet" data-toggle-fb-received="${id}" ${freebet ? '' : 'disabled'}>✓</button></div></div>`;
}
function rowMarkup(bet) {
  const isDue = needsReview(bet);
  const capture = bet.capturePath ? `<button class="capture-link" data-open-cloud-capture="${escapeHtml(bet.capturePath)}">Ver captura adjunta</button>` : bet.captureId ? `<button class="capture-link" data-open-capture="${escapeHtml(bet.captureId)}">Ver captura adjunta (solo este dispositivo)</button>` : '';
  const noteButton = `<button class="bet-note-button" data-edit-note="${escapeHtml(bet.id)}">${bet.note ? 'Editar nota' : '＋ Añadir nota'}${bet.note ? '<span class="note-saved-mark" aria-label="Tiene una nota">●</span>' : ''}</button>`;
  const deleteButton = `<button type="button" class="bet-delete-button" data-delete-bet="${escapeHtml(bet.id)}" aria-label="Eliminar apuesta ${escapeHtml(bet.event)}">Eliminar</button>`;
  return `<tr class="bet-row ${isDue ? 'due-row' : ''}"><td><div class="bet-title">${escapeHtml(bet.event)}</div><div class="bet-sub">${escapeHtml(bet.player)} · <span class="sport-label"><span aria-hidden="true">${sportEmoji(bet.sport)}</span> ${escapeHtml(bet.sport)}</span> · ${shortDate(bet.eventAt)}</div><div class="bet-row-tools">${capture}${noteButton}${deleteButton}</div></td><td><span class="type-chip">${escapeHtml(bet.type)}</span></td><td><div class="legs-cell">${legsMarkup(bet)}</div>${reviewActions(bet)}</td><td class="amount">${money(totalStake(bet))}</td><td class="profit-positive">${openBet(bet) ? '+' + money(potential(bet)) : money(bet.actualProfit)}</td><td>${statusMarkup(bet)}</td><td>${workflowMarkup(bet)}</td></tr>`;
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
  $$('[data-open-cloud-capture]').forEach(button => button.addEventListener('click', () => openCloudCapture(button.dataset.openCloudCapture)));
  $$('[data-edit-note]').forEach(button => button.addEventListener('click', () => editBetNote(button.dataset.editNote)));
  $$('[data-delete-bet]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.deleteBet;
    const bet = bets.find(item => String(item.id) === id);
    if (!bet) return;
    const attachment = bet.capturePath ? ' También se eliminará su captura guardada en la nube.' : '';
    if (!window.confirm(`¿Eliminar la apuesta «${bet.event}»? Esta acción no se puede deshacer.${attachment}`)) return;
    button.disabled = true;
    try {
      if (cloudUser && !cloudLoaded) throw new Error('Espera a que las apuestas terminen de sincronizarse e inténtalo de nuevo.');
      let warning = '';
      if (cloud && cloudUser && cloudLoaded) {
        cloudQueue = cloudQueue.catch(() => {}).then(async () => {
          const { error } = await cloud.from('bets').delete().eq('user_id', cloudUser.id).eq('id', id);
          if (error) throw error;
          if (bet.capturePath) {
            const { error: captureError } = await cloud.storage.from('bet-captures').remove([bet.capturePath]);
            if (captureError) warning = `Apuesta eliminada; no se pudo borrar la captura: ${captureError.message}`;
          }
        });
        await cloudQueue;
      }
      bets = bets.filter(item => String(item.id) !== id);
      localStorage.setItem(cloudUser ? `${STORAGE_KEY}:${cloudUser.id}` : STORAGE_KEY, JSON.stringify(bets));
      updateDashboard();
      const toast = $('#toast'); toast.textContent = warning || 'Apuesta eliminada'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2800);
    } catch (error) {
      button.disabled = false;
      const toast = $('#toast'); toast.textContent = `No se pudo eliminar: ${error.message}`; toast.classList.add('show');
    }
  }));
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
async function analyzeBet(id) {
  const bet = bets.find(item => item.id === id); if (!bet) return;
  const backdrop = document.createElement('div'); backdrop.className = 'analysis-backdrop';
  backdrop.innerHTML = `<section class="analysis-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-title"><div class="modal-head"><div><div class="eyebrow">ANÁLISIS AUTOMÁTICO</div><h2 id="analysis-title">${escapeHtml(bet.event)}</h2></div><button type="button" class="close-button" data-close-analysis aria-label="Cerrar">×</button></div><p class="analysis-help">BET4FUN consultará los datos del partido y comparará cada selección automáticamente. Revisa siempre la liquidación en la casa de apuestas, porque sus reglas y correcciones pueden variar.</p><div class="auto-analysis-status" role="status">Preparando consulta…</div><div class="auto-analysis-results"></div><div class="form-actions"><button type="button" class="secondary-button" data-close-analysis>Cerrar</button><button type="button" class="primary-button" data-run-auto-check>Buscar resultado</button></div></section>`;
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelectorAll('[data-close-analysis]').forEach(button => button.addEventListener('click', close));
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  const status = backdrop.querySelector('.auto-analysis-status');
  const results = backdrop.querySelector('.auto-analysis-results');
  const run = backdrop.querySelector('[data-run-auto-check]');
  const apiUrl = String(window.BET4FUN_API_URL || '').replace(/\/$/, '');
  if (!apiUrl) {
    status.textContent = 'La consulta automática todavía no está conectada. Falta configurar el backend de resultados.';
    run.disabled = true;
    return;
  }
  const runCheck = async () => {
    run.disabled = true; status.textContent = 'Consultando el resultado del encuentro…'; results.innerHTML = '';
    try {
      const response = await fetch(apiUrl + '/check-bet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: bet.event, sport: bet.sport, player: bet.player,
          eventDate: String(bet.eventAt || '').slice(0, 10),
          legs: bet.legs.map(leg => ({ bookmaker: leg.bookmaker, selection: leg.selection, odds: leg.odds, stake: leg.stake }))
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo consultar el proveedor de resultados.');
      if (data.status !== 'verified' || !Array.isArray(data.legs)) {
        status.textContent = data.message || 'El proveedor no pudo confirmar automáticamente este evento o mercado.';
        return;
      }
      if (data.legs.length !== bet.legs.length || data.legs.some(item => !['won', 'lost', 'void'].includes(item.outcome))) {
        status.textContent = 'La respuesta no contiene un resultado completo y fiable para todas las selecciones.';
        return;
      }
      data.legs.forEach((item, index) => { bet.legs[index].outcome = item.outcome; });
      bet.actualProfit = Number(data.actualProfit || 0);
      bet.result = data.result || (data.legs.every(item => item.outcome === 'void') ? 'void' : bet.actualProfit >= 0 ? 'won' : 'lost');
      bet.verifiedAt = data.checkedAt || new Date().toISOString();
      await save();
      status.textContent = data.game?.status ? `Partido finalizado · ${data.game.status}` : 'Resultado consultado automáticamente.';
      results.innerHTML = data.legs.map((item, index) => `<div class="analysis-result-row"><b>${escapeHtml(bet.legs[index].bookmaker)}</b><span>${escapeHtml(bet.legs[index].selection)}</span><strong class="outcome-${item.outcome}">${item.outcome === 'won' ? 'Ganada' : item.outcome === 'lost' ? 'No ganada' : 'Anulada'}${item.actual != null ? ` · ${escapeHtml(item.actual)}` : ''}</strong></div>`).join('') + `<p class="analysis-help">${escapeHtml(data.warning || 'Comprueba también la liquidación en la casa de apuestas.')}</p>`;
      run.textContent = 'Volver a consultar';
      run.disabled = false;
    } catch (error) {
      status.textContent = error.message || 'No se pudo consultar el resultado. Inténtalo de nuevo más tarde.';
    } finally {
      if (run.textContent !== 'Volver a consultar') run.disabled = false;
    }
  };
  run.addEventListener('click', runCheck);
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
function save() {
  const cacheKey = cloudUser ? `${STORAGE_KEY}:${cloudUser.id}` : STORAGE_KEY;
  localStorage.setItem(cacheKey, JSON.stringify(bets)); updateDashboard();
  if (cloud && cloudUser && cloudLoaded) cloudQueue = cloudQueue.catch(() => {}).then(() => syncBetsToCloud()).catch(error => { setCloudStatus(`Error al sincronizar: ${error.message}`, true); throw error; });
  return cloudQueue;
}
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
function openModal(prefill = {}) {
  const form = $('#bet-form'); form.reset(); form.elements.date.value = todayKey();
  const soon = new Date(Date.now() + 3600000); soon.setMinutes(0, 0, 0);
  form.elements.eventAt.value = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}T${String(soon.getHours()).padStart(2, '0')}:00`;
  Object.entries(prefill).forEach(([name, value]) => { if (value !== undefined && value !== '' && form.elements[name]) form.elements[name].value = value; });
  let hint = $('#capture-link-hint');
  if (!hint) { hint = document.createElement('div'); hint.id = 'capture-link-hint'; hint.className = 'form-hint capture-linked-hint'; form.prepend(hint); }
  hint.hidden = !pendingCaptureId;
  hint.textContent = pendingCaptureId ? `La captura «${pendingCaptureName}» quedará adjunta. Revisa los datos reconocidos antes de guardar.` : '';
  const cloudCaptureChoice = form.querySelector('.cloud-upload-choice');
  cloudCaptureChoice.hidden = !pendingCaptureId;
  form.elements.uploadCaptureCloud.disabled = !(pendingCaptureId && cloudUser);
  cloudCaptureChoice.querySelector('small').textContent = pendingCaptureId && !cloudUser ? 'Conecta tu cuenta para guardar la imagen y abrirla desde otros dispositivos.' : 'Opcional · privada y accesible desde tus otros dispositivos. La lectura OCR se hace en este dispositivo.';
  let ocrSummary = $('#capture-ocr-summary');
  if (!ocrSummary) { ocrSummary = document.createElement('details'); ocrSummary.id = 'capture-ocr-summary'; ocrSummary.className = 'capture-ocr-summary'; hint.after(ocrSummary); }
  ocrSummary.hidden = !pendingCaptureOcrText;
  ocrSummary.innerHTML = pendingCaptureOcrText ? `<summary>Ver texto leído de la captura</summary><pre>${escapeHtml(pendingCaptureOcrText)}</pre>` : '';
  $('#modal').classList.add('open'); $('#modal').setAttribute('aria-hidden', 'false'); form.elements.event.focus();
}
function closeModal() { $('#modal').classList.remove('open'); $('#modal').setAttribute('aria-hidden', 'true'); pendingCaptureId = null; pendingCaptureName = ''; pendingCaptureOcrText = ''; }
function showPage(name) {
  if (name === 'usuarios' && !isAdmin) name = 'dashboard';
  $$('.page').forEach(page => page.classList.toggle('active-page', page.id === `page-${name}`));
  $$('.nav-item').forEach(link => link.classList.toggle('active', link.dataset.page === name));
  $('#crumb-name').textContent = ({ dashboard: 'Resumen', apuestas: 'Mis apuestas', promos: 'Freebets', datos: 'Datos', capturas: 'Capturas', usuarios: 'Usuarios' })[name] || 'Resumen';
  history.replaceState(null, '', `#${name}`);
  if (name === 'capturas') return renderCaptures();
  if (name === 'usuarios') return loadAdminUsers();
}

$('#today').textContent = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
renderProfile();
$('#profile-edit').addEventListener('click', openProfile);
$('#profile-edit-top').addEventListener('click', openProfile);
$('#profile-close').addEventListener('click', closeProfile);
$('#profile-cancel').addEventListener('click', closeProfile);
$('#profile-modal').addEventListener('click', event => { if (event.target === $('#profile-modal')) closeProfile(); });
$('#profile-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  profile = { displayName: String(data.get('displayName') || '').trim(), email: String(data.get('email') || '').trim(), initials: String(data.get('initials') || '').trim() };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  renderProfile(); closeProfile();
});
$('#cloud-login').addEventListener('click', loginWithGoogle);
$('#cloud-account').addEventListener('click', async () => {
  if (!cloudUser) { await loginWithGoogle(); return; }
  const { error } = await cloud.auth.signOut();
  if (error) setCloudStatus(`No se pudo cerrar sesión: ${error.message}`, true);
});
$$('.nav-item').forEach(link => link.addEventListener('click', e => { e.preventDefault(); showPage(link.dataset.page); }));
$('#admin-users-refresh').addEventListener('click', loadAdminUsers);
$$('[data-page-link]').forEach(link => link.addEventListener('click', () => showPage(link.dataset.pageLink)));
$$('[data-open-form]').forEach(button => button.addEventListener('click', openModal));
$('#close-modal').addEventListener('click', closeModal); $('#cancel-modal').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target === $('#modal')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeProfile(); } });
$('#bet-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.currentTarget;
  if (form.dataset.saving === 'true') return;
  form.dataset.saving = 'true';
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Guardando…';
  const toast = $('#toast');
  toast.textContent = 'Guardando apuesta…'; toast.classList.add('show');
  let bet, added = false, localCaptureId = null, uploadCapture = false;
  try {
    const data = new FormData(form);
    const eventAt = new Date(data.get('eventAt'));
    const reviewAfter = new Date(eventAt.getTime() + 3 * 60 * 60 * 1000);
    localCaptureId = pendingCaptureId;
    uploadCapture = data.get('uploadCaptureCloud') === 'on' && Boolean(localCaptureId && cloudUser);
    bet = { id: crypto.randomUUID(), date: data.get('date'), eventDate: String(data.get('eventAt')).slice(0, 10), eventAt: eventAt.toISOString(), reviewAfter: reviewAfter.toISOString(), event: data.get('event').trim(), player: data.get('player').trim(), sport: data.get('sport').trim(), type: 'Surebet', result: 'pending', placed: true, promoEligible: false, promoStatus: 'none', captureId: cloudUser ? null : localCaptureId, capturePath: null, legs: [1, 2].map(i => ({ bookmaker: data.get(`bookmaker${i}`).trim(), region: 'ES', selection: data.get(`selection${i}`).trim(), odds: Number(data.get(`odds${i}`)), stake: Number(data.get(`stake${i}`)), profit: Number(data.get(`profit${i}`)), humanError: data.get(`error${i}`) === 'on', errorImpact: Number(data.get(`errorImpact${i}`) || 0) })) };
    bets.push(bet); added = true;
    await save();
    form.reset(); closeModal();
    toast.textContent = cloudUser ? 'Apuesta sincronizada con tu cuenta' : 'Apuesta guardada en este dispositivo'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2800);
    if (uploadCapture) {
      try { await uploadCaptureForBet(localCaptureId, bet); toast.textContent = 'Captura guardada en tu cuenta privada'; }
      catch (uploadError) { toast.textContent = `Apuesta guardada; captura no subida: ${uploadError.message}`; }
      toast.classList.add('show');
    }
  } catch (error) {
    if (added) {
      bets = bets.filter(item => item.id !== bet.id);
      localStorage.setItem(cloudUser ? `${STORAGE_KEY}:${cloudUser.id}` : STORAGE_KEY, JSON.stringify(bets)); updateDashboard();
    }
    toast.textContent = `No se pudo guardar: ${error.message}`; toast.classList.add('show');
  } finally {
    delete form.dataset.saving;
    submitButton.disabled = false;
    submitButton.textContent = 'Guardar apuesta';
  }
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
function showCaptureToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
}
let tesseractPromise;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractPromise) tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('No se pudo iniciar el lector de imágenes.'));
    script.onerror = () => reject(new Error('No se pudo cargar el lector de imágenes.'));
    document.head.append(script);
  });
  return tesseractPromise;
}
function groupOcrLines(words) {
  const ordered = (words || []).filter(word => word.text?.trim() && word.bbox).slice().sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const lines = [];
  ordered.forEach(word => {
    const y = (word.bbox.y0 + word.bbox.y1) / 2;
    const height = word.bbox.y1 - word.bbox.y0;
    let line = lines.find(item => Math.abs(item.y - y) < Math.max(12, Math.min(height, item.height) * 0.7));
    if (!line) { line = { y, height, words: [] }; lines.push(line); }
    line.words.push(word);
    line.y = line.words.reduce((sum, item) => sum + (item.bbox.y0 + item.bbox.y1) / 2, 0) / line.words.length;
    line.height = line.words.reduce((sum, item) => sum + item.bbox.y1 - item.bbox.y0, 0) / line.words.length;
  });
  return lines.sort((a, b) => a.y - b.y).map(line => {
    const sorted = line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    return { words: sorted, text: sorted.map(word => word.text).join(' ') };
  });
}
function titleCaseName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 2 && parts[0] === parts[0].toLocaleUpperCase('es-ES') && parts[1] !== parts[1].toLocaleUpperCase('es-ES')) parts.reverse();
  return parts.map(part => part.charAt(0).toLocaleUpperCase('es-ES') + part.slice(1).toLocaleLowerCase('es-ES')).join(' ');
}
function reconcileTotalThresholds(rows) {
  if (rows.length !== 2) return;
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const highPattern = /\btotal\s*(?:(?:>=|≥|>)\s*)?7\b/i;
  const lowPattern = /\b(?:inferior(?:\s+a)?|under|menos\s+de)\s*6[.,]5\b/i;
  const high = rows.find(row => highPattern.test(row.selection));
  const low = rows.find(row => lowPattern.test(row.selection));
  if (!high || !low) return;
  const highContext = normalize(high.selection).replace(/\btotal\s*(?:(?:>=|≥|>)\s*)?7\b/i, '').replace(/[^a-z0-9]/g, '');
  const lowContext = normalize(low.selection).replace(/\b(?:inferior(?:\s+a)?|under|menos\s+de)\s*6[.,]5\b/i, '').replace(/[^a-z0-9]/g, '');
  if (!highContext || highContext !== lowContext) return;
  high.selection = high.selection.replace(/\btotal\s*(?:(?:>=|≥|>)\s*)?7\b/i, 'Total ≥7');
}
function parseCaptureBet(words, rawText, imageWidth) {
  const lines = groupOcrLines(words);
  const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const allText = String(rawText || lines.map(line => line.text).join('\n'));
  const dateMatch = allText.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\D{0,12}(\d{1,2}):(\d{2})/);
  const eventIndex = lines.findIndex(line => /\s(?:vs\.?|[-–—])\s/i.test(line.text) && line.text.length > 9 && !/superior|inferior|over|under|mas de|menos de/i.test(line.text));
  const event = eventIndex >= 0 ? lines[eventIndex].text.replace(/\s+/g, ' ').replace(/\s+\d+(?:[.,]\d+)?\s*%\s*$/, '').trim() : '';
  const heading = eventIndex > 0 ? lines.slice(0, eventIndex).reverse().find(line => line.text.trim() && !/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|evento en|cuota|apuesta|roi/i.test(line.text))?.text : '';
  const headingWords = String(heading || '').trim().split(/\s+/).filter(Boolean);
  const plausiblePlayer = headingWords.length >= 2 && headingWords.length <= 3 &&
    headingWords.every(word => /^[\p{L}][\p{L}'’.-]*$/u.test(word)) &&
    !/baloncesto|basket|futbol|football|tenis|tennis|nba|liga|champions|league|total|superior|inferior|servette|barcelona/i.test(heading);
  const player = plausiblePlayer ? titleCaseName(heading) : '';
  const sportPattern = /baloncesto|basketball|basket|futbol|football|soccer|hockey|floorball|tenis|tennis|beisbol|baseball|rugby|voleibol|volleyball|balonmano|handball|golf|boxeo|boxing|mma|ufc|formula\s*1|\bf1\b|ciclismo|cycling|natacion|swimming|atletismo|\bnba\b|\bnfl\b|\bmlb\b|\bnhl\b|laliga|premier\s+league|champions\s+league/i;
  const sportLine = lines.findIndex((line, index) => index !== eventIndex && sportPattern.test(clean(line.text)));
  const sport = sportLine >= 0 ? lines[sportLine].text.replace(/\s+/g, ' ').trim() : '';
  const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}` : '';
  const eventAt = dateMatch ? `${date}T${dateMatch[4].padStart(2, '0')}:${dateMatch[5]}` : '';
  const width = Number(imageWidth) || 1;
  const centerX = word => ((word.bbox.x0 + word.bbox.x1) / 2) / width;
  const numberValue = word => {
    const raw = String(word?.text || '').replace(/[^\d.,-]/g, '').replace(',', '.');
    return /^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
  };
  const header = lines.find(line => {
    const labels = line.words.map(word => clean(word.text).replace(/[^a-z]/g, ''));
    return labels.includes('cuota') && labels.includes('apuesta') && labels.includes('beneficio');
  });
  const headerX = label => {
    const word = header?.words.find(item => clean(item.text).replace(/[^a-z]/g, '') === label);
    return word ? centerX(word) : null;
  };
  const oddsStart = headerX('cuota');
  const stakeStart = headerX('apuesta');
  const profitStart = headerX('beneficio');
  const bookmakers = ['jokerbet', 'winamax', 'pokerstars', 'ol ybet', 'olybet', 'retabet', 'wplay', 'bet365', 'betfair', 'betway', 'bwin', 'codere', 'luckia', 'marathonbet', '1xbet', 'sportium', 'pinnacle', 'betano', 'novibet', 'suertia'];
  const legRows = [];
  lines.forEach(line => {
    const rowWords = line.words.slice().sort((a, b) => centerX(a) - centerX(b));
    const rowText = clean(rowWords.map(word => word.text).join(' '));
    if (/apuesta\s+total|evento\s+en|\broi\b|\bsurebet\b/.test(rowText)) return;
    const numeric = rowWords.map(word => ({ word, x: centerX(word), value: numberValue(word) })).filter(item => Number.isFinite(item.value));
    if (!numeric.length) return;
    let oddsWord, stakeWord, profitWord;
    if (oddsStart != null && stakeStart != null && profitStart != null) {
      oddsWord = numeric.filter(item => item.x >= oddsStart + 0.025 && item.x < stakeStart - 0.025 && item.value >= 1 && item.value <= 1000).at(-1);
      stakeWord = numeric.filter(item => item.x >= stakeStart - 0.025 && item.x < profitStart - 0.025 && item.value >= 0 && item.value <= 100000).sort((a, b) => Math.abs(a.x - stakeStart) - Math.abs(b.x - stakeStart))[0];
      profitWord = numeric.filter(item => item.x >= profitStart - 0.025 && item.value >= 0 && item.value <= 100000).at(-1);
    }
    // Some Surebet screen sizes omit the column labels from the OCR result.
    // In that case, use the rightmost three numeric columns of the row.
    if (!oddsWord || !stakeWord || !profitWord) {
      const tail = numeric.filter(item => item.x > 0.18);
      if (tail.length >= 3) [oddsWord, stakeWord, profitWord] = tail.slice(-3);
    }
    if (!oddsWord || !stakeWord || !profitWord || oddsWord.value <= 1 || stakeWord.value < 0) return;
    const oddsX = oddsWord.x;
    const leftWords = rowWords.filter(word => centerX(word) < oddsX - 0.025);
    if (!leftWords.length) return;
    const normalizedLeft = clean(leftWords.map(word => word.text).join(' ')).replace(/[^a-z0-9]/g, '');
    const knownBook = bookmakers.find(name => normalizedLeft.includes(name.replace(/[^a-z0-9]/g, '')));
    const regionIndex = leftWords.findIndex(word => /^\(?[A-Z]{2,3}\)?$/.test(word.text.trim()));
    // Do not turn event headings, table labels, or arbitrary words into a
    // bookmaker just because the line also contains some numbers.
    if (!knownBook && regionIndex < 0) return;
    const quotaBoundary = oddsStart ?? (oddsX * 0.42);
    let bookmakerWords;
    if (knownBook) {
      const tokens = leftWords.filter(word => centerX(word) < quotaBoundary);
      const wordsText = tokens.map(word => word.text);
      const brandIndex = wordsText.findIndex(word => clean(word).replace(/[^a-z0-9]/g, '').includes(knownBook.replace(/[^a-z0-9]/g, '')));
      bookmakerWords = brandIndex >= 0 ? tokens.slice(brandIndex, brandIndex + 2) : tokens;
    } else if (regionIndex >= 0) bookmakerWords = leftWords.slice(0, regionIndex);
    else bookmakerWords = leftWords.filter(word => centerX(word) < quotaBoundary);
    const bookmaker = bookmakerWords.map(word => word.text).filter(word => !/^\(?[A-Z]{2,3}\)?$/.test(word.trim())).join(' ').trim();
    const selectionWords = rowWords.filter(word => centerX(word) >= quotaBoundary - 0.01 && centerX(word) < oddsX - 0.02);
    const selection = selectionWords.map(word => word.text).join(' ').replace(/\s+/g, ' ').trim();
    if (!bookmaker || !selection) return;
    legRows.push({
      bookmaker, selection, odds: oddsWord.value.toString(), stake: stakeWord.value.toString(), profit: profitWord.value.toString(), y: line.y,
      oddsBox: { x0: oddsWord.word.bbox.x0, y0: Math.min(...line.words.map(word => word.bbox.y0)), x1: oddsWord.word.bbox.x1, y1: Math.max(...line.words.map(word => word.bbox.y1)) }
    });
  });
  reconcileTotalThresholds(legRows);
  legRows.sort((a, b) => a.y - b.y);
  const fields = { event, player, sport, eventAt };
  legRows.slice(0, 2).forEach((leg, index) => {
    const number = index + 1;
    fields[`bookmaker${number}`] = leg.bookmaker;
    fields[`selection${number}`] = leg.selection;
    fields[`odds${number}`] = leg.odds;
    fields[`stake${number}`] = leg.stake;
    fields[`profit${number}`] = leg.profit;
  });
  return { fields, legCount: legRows.length, legRows, lines, text: allText };
}
async function prepareCaptureImage(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(3, Math.max(2, 2200 / bitmap.width));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const gray = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114;
    const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.24 + 128));
    image.data[i] = image.data[i + 1] = image.data[i + 2] = contrast;
  }
  context.putImageData(image, 0, 0);
  return { canvas, originalWidth: canvas.width / scale };
}
async function readCapture(file) {
  const tesseract = await loadTesseract();
  let worker;
  try {
    const { canvas, originalWidth } = await prepareCaptureImage(file.blob);
    worker = await tesseract.createWorker('spa+eng', 1, { logger: message => {
      if (message.status === 'recognizing text' && Number.isFinite(message.progress)) showCaptureToast(`Mejorando lectura · ${Math.round(message.progress * 100)}%`);
      else if (message.status === 'loading language traineddata') showCaptureToast('Preparando lectura de texto…');
    } });
    await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '220' });
    const results = [];
    for (const mode of ['11', '6']) {
      await worker.setParameters({ tessedit_pageseg_mode: mode });
      const result = await worker.recognize(canvas);
      const parsed = parseCaptureBet(result.data.words, result.data.text, canvas.width);
      const text = String(result.data.text || '');
      const score = parsed.legCount * 100 + (parsed.fields.event ? 25 : 0) +
        (parsed.fields.bookmaker1 ? 12 : 0) + (parsed.fields.bookmaker2 ? 12 : 0) +
        (parsed.fields.stake1 ? 6 : 0) + (parsed.fields.stake2 ? 6 : 0) +
        Math.min(20, Math.round(Number(result.data.confidence || 0) / 5)) +
        (/\\b(?:apuesta|cuota|beneficio)\\b/i.test(text) ? 3 : 0);
      results.push({ parsed, score });
    }
    const parsed = results.sort((a, b) => b.score - a.score)[0].parsed;
    // Re-read each odds cell at higher magnification with a numeric-only
    // whitelist. Small Surebet screenshots often turn 1.680 into 1.08.
    for (const [index, leg] of parsed.legRows.entries()) {
      const box = leg.oddsBox;
      if (!box) continue;
      const padX = Math.max(18, (box.x1 - box.x0) * 1.25);
      const padY = Math.max(8, (box.y1 - box.y0) * 0.2);
      const x0 = Math.max(0, box.x0 - padX), y0 = Math.max(0, box.y0 - padY);
      const x1 = Math.min(canvas.width, box.x1 + padX), y1 = Math.min(canvas.height, box.y1 + padY);
      const crop = document.createElement('canvas');
      crop.width = Math.max(1, Math.round((x1 - x0) * 3));
      crop.height = Math.max(1, Math.round((y1 - y0) * 3));
      crop.getContext('2d').drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, crop.width, crop.height);
      await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789.,' });
      const oddsResult = await worker.recognize(crop);
      const match = String(oddsResult.data.text || '').replace(/\s/g, '').match(/\d{1,3}[.,]\d{1,3}/);
      const value = match ? Number(match[0].replace(',', '.')) : NaN;
      if (Number.isFinite(value) && value > 1 && value <= 1000) parsed.fields[`odds${index + 1}`] = value.toString();
    }
    return parsed;
  } finally {
    if (worker) await worker.terminate();
  }
}

async function renderCaptures() {
  const grid = $('#capture-grid'); if (!grid) return;
  try {
    const files = await captureRequest('readonly', store => store.getAll());
    let remoteCaptures = [];
    if (cloud && cloudUser) {
      const { data, error } = await cloud.from('captures').select('id,bet_id,object_path,file_name,mime_type,size_bytes,created_at').order('created_at', { ascending: false });
      if (error) throw error;
      remoteCaptures = await Promise.all((data || []).map(async capture => {
        const { data: signed, error: signError } = await cloud.storage.from('bet-captures').createSignedUrl(capture.object_path, 3600);
        return { ...capture, signedUrl: signError ? '' : signed?.signedUrl || '' };
      }));
    }
    captureObjectUrls.forEach(url => URL.revokeObjectURL(url)); captureObjectUrls = [];
    const totalFiles = files.length + remoteCaptures.length;
    $('#capture-count').textContent = `${totalFiles} ${totalFiles === 1 ? 'archivo' : 'archivos'}`;
    $('#capture-empty').classList.toggle('visible', !totalFiles);
    const localCards = files.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(file => {
      const url = URL.createObjectURL(file.blob); captureObjectUrls.push(url);
      const linkedBet = bets.find(bet => bet.captureId === file.id || bet.captureFileId === file.id);
      const action = linkedBet ? `<button class="capture-use linked" ${linkedBet.capturePath ? `data-open-cloud-file="${escapeHtml(linkedBet.capturePath)}"` : `data-open-bet-capture="${escapeHtml(file.id)}"`}>${linkedBet.capturePath ? 'Guardada en la nube · ' : 'Adjunta a '}${escapeHtml(linkedBet.event)}</button>` : `<button class="capture-use" data-incorporate-capture="${escapeHtml(file.id)}">Incorporar como apuesta</button>`;
      return `<article class="capture-card" data-capture-card="${escapeHtml(file.id)}"><img src="${url}" alt="Captura de ${escapeHtml(file.name)}"><div class="capture-info"><b title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</b><small>${shortDate(file.createdAt)}</small>${action}<button data-delete-capture="${escapeHtml(file.id)}" aria-label="Eliminar ${escapeHtml(file.name)}">Eliminar</button></div></article>`;
    }).join('');
    const cloudCards = remoteCaptures.map(file => {
      const linkedBet = bets.find(bet => bet.id === file.bet_id);
      const fileMeta = `${Math.max(1, Math.round(Number(file.size_bytes || 0) / 1024))} KB · En tu nube privada`;
      return `<article class="capture-card cloud-capture-card" data-cloud-capture-card="${escapeHtml(file.id)}">${file.signedUrl ? `<img src="${escapeHtml(file.signedUrl)}" alt="Captura de ${escapeHtml(file.file_name)}">` : '<div class="cloud-capture-placeholder">Imagen privada</div>'}<div class="capture-info"><b title="${escapeHtml(file.file_name)}">${escapeHtml(file.file_name)}</b><small>${fileMeta}</small>${linkedBet ? `<span class="capture-use linked">Adjunta a ${escapeHtml(linkedBet.event)}</span>` : ''}<button data-open-cloud-file="${escapeHtml(file.object_path)}">Abrir captura</button><button data-delete-cloud-capture="${escapeHtml(file.id)}" data-path="${escapeHtml(file.object_path)}" aria-label="Eliminar ${escapeHtml(file.file_name)}">Eliminar de la nube</button></div></article>`;
    }).join('');
    grid.innerHTML = localCards + cloudCards;
    $$('[data-incorporate-capture]').forEach(button => button.addEventListener('click', async () => {
      const file = await captureRequest('readonly', store => store.get(button.dataset.incorporateCapture));
      if (!file) return;
      pendingCaptureId = file.id; pendingCaptureName = file.name;
      showCaptureToast('Analizando la captura…');
      try {
        const extracted = await readCapture(file);
        pendingCaptureOcrText = extracted.text;
        openModal(extracted.fields);
        const complete = extracted.fields.event && extracted.fields.bookmaker1 && extracted.fields.bookmaker2;
        showCaptureToast(complete ? 'Datos leídos. Revísalos antes de guardar.' : 'Lectura parcial: completa o corrige los campos que falten.');
      } catch (error) {
        pendingCaptureOcrText = '';
        openModal();
        showCaptureToast('No se pudo leer la imagen. Puedes rellenar la apuesta manualmente.');
      }
    }));
    $$('[data-open-bet-capture]').forEach(button => button.addEventListener('click', () => openLinkedCapture(button.dataset.openBetCapture)));
    $$('[data-open-cloud-file]').forEach(button => button.addEventListener('click', () => openCloudCapture(button.dataset.openCloudFile)));
    $$('[data-delete-capture]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.deleteCapture;
      bets.filter(bet => bet.captureId === id).forEach(bet => { bet.captureId = null; });
      save(); await captureRequest('readwrite', store => store.delete(id)); renderCaptures();
    }));
    $$('[data-delete-cloud-capture]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.deleteCloudCapture, path = button.dataset.path;
      if (!window.confirm('¿Eliminar esta captura de tu almacenamiento en la nube?')) return;
      const { error: storageError } = await cloud.storage.from('bet-captures').remove([path]);
      if (storageError) { showCaptureToast(`No se pudo borrar: ${storageError.message}`); return; }
      const { error } = await cloud.from('captures').delete().eq('id', id);
      if (error) { showCaptureToast(`No se pudo borrar el registro: ${error.message}`); return; }
      bets.filter(bet => bet.captureFileId === id).forEach(bet => { bet.capturePath = null; bet.captureFileId = null; });
      await save(); renderCaptures();
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
async function openCloudCapture(path) {
  if (!cloud || !cloudUser) return;
  const { data, error } = await cloud.storage.from('bet-captures').createSignedUrl(path, 3600);
  if (error) { showCaptureToast(`No se pudo abrir la captura: ${error.message}`); return; }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}
async function uploadCaptureForBet(localId, bet) {
  if (!cloudUser || !cloud) throw new Error('Inicia sesión antes de subir capturas.');
  const file = await captureRequest('readonly', store => store.get(localId));
  if (!file) throw new Error('No se encontró la captura en este dispositivo.');
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${cloudUser.id}/${bet.id}/${file.id}.${extension}`;
  const { error: uploadError } = await cloud.storage.from('bet-captures').upload(path, file.blob, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { error: recordError } = await cloud.from('captures').insert({ id: file.id, user_id: cloudUser.id, bet_id: bet.id, object_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.blob.size });
  if (recordError) { await cloud.storage.from('bet-captures').remove([path]); throw recordError; }
  bet.capturePath = path; bet.captureFileId = file.id; bet.captureId = null;
  await save(); await captureRequest('readwrite', store => store.delete(localId)); renderCaptures();
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
initializeCloud();


