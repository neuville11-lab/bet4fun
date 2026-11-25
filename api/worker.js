const SPORT_CONFIG = {
  football: { base: 'https://v3.football.api-sports.io', endpoint: 'fixtures', finished: new Set(['FT', 'AET', 'PEN']) },
  basketball: { base: 'https://v1.basketball.api-sports.io', endpoint: 'games', finished: new Set(['FT', 'AOT', 'AP']) },
  hockey: { base: 'https://v1.hockey.api-sports.io', endpoint: 'games', finished: new Set(['FT', 'AOT', 'AP']) },
  rugby: { base: 'https://v1.rugby.api-sports.io', endpoint: 'games', finished: new Set(['FT', 'AET']) },
  baseball: { base: 'https://v1.baseball.api-sports.io', endpoint: 'games', finished: new Set(['FT']) },
  handball: { base: 'https://v1.handball.api-sports.io', endpoint: 'games', finished: new Set(['FT', 'AET']) },
  volleyball: { base: 'https://v1.volleyball.api-sports.io', endpoint: 'games', finished: new Set(['FT', 'AET']) }
};

function response(body, status, origin) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin', 'Cache-Control': 'no-store'
  }});
}
function normalize(value) {
  return String(value || '').toLocaleLowerCase('es-ES').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function dateCandidates(eventDate) {
  const base = new Date(eventDate + 'T12:00:00Z');
  return [-1, 0, 1].map(offset => {
    const candidate = new Date(base); candidate.setUTCDate(candidate.getUTCDate() + offset);
    return candidate.toISOString().slice(0, 10);
  });
}
function eventTeams(event) {
  const parts = String(event || '').split(/\s+(?:–|—|-|vs\.?|v)\s+/i).map(normalize).filter(Boolean);
  return parts.length === 2 ? parts : [];
}
function teamsOf(game) {
  return game.teams || game.fixture?.teams || {};
}
function gameMatchesEvent(game, teams) {
  if (teams.length !== 2) return false;
  const sides = teamsOf(game);
  const home = normalize(sides.home?.name || sides.home);
  const away = normalize(sides.away?.name || sides.away);
  const contains = (a, b) => Boolean(a && b && (a.includes(b) || b.includes(a)));
  return (contains(teams[0], home) && contains(teams[1], away)) ||
    (contains(teams[1], home) && contains(teams[0], away));
}
function statusOf(game) {
  return String(game.fixture?.status?.short || game.game?.status?.short || game.status?.short || '').toUpperCase();
}
function isFinished(game, config) {
  const status = statusOf(game);
  const long = normalize(game.fixture?.status?.long || game.game?.status?.long || game.status?.long || '');
  return config.finished.has(status) || long.includes('finished') || long.includes('final');
}
function gameId(game) {
  return game.fixture?.id || game.game?.id || game.id;
}
function scoreSides(game, sport) {
  if (sport === 'football') return { home: game.goals?.home, away: game.goals?.away };
  const scores = game.scores || game.game?.scores || {};
  const number = value => {
    if (value == null || value === '') return null;
    if (typeof value === 'object') {
      for (const key of ['total', 'points', 'goals', 'runs', 'score']) {
        if (value[key] != null && value[key] !== '' && Number.isFinite(Number(value[key]))) return Number(value[key]);
      }
      return null;
    }
    return Number.isFinite(Number(value)) ? Number(value) : null;
  };
  return { home: number(scores.home), away: number(scores.away) };
}
function scoreForSelection(selection, bet, game, sport) {
  const scores = scoreSides(game, sport);
  const homeName = normalize(teamsOf(game).home?.name || teamsOf(game).home);
  const awayName = normalize(teamsOf(game).away?.name || teamsOf(game).away);
  const eventSides = eventTeams(bet.event);
  const text = normalize(selection);
  if (/\b(?:empate|draw|tie)\b/.test(text)) return scores.home === scores.away ? 1 : 0;
  const firstSide = eventSides[0] && (eventSides[0].includes(homeName) || homeName.includes(eventSides[0])) ? 'home' : 'away';
  const secondSide = firstSide === 'home' ? 'away' : 'home';
  if (/1\s*(?:er|º|o)?\s*equipo|primer equipo|home|local/.test(text)) return scores[firstSide];
  if (/2\s*(?:o|º|do)?\s*equipo|segundo equipo|away|visitante/.test(text)) return scores[secondSide];
  if (homeName && text.includes(homeName)) return scores.home;
  if (awayName && text.includes(awayName)) return scores.away;
  if (/corn|corner/.test(text)) return null;
  if (/\b(?:total|goals?|goles?|points?|puntos?|runs?|carreras?|goals team|team points)\b/.test(text) || /\b(?:over|under|superior|inferior|mas de|menos de)\b/.test(text)) {
    if (scores.home == null || scores.away == null) return null;
    return scores.home + scores.away;
  }
  return null;
}
function parseMarket(selection, sport) {
  const raw = String(selection || '');
  const text = normalize(raw);
  const numberMatch = raw.match(/(?:>=|≥|<=|≤|>|<|superior(?:\s+a)?|inferior(?:\s+a)?|over|under|mas\s+de|menos\s+de)\s*(\d+(?:[.,]\d+)?)/i) ||
    raw.match(/\b(?:total|over|under)\s+(\d+(?:[.,]\d+)?)/i);
  const line = numberMatch ? Number(numberMatch[1].replace(',', '.')) : null;
  const inclusive = /(?:>=|≥|<=|≤)/.test(raw);
  let direction = null;
  if (/(?:>=|≥|>|superior|over|mas de)/i.test(raw)) direction = 'over';
  else if (/(?:<=|≤|<|inferior|under|menos de)/i.test(raw)) direction = 'under';
  let metric = '';
  if (/corner|corn|esquina/.test(text)) metric = 'corners';
  else if (/rebote|rebound/.test(text)) metric = 'rebounds';
  else if (/asist|assist/.test(text)) metric = 'assists';
  else if (/punto|points|carrera|runs/.test(text)) metric = 'points';
  else if (/gol|goal/.test(text)) metric = 'goals';
  else if (/yellow card|tarjeta amarilla/.test(text)) metric = 'yellow cards';
  else if (/shot on goal|tiro a puerta/.test(text)) metric = 'shots on goal';
  else if (/foul|falta/.test(text)) metric = 'fouls';
  else if (/offside|fuera de juego/.test(text)) metric = 'offsides';
  if (!direction || line === null) {
    if (sport === 'football' && /\b(?:1x2|ganador|winner)\b/.test(text)) return { kind: 'winner', selection: text };
    return null;
  }
  return { kind: 'line', line, direction, inclusive, metric, selection: text };
}
function findMetricValue(value, metric) {
  const aliases = {
    assists: ['assists', 'assist'], rebounds: ['rebounds', 'rebound'],
    points: ['points', 'point']
  }[metric];
  if (!aliases || !value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (!aliases.includes(normalize(key).replace(/ /g, ''))) continue;
    if (child !== null && child !== '' && Number.isFinite(Number(child))) return Number(child);
    if (child && typeof child === 'object') for (const field of ['total', 'count', 'value']) {
      if (child[field] !== null && child[field] !== '' && Number.isFinite(Number(child[field]))) return Number(child[field]);
    }
  }
  for (const child of Object.values(value)) {
    const found = findMetricValue(child, metric); if (found !== null) return found;
  }
  return null;
}
async function apiGet(base, path, params, apiKey) {
  const url = new URL(base + '/' + path);
  Object.entries(params).forEach(([key, value]) => { if (value != null) url.searchParams.set(key, value); });
  const result = await fetch(url, { headers: { 'x-apisports-key': apiKey } });
  const data = await result.json();
  if (!result.ok || (data.errors && Object.keys(data.errors).length)) {
    throw new Error('API-Sports no pudo completar la consulta para este deporte.');
  }
  return data.response || [];
}
function footballStatsValue(rows, teamName, metric) {
  const aliases = {
    corners: ['corner kicks'], 'yellow cards': ['yellow cards'],
    'shots on goal': ['shots on goal'], fouls: ['fouls'], offsides: ['offsides']
  }[metric];
  if (!aliases) return null;
  const team = rows.find(row => normalize(row.team?.name).includes(teamName) || teamName.includes(normalize(row.team?.name)));
  const stat = team?.statistics?.find(item => aliases.includes(normalize(item.type)));
  if (stat?.value == null || stat.value === '') return null;
  const number = Number(String(stat.value).replace('%', ''));
  return Number.isFinite(number) ? number : null;
}
function evaluate(actual, market) {
  if (actual === null || actual === undefined || !Number.isFinite(Number(actual))) return 'unknown';
  const value = Number(actual), line = market.line;
  if (market.direction === 'over') {
    if (market.inclusive ? value >= line : value > line) return 'won';
    if (!market.inclusive && value === line) return 'void';
    return 'lost';
  }
  if (market.inclusive ? value <= line : value < line) return 'won';
  if (!market.inclusive && value === line) return 'void';
  return 'lost';
}
function resultSummary(bet, legs, game, provider) {
  if (legs.some(item => item.outcome === 'unknown')) return {
    status: 'incomplete', provider, game: { id: gameId(game), status: statusOf(game) },
    legs, message: 'El proveedor no publica todos los datos necesarios para estas selecciones.'
  };
  let actualProfit = 0;
  legs.forEach((item, index) => {
    const leg = bet.legs[index], stake = Number(leg.stake || 0), odds = Number(leg.odds || 0);
    if (item.outcome === 'won') actualProfit += stake * (odds - 1);
    else if (item.outcome === 'lost') actualProfit -= stake;
  });
  return {
    status: 'verified', provider, game: { id: gameId(game), status: statusOf(game) }, legs,
    actualProfit: Number(actualProfit.toFixed(2)),
    result: legs.every(item => item.outcome === 'void') ? 'void' : actualProfit >= 0 ? 'won' : 'lost',
    checkedAt: new Date().toISOString(),
    warning: 'Resultado automático orientativo. Verifica también la liquidación en la casa de apuestas.'
  };
}
async function checkFootball(bet, config, apiKey, date) {
  const fixtures = await apiGet(config.base, 'fixtures', { date, timezone: 'Europe/Madrid' }, apiKey);
  const teams = eventTeams(bet.event);
  const game = fixtures.find(item => gameMatchesEvent(item, teams));
  if (!game) return null;
  if (!isFinished(game, config)) return { status: 'not_finished', message: 'API-Sports todavía no marca el partido como finalizado.' };
  const parsed = bet.legs.map(leg => parseMarket(leg.selection, 'football'));
  if (parsed.some(item => !item)) return { status: 'unsupported', message: 'La lectura automática aún no reconoce ese mercado de fútbol.' };
  const hasStats = parsed.some(item => ['corners', 'yellow cards', 'shots on goal', 'fouls', 'offsides'].includes(item.metric));
  const stats = hasStats ? await apiGet(config.base, 'fixtures/statistics', { fixture: game.fixture?.id || game.id }, apiKey) : [];
  const sides = teamsOf(game);
  const eventOrder = eventTeams(bet.event);
  const firstName = eventOrder[0] || '';
  const firstIsHome = normalize(sides.home?.name).includes(firstName) || firstName.includes(normalize(sides.home?.name));
  const legRows = bet.legs.map((leg, index) => {
    const market = parsed[index];
    let actual = null;
    if (market.metric === 'corners' || market.metric === 'yellow cards' || market.metric === 'shots on goal' || market.metric === 'fouls' || market.metric === 'offsides') {
      const isFirst = /1\s*(?:er|º|o)?\s*equipo|primer equipo/.test(market.selection);
      const isSecond = /2\s*(?:o|º|do)?\s*equipo|segundo equipo/.test(market.selection);
      const teamName = isFirst ? (firstIsHome ? normalize(sides.home?.name) : normalize(sides.away?.name))
        : isSecond ? (firstIsHome ? normalize(sides.away?.name) : normalize(sides.home?.name)) : null;
      if (teamName) actual = footballStatsValue(stats, teamName, market.metric);
      else {
        const values = stats.map(row => footballStatsValue([row], normalize(row.team?.name), market.metric));
        actual = values.length >= 2 && values.every(value => value !== null) ? values.reduce((sum, value) => sum + value, 0) : null;
      }
    } else {
      actual = scoreForSelection(leg.selection, bet, game, 'football');
    }
    return { bookmaker: leg.bookmaker, outcome: evaluate(actual, market), actual, market: market.metric || 'marcador', line: market.line };
  });
  return resultSummary(bet, legRows, game, 'API-Sports Football');
}
async function checkBasketball(bet, config, apiKey, date) {
  const games = await apiGet(config.base, 'games', { date }, apiKey);
  const game = games.find(item => gameMatchesEvent(item, eventTeams(bet.event)));
  if (!game) return null;
  if (!isFinished(game, config)) return { status: 'not_finished', message: 'API-Sports todavía no marca el partido como finalizado.' };
  const markets = bet.legs.map(leg => parseMarket(leg.selection, 'basketball'));
  const playerRows = bet.legs.some(leg => /\b\d+(?:[.,]\d+)?\s*(?:puntos?|points?|rebotes?|rebounds?|asistencias?|assists?)\b/i.test(leg.selection)) ?
    await apiGet(config.base, 'games/statistics/players', { id: gameId(game) }, apiKey) : [];
  const stats = game.scores || {};
  const legs = bet.legs.map((leg, index) => {
    const market = markets[index];
    if (!market) return { bookmaker: leg.bookmaker, outcome: 'unknown' };
    let actual = null;
    if (['points', 'assists', 'rebounds'].includes(market.metric) && bet.player) {
      const playerRow = playerRows.find(row => normalize(row.player?.name || row.name) === normalize(bet.player) ||
        normalize(row.player?.name || row.name).includes(normalize(bet.player)) || normalize(bet.player).includes(normalize(row.player?.name || row.name)));
      actual = playerRow ? findMetricValue(playerRow.statistics || playerRow, market.metric) : null;
    } else if (market.metric === 'points' || market.metric === 'goals') {
      actual = scoreForSelection(leg.selection, bet, game, 'basketball');
    }
    return { bookmaker: leg.bookmaker, outcome: evaluate(actual, market), actual, market: market.metric, line: market.line };
  });
  return resultSummary(bet, legs, game, 'API-Sports Basketball');
}
async function checkHockey(bet, config, apiKey, date) {
  const games = await apiGet(config.base, 'games', { date }, apiKey);
  const game = games.find(item => gameMatchesEvent(item, eventTeams(bet.event)));
  if (!game) return null;
  if (!isFinished(game, config)) return { status: 'not_finished', message: 'API-Sports todavía no marca el partido como finalizado.' };
  const markets = bet.legs.map(leg => parseMarket(leg.selection, 'hockey'));
  const legs = bet.legs.map((leg, index) => {
    const market = markets[index], actual = market ? scoreForSelection(leg.selection, bet, game, 'hockey') : null;
    return { bookmaker: leg.bookmaker, outcome: market ? evaluate(actual, market) : 'unknown', actual, market: market?.metric || 'marcador', line: market?.line };
  });
  return resultSummary(bet, legs, game, 'API-Sports Hockey');
}
async function checkScoreSport(bet, config, apiKey, date, sport) {
  const games = await apiGet(config.base, config.endpoint, { date, timezone: 'Europe/Madrid' }, apiKey);
  const game = games.find(item => gameMatchesEvent(item, eventTeams(bet.event)));
  if (!game) return null;
  if (!isFinished(game, config)) return { status: 'not_finished', message: 'API-Sports todavía no marca el encuentro como finalizado.' };
  const markets = bet.legs.map(leg => parseMarket(leg.selection, sport));
  const legs = bet.legs.map((leg, index) => {
    const market = markets[index];
    const scoreMarket = market && ['', 'goals', 'points'].includes(market.metric);
    const actual = scoreMarket ? scoreForSelection(leg.selection, bet, game, sport) : null;
    return { bookmaker: leg.bookmaker, outcome: scoreMarket ? evaluate(actual, market) : 'unknown', actual, market: market?.metric || 'marcador', line: market?.line };
  });
  return resultSummary(bet, legs, game, 'API-Sports ' + sport[0].toUpperCase() + sport.slice(1));
}
async function checkBet(bet, env) {
  const sportText = normalize(bet.sport);
  const provider = /futbol|football|soccer/.test(sportText) ? 'football' :
    /basket|baloncesto|nba/.test(sportText) ? 'basketball' :
    /hockey|floorball/.test(sportText) ? 'hockey' :
    /rugby/.test(sportText) ? 'rugby' :
    /baseball|beisbol|softbol|softball/.test(sportText) ? 'baseball' :
    /handball|balonmano/.test(sportText) ? 'handball' :
    /volleyball|voleibol/.test(sportText) ? 'volleyball' : null;
  if (!provider) return { status: 'unsupported', message: 'Este deporte todavía no está conectado. API-Sports cubre más deportes; ampliaremos su adaptador.' };
  const config = SPORT_CONFIG[provider];
  const apiKey = env['API_SPORTS_' + provider.toUpperCase() + '_KEY'] || env.API_SPORTS_KEY;
  if (!apiKey) return { status: 'configuration_error', message: 'Falta configurar la clave API-Sports para ' + provider + '.' };
  const eventDate = String(bet.eventDate || bet.eventAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return { status: 'unsupported', message: 'La fecha del evento no es válida.' };
  for (const date of dateCandidates(eventDate)) {
    const checked = provider === 'football' ? await checkFootball(bet, config, apiKey, date) :
      provider === 'basketball' ? await checkBasketball(bet, config, apiKey, date) :
      provider === 'hockey' ? await checkHockey(bet, config, apiKey, date) :
      await checkScoreSport(bet, config, apiKey, date, provider);
    if (checked) return checked;
  }
  return { status: 'not_found', message: 'No se encontró un encuentro que coincida con los equipos y la fecha.' };
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://neuville11-lab.github.io').split(',').map(value => value.trim());
    if (!allowed.includes(origin)) return new Response('Origin not allowed', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin'
    }});
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/check-bet') {
      return response({ status: 'not_found' }, 404, origin);
    }
    try {
      const bet = await request.json();
      if (!bet || !Array.isArray(bet.legs) || bet.legs.length < 1 || bet.legs.length > 4) {
        return response({ status: 'invalid_request', message: 'Datos de apuesta no válidos.' }, 400, origin);
      }
      return response(await checkBet(bet, env), 200, origin);
    } catch (error) {
      return response({ status: 'provider_error', message: error.message || 'No se pudo consultar el resultado.' }, 502, origin);
    }
  }
};
