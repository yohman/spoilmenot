#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'assets/highlights.js');
const day = 86_400_000;
const maxChecks = Math.max(1, Number(process.env.MAX_HIGHLIGHT_CHECKS || 12));
const ytDlp = process.env.SPOILMENOT_YTDLP || 'yt-dlp';
const requestedLeagues = new Set(String(process.env.HIGHLIGHT_LEAGUES || '').split(',').map(value => value.trim()).filter(Boolean));
const leagues = [
  { id: 'epl', sport: 'soccer', slug: 'eng.1', name: 'Premier League' },
  { id: 'laliga', sport: 'soccer', slug: 'esp.1', name: 'La Liga' },
  { id: 'ucl', sport: 'soccer', slug: 'uefa.champions', name: 'UEFA Champions League' },
  { id: 'carabao', sport: 'soccer', slug: 'eng.league_cup', name: 'Carabao Cup' },
  { id: 'nfl', sport: 'football', slug: 'nfl', name: 'NFL' }
];

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const utcDate = value => new Date(value).toISOString().slice(0, 10);
const espnDate = value => utcDate(value).replaceAll('-', '');
const normal = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const escapePattern = value => clean(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
const namedScoreInTitle = (game, title) => {
  if (!game) return false;
  const variants = side => [...new Set([game[side], game[`${side}Abbr`]].map(clean).filter(value => value.length >= 3))];
  const pairs = [
    [variants('home'), variants('away')],
    [variants('away'), variants('home')]
  ];
  return pairs.some(([firstTeams, secondTeams]) => firstTeams.some(first => secondTeams.some(second =>
    new RegExp(`\\b${escapePattern(first)}\\b\\s+\\d{1,3}\\s+${escapePattern(second)}\\b\\s+\\d{1,3}\\b`, 'i').test(clean(title))
  )));
};
const safeTitle = (title, game) => !/\b\d{1,3}\s*(?:[-–—:]\s*)\d{1,3}\b/.test(String(title || '')) && !namedScoreInTitle(game, title);
const unsuitableTitle = title => /\bmadden\b|\bsimulation\b|\bsim\b|\bgameplay\b|\bwatch live\b|\blive stream\b/i.test(String(title || ''));
const durationSeconds = value => {
  if (Number.isFinite(Number(value))) return Number(value);
  const parts = String(value || '').split(':').map(Number);
  return parts.length === 2 && parts.every(Number.isFinite) ? parts[0] * 60 + parts[1] : 0;
};
const publishedAt = entry => {
  const compactDate = String(entry.upload_date || entry.release_date || '').match(/^\d{8}$/)?.[0];
  if (compactDate) {
    const year = Number(compactDate.slice(0, 4)), month = Number(compactDate.slice(4, 6)) - 1, date = Number(compactDate.slice(6, 8));
    const timestamp = Date.UTC(year, month, date);
    return Number.isFinite(timestamp) ? new Date(timestamp) : null;
  }
  const timestamp = Number(entry.release_timestamp ?? entry.timestamp);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1_000) : null;
};
// A search can surface an old meeting between the same teams. The calendar
// day varies by timezone, and official uploads can arrive late, so allow a
// small window around the fixture but require a verified publication date.
const publishedNearFixture = (game, entry) => {
  const date = publishedAt(entry);
  if (!date || Number.isNaN(date.getTime())) return false;
  return date.getTime() >= game.time.getTime() - 36 * 60 * 60 * 1_000
    && date.getTime() <= game.time.getTime() + 7 * day;
};
const teamTokens = name => clean(name).toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2 && !['the', 'club', 'city'].includes(token));
const teamAppears = (title, name, abbreviation) => {
  const titleText = normal(title), abbreviationText = normal(abbreviation);
  return (abbreviationText.length >= 2 && titleText.includes(abbreviationText)) || teamTokens(name).some(token => titleText.includes(token));
};
// Preferred sources are the rights holder, competition, or explicitly named
// official broadcaster. When none has published a suitable clip yet, a small
// vetted broadcaster / official-team tier protects coverage without admitting
// reaction, simulation, or fan accounts.
const officialSourcePatterns = {
  mlb: [/^mlb(?:official)?$/, /^majorleaguebaseball$/],
  nfl: [/^nfl(?:official)?$/, /^nflnetwork$/],
  epl: [/^premierleague$/, /^dazn/, /^unext/],
  laliga: [/^laliga/, /^dazn/, /^unext/],
  ucl: [/^uefa/, /^dazn/, /^unext/],
  carabao: [/^carabao/, /^efl/, /^dazn/, /^unext/]
};
const verifiedSourcePatterns = {
  mlb: [/^espn/, /^foxsports/, /^tbssports?$/, /^sportsnet/, /^sny$/],
  nfl: [/^espn/, /^nbcsports?$/, /^cbssports?$/, /^foxsports?$/],
  epl: [/^nbcsports?$/, /^skysports?$/, /^tntsports?$/, /^espnfc$/, /^espn$/, /^beinsports?$/],
  laliga: [/^espn/, /^beinsports?$/, /^skysports?$/, /^tntsports?$/, /^cbssportsgolazo$/],
  ucl: [/^cbssportsgolazo$/, /^tntsports?$/, /^beinsports?$/, /^skysports?$/, /^espn$/],
  carabao: [/^skysports?$/, /^tntsports?$/, /^espn$/, /^espnfc$/]
};
// These are the user-approved first-party rights holders. Their normal recap
// titles may include the score, so do not discard an otherwise exact official
// match just because that title is a spoiler. Every other source remains
// subject to the strict spoiler-title guard below.
const scoreTitleApprovedSourcePatterns = [/^efl(?:official)?$/, /^mlb(?:official)?$/, /^majorleaguebaseball$/, /^nfl(?:official)?$/, /^nflnetwork$/, /^dazn/, /^unext/];
const trustedSearchSources = {
  mlb: ['MLB'],
  nfl: ['NFL'],
  epl: ['Premier League', 'DAZN', 'U-NEXT'],
  laliga: ['LaLiga', 'DAZN', 'U-NEXT'],
  ucl: ['UEFA', 'DAZN', 'U-NEXT'],
  carabao: ['Carabao Cup', 'EFL', 'DAZN', 'U-NEXT']
};
const sourceName = entry => clean(entry.channel || entry.uploader || entry.uploader_id || entry.channel_id || '');
const allowsScoreInTitle = entry => scoreTitleApprovedSourcePatterns.some(pattern => pattern.test(normal(sourceName(entry))));
const isOfficialTeamChannel = (game, source) => {
  const value = normal(source);
  return value.length > 4 && [game.home, game.away].some(team => value === normal(team));
};
const sourceTier = (game, entry) => {
  const name = sourceName(entry), source = normal(name);
  if (scoreTitleApprovedSourcePatterns.some(pattern => pattern.test(source))) return 'official';
  if ((officialSourcePatterns[game.leagueId] || []).some(pattern => pattern.test(source))) return 'official';
  if (isOfficialTeamChannel(game, name) || (verifiedSourcePatterns[game.leagueId] || []).some(pattern => pattern.test(source))) return 'verified';
  return 'fallback';
};
const isApprovedTier = tier => tier === 'official' || tier === 'verified';

async function requestJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Spoil-Me-Not-highlights/1.0' } });
  if (!response.ok) throw Error(`${response.status} from ${url}`);
  return response.json();
}

async function soccerGames(league, start, end) {
  // ESPN has begun returning HTTP 400 for otherwise valid date ranges. The
  // client feed already works around that by requesting each bounded fixture
  // day separately; do the same here so soccer cards receive official links
  // instead of permanently falling through to “Find highlights”.
  const dates = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor <= last) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const base = `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/scoreboard?limit=1000&dates=`;
  const responses = await Promise.allSettled(dates.map(date => requestJson(`${base}${espnDate(date)}`)));
  const events = [...new Map(responses
    .filter(response => response.status === 'fulfilled')
    .flatMap(response => response.value.events || [])
    .map(event => [String(event.id), event])).values()];
  if (!events.length) throw Error(`${league.name} fixtures are unavailable.`);
  return events.flatMap(event => {
    const competition = event.competitions?.[0];
    const home = competition?.competitors?.find(team => team.homeAway === 'home');
    const away = competition?.competitors?.find(team => team.homeAway === 'away');
    if (!event.status?.type?.completed || !home?.team || !away?.team) return [];
    return [{
      key: `${league.id}:${event.id}`,
      leagueId: league.id,
      league: league.name,
      time: new Date(event.date),
      home: clean(home.team.displayName),
      away: clean(away.team.displayName),
      homeAbbr: clean(home.team.abbreviation),
      awayAbbr: clean(away.team.abbreviation)
    }];
  });
}

async function mlbGames(start, end) {
  const endpoint = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${utcDate(start)}&endDate=${utcDate(end)}`;
  const payload = await requestJson(endpoint);
  return (payload.dates || []).flatMap(date => date.games || []).flatMap(game => {
    const home = game.teams?.home?.team, away = game.teams?.away?.team;
    if (game.status?.abstractGameState !== 'Final' || !home || !away) return [];
    return [{
      key: `mlb:${game.gamePk}`,
      leagueId: 'mlb',
      league: 'MLB',
      time: new Date(game.gameDate),
      home: clean(home.name),
      away: clean(away.name),
      homeAbbr: clean(home.abbreviation),
      awayAbbr: clean(away.abbreviation)
    }];
  });
}

// MLB publishes a first-party recap for each completed game in its game
// content feed. Prefer that exact game-level source before a YouTube search:
// it is tied to the game id, so it can neither miss a matchup nor point at a
// different meeting between the same clubs.
async function mlbOfficialHighlight(game) {
  const content = await requestJson(`https://statsapi.mlb.com/api/v1/game/${game.key.split(':')[1]}/content`);
  const items = content.highlights?.highlights?.items || [];
  const recaps = items.filter(item => {
    const tags = (item.keywordsAll || item.keywordsDisplay || []).map(keyword => `${keyword.value || ''} ${keyword.displayName || ''}`).join(' ');
    return item.type === 'video' && /game.?recap/i.test(tags) && durationSeconds(item.duration) >= 70;
  }).sort((left, right) => durationSeconds(right.duration) - durationSeconds(left.duration));
  const recap = recaps[0];
  if (!recap?.slug && !recap?.id) return null;
  return {
    url: `https://www.mlb.com/video/${encodeURIComponent(recap.slug || recap.id)}`,
    title: clean(recap.headline || recap.blurb || 'Official MLB game recap'),
    seconds: durationSeconds(recap.duration),
    source: 'MLB',
    sourceTier: 'official',
    publishedAt: new Date(recap.date || game.time).toISOString()
  };
}

function youtubeSearch(query, count = 25) {
  return new Promise((resolveSearch, rejectSearch) => {
    const child = spawn(ytDlp, ['--no-warnings', '--no-playlist', '--flat-playlist', '--dump-json', `ytsearch${count}:${query}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', rejectSearch);
    child.on('close', code => {
      if (code !== 0 && !stdout.trim()) return rejectSearch(Error(stderr.trim() || `yt-dlp exited ${code}`));
      resolveSearch(stdout.split('\n').flatMap(line => {
        try { return line.trim() ? [JSON.parse(line)] : []; } catch (_) { return []; }
      }));
    });
  });
}

// Search results are deliberately lightweight and often omit upload_date.
// Read the metadata only for an already trusted candidate so the calendar
// guard remains reliable without fetching every video in a search result.
function youtubeMetadata(id) {
  return new Promise((resolveVideo, rejectVideo) => {
    const child = spawn(ytDlp, ['--no-warnings', '--no-playlist', '--dump-single-json', `https://www.youtube.com/watch?v=${id}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', rejectVideo);
    child.on('close', code => {
      if (code !== 0 || !stdout.trim()) return rejectVideo(Error(stderr.trim() || `yt-dlp exited ${code}`));
      try { resolveVideo(JSON.parse(stdout)); } catch (_) { rejectVideo(Error('yt-dlp returned invalid video metadata')); }
    });
  });
}

async function pickHighlight(game, entries) {
  const candidates = entries
    .map(entry => ({ ...entry, seconds: durationSeconds(entry.duration ?? entry.duration_string) }))
    .map(entry => ({ ...entry, source: sourceName(entry), sourceTier: sourceTier(game, entry) }))
    .filter(entry => {
      const title = clean(entry.title);
      return entry.id && entry.seconds >= 70 && entry.seconds <= 3_600
        && /highlight|ハイライト|condensed game|game recap|extended highlights/i.test(title)
        && (safeTitle(title, game) || allowsScoreInTitle(entry))
        && !unsuitableTitle(title)
        && teamAppears(title, game.home, game.homeAbbr)
        && teamAppears(title, game.away, game.awayAbbr);
    });
  const longestFirst = (left, right) => right.seconds - left.seconds || String(right.upload_date || '').localeCompare(String(left.upload_date || ''));
  // Official recaps are usually eight to fifteen minutes. Prefer that useful
  // match-summary range ahead of short clips, then use duration as the tiebreak.
  const officialRecapRank = entry => entry.seconds >= 480 && entry.seconds <= 900 ? 0 : entry.seconds >= 420 ? 1 : 2;
  const officialFirst = (left, right) => {
    const tierOrder = (left.sourceTier === 'official' ? 0 : 1) - (right.sourceTier === 'official' ? 0 : 1);
    if (tierOrder) return tierOrder;
    if (left.sourceTier === 'official') {
      const recapOrder = officialRecapRank(left) - officialRecapRank(right);
      if (recapOrder) return recapOrder;
      const proximity = Math.abs(left.seconds - 600) - Math.abs(right.seconds - 600);
      if (proximity) return proximity;
    }
    return longestFirst(left, right);
  };
  // Never trade trust for coverage. This admits only the preferred official
  // tier and a named, vetted fallback tier — never a fan, reaction, gameplay,
  // or unrelated uploader.
  const approved = candidates.filter(entry => isApprovedTier(entry.sourceTier))
    .sort(officialFirst);
  for (const candidate of approved) {
    let verified = candidate;
    try {
      if (!publishedAt(verified)) verified = { ...candidate, ...await youtubeMetadata(candidate.id) };
    } catch (_) {
      continue;
    }
    const tier = sourceTier(game, verified);
    const verifiedTitle = clean(verified.title || candidate.title);
    if (!isApprovedTier(tier) || !publishedNearFixture(game, verified) || (!safeTitle(verifiedTitle, game) && !allowsScoreInTitle(verified))) continue;
    return {
      ...verified,
      seconds: durationSeconds(verified.duration ?? verified.duration_string),
      source: sourceName(verified) || candidate.source,
      sourceTier: tier,
      publishedAt: publishedAt(verified).toISOString()
    };
  }
  return null;
}

async function findTrustedHighlight(game, when) {
  if (game.leagueId === 'mlb') {
    try {
      const official = await mlbOfficialHighlight(game);
      if (official) return official;
    } catch (_) {
      // A provider delay should fall through to the official YouTube search.
    }
  }
  const sources = trustedSearchSources[game.leagueId] || [];
  // The generic pass is where vetted broadcasters and official club channels
  // can be discovered. `pickHighlight` still rejects every source outside the
  // approved allow-list, so loosening the words in the query never admits
  // random reaction or simulation videos.
  const generic = `${game.away} vs ${game.home} ${game.league} highlights ${when}`;
  const queries = [
    ...sources.map(source => `${source} ${game.away} vs ${game.home} highlights ${when}`),
    generic
  ].filter((query, index, list) => list.indexOf(query) === index);
  // Do not stop at the first acceptable result. A DAZN query can surface a
  // trusted broadcaster before a later U-NEXT, NFL, or competition query has
  // a chance to surface the actual rights-holder upload. Pool the results and
  // let pickHighlight rank official channels above every verified fallback.
  const searches = await Promise.allSettled(queries.map(query => youtubeSearch(query, 50)));
  const unique = new Map();
  searches.filter(search => search.status === 'fulfilled').forEach(search => {
    search.value.forEach(entry => {
      if (entry?.id && !unique.has(entry.id)) unique.set(entry.id, entry);
    });
  });
  return pickHighlight(game, [...unique.values()]);
}

async function readIndex() {
  try {
    const source = await readFile(output, 'utf8');
    const json = source.replace(/^\s*window\.SpoilHighlights\s*=\s*/, '').replace(/;\s*$/, '');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed.highlights === 'object' ? parsed : { version: 1, generatedAt: null, highlights: {} };
  } catch (_) {
    return { version: 1, generatedAt: null, highlights: {} };
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: node scripts/update-highlights.mjs');
    return;
  }
  // Search a full week of completed fixtures. The visible list is shorter,
  // but this lets the index recover links that were not published promptly.
  const now = new Date(), start = new Date(now.getTime() - 7 * day);
  const index = await readIndex();
  const results = await Promise.allSettled([...leagues.map(league => soccerGames(league, start, now)), mlbGames(start, now)]);
  const allCandidates = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value)
    .sort((left, right) => right.time - left.time);
  const candidates = requestedLeagues.size
    ? allCandidates.filter(game => requestedLeagues.has(game.leagueId))
    : allCandidates;
  // Recheck newly finished games often, but rotate the remainder of the
  // seven-day window. Without the rotation, unresolved recent games consume
  // every run and older cards never get a chance to receive a highlight.
  const rotate = (items, limit, offset) => {
    if (!items.length || !limit) return [];
    const count = Math.min(limit, items.length), start = offset % items.length;
    return Array.from({ length: count }, (_, index) => items[(start + index) % items.length]);
  };
  const unresolved = candidates.filter(game => !index.highlights[game.key]);
  const freshnessWindow = 24 * 60 * 60 * 1_000;
  const fresh = unresolved.filter(game => now - game.time <= freshnessWindow);
  const backlog = unresolved.filter(game => now - game.time > freshnessWindow);
  const rotation = Math.floor(now.getTime() / (5 * 60 * 1_000));
  const freshAllowance = Math.min(fresh.length, Math.max(1, Math.ceil(maxChecks * .6)));
  const missing = [
    ...rotate(fresh, freshAllowance, rotation * freshAllowance),
    ...rotate(backlog, maxChecks - freshAllowance, rotation * Math.max(1, maxChecks - freshAllowance))
  ];
  const upgrades = candidates.filter(game => {
    const existing = index.highlights[game.key];
    return existing && (existing.sourceTier !== 'official' || !existing.publishedAt);
  })
    .slice(0, Math.max(0, maxChecks - missing.length));
  const completed = [...missing, ...upgrades];

  if (!completed.length) {
    console.log('No unresolved completed games in the highlight window.');
    return;
  }

  let updated = 0;
  for (const game of completed) {
    const when = game.time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    try {
      const picked = await findTrustedHighlight(game, when);
      if (!picked) {
        // A search result can lag behind a completed match. Never erase a
        // previously accepted link merely because this particular run did not
        // find a better one; that caused healthy cards to lose their video.
        console.log(`No trusted highlight yet: ${game.key}`);
        continue;
      }
      const existing = index.highlights[game.key];
      const rank = tier => tier === 'official' ? 2 : tier === 'verified' ? 1 : 0;
      const improvesSource = !existing || rank(picked.sourceTier) > rank(existing.sourceTier);
      const sameTrustedTier = existing && rank(picked.sourceTier) === rank(existing.sourceTier);
      const improvesSameTier = sameTrustedTier && (!existing.publishedAt || picked.seconds > Number(existing.durationSeconds || 0));
      if (existing && !improvesSource && !improvesSameTier) {
        console.log(`Keeping existing ${existing.sourceTier || 'saved'} highlight: ${game.key}`);
        continue;
      }
      index.highlights[game.key] = {
        url: picked.url || `https://www.youtube.com/watch?v=${picked.id}`,
        title: clean(picked.title),
        durationSeconds: picked.seconds,
        source: picked.source,
        sourceTier: picked.sourceTier,
        publishedAt: picked.publishedAt,
        discoveredAt: now.toISOString()
      };
      updated += 1;
      console.log(`${picked.sourceTier === 'official' ? 'Preferred' : 'Verified'} ${game.key}: ${picked.seconds}s from ${picked.source || 'unknown source'}`);
    } catch (error) {
      console.warn(`Highlight search failed for ${game.key}: ${clean(error.message)}`);
    }
  }

  // Keep a month of links. This is intentionally longer than the fixture
  // window so a later refresh cannot make older visible cards go blank.
  const oldest = now.getTime() - 30 * day;
  Object.entries(index.highlights).forEach(([key, item]) => {
    if (Date.parse(item.discoveredAt || 0) < oldest) delete index.highlights[key];
  });
  if (!updated) return;
  index.generatedAt = now.toISOString();
  await writeFile(output, `window.SpoilHighlights = ${JSON.stringify(index, null, 2)};\n`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
