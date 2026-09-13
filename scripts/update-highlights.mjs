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
    const child = spawn('yt-dlp', ['--no-warnings', '--no-playlist', '--flat-playlist', '--dump-json', `ytsearch8:${query}`], { stdio: ['ignore', 'pipe', 'pipe'] });
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
  return entries
    .map(entry => ({ ...entry, seconds: durationSeconds(entry.duration ?? entry.duration_string) }))
    .filter(entry => {
      const title = clean(entry.title);
      return entry.id && entry.seconds >= 70 && entry.seconds <= 3_600
        && /highlight|condensed game|game recap|extended highlights/i.test(title)
        && safeTitle(title)
        && teamAppears(title, game.home, game.homeAbbr)
        && teamAppears(title, game.away, game.awayAbbr);
    })
    .sort((left, right) => right.seconds - left.seconds || String(right.upload_date || '').localeCompare(String(left.upload_date || '')))[0];
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
  const completed = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value)
    .filter(game => !index.highlights[game.key])
    .sort((left, right) => right.time - left.time)
    .slice(0, maxChecks);

  if (!completed.length) {
    console.log('No unresolved completed games in the highlight window.');
    return;
  }

  let added = 0;
  for (const game of completed) {
    const when = game.time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const query = `${game.away} vs ${game.home} ${game.league} highlights ${when}`;
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
        discoveredAt: now.toISOString()
      };
      added += 1;
      console.log(`Added ${game.key}: ${picked.seconds}s`);
    } catch (error) {
      console.warn(`Highlight search failed for ${game.key}: ${clean(error.message)}`);
    }
  }

  const oldest = now.getTime() - 10 * day;
  Object.entries(index.highlights).forEach(([key, item]) => {
    if (Date.parse(item.discoveredAt || 0) < oldest) delete index.highlights[key];
  });
  if (!added) return;
  index.generatedAt = now.toISOString();
  await writeFile(output, `window.SpoilHighlights = ${JSON.stringify(index, null, 2)};\n`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
