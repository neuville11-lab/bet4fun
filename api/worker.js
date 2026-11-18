const API_BASE = 'https://v1.basketball.api-sports.io';
const NBA_LEAGUE_ID = 12;
const FINISHED = new Set(['FT', 'AOT', 'AP']);

function response(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
      'Cache-Control': 'no-store'
    }
  });
}

function normalize(value) {
  return String(value || '').toLocaleLowerCase('es-ES').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function nbaSeason(date) {
  const [year, month] = date.split('-').map(Number);
  return month >= 10 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function dateCandidates(eventDate) {
  const base = new Date(`${eventDate}T12:00:00Z`);
  return [-1, 0, 1].map(offset => {
    const candidate = new Date(base);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    return candidate.toISOString().slice(0, 10);
  });
}

function eventTeams(event) {
  const parts = String(event || '').split(/\s+(?:–|—|-|vs\.?|v)\s+/i).map(normalize).filter(Boolean);
  return parts.length === 2 ? parts : [];
}

function gameMatchesEvent(game, teams) {
  if (teams.length !== 2) return false;
  const home = normalize(game.teams?.home?.name);
  const away = normalize(game.teams?.away?.name);
  return teams.some(team => team && (home.includes(team) || team.includes(home))) &&
    teams.some(team => team && (away.includes(team) || team.includes(away)));
}

function parseSelection(selection) {
  const text = normalize(selection);
  const lineMatch = String(selection || '').match(/(superior(?:\s+a)?|inferior(?:\s+a)?|over|under|mas\s+de|menos\s+de)\s*(\d+(?:[.,]\d+)?)/i);
  if (!lineMatch) return null;
  const direction = /^(superior|over|mas)/i.test(lineMatch[1]) ? 'over' : 'under';
  let metric = '';
  if (/asist|assist/.test(text)) metric = 'assists';
  else if (/rebote|rebound/.test(text)) metric = 'rebounds';
  else if (/punto|points/.test(text)) metric = 'points';
  if (!metric) return null;
  return { direction, line: Number(lineMatch[2].replace(',', '.')), metric };
}

function findMetricValue(value, metric) {
  const aliases = {
    assists: ['assists', 'assist'],
    rebounds: ['rebounds', 'rebound'],
    points: ['points', 'point']
  }[metric];
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const keyName = normalize(key).replace(/ /g, '');
    if (aliases.includes(keyName)) {
      if (child !== null && child !== '' && Number.isFinite(Number(child))) return Number(child);
      if (child && typeof child === 'object') {
        for (const totalKey of ['total', 'count', 'value']) {
          const total = child[totalKey];
          if (total !== null && total !== '' && total !== undefined && Number.isFinite(Number(total))) return Number(total);
        }
      }
    }
  }
  for (const child of Object.values(value)) {
    const found = findMetricValue(child, metric);
    if (found !== null) return found;
  }
  return null;
}

async function apiGet(path, params, apiKey) {
  const url = new URL(`${API_BASE}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const result = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
  const data = await result.json();
  if (!result.ok || (data.errors && Object.keys(data.errors).length)) {
    throw new Error('El proveedor de resultados no ha podido completar la consulta.');
  }
  return data.response || [];
}

function finished(game) {
  const status = String(game.status?.short || '').toUpperCase();
  const description = normalize(game.status?.long || '');
  return FINISHED.has(status) || description.includes('finished') || description.includes('final');
}

async function checkBet(bet, apiKey) {
  if (!/nba|baloncesto|basket/i.test(bet.sport || '')) {
    return { status: 'unsupported', message: 'La comprobación automática está habilitada por ahora para NBA.' };
  }
  const teams = eventTeams(bet.event);
  if (!teams.length) return { status: 'unsupported', message: 'No se pudieron identificar los dos equipos del evento.' };
  const markets = bet.legs.map(leg => parseSelection(leg.selection));
  if (markets.some(market => !market) || !bet.player) {
    return { status: 'unsupported', message: 'De momento se admiten mercados de puntos, rebotes o asistencias de un jugador NBA.' };
  }
  const eventDate = String(bet.eventDate || bet.eventAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return { status: 'unsupported', message: 'La fecha del evento no es válida.' };
  const season = nbaSeason(eventDate);
  const dates = dateCandidates(eventDate);
  const allGames = [];
  for (const date of dates) {
    const games = await apiGet('games', { league: NBA_LEAGUE_ID, season, date }, apiKey);
    allGames.push(...games);
  }
  const game = allGames.find(item => gameMatchesEvent(item, teams));
  if (!game) return { status: 'not_found', message: 'No se encontró un partido NBA que coincida con el evento y la fecha.' };
  if (!finished(game)) return { status: 'not_finished', message: 'El proveedor todavía no marca este partido como finalizado.' };
  const playerRows = await apiGet('games/statistics/players', { id: game.id }, apiKey);
  const targetName = normalize(bet.player);
  const playerRow = playerRows.find(row => {
    const name = normalize(row.player?.name || row.name);
    return name === targetName || name.includes(targetName) || targetName.includes(name);
  });
  if (!playerRow) return { status: 'not_found', message: 'No se encontraron estadísticas de ese jugador en el partido.' };
  const stats = playerRow.statistics || playerRow;
  const legs = bet.legs.map((leg, index) => {
    const market = markets[index];
    const actual = findMetricValue(stats, market.metric);
    if (actual === null) return { bookmaker: leg.bookmaker, outcome: 'unknown', message: 'El proveedor no publicó esa estadística.' };
    const outcome = actual === market.line ? 'void' : (market.direction === 'over' ? actual > market.line : actual < market.line) ? 'won' : 'lost';
    return { bookmaker: leg.bookmaker, outcome, actual, market: market.metric, line: market.line };
  });
  if (legs.some(leg => leg.outcome === 'unknown')) return { status: 'incomplete', message: 'Faltan estadísticas para completar la comprobación.', legs };
  let actualProfit = 0;
  legs.forEach((item, index) => {
    const leg = bet.legs[index];
    if (item.outcome === 'won') actualProfit += Number(leg.stake || 0) * (Number(leg.odds || 0) - 1);
    else if (item.outcome === 'lost') actualProfit -= Number(leg.stake || 0);
  });
  return {
    status: 'verified',
    provider: 'API-Sports Basketball',
    game: { id: game.id, status: game.status?.long || game.status?.short },
    legs,
    actualProfit: Number(actualProfit.toFixed(2)),
    result: legs.every(item => item.outcome === 'void') ? 'void' : actualProfit >= 0 ? 'won' : 'lost',
    checkedAt: new Date().toISOString(),
    warning: 'Comprueba también la liquidación en la casa de apuestas; sus reglas y posibles correcciones pueden variar.'
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://neuville11-lab.github.io').split(',').map(value => value.trim());
    if (!allowed.includes(origin)) return new Response('Origin not allowed', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    } });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/check-bet') {
      return response({ status: 'not_found' }, 404, origin);
    }
    if (!env.API_SPORTS_KEY) return response({ status: 'configuration_error', message: 'Falta configurar la clave de API-Sports en el backend.' }, 503, origin);
    try {
      const bet = await request.json();
      if (!bet || !Array.isArray(bet.legs) || bet.legs.length < 1 || bet.legs.length > 4) {
        return response({ status: 'invalid_request', message: 'Datos de apuesta no válidos.' }, 400, origin);
      }
      return response(await checkBet(bet, env.API_SPORTS_KEY), 200, origin);
    } catch (error) {
      return response({ status: 'provider_error', message: error.message || 'No se pudo comprobar el resultado.' }, 502, origin);
    }
  }
};

