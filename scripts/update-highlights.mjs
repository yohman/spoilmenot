#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'assets/highlights.js');
const day = 86_400_000;
const maxChecks = Math.max(1, Number(process.env.MAX_HIGHLIGHT_CHECKS || 12));
const leagues = [
  { id: 'epl', sport: 'soccer', slug: 'eng.1', name: 'Premier League' },
  { id: 'laliga', sport: 'soccer', slug: 'esp.1', name: 'La Liga' },
  { id: 'ucl', sport: 'soccer', slug: 'uefa.champions', name: 'UEFA Champions League' },
  { id: 'nfl', sport: 'football', slug: 'nfl', name: 'NFL' }
];

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const utcDate = value => new Date(value).toISOString().slice(0, 10);
const espnDate = value => utcDate(value).replaceAll('-', '');
const normal = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const safeTitle = title => !/\b\d{1,3}\s*(?:[-–—:]\s*)\d{1,3}\b/.test(String(title || ''));
const unsuitableTitle = title => /\bmadden\b|\bsimulation\b|\bsim\b|\bgameplay\b|\bwatch live\b|\blive stream\b/i.test(String(title || ''));
const durationSeconds = value => {
  if (Number.isFinite(Number(value))) return Number(value);
  const parts = String(value || '').split(':').map(Number);
  return parts.length === 2 && parts.every(Number.isFinite) ? parts[0] * 60 + parts[1] : 0;
};
const teamTokens = name => clean(name).toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2 && !['the', 'club', 'city'].includes(token));
const teamAppears = (title, name, abbreviation) => {
  const titleText = normal(title), abbreviationText = normal(abbreviation);
  return (abbreviationText.length >= 2 && titleText.includes(abbreviationText)) || teamTokens(name).some(token => titleText.includes(token));
};
// Trusted sources are deliberately narrow. A source must identify itself as
// the competition, its official broadcaster, or its official league channel.
const officialSourcePatterns = {
  mlb: [/^mlb(?:official)?$/],
  nfl: [/^nfl(?:official)?$/],
  epl: [/^premierleague$/, /^dazn/, /^unext/],
  laliga: [/^laliga/, /^dazn/, /^unext/],
  ucl: [/^uefa/, /^dazn/, /^unext/]
};
const sourceName = entry => clean(entry.channel || entry.uploader || entry.uploader_id || entry.channel_id || '');
const sourceTier = (game, entry) => {
  const source = normal(sourceName(entry));
  return (officialSourcePatterns[game.leagueId] || []).some(pattern => pattern.test(source)) ? 'official' : 'fallback';
};

async function requestJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Spoil-Me-Not-highlights/1.0' } });
  if (!response.ok) throw Error(`${response.status} from ${url}`);
  return response.json();
}

async function soccerGames(league, start, end) {
  const endpoint = `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/scoreboard?limit=1000&dates=${espnDate(start)}-${espnDate(end)}`;
  const payload = await requestJson(endpoint);
  return (payload.events || []).flatMap(event => {
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

function youtubeSearch(query) {
  return new Promise((resolveSearch, rejectSearch) => {
    const child = spawn('yt-dlp', ['--no-warnings', '--no-playlist', '--flat-playlist', '--dump-json', `ytsearch15:${query}`], { stdio: ['ignore', 'pipe', 'pipe'] });
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

function pickHighlight(game, entries) {
  const candidates = entries
    .map(entry => ({ ...entry, seconds: durationSeconds(entry.duration ?? entry.duration_string) }))
    .filter(entry => {
      const title = clean(entry.title);
      return entry.id && entry.seconds >= 70 && entry.seconds <= 3_600
        && /highlight|condensed game|game recap|extended highlights/i.test(title)
        && safeTitle(title)
        && !unsuitableTitle(title)
        && teamAppears(title, game.home, game.homeAbbr)
        && teamAppears(title, game.away, game.awayAbbr);
    })
    .map(entry => ({ ...entry, source: sourceName(entry), sourceTier: sourceTier(game, entry) }));
  const longestFirst = (left, right) => right.seconds - left.seconds || String(right.upload_date || '').localeCompare(String(left.upload_date || ''));
  // Official source wins even if a fan upload is longer. Only when that trusted
  // search is empty do we use the best score-safe, non-simulation fallback.
  return candidates.filter(entry => entry.sourceTier === 'official').sort(longestFirst)[0]
    || candidates.sort(longestFirst)[0];
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
  const now = new Date(), start = new Date(now.getTime() - 3 * day);
  const index = await readIndex();
  const results = await Promise.allSettled([...leagues.map(league => soccerGames(league, start, now)), mlbGames(start, now)]);
  const candidates = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value)
    .sort((left, right) => right.time - left.time);
  // New cards take priority. A smaller parallel allowance keeps rechecking
  // fallbacks for a later official upload without starving the wider archive.
  const newLimit = Math.max(1, Math.ceil(maxChecks * .75));
  const missing = candidates.filter(game => !index.highlights[game.key]).slice(0, newLimit);
  const upgrades = candidates.filter(game => index.highlights[game.key] && index.highlights[game.key].sourceTier !== 'official')
    .slice(0, Math.max(0, maxChecks - missing.length));
  const completed = [...missing, ...upgrades];

  if (!completed.length) {
    console.log('No unresolved completed games in the highlight window.');
    return;
  }

  let updated = 0;
  for (const game of completed) {
    const when = game.time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const query = `${game.away} vs ${game.home} ${game.league} official highlights ${when}`;
    try {
      const picked = pickHighlight(game, await youtubeSearch(query));
      if (!picked) {
        console.log(`No score-safe highlight yet: ${game.key}`);
        continue;
      }
      index.highlights[game.key] = {
        url: `https://www.youtube.com/watch?v=${picked.id}`,
        title: clean(picked.title),
        durationSeconds: picked.seconds,
        source: picked.source,
        sourceTier: picked.sourceTier,
        discoveredAt: now.toISOString()
      };
      updated += 1;
      console.log(`${picked.sourceTier === 'official' ? 'Trusted' : 'Fallback'} ${game.key}: ${picked.seconds}s from ${picked.source || 'unknown source'}`);
    } catch (error) {
      console.warn(`Highlight search failed for ${game.key}: ${clean(error.message)}`);
    }
  }

  const oldest = now.getTime() - 10 * day;
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
