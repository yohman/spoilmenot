window.EPLData = (() => {
  const leagueBadge = label => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#242424" stroke="#e8e8e4" stroke-width="2"/><text x="32" y="36" fill="#f3f3f1" font-family="Arial,sans-serif" font-size="${label.length > 3 ? 17 : 20}" font-weight="700" text-anchor="middle">${label}</text></svg>`)}`;
  const LEAGUES = {
    epl: { id: 'epl', sport: 'soccer', slug: 'eng.1', name: 'Premier League', shortName: 'PREMIER LEAGUE', logo: 'assets/leagues/epl-official.png' },
    laliga: { id: 'laliga', sport: 'soccer', slug: 'esp.1', name: 'La Liga', shortName: 'LA LIGA', logo: 'assets/leagues/laliga-official.png' },
    ucl: { id: 'ucl', sport: 'soccer', slug: 'uefa.champions', name: 'UEFA Champions League', shortName: 'CHAMPIONS LEAGUE', logo: 'assets/leagues/ucl-official.png' },
    carabao: { id: 'carabao', sport: 'soccer', slug: 'eng.league_cup', name: 'Carabao Cup', shortName: 'CARABAO CUP', logo: 'assets/leagues/carabao-cup-official.png' },
    mlb: { id: 'mlb', sport: 'baseball', slug: 'mlb', name: 'Major League Baseball', shortName: 'MLB', logo: 'assets/leagues/mlb-official.png', pastCap: 54, futureCap: 110 },
    nfl: { id: 'nfl', sport: 'football', slug: 'nfl', name: 'National Football League', shortName: 'NFL', logo: 'assets/leagues/nfl-official.png' }
  };
  const MLB_BASE = 'https://statsapi.mlb.com/api/v1', MLB_LIVE = 'https://statsapi.mlb.com/api/v1.1';
  let activeLeague = 'epl';
  const eplRoundLookups = new Map();
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const color = team => team?.color ? `#${team.color}` : '#77736a';
  const espnBase = league => `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}`;
  const espnStandings = league => `https://site.api.espn.com/apis/v2/sports/${league.sport}/${league.slug}/standings`;
  const soccerBase = slug => `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}`;
  const formatSoccerDate = date => date.toISOString().slice(0, 10).replaceAll('-', '');
  const formatMlbDate = date => date.toISOString().slice(0, 10);
  // Keep the single-league and All Leagues feeds on the same calendar policy.
  // Most competitions have enough activity that three days of completed games
  // is useful and compact. A knockout cup can have an entire round outside
  // that window, so retain two weeks there without loading a whole season.
  const fixtureWindow = league => ({
    pastDays: league?.id === 'carabao' ? 14 : 3,
    futureDays: 7
  });
  const soccerFixtureDates = league => {
    const { pastDays, futureDays } = fixtureWindow(league);
    const now = new Date();
    return Array.from({ length: pastDays + futureDays + 1 }, (_, index) => {
      const day = new Date(now);
      day.setDate(now.getDate() - pastDays + index);
      return formatSoccerDate(day);
    });
  };
  const soccerRefreshDates = () => {
    const now = new Date();
    return [-1, 0, 1].map(offset => {
      const day = new Date(now);
      day.setDate(now.getDate() + offset);
      return formatSoccerDate(day);
    });
  };
  const mlbWindow = () => { const now = new Date(), start = new Date(now), end = new Date(now); start.setDate(now.getDate() - 3); end.setDate(now.getDate() + 7); return { startDate: formatMlbDate(start), endDate: formatMlbDate(end) }; };
  const isLiveStatus = status => { const type = status?.type || status || {}, name = String(type.name || status?.name || ''); return type.state === 'in' || status?.state === 'in' || /^STATUS_(?:FIRST|SECOND|HALF|EXTRA|IN_PROGRESS)/.test(name); };
  const fixtureDay = value => { const date = new Date(value); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()); };
  async function loadEplRoundLookup(seasonYear) {
    const year = Number(seasonYear);
    if (!Number.isInteger(year)) return new Map();
    if (eplRoundLookups.has(year)) return eplRoundLookups.get(year);
    const request = fetch(`${espnBase(LEAGUES.epl)}/scoreboard?limit=1000&dates=${year}0801-${year + 1}0601`)
      .then(response => response.ok ? response.json() : null)
      .then(payload => {
        const fixtures = (payload?.events || []).slice().sort((left, right) => new Date(left.date) - new Date(right.date));
        const opener = fixtures[0] ? fixtureDay(fixtures[0].date) : null;
        const lookup = new Map();
        if (opener != null) fixtures.forEach(fixture => {
          const round = Math.floor((fixtureDay(fixture.date) - opener) / 604800000) + 1;
          if (round >= 1 && round <= 38) lookup.set(String(fixture.id), round);
        });
        return lookup;
      })
      .catch(() => new Map());
    eplRoundLookups.set(year, request);
    return request;
  }
  // MLB's own badges are dependable in standard document images. The map filters
  // these SVGs separately because deck.gl's bitmap icon loader needs dimensions.
  const mlbLogo = id => id ? `https://www.mlbstatic.com/team-logos/${id}.svg` : '';
  const MLB_MAP_CODES = { 108: 'laa', 109: 'ari', 110: 'bal', 111: 'bos', 112: 'chc', 113: 'cin', 114: 'cle', 115: 'col', 116: 'det', 117: 'hou', 118: 'kc', 119: 'lad', 120: 'wsh', 121: 'nym', 133: 'ath', 134: 'pit', 135: 'sd', 136: 'sea', 137: 'sf', 138: 'stl', 139: 'tb', 140: 'tex', 141: 'tor', 142: 'min', 143: 'phi', 144: 'atl', 145: 'chw', 146: 'mia', 147: 'nyy', 158: 'mil' };
  const mlbMapLogo = (id, abbreviation) => {
    const code = MLB_MAP_CODES[Number(id)] || { AZ: 'ari', CWS: 'chw' }[String(abbreviation || '').toUpperCase()] || String(abbreviation || '').toLowerCase();
    return code ? `https://a.espncdn.com/i/teamlogos/mlb/500/${code}.png` : '';
  };
  // Generated on GitHub rather than queried from YouTube in the browser. The
  // small local script also works when the site is opened from a file preview.
  const scoreInHighlightTitle = title => /\b\d{1,3}\s*(?:[-–—:]\s*)\d{1,3}\b/.test(String(title || ''));
  const applyHighlights = games => {
    const highlights = window.SpoilHighlights?.highlights;
    if (!highlights || typeof highlights !== 'object') return games;
    games.forEach(game => {
      const item = highlights[`${game.leagueId}:${game.id}`];
      const trustedVideo = /^https:\/\/www\.youtube\.com\/watch\?v=/.test(item?.url || '') || /^https:\/\/www\.mlb\.com\/video\//.test(item?.url || '');
      if (!game.completed || !item || !trustedVideo || scoreInHighlightTitle(item.title)) return;
      game.highlight = item;
    });
    return games;
  };

  function normalize(event, league = LEAGUES[activeLeague]) {
    const competition = event.competitions?.[0], teams = competition?.competitors || [], home = teams.find(team => team.homeAway === 'home'), away = teams.find(team => team.homeAway === 'away');
    if (!home || !away) return null;
    const completed = event.status?.type?.completed === true, live = isLiveStatus(event.status), scored = completed || live;
    return { id: event.id, sport: league.sport, leagueId: league.id, league: league.name, leagueLogo: league.logo, time: new Date(event.date), home: clean(home.team.displayName), away: clean(away.team.displayName), homeId: String(home.team.id || ''), awayId: String(away.team.id || ''), homeAbbr: home.team.abbreviation, awayAbbr: away.team.abbreviation, homeLogo: home.team.logo || home.team.logos?.[0]?.href || '', awayLogo: away.team.logo || away.team.logos?.[0]?.href || '', homeColor: color(home.team), awayColor: color(away.team), homeScore: scored ? Number(home.score) : null, awayScore: scored ? Number(away.score) : null, completed, live, venue: clean(competition.venue?.fullName), status: event.status?.type?.detail || '', events: [], raw: event };
  }

  function normalizeMlb(game, league = LEAGUES.mlb) {
    const home = game.teams?.home, away = game.teams?.away, status = game.status || {};
    if (!home?.team || !away?.team) return null;
    const completed = status.abstractGameState === 'Final', live = status.abstractGameState === 'Live', scored = completed || live;
    return { id: String(game.gamePk), sport: 'baseball', leagueId: league.id, league: league.name, leagueLogo: league.logo, time: new Date(game.gameDate), home: clean(home.team.name), away: clean(away.team.name), homeId: String(home.team.id), awayId: String(away.team.id), homeAbbr: home.team.abbreviation, awayAbbr: away.team.abbreviation, homeLogo: mlbLogo(home.team.id), awayLogo: mlbLogo(away.team.id), homeMapLogo: mlbMapLogo(home.team.id, home.team.abbreviation), awayMapLogo: mlbMapLogo(away.team.id, away.team.abbreviation), homeColor: '#77736a', awayColor: '#b5b5b0', homeScore: scored ? Number(home.score) : null, awayScore: scored ? Number(away.score) : null, completed, live, venue: clean(game.venue?.name), status: status.detailedState || status.abstractGameState || '', probableHomePitcher: home.probablePitcher || null, probableAwayPitcher: away.probablePitcher || null, gameNumber: game.gameNumber, doubleHeader: game.doubleHeader, events: [], raw: game };
  }

  const addSoccerContext = (games, ranks) => games.forEach(game => {
    const home = ranks[game.home], away = ranks[game.away]; if (!Number.isFinite(home) || !Number.isFinite(away)) return;
    game.homeRank = home; game.awayRank = away;
    const competitiveness = 100 - Math.min(70, Math.abs(home - away) * 7), stakes = home <= 6 && away <= 6 ? 20 : home >= 15 && away >= 15 ? 12 : 0;
    game.contextScore = Math.round(Math.min(100, competitiveness + stakes));
  });
  const addMlbContext = (games, table) => games.forEach(game => {
    const home = table[String(game.homeId)], away = table[String(game.awayId)];
    if (!home || !away) return;
    Object.assign(game, { homeRank: home.rank, awayRank: away.rank, homeWins: home.wins, homeLosses: home.losses, awayWins: away.wins, awayLosses: away.losses, homeGamesBack: home.gamesBack, awayGamesBack: away.gamesBack });
    const homePct = home.wins / Math.max(1, home.wins + home.losses), awayPct = away.wins / Math.max(1, away.wins + away.losses);
    const competitiveness = 100 - Math.min(68, Math.abs(homePct - awayPct) * 290), lateSeason = game.time.getMonth() >= 8 ? 14 : game.time.getMonth() >= 7 ? 7 : 0;
    game.contextScore = Math.round(Math.min(100, competitiveness + lateSeason));
  });

  // ESPN accepts a single YYYYMMDD fixture date, but has begun rejecting its
  // previously documented date-range form with HTTP 400. Fetch the bounded
  // calendar window one day at a time, merge duplicate events, and tolerate an
  // isolated failed day so that All Leagues never collapses to just MLB.
  async function fetchSoccerFixtures(league, dates = soccerFixtureDates(league)) {
    const requests = await Promise.allSettled(dates.map(date =>
      fetch(`${espnBase(league)}/scoreboard?limit=1000&dates=${date}`)
    ));
    const payloads = [], statuses = [];
    for (const request of requests) {
      if (request.status !== 'fulfilled') continue;
      if (!request.value.ok) { statuses.push(request.value.status); continue; }
      try { payloads.push(await request.value.json()); } catch (_) {}
    }
    if (!payloads.length) throw Error(`${league.name} fixtures are unavailable (${statuses[0] || 'network'}).`);
    const events = [...new Map(payloads.flatMap(payload => payload.events || []).map(event => [String(event.id), event])).values()];
    return { events, payloads };
  }

  async function loadSoccer(id) {
    const league = LEAGUES[id];
    const [{ events: fixtureEvents, payloads }, standings] = await Promise.all([fetchSoccerFixtures(league), fetch(espnStandings(league)).catch(() => null)]);
    const seasonYear = payloads.find(payload => payload.leagues?.[0]?.season?.year)?.leagues?.[0]?.season?.year || fixtureEvents[0]?.season?.year;
    const roundLookup = id === 'epl' ? await loadEplRoundLookup(seasonYear) : new Map();
    const games = fixtureEvents.map(event => {
      const game = normalize(event, league);
      if (game && roundLookup.has(String(event.id))) game.matchday = roundLookup.get(String(event.id));
      return game;
    }).filter(Boolean);
    if (!games.length) throw Error(`The ${league.name} feed returned no fixtures for this period.`);
    const ranks = {}; try { const table = standings?.ok ? await standings.json() : null; (table?.children || []).flatMap(group => group.standings?.entries || []).forEach(entry => { const stat = name => entry.stats?.find(item => item.name === name)?.value, rank = stat('rank') ?? stat('playoffSeed') ?? stat('divisionRank'); if (Number.isFinite(rank)) ranks[clean(entry.team?.displayName)] = rank; }); } catch (_) {}
    addSoccerContext(games, ranks); return games;
  }

  async function loadMlb() {
    const league = LEAGUES.mlb, { startDate, endDate } = mlbWindow();
    const [scheduleResponse, standingsResponse] = await Promise.all([
      fetch(`${MLB_BASE}/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=linescore,probablePitcher,decisions`),
      fetch(`${MLB_BASE}/standings?leagueId=103,104&season=${new Date().getFullYear()}&standingsTypes=regularSeason`).catch(() => null)
    ]);
    if (!scheduleResponse.ok) throw Error(`MLB fixtures are unavailable (${scheduleResponse.status}).`);
    const schedule = await scheduleResponse.json(), games = (schedule.dates || []).flatMap(date => date.games || []).map(game => normalizeMlb(game, league)).filter(Boolean), now = Date.now(), pastHorizon = now - 3 * 864e5, futureHorizon = now + 7 * 864e5;
    // Status, rather than scheduled first-pitch time, keeps rain delays and live games
    // in the active/future section instead of accidentally treating them as history.
    const past = games.filter(game => game.completed && game.time >= pastHorizon).sort((a, b) => b.time - a.time).slice(0, league.pastCap).reverse();
    const future = games.filter(game => !game.completed && game.time <= futureHorizon).sort((a, b) => a.time - b.time).slice(0, league.futureCap);
    const limited = [...past, ...future];
    if (!limited.length) throw Error('The MLB feed returned no games in the current window.');
    const table = {}; try { const standings = standingsResponse?.ok ? await standingsResponse.json() : null; (standings?.records || []).flatMap(record => record.teamRecords || []).forEach(entry => { table[String(entry.team?.id)] = { rank: Number(entry.divisionRank), wins: Number(entry.wins), losses: Number(entry.losses), gamesBack: entry.gamesBack }; }); } catch (_) {}
    addMlbContext(limited, table); return limited;
  }
  const loadOne = id => LEAGUES[id].sport === 'baseball' ? loadMlb() : loadSoccer(id);
  const compactAllLeagueWindow = (games, league) => {
    const now = Date.now(), window = fixtureWindow(league), pastLimit = league.sport === 'baseball' ? 30 : 24, futureLimit = league.sport === 'baseball' ? 72 : 44;
    const past = games.filter(game => game.completed && game.time >= now - window.pastDays * 864e5).sort((a, b) => b.time - a.time).slice(0, pastLimit).reverse();
    const live = games.filter(game => game.live && !game.completed);
    const future = games.filter(game => !game.completed && !game.live && game.time >= now && game.time <= now + window.futureDays * 864e5).sort((a, b) => a.time - b.time).slice(0, futureLimit);
    return [...past, ...live, ...future];
  };
  async function load(id = activeLeague) {
    if (id === 'all') {
      activeLeague = 'all';
      const results = await Promise.allSettled(Object.keys(LEAGUES).map(async leagueId => compactAllLeagueWindow(await loadOne(leagueId), LEAGUES[leagueId])));
      const combined = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value).sort((a, b) => a.time - b.time);
      if (!combined.length) throw Error('No league feeds are available right now.');
      return applyHighlights(combined);
    }
    const league = LEAGUES[id]; if (!league) throw Error('Unknown league.'); activeLeague = id; return applyHighlights(await loadOne(id));
  }

  function nflScore(game, summary) {
    const plays = (summary.scoringPlays || summary.plays || []).filter(Boolean), home = Number(game.homeScore || 0), away = Number(game.awayScore || 0), margin = Math.abs(home - away), total = home + away, overtime = /overtime|ot/i.test(String(game.status || ''));
    let leader = 0, leadChanges = 0, ties = 0;
    plays.forEach(play => { const next = Math.sign(Number(play.homeScore || 0) - Number(play.awayScore || 0)); if (next === 0 && leader) ties++; if (next && leader && next !== leader) leadChanges++; if (next) leader = next; });
    const drama = Math.min(100, (margin <= 3 ? 42 : margin <= 8 ? 25 : 6) + leadChanges * 18 + ties * 7 + (overtime ? 20 : 0));
    const action = Math.min(100, total * 1.45 + plays.length * 7);
    const exceptional = Math.min(100, (overtime ? 32 : 0) + (total >= 60 ? 32 : total >= 48 ? 17 : 0) + leadChanges * 9);
    const surpriseContext = Number.isFinite(game.contextScore) ? game.contextScore : 40;
    return { watchScore: Math.round(drama * .4 + action * .25 + exceptional * .2 + surpriseContext * .15), drama: Math.round(drama), action: Math.round(action), exceptional: Math.round(exceptional), surpriseContext: Math.round(surpriseContext), reasons: [margin <= 3 && 'One-score finish', overtime && 'Overtime', leadChanges && `${leadChanges} lead change${leadChanges === 1 ? '' : 's'}`, total >= 60 && 'High-scoring game'].filter(Boolean), nfl: true };
  }

  function mlbScore(game, feed) {
    const linescore = feed.liveData?.linescore || {}, teams = linescore.teams || {}, away = teams.away || {}, home = teams.home || {}, plays = (feed.liveData?.plays?.allPlays || []).filter(play => play.about?.isScoringPlay), finalHome = Number(home.runs ?? game.homeScore ?? 0), finalAway = Number(away.runs ?? game.awayScore ?? 0), finalMargin = Math.abs(finalHome - finalAway), extra = (linescore.innings || []).length > 9;
    let previousLeader = 0, leadChanges = 0, ties = 0, lateSwing = 0, maxCaptivating = 0, grandSlams = 0;
    plays.forEach(play => { const homeScore = Number(play.result?.homeScore || 0), awayScore = Number(play.result?.awayScore || 0), leader = Math.sign(homeScore - awayScore), inning = Number(play.about?.inning || 0); if (leader === 0 && previousLeader !== 0) ties++; if (leader !== 0 && previousLeader !== 0 && leader !== previousLeader) leadChanges++; if (inning >= 7 && leader !== previousLeader) lateSwing++; previousLeader = leader || previousLeader; maxCaptivating = Math.max(maxCaptivating, Number(play.about?.captivatingIndex || 0)); if (Number(play.result?.rbi || 0) >= 4 && /home run/i.test(play.result?.event || '')) grandSlams++; });
    const totalRuns = finalHome + finalAway, totalHits = Number(home.hits || 0) + Number(away.hits || 0), drama = Math.round(Math.min(100, (finalMargin === 1 ? 30 : finalMargin === 2 ? 14 : 0) + (extra ? 25 : 0) + leadChanges * 18 + ties * 7 + lateSwing * 10 + maxCaptivating * .23)), action = Math.round(Math.min(100, totalRuns * 5 + totalHits * 1.7 + plays.filter(play => /home run/i.test(play.result?.event || '')).length * 8)), exceptional = Math.round(Math.min(100, grandSlams * 30 + (extra ? 12 : 0) + ((home.hits === 0 || away.hits === 0) ? 30 : (home.hits === 1 || away.hits === 1) ? 16 : 0) + plays.filter(play => Number(play.result?.rbi || 0) >= 3).length * 10)), surpriseContext = Number.isFinite(game.contextScore) ? game.contextScore : 40, watchScore = Math.round(drama * .45 + action * .25 + exceptional * .2 + surpriseContext * .1);
    return { watchScore, drama, action, exceptional, surpriseContext, reasons: [extra && 'Extra innings', finalMargin === 1 && 'One-run finish', leadChanges && `${leadChanges} lead change${leadChanges === 1 ? '' : 's'}`, lateSwing && 'Late-inning swing', grandSlams && 'Grand slam'].filter(Boolean), mlb: true };
  }

  const flattenStats = team => Object.entries(team?.teamStats || {}).flatMap(([, values]) => Object.entries(values || {}).filter(([, value]) => typeof value === 'number' || typeof value === 'string').map(([name, value]) => ({ name, value, displayValue: String(value) })));
  const mlbPersonCountries = new Map();
  const mlbCountryMeta = {
    USA: ['United States', 'us'], 'UNITED STATES': ['United States', 'us'], CANADA: ['Canada', 'ca'],
    'DOMINICAN REPUBLIC': ['Dominican Republic', 'do'], VENEZUELA: ['Venezuela', 've'], CUBA: ['Cuba', 'cu'],
    JAPAN: ['Japan', 'jp'], MEXICO: ['Mexico', 'mx'], 'PUERTO RICO': ['Puerto Rico', 'pr'], PANAMA: ['Panama', 'pa'],
    COLOMBIA: ['Colombia', 'co'], NICARAGUA: ['Nicaragua', 'ni'], CURACAO: ['Curaçao', 'cw'], ARUBA: ['Aruba', 'aw'],
    BAHAMAS: ['Bahamas', 'bs'], KOREA: ['South Korea', 'kr'], 'SOUTH KOREA': ['South Korea', 'kr'], TAIWAN: ['Taiwan', 'tw'],
    AUSTRALIA: ['Australia', 'au'], NETHERLANDS: ['Netherlands', 'nl'], GERMANY: ['Germany', 'de'], ITALY: ['Italy', 'it'],
    BRAZIL: ['Brazil', 'br'], FRANCE: ['France', 'fr'], SPAIN: ['Spain', 'es'], UNITED_KINGDOM: ['United Kingdom', 'gb'],
    'UNITED KINGDOM': ['United Kingdom', 'gb'], IRELAND: ['Ireland', 'ie'], SOUTH_AFRICA: ['South Africa', 'za'],
    'SOUTH AFRICA': ['South Africa', 'za'], NEW_ZEALAND: ['New Zealand', 'nz'], 'NEW ZEALAND': ['New Zealand', 'nz'],
    ISRAEL: ['Israel', 'il'], PHILIPPINES: ['Philippines', 'ph'], HONDURAS: ['Honduras', 'hn'], HAITI: ['Haiti', 'ht'],
    JAMAICA: ['Jamaica', 'jm'], VIRGIN_ISLANDS: ['U.S. Virgin Islands', 'vi'], 'U.S. VIRGIN ISLANDS': ['U.S. Virgin Islands', 'vi']
  };
  const normalizeCountry = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const mlbCountry = value => mlbCountryMeta[normalizeCountry(value)] || (value ? [String(value), ''] : null);
  async function hydrateMlbRosterCountries(game) {
    const players = (game.rosters || []).flatMap(roster => roster.roster || []);
    const ids = [...new Set(players.map(entry => String((entry.athlete || entry)?.id || '')).filter(Boolean))];
    const signature = ids.slice().sort().join(',');
    if (game._mlbCountriesReady && game._mlbCountrySignature === signature) return;
    if (game._mlbCountryPromise) return game._mlbCountryPromise;
    const pending = ids.filter(id => !mlbPersonCountries.has(id));
    game._mlbCountryPromise = (async () => {
      if (pending.length) {
        try {
          const response = await fetch(`${MLB_BASE}/people?personIds=${pending.join(',')}`);
          const payload = response.ok ? await response.json() : null;
          (payload?.people || []).forEach(person => mlbPersonCountries.set(String(person.id), person.birthCountry || person.nationality || ''));
        } catch (_) {}
        pending.forEach(id => { if (!mlbPersonCountries.has(id)) mlbPersonCountries.set(id, ''); });
      }
      players.forEach(entry => {
        const athlete = entry.athlete || entry, details = mlbCountry(mlbPersonCountries.get(String(athlete.id)));
        if (!details) return;
        const [name, code] = details;
        athlete.country = { displayName: name };
        entry.country = athlete.country;
        if (code) athlete.flag = { href: `https://flagcdn.com/24x18/${code}.png`, alt: name };
      });
      game._mlbCountriesReady = true;
      game._mlbCountrySignature = signature;
    })().finally(() => { game._mlbCountryPromise = null; });
    return game._mlbCountryPromise;
  }
  function enrichMlbRoster(game, feed) {
    const sides = feed.liveData?.boxscore?.teams || {}, entries = Object.entries(sides);
    game.rosters = entries.map(([side, team]) => {
      const battingOrder = (team.battingOrder || []).map(String);
      const orderIndex = new Map(battingOrder.map((id, index) => [id, index]));
      const bench = new Set((team.bench || []).map(String)), bullpen = new Set((team.bullpen || []).map(String)), people = Object.values(team.players || {});
      const roster = people.map(item => {
        const id = String(item.person?.id || '');
        const listedIndex = orderIndex.get(id);
        // Some MLB feeds expose the order as 100, 200 … on the player instead
        // of returning a complete battingOrder array. Normalize both variants.
        const rawOrder = Number(item.battingOrder ?? item.stats?.batting?.battingOrder);
        const inferredIndex = Number.isFinite(rawOrder) && rawOrder > 0 ? Math.floor(rawOrder / 100) : null;
        // Keep this one-based. It is the visible batting order as well as the
        // sorting key; treating the leadoff hitter's 0 as "missing" sent them
        // to the end of the rendered order.
        const battingIndex = Number.isInteger(listedIndex) ? listedIndex + 1 : inferredIndex;
        return { athlete: { id: item.person?.id, displayName: item.person?.fullName, fullName: item.person?.fullName, jersey: item.jerseyNumber, position: { abbreviation: item.position?.abbreviation || item.position?.code || '' }, birthDate: item.person?.birthDate }, jersey: item.jerseyNumber, position: { abbreviation: item.position?.abbreviation || item.position?.code || '' }, starter: Number.isInteger(battingIndex), substitute: bench.has(id) || bullpen.has(id), battingOrder: battingIndex, pitching: item.stats?.pitching || {} };
      });
      const source = side === 'home'
        ? { id: game.homeId, displayName: game.home, abbreviation: game.homeAbbr, logo: game.homeLogo }
        : { id: game.awayId, displayName: game.away, abbreviation: game.awayAbbr, logo: game.awayLogo };
      const probable = side === 'home' ? game.probableHomePitcher : game.probableAwayPitcher;
      const probableId = String(probable?.id || probable?.person?.id || '');
      const probableName = clean(probable?.fullName || probable?.name);
      const startingPitcher = roster.find(player => probableId && String(player.athlete?.id) === probableId)
        || roster.find(player => probableName && clean(player.athlete?.displayName) === probableName)
        || roster.find(player => Number(player.pitching?.gamesStarted) === 1)
        || roster.find(player => player.position?.abbreviation === 'P' && !player.substitute)
        || null;
      return { team: source, roster, starters: roster.filter(player => player.starter).sort((a, b) => a.battingOrder - b.battingOrder), substitutes: roster.filter(player => player.substitute), startingPitcher };
    });
    game.lineupAvailable = entries.length === 2 && entries.every(([, team]) => (team.battingOrder || []).length === 9);
  }
  async function enrichMlb(game, { refresh = false, lineup = false } = {}) {
    if (game._enriched && !refresh) {
      if (lineup) await hydrateMlbRosterCountries(game);
      return game;
    }
    try {
      const response = await fetch(`${MLB_LIVE}/game/${game.id}/feed/live`); if (!response.ok) return game;
      const feed = await response.json(), status = feed.gameData?.status || {}, linescore = feed.liveData?.linescore || {}, sides = linescore.teams || {};
      game.status = status.detailedState || game.status; game.completed = status.abstractGameState === 'Final'; game.live = status.abstractGameState === 'Live';
      if (game.completed || game.live) { game.homeScore = Number(sides.home?.runs ?? game.homeScore ?? 0); game.awayScore = Number(sides.away?.runs ?? game.awayScore ?? 0); }
      game.probableHomePitcher = feed.gameData?.probablePitchers?.home || game.probableHomePitcher; game.probableAwayPitcher = feed.gameData?.probablePitchers?.away || game.probableAwayPitcher;
      enrichMlbRoster(game, feed);
      // A feed can expose a usable roster before it marks all nine batting
      // spots as official.  When the user has explicitly opened a lineup,
      // hydrate its nationality details whenever roster players exist.
      if ((lineup || (game.lineupAvailable && (game.live || (!game.completed && game.time - Date.now() <= 3 * 60 * 60 * 1000)))) && game.rosters?.some(roster => roster.roster?.length)) await hydrateMlbRosterCountries(game);
      const allPlays = feed.liveData?.plays?.allPlays || [];
      game.events = allPlays.filter(play => play.about?.isScoringPlay).map(play => ({ type: 'run', minute: Number(play.about?.inning || 0), inning: play.about?.inning, half: play.about?.halfInning, text: clean(play.result?.description), teamId: String(play.team?.id || ''), scorer: clean(play.matchup?.batter?.fullName), homeScore: Number(play.result?.homeScore), awayScore: Number(play.result?.awayScore), rbi: Number(play.result?.rbi || 0), captivating: Number(play.about?.captivatingIndex || 0) }));
      game.summary = { boxscore: { teams: Object.entries(sides).map(([side]) => ({ team: { id: side === 'home' ? game.homeId : game.awayId }, statistics: flattenStats(feed.liveData?.boxscore?.teams?.[side]) })) } };
      const decisionName = value => clean(value?.fullName || value?.fullNameDisplay || value?.lastInitName || value?.name);
      const decisions = feed.liveData?.decisions || feed.gameData?.decisions || {};
      const boxscoreTeams = feed.liveData?.boxscore?.teams || {};
      const playerCards = Object.values(boxscoreTeams).flatMap(team => Object.values(team?.players || {}));
      const batterContext = new Map(Object.entries(boxscoreTeams).flatMap(([side, team]) => Object.values(team?.players || {}).map(player => [String(player?.person?.id || player?.id || ''), { teamId: side === 'home' ? game.homeId : game.awayId, seasonHomeRuns: Number(player?.seasonStats?.batting?.homeRuns) }])));
      const pitcherLine = decision => {
        const name = decisionName(decision);
        const decisionId = String(decision?.id || decision?.person?.id || '');
        const card = playerCards.find(player => String(player?.person?.id || player?.id || '') === decisionId) || playerCards.find(player => decisionName(player?.person) === name);
        const pitching = card?.stats?.pitching || {};
        return [['IP', pitching.inningsPitched], ['H', pitching.hits], ['R', pitching.runs], ['ER', pitching.earnedRuns], ['BB', pitching.baseOnBalls], ['K', pitching.strikeOuts]].filter(([, value]) => value !== undefined && value !== null && value !== '').map(([label, value]) => `${label} ${value}`).join(' · ');
      };
      game.mlbRecap = {
        winner: decisionName(decisions.winner), loser: decisionName(decisions.loser), save: decisionName(decisions.save),
        winnerLine: pitcherLine(decisions.winner), loserLine: pitcherLine(decisions.loser), saveLine: pitcherLine(decisions.save),
        homeRuns: allPlays.filter(play => /home run/i.test(String(play.result?.event || play.result?.description || ''))).map(play => { const batter = batterContext.get(String(play.matchup?.batter?.id || '')); return { teamId: String(batter?.teamId || play.team?.id || ''), batter: clean(play.matchup?.batter?.fullName), inning: Number(play.about?.inning || 0), total: Number(play.result?.rbi || 0), seasonHomeRuns: Number.isFinite(batter?.seasonHomeRuns) ? batter.seasonHomeRuns : null }; }),
        innings: (linescore.innings || []).map(inning => ({ away: inning.away?.runs, home: inning.home?.runs })),
        away: { runs: Number(sides.away?.runs ?? game.awayScore ?? 0), hits: Number(sides.away?.hits ?? 0), errors: Number(sides.away?.errors ?? 0) },
        home: { runs: Number(sides.home?.runs ?? game.homeScore ?? 0), hits: Number(sides.home?.hits ?? 0), errors: Number(sides.home?.errors ?? 0) }
      };
      if (game.completed) game.scoreResult = mlbScore(game, feed);
      game._enriched = true;
    } catch (error) { console.warn('Could not enrich MLB game', error); }
    return game;
  }

  async function enrichSoccer(game, { refresh = false } = {}) {
    if (game._enriched && !refresh) return game;
    try {
      const league = LEAGUES[game.leagueId || activeLeague], response = await fetch(`${espnBase(league)}/summary?event=${game.id}`); if (!response.ok) return game;
      const summary = await response.json(), plays = summary.scoringPlays || summary.keyEvents || summary.plays || [], competition = summary.header?.competitions?.[0], status = competition?.status || summary.header?.status;
      if (status) { game.status = status.type?.detail || status.displayClock || game.status; game.completed = status.type?.completed === true; game.live = isLiveStatus(status); }
      (competition?.competitors || []).forEach(team => { if (team.homeAway === 'home' && team.score != null) game.homeScore = Number(team.score); if (team.homeAway === 'away' && team.score != null) game.awayScore = Number(team.score); });
      game.summary = summary; game.injuries = summary.injuries || [];
      const providerRosters = summary.rosters?.length ? summary.rosters : (summary.boxscore?.players || []);
      game.rosters = providerRosters.map(roster => {
        const groups = roster.statistics || roster.groups || [], grouped = groups.flatMap(group => group.athletes || group.players || group.entries || []), raw = roster.roster || roster.athletes || roster.entries || roster.players || [];
        const unique = entries => [...new Map(entries.filter(Boolean).map((entry, index) => { const player = entry.athlete || entry; return [String(player.id || player.uid || player.displayName || player.fullName || index), entry]; })).values()];
        const named = expression => groups.filter(group => expression.test(String(group.name || group.displayName || group.label || group.title || ''))).flatMap(group => group.athletes || group.players || group.entries || []);
        const players = unique([...raw, ...grouped]), starters = unique([...named(/start|lineup|xi/i), ...players.filter(player => player.starter === true || player.isStarter === true || player.status?.type === 'starter')]);
        let substitutes = unique([...named(/sub|bench|reserve/i), ...players.filter(player => player.substitute === true || player.isSubstitute === true || player.status?.type === 'substitute' || player.status?.type === 'bench')]);
        if (!substitutes.length && starters.length) { const starterIds = new Set(starters.map(entry => { const player = entry.athlete || entry; return String(player.id || player.uid || player.displayName || player.fullName); })); substitutes = players.filter(entry => { const player = entry.athlete || entry; return !starterIds.has(String(player.id || player.uid || player.displayName || player.fullName)); }); }
        return { ...roster, roster: players, starters, substitutes };
      });
      game.events = plays.map(play => {
        const text = clean(play.text || play.shortText || play.description), footballDetail=`${text} ${play.type?.text||''} ${play.scoringType?.name||''} ${play.scoringType?.displayName||''}`, clock = String(play.clock?.displayValue || ''), participants = play.participants || [], minute = Number((clock || text).match(/\d+/)?.[0]), footballLabel = /touchdown/i.test(footballDetail) ? 'TOUCHDOWN' : /field.goal/i.test(footballDetail) ? 'FIELD GOAL' : /extra point|two.point/i.test(footballDetail) ? 'EXTRA POINT' : /safety/i.test(footballDetail) ? 'SAFETY' : 'SCORE', type = game.sport === 'football' ? 'score' : /goal/i.test(text) ? 'goal' : /red card/i.test(text) ? 'red' : /yellow card/i.test(text) ? 'yellow' : /penalty/i.test(text) ? 'penalty' : /substitution|replaces/i.test(text) ? 'sub' : /injur/i.test(text) ? 'injury' : 'other';
        const participantName = participant => clean(participant?.athlete?.displayName || participant?.displayName);
        const participantRole = participant => String(participant?.role || participant?.type?.text || participant?.type?.displayName || participant?.type || '').toLowerCase();
        const canonical = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const announcedAssist = clean(play.assist?.athlete?.displayName || play.assist?.displayName || (text.match(/assisted by\s+([^,.()]+?)(?:[,.]|$)/i) || [])[1]);
        const isAssistant = participant => /assist/.test(participantRole(participant)) || (!!announcedAssist && canonical(participantName(participant)) === canonical(announcedAssist));
        // ESPN may list both scorer and assister as participants.  Goal annotations
        // must stay spoiler-accurate, so choose only the scorer and never the full
        // participant list for a goal.
        const scorerParticipant = type === 'goal'
          ? participants.find(participant => /scor|goal/.test(participantRole(participant)) && !isAssistant(participant)) || participants.find(participant => !isAssistant(participant)) || null
          : participants[0] || null;
        const scorer = participantName(scorerParticipant);
        return { type, scoreLabel: game.sport === 'football' ? footballLabel : '', minute: Number.isFinite(minute) ? minute : null, clock, period: play.period?.number || play.period, stoppage: /(?:45|90)\+\d+/.test(clock) || /(?:45|90)\+\d+/.test(text), text, teamId: String(play.team?.id || scorerParticipant?.team?.id || participants[0]?.team?.id || ''), players: type === 'goal' ? (scorer ? [scorer] : []) : participants.map(participantName).filter(Boolean), scorer, assist: announcedAssist, homeScore: Number.isFinite(Number(play.homeScore)) ? Number(play.homeScore) : null, awayScore: Number.isFinite(Number(play.awayScore)) ? Number(play.awayScore) : null, ownGoal: /own goal/i.test(text) };
      });
      if (game.sport === 'football' && game.completed) game.scoreResult = nflScore(game, summary);
      game._enriched = true;
    } catch (error) { console.warn('Could not enrich match', error); }
    return game;
  }

  async function refresh(games) {
    const groups = [...new Set(games.map(game => game.leagueId || activeLeague))];
    await Promise.all(groups.map(async id => {
      const league = LEAGUES[id]; if (!league) return;
      try {
        if (league.sport === 'baseball') { const fresh = new Map((await loadMlb()).map(game => [String(game.id), game])); games.filter(game => game.leagueId === id).forEach(game => { const update = fresh.get(String(game.id)); if (update) Object.assign(game, { live: update.live, completed: update.completed, status: update.status, homeScore: update.homeScore, awayScore: update.awayScore, probableHomePitcher: update.probableHomePitcher, probableAwayPitcher: update.probableAwayPitcher }); }); return; }
        const { events } = await fetchSoccerFixtures(league, soccerRefreshDates());
        const fresh = new Map(events.map(event => normalize(event, league)).filter(Boolean).map(game => [String(game.id), game])); games.filter(game => game.leagueId === id).forEach(game => { const update = fresh.get(String(game.id)); if (update) Object.assign(game, { live: update.live, completed: update.completed, status: update.status, homeScore: update.homeScore, awayScore: update.awayScore }); });
      } catch (_) {}
    })); return games;
  }
  const enrich = (game, options) => game.sport === 'baseball' ? enrichMlb(game, options) : enrichSoccer(game, options);
  return { leagues: LEAGUES, get activeLeague() { return activeLeague; }, setLeague: id => { if (id !== 'all' && !LEAGUES[id]) throw Error('Unknown league.'); activeLeague = id; }, load, enrich, refresh, normalize, normalizeMlb };
})();
