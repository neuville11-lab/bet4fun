(() => {
  'use strict';

  const STORAGE_KEY = 'bet4fun-surebet-import:v1';
  const DISPLAY_LIMIT = 10;
  const MAX_RECORDS = 500;
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const $ = id => document.getElementById(id);

  const text = value => String(value ?? '').trim();
  const firstValue = (record, keys) => {
    for (const key of keys) {
      const value = record?.[key];
      if (value !== undefined && value !== null && text(value) !== '') return value;
    }
    return '';
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const parseNumber = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const normalized = text(value).replace(/\s/g, '').replace(',', '.').replace(/%$/, '');
    return normalized ? Number(normalized) : NaN;
  };
  const parseSide = value => {
    const side = text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (['favor', 'a favor', 'back', 'for', 'f', 'lay-back'].includes(side)) return 'favor';
    if (['contra', 'a la contra', 'lay', 'against', 'c'].includes(side)) return 'contra';
    return '';
  };
  const formatDate = value => {
    if (!value) return 'Sin fecha';
    const raw = text(value);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
    return Number.isNaN(date.getTime()) ? 'Sin fecha' : new Intl.DateTimeFormat('es-ES', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(date);
  };

  function parseImport(input) {
    const source = Array.isArray(input) ? input : input?.opportunities ?? input?.surebets;
    if (!Array.isArray(source)) throw new Error('El JSON debe contener una lista «opportunities».');
    if (source.length > MAX_RECORDS) throw new Error(`El archivo supera el máximo de ${MAX_RECORDS} oportunidades.`);

    const opportunities = source.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`La oportunidad ${index + 1} no es un objeto válido.`);
      const event = text(firstValue(raw, ['event', 'match', 'game', 'fixture', 'partido', 'title']));
      const sport = text(firstValue(raw, ['sport', 'deporte', 'discipline'])) || 'Sin especificar';
      const competition = text(firstValue(raw, ['competition', 'league', 'tournament', 'competicion', 'competitionName'])) || 'Sin competición';
      const startsAt = text(firstValue(raw, ['startsAt', 'eventAt', 'startDate', 'eventDate', 'date', 'fecha']));
      const profitPct = parseNumber(firstValue(raw, ['profitPct', 'profitPercent', 'roi', 'benefitPercent', 'percentage', 'beneficioPct']));
      const rawOffers = firstValue(raw, ['offers', 'quotes', 'odds', 'legs', 'cuotas']);

      if (!event) throw new Error(`Falta el partido en la oportunidad ${index + 1}.`);
      if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) throw new Error(`La fecha del evento ${index + 1} no es válida.`);
      if (!Number.isFinite(profitPct)) throw new Error(`Falta el porcentaje de beneficio en la oportunidad ${index + 1}.`);
      if (!Array.isArray(rawOffers) || rawOffers.length < 2) throw new Error(`La oportunidad ${index + 1} necesita al menos dos cuotas en «offers».`);

      const offers = rawOffers.map((offer, offerIndex) => {
        if (!offer || typeof offer !== 'object' || Array.isArray(offer)) throw new Error(`La cuota ${offerIndex + 1} de la oportunidad ${index + 1} no es válida.`);
        const side = parseSide(firstValue(offer, ['side', 'direction', 'position', 'tipo', 'lado']));
        const bookmaker = text(firstValue(offer, ['bookmaker', 'bookie', 'house', 'casa', 'site']));
        const market = text(firstValue(offer, ['market', 'selection', 'mercado', 'seleccion']));
        const odds = parseNumber(firstValue(offer, ['odds', 'quote', 'cuota', 'price']));
        if (!side) throw new Error(`Indica «favor» o «contra» en la cuota ${offerIndex + 1} de la oportunidad ${index + 1}.`);
        if (!bookmaker || !market || !Number.isFinite(odds) || odds <= 1) throw new Error(`La cuota ${offerIndex + 1} de la oportunidad ${index + 1} necesita casa, mercado y una cuota mayor que 1.`);
        return { side, bookmaker, market, odds };
      });

      return {
        id: text(firstValue(raw, ['id', 'opportunityId', 'surebetId'])) || `import-${index + 1}`,
        event, sport, competition, startsAt, profitPct, offers
      };
    });
    return opportunities;
  }

  function readSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || !Array.isArray(saved.opportunities)) return null;
      return { ...saved, opportunities: parseImport(saved.opportunities) };
    } catch { return null; }
  }

  function renderOffer(offer) {
    const label = offer.side === 'favor' ? 'A FAVOR' : 'A LA CONTRA';
    return `<div class="sb-offer"><span class="sb-side ${offer.side}">${label}</span><b>${escapeHtml(offer.bookmaker)}</b><span class="sb-market">${escapeHtml(offer.market)}</span><strong class="sb-odds">${offer.odds.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</strong></div>`;
  }

  function renderRows(opportunities) {
    return opportunities.slice(0, DISPLAY_LIMIT).map((opportunity, index) => `
      <tr>
        <td><span class="sb-index">${String(index + 1).padStart(2, '0')}</span><b class="sb-event">${escapeHtml(opportunity.event)}</b></td>
        <td><span class="sb-sport">${escapeHtml(opportunity.sport)}</span><small class="sb-competition">${escapeHtml(opportunity.competition)}</small></td>
        <td class="sb-date">${escapeHtml(formatDate(opportunity.startsAt))}</td>
        <td class="sb-offers-cell">${opportunity.offers.map(renderOffer).join('')}</td>
        <td><strong class="sb-profit">+${opportunity.profitPct.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</strong></td>
      </tr>`).join('');
  }

  function init() {
    const page = $('page-surebet');
    if (!page) return;
    const input = $('surebet-json-file');
    const rows = $('surebet-rows');
    const empty = $('surebet-empty');
    const status = $('surebet-import-status');
    const updated = $('surebet-updated');
    const count = $('surebet-count');
    const clear = $('surebet-clear');
    let state = readSaved();

    const render = () => {
      const opportunities = state?.opportunities || [];
      rows.innerHTML = renderRows(opportunities);
      empty.hidden = opportunities.length > 0;
      clear.disabled = opportunities.length === 0;
      if (!state) {
        status.textContent = 'Todavía no has importado oportunidades.';
        updated.textContent = 'Última actualización: —';
        count.textContent = 'Importa un JSON para ver las oportunidades.';
        return;
      }
      status.textContent = `Importación local: ${state.fileName || 'archivo JSON'} · ${opportunities.length} oportunidades cargadas.`;
      updated.textContent = `Última actualización: ${formatDate(state.updatedAt)}`;
      count.textContent = `Mostrando ${Math.min(opportunities.length, DISPLAY_LIMIT)} de ${opportunities.length} oportunidades, en el orden del archivo.`;
    };

    $('surebet-choose-file').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) { status.textContent = 'El archivo supera el límite de 5 MB.'; return; }
      if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') { status.textContent = 'Selecciona un archivo JSON.'; return; }
      try {
        const opportunities = parseImport(JSON.parse(await file.text()));
        if (!opportunities.length) throw new Error('El archivo no contiene oportunidades.');
        const next = { version: 1, fileName: file.name, updatedAt: new Date().toISOString(), opportunities };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        state = next;
        render();
      } catch (error) {
        status.textContent = error?.message || 'No se pudo leer el JSON. Comprueba su formato e inténtalo de nuevo.';
      }
    });
    clear.addEventListener('click', () => {
      if (!state || !window.confirm('¿Limpiar la importación local de SureBet.com? Tus apuestas registradas no se modificarán.')) return;
      localStorage.removeItem(STORAGE_KEY);
      state = null;
      render();
    });

    render();
  }

  window.BET4FUNSurebet = Object.freeze({ parseImport });
  init();
})();

