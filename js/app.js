const routeParams=new URLSearchParams(location.search),routeLeague=routeParams.get('league'),matchRouteId=routeParams.get('match'),routeReturnGame=routeParams.get('returnGame'),routeReturnTop=Number(routeParams.get('returnTop')),routeReturnScroll=Number(routeParams.get('returnScroll'));
const knownLeagueIds=['epl','laliga','ucl','carabao','international','mlb','nfl'];
const validLeagueIds=value=>[...new Set(String(value||'').split(',').filter(id=>knownLeagueIds.includes(id)))];
const rememberedLeague=localStorage.getItem('spoil-me-not-last-league'),savedLeagueIds=(()=>{try{return validLeagueIds(JSON.parse(localStorage.getItem('spoil-me-not-visible-leagues')||'[]').join(','))}catch(_){return []}})();
const routeLeagueIds=validLeagueIds(routeParams.get('leagues'));
const initialLeagueIds=routeLeagueIds.length?routeLeagueIds:routeLeague==='all'?knownLeagueIds:knownLeagueIds.includes(routeLeague)?[routeLeague]:savedLeagueIds.length?savedLeagueIds:knownLeagueIds.includes(rememberedLeague)?[rememberedLeague]:['epl'];
const initialLeague=initialLeagueIds.length===1?initialLeagueIds[0]:'all';
(()=>{let plot,games=[],activeLeague=initialLeague,activeLeagueIds=new Set(initialLeagueIds),activeTeams=new Set(JSON.parse(localStorage.getItem('must-watch-teams')||'[]')),allLeagueTeamKeys=new Set(),logos={},teamColors={},teamAbbrs={};let internationalCompetition=['all','nations','friendly'].includes(routeParams.get('international'))?routeParams.get('international'):(localStorage.getItem('spoil-me-not-international-filter')||'all');const futureFormSpoilers=new Set(),info=document.getElementById('match-info'),search=document.getElementById('team-search'),results=document.getElementById('team-results'),picker=document.getElementById('team-picker'),toggle=document.getElementById('team-toggle'),ribbon=document.getElementById('team-ribbon'),ribbonLabel=document.getElementById('team-hover-label'),teamPreview=document.getElementById('team-preview'),listShell=document.getElementById('list-shell'),internationalFilter=document.getElementById('international-filter'),plotShell=document.querySelector('.plot-shell'),viewToggle=document.querySelector('.view-toggle'),leagueSwitcher=document.getElementById('league-switcher'),matchPage=document.getElementById('match-page'),loader=document.getElementById('loading');let loaderMinUntil=0,leagueLoadSerial=0;const showLoader=(detail='SYNCING LEAGUES & FIXTURES',minimum=0)=>{loaderMinUntil=Math.max(loaderMinUntil,performance.now()+minimum);const text=loader.querySelector('small');if(text)text.textContent=detail;loader.hidden=false},hideLoader=async()=>{const wait=Math.max(0,loaderMinUntil-performance.now());if(wait)await new Promise(resolve=>setTimeout(resolve,wait));loader.hidden=true};toggle.onclick=()=>{picker.hidden=!picker.hidden;if(!picker.hidden)search.focus()};
let listPositionLock=null;const listCardAnchors=new Map(),cardAnchor=card=>{const id=card?.dataset?.game,top=card?.getBoundingClientRect?.().top;if(!id||!Number.isFinite(top))return null;return{id,top,left:listShell.scrollLeft,until:Date.now()+3000}};
const renderAtCardAnchor=anchor=>{if(anchor)listPositionLock=anchor;renderList();if(!anchor)return;const holdPosition=()=>{const card=[...listShell.querySelectorAll('[data-game]')].find(node=>node.dataset.game===anchor.id);if(!card)return;const drift=card.getBoundingClientRect().top-anchor.top;if(Math.abs(drift)>.5)listShell.scrollTop=Math.max(0,listShell.scrollTop+drift)};holdPosition();requestAnimationFrame(holdPosition);setTimeout(holdPosition,80)};
// Card actions used to rebuild every fixture in the season. Besides making a
// lineup feel slow, that work retriggered all list observers and could nudge the
// scroll position. Replace only the affected card and let the existing
// decorators bind to the new node.
const rerenderAtCard=card=>{
  const id=String(card?.dataset?.game||''),game=games.find(item=>String(item.id)===id);
  const current=id?[...listShell.querySelectorAll('[data-game]')].find(node=>String(node.dataset.game)===id):null;
  if(!game||!current){renderAtCardAnchor(cardAnchor(card));return null}
  const anchor=cardAnchor(current),template=document.createElement('template');
  template.innerHTML=listRow(game).trim();
  const replacement=template.content.firstElementChild;
  if(!replacement)return null;
  current.replaceWith(replacement);
  if(anchor)listCardAnchors.set(id,anchor);
  requestAnimationFrame(()=>fitTeamNames(replacement));
  return replacement;
};
const rerenderAtGame=id=>rerenderAtCard([...listShell.querySelectorAll('[data-game]')].find(node=>String(node.dataset.game)===String(id)));
const restoreListRoutePosition=()=>{
  if(!routeReturnGame)return false;
  const card=[...listShell.querySelectorAll('[data-game]')].find(node=>String(node.dataset.game)===String(routeReturnGame));
  if(!card)return false;
  if(Number.isFinite(routeReturnScroll))listShell.scrollTop=Math.max(0,routeReturnScroll);
  if(Number.isFinite(routeReturnTop)){
    const drift=card.getBoundingClientRect().top-routeReturnTop;
    if(Math.abs(drift)>.5)listShell.scrollTop=Math.max(0,listShell.scrollTop+drift);
  }
  const clean=new URL(location.href);
  ['returnGame','returnTop','returnScroll'].forEach(key=>clean.searchParams.delete(key));
  history.replaceState(history.state,'',clean);
  return true;
};
let spoilHold=null;
const matchHref=(game,card)=>{const url=new URL(location.href),anchor=cardAnchor(card);url.searchParams.set('league',activeLeague);if(activeLeagueIds.size>1)url.searchParams.set('leagues',[...activeLeagueIds].join(','));else url.searchParams.delete('leagues');if(activeLeague==='international')url.searchParams.set('international',internationalCompetition);url.searchParams.set('match',game.id);if(anchor){url.searchParams.set('returnGame',anchor.id);url.searchParams.set('returnTop',String(Math.round(anchor.top)));url.searchParams.set('returnScroll',String(Math.round(listShell.scrollTop)))}return url.toString()};
const cancelSpoilHold=state=>{if(!state)return;cancelAnimationFrame(state.frame);state.card.classList.remove('spoil-hold-active','spoil-hold-complete');state.card.style.removeProperty('--spoil-hold-progress');state.card.dataset.spoilHold='cancelled';requestAnimationFrame(()=>{if(state.card.dataset.spoilHold==='cancelled')delete state.card.dataset.spoilHold})};
listShell.addEventListener('pointerdown',event=>{const card=event.target.closest('.list-game.past'),control=event.target.closest('button,a,[data-highlight],input,label');if(!card||control||(event.pointerType==='mouse'&&event.button!==0))return;const game=games.find(item=>String(item.id)===String(card.dataset.game));if(!game)return;event.preventDefault();event.stopImmediatePropagation();if(spoilHold)cancelSpoilHold(spoilHold);const state={card,game,pointerId:event.pointerId,frame:0,started:performance.now()};spoilHold=state;card.dataset.spoilHold='pending';card.classList.add('spoil-hold-active');card.style.setProperty('--spoil-hold-progress','0%');card.setPointerCapture?.(event.pointerId);const fill=now=>{if(spoilHold!==state)return;const progress=Math.min(1,(now-state.started)/500);card.style.setProperty('--spoil-hold-progress',`${(progress*100).toFixed(1)}%`);if(progress<1){state.frame=requestAnimationFrame(fill);return}card.classList.remove('spoil-hold-active','spoil-hold-complete');card.style.removeProperty('--spoil-hold-progress');delete card.dataset.spoilHold;spoilHold=null;openCachedMatchPage(game,card)};state.frame=requestAnimationFrame(fill)},true);
['pointerup','pointercancel','lostpointercapture'].forEach(type=>listShell.addEventListener(type,event=>{const state=spoilHold;if(!state||state.pointerId!==event.pointerId)return;spoilHold=null;cancelSpoilHold(state)},true));
listShell.addEventListener('dragstart',event=>{if(event.target.closest('.list-game.match-page-link'))event.preventDefault()},true);
listShell.addEventListener('click',event=>{const button=event.target.closest('[data-watch-toggle],[data-form-spoilers],[data-lineup],[data-results],[data-summary]'),card=event.target.closest('[data-game]');if(!button||!card)return;if(card.dataset.spoilHold){event.preventDefault();event.stopImmediatePropagation();delete card.dataset.spoilHold;return}const game=games.find(g=>String(g.id)===String(card.dataset.game));if(!game)return;event.preventDefault();event.stopImmediatePropagation();if(button.matches('[data-form-spoilers]')){toggleFutureStandings(button,card);return}if(button.matches('[data-lineup]')){game.__showLineup=!game.__showLineup;game.__lineupSpoilers=false;game.__showResults=false;game.__showSummary=false;if(game.__showLineup){game.__lineupLoading=true;rerenderAtCard(card);EPLData.enrich(game,{lineup:true}).then(()=>hydrateRosterFlags(game)).finally(()=>{game.__lineupLoading=false;rerenderAtCard(card)})}else rerenderAtCard(card);return}if(button.matches('[data-watch-toggle]')){toggleCardMeter(button,card);return}if(game.completed)return;if(button.matches('[data-summary]')){game.__showSummary=!game.__showSummary;game.__showLineup=false;if(game.__showSummary)EPLData.enrich(game).finally(()=>rerenderAtCard(card));else rerenderAtCard(card);return}game.__showResults=!game.__showResults;game.__showLineup=false;game.__showSummary=false;EPLData.enrich(game).finally(()=>rerenderAtCard(card))},true);
listShell.addEventListener('click',event=>{const card=event.target.closest('.list-game.past');if(!card||event.target.closest('a,[data-highlight],[data-schedule-lineup]'))return;event.preventDefault();event.stopImmediatePropagation()},true);
// Upcoming records and standings are spoilers. Native checkbox state gives
// immediate feedback; save it independently so a later refresh keeps the choice.
listShell.addEventListener('change',event=>{const control=event.target.closest('[data-form-spoilers]'),card=event.target.closest('[data-game]');if(!control||!card?.classList.contains('future'))return;const id=String(card.dataset.game),show=control.checked,game=games.find(item=>String(item.id)===id);show?futureFormSpoilers.add(id):futureFormSpoilers.delete(id);if(game)game.__showForm=show;rerenderAtCard(card)},true);
document.addEventListener('click',event=>{const button=event.target.closest('#match-info [data-lineup]');if(!button||!info.querySelector('.incident-list'))return;const title=info.querySelector('.result-title')?.textContent||'',game=games.find(g=>title.includes(g.homeAbbr||g.home)&&title.includes(g.awayAbbr||g.away));if(!game)return;event.preventDefault();event.stopImmediatePropagation();openInfo(game,false);const box=info.querySelector('[data-lineup-content]');box.innerHTML=rosterMarkup(game);info.querySelector('[data-lineup]').textContent='HIDE LINEUP'},true);
document.addEventListener('click',event=>{const button=event.target.closest('#match-info [data-results]');if(!button)return;const title=info.querySelector('.result-title')?.textContent||'',game=games.find(g=>title.includes(g.homeAbbr||g.home)&&title.includes(g.awayAbbr||g.away));if(!game)return;event.preventDefault();event.stopImmediatePropagation();openInfo(game,true)},true);
document.addEventListener('click',event=>{const button=event.target.closest('#match-info [data-watch]');if(!button)return;const title=info.querySelector('.result-title')?.textContent||'',game=games.find(g=>title.includes(g.homeAbbr||g.home)&&title.includes(g.awayAbbr||g.away));if(!game)return;event.preventDefault();event.stopImmediatePropagation();ensurePlot().activate(game);openInfo(game,false);info.querySelector('[data-watch]')?.classList.add('active')},true);
incidentTimeline=function(g){const events=(g.events||[]).filter(event=>['goal','red','yellow','penalty','sub'].includes(event.type));return events.map(event=>{const logo=event.teamId&&event.teamId===g.homeId?g.homeLogo:event.teamId&&event.teamId===g.awayId?g.awayLogo:'',icon=event.type==='goal'&&logo?`<img class="incident-badge" src="${logo}" aria-hidden="true">`:`<i class="incident-mark ${event.type}" aria-hidden="true"></i>`,text=event.scorer&&event.text.includes(event.scorer)?event.text.split(event.scorer).join(`<strong class="incident-player">${event.scorer}</strong>`):event.text;return `<div class="incident ${event.type}"><time>${Number.isFinite(event.minute)?`${event.minute}'`:'—'}</time>${icon}<span>${text}</span></div>`}).join('')||'<p>Detailed incidents are not yet available.</p>'};
listShell.addEventListener('click',event=>{const card=event.target.closest('[data-game]'),control=event.target.closest('[data-watch-toggle],[data-results],[data-summary],[data-result-tab],[data-lineup],[data-schedule-lineup],[data-lineup-spoilers],[data-form-spoilers],[data-highlight]');if(!card||control)return;const game=games.find(item=>String(item.id)===String(card.dataset.game));if(!game?.completed)return;event.preventDefault();event.stopPropagation();if(game.__showResults||game.__showSummary||game.__showLineup){game.__showResults=false;game.__showSummary=false;game.__showLineup=false;game.__resultTab='stats';rerenderAtCard(card)}},true);
const teamTable={};
// Club names repeat across competitions (for example Barcelona in La Liga and
// the Champions League), so standings must never be keyed by name alone.
const teamTableKey=(leagueId,team)=>`${leagueId||'epl'}:${String(team||'').trim()}`;
const tableLeagueLabel=game=>game.competitionLabel||({laliga:'LA LIGA',ucl:'CHAMPIONS LEAGUE',carabao:'CARABAO CUP',mlb:'MLB',nfl:'NFL'}[game.leagueId]||'EPL');
const standingsKey=game=>game.espnLeague||game.leagueId;
const leagueStandings={},leagueTableRequests=new Map(),teamFormRequests=new Map();
const normalStatName=value=>String(value||'').toLowerCase().replace(/[^a-z]/g,'');
const standingStat=(entry,names)=>{const stat=(entry?.stats||[]).find(item=>names.includes(normalStatName(item.name||item.displayName||item.label)));return stat?.displayValue??stat?.value??''};
const standingNumber=value=>{const cleaned=String(value??'').replace(/[^\d.-]/g,'');if(!cleaned||cleaned==='-'||cleaned==='.')return null;const number=Number(cleaned);return Number.isFinite(number)?number:null};
const standingEntries=payload=>{const collect=node=>[...(node?.standings?.entries||[]),...((node?.children||[]).flatMap(collect))],entries=collect(payload),seen=new Set();return entries.filter(entry=>{const id=String(entry?.team?.id||entry?.team?.displayName||'');if(!id||seen.has(id))return false;seen.add(id);return true})};
const standingRows=(payload,leagueId)=>standingEntries(payload).map(entry=>{
  const value=names=>standingStat(entry,names),rank=value(['leaguerank','rank','playoffseed','divisionrank']),wins=value(['wins']),draws=value(['ties','draws']),losses=value(['losses']);
  const gp=value(['gamesplayed','games','matchesplayed'])||((standingNumber(wins)??0)+(standingNumber(draws)??0)+(standingNumber(losses)??0));
  return {id:String(entry.team?.id||''),name:entry.team?.displayName||entry.team?.name||'',abbr:entry.team?.abbreviation||entry.team?.shortDisplayName||entry.team?.displayName||'',logo:entry.team?.logos?.[0]?.href||entry.team?.logo||'',rank:standingNumber(rank),gp,wins,draws,losses,for:value(['pointsfor','goalsfor','goals']),against:value(['pointsagainst','goalsagainst','goalsconceded']),gd:value(['pointdifferential','goaldifference','differential']),points:value(['points','leaguepoints']),pct:value(['winpercent','winpercentage','winningpercentage','winpct','percentage']),gamesBack:value(['gamesbehind','gamesback','gb']),leagueId};
}).filter(row=>row.name).sort((left,right)=>(left.rank??999)-(right.rank??999)||(standingNumber(right.wins)??0)-(standingNumber(left.wins)??0));
const mlbStandingRows=(payload,leagueId)=>{
  const seen=new Set();
  return (payload?.records||[]).flatMap(record=>(record?.teamRecords||[]).map(entry=>({record,entry}))).map(({record,entry})=>{
    const id=String(entry?.team?.id||''),wins=standingNumber(entry?.wins),losses=standingNumber(entry?.losses),gp=standingNumber(entry?.gamesPlayed)??((wins??0)+(losses??0));
    const divisionId=String(record?.division?.id||entry?.division?.id||''),divisionNames={201:'AL EAST',202:'AL CENTRAL',200:'AL WEST',204:'NL EAST',205:'NL CENTRAL',203:'NL WEST'},division=record?.division?.nameShort||record?.division?.name||entry?.division?.nameShort||entry?.division?.name||divisionNames[divisionId]||'DIVISION';
    return {id,name:entry?.team?.name||'',abbr:entry?.team?.abbreviation||entry?.team?.name||'',logo:id?`https://www.mlbstatic.com/team-logos/${id}.svg`:'',rank:standingNumber(entry?.divisionRank??entry?.leagueRank??entry?.sportRank),gp,wins,draws:'',losses,for:entry?.runsScored??'',against:entry?.runsAllowed??'',gd:entry?.runDifferential??'',points:entry?.winningPercentage??'',pct:entry?.winningPercentage??'',gamesBack:entry?.gamesBack??'',leagueId,division};
  }).filter(row=>row.name&&!seen.has(row.id)&&(seen.add(row.id),true)).sort((left,right)=>(left.rank??999)-(right.rank??999)||(right.wins??0)-(left.wins??0));
};
const divisionStandingRows=(payload,leagueId)=>{
  const rows=[],seen=new Set();
  const visit=(node,inherited='')=>{
    const division=node?.name||node?.displayName||node?.abbreviation||inherited;
    const entries=node?.standings?.entries||[];
    if(entries.length)standingRows({standings:{entries}},leagueId).forEach(row=>{
      if(!seen.has(row.id)){seen.add(row.id);rows.push({...row,division})}
    });
    (node?.children||[]).forEach(child=>visit(child,division));
  };
  visit(payload);
  return rows;
};
const applyStandingRows=rows=>{rows.forEach(row=>{teamTable[teamTableKey(row.leagueId,row.name)]={rank:row.rank,wins:standingNumber(row.wins),draws:standingNumber(row.draws),losses:standingNumber(row.losses)};});return rows};
async function fetchLeagueStandings(league,providerSlug=''){
  if(!league)return [];
  const cacheKey=providerSlug||league.id;
  if(leagueTableRequests.has(cacheKey))return leagueTableRequests.get(cacheKey).then(applyStandingRows);
  const request=(async()=>{
    try{
      const endpoint=league.sport==='baseball'?`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${new Date().getUTCFullYear()}&standingsTypes=regularSeason`:`https://site.api.espn.com/apis/v2/sports/${league.sport}/${providerSlug||league.slug}/standings`,response=await fetch(endpoint),payload=response.ok?await response.json():null,divisionRows=league.sport==='football'?divisionStandingRows(payload,league.id):[],rows=league.sport==='baseball'?mlbStandingRows(payload,league.id):divisionRows.length?divisionRows:standingRows(payload,league.id);
      if(rows.length){
        leagueStandings[cacheKey]=rows;
        applyStandingRows(rows);
      }
      return rows;
    }catch(_){return []}
  })();
  leagueTableRequests.set(cacheKey,request);
  request.then(rows=>{if(!rows.length&&leagueTableRequests.get(cacheKey)===request)leagueTableRequests.delete(cacheKey)}).catch(()=>{if(leagueTableRequests.get(cacheKey)===request)leagueTableRequests.delete(cacheKey)});
  return request;
}
async function loadTeamTable(id=activeLeague){
  Object.keys(teamTable).forEach(key=>delete teamTable[key]);
  const leagues=id==='all'?[...activeLeagueIds].map(leagueId=>EPLData.leagues[leagueId]).filter(league=>league&&!league.virtual):[EPLData.leagues[id]].filter(league=>league&&!league.virtual);
  await Promise.all(leagues.map(fetchLeagueStandings));
  listShell.querySelectorAll('[data-game]').forEach(card=>{
    const game=games.find(item=>String(item.id)===String(card.dataset.game));
    if(game)paintStandingContextAtCard(card,game);
  });
}
const ordinal=value=>{const n=Number(value),tail=n%100;return `${n}${tail>=11&&tail<=13?'th':n%10===1?'st':n%10===2?'nd':n%10===3?'rd':'th'}`};
function paintStandingContextAtCard(card,game){
  const teams=card?.querySelectorAll('.list-teams:has(.card-kickoff) > .home-team, .list-teams:has(.card-kickoff) > .away-team');
  if(!teams?.length)return;
  [game.home,game.away].forEach((name,index)=>{
    const team=teams[index];if(!team)return;
    let context=team.querySelector('.team-table-context');
    if(!context){context=document.createElement('small');context.className='team-table-context';team.append(context)}
    const row=teamTable[teamTableKey(game.leagueId,name)];
    if(!row){context.innerHTML='<b>—</b><i>STANDINGS LOADING…</i>';return}
    const baseball=game.sport==='baseball',values=baseball?[row.wins,row.losses]:[row.wins,row.draws,row.losses];
    const record=values.every(Number.isFinite)?values.join('–'):'—';
    const standing=Number.isFinite(Number(row.rank))&&Number(row.rank)>0?`${ordinal(row.rank)} IN ${baseball?'DIV.':tableLeagueLabel(game)}`:tableLeagueLabel(game);
    context.dataset.split='true';context.dataset.standingReady='true';
    context.innerHTML=`<b>${record}</b><i data-standing="${standing}">${standing}</i>`;
  });
}
ribbon.addEventListener('click',event=>{if(!event.target.closest('[data-team]'))return;requestAnimationFrame(()=>document.body.classList.contains('view-list')?document.getElementById('list-now')?.scrollIntoView({behavior:'smooth',block:'center'}):plot?.recenter())});
// Match rounds come from the provider. Never infer them from the fixture index:
// that fabricated a "MATCHWEEK" for every competition.
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game),matchup=card.querySelector('.list-teams');if(!game||game.sport==='baseball'||!matchup)return;const teams=matchup.querySelectorAll(':scope > .home-team,:scope > .away-team'),competition=tableLeagueLabel(game);[game.home,game.away].forEach((name,index)=>{const node=teams[index],context=teamTable[teamTableKey(game.leagueId,name)];if(!node||!context||node.querySelector('.team-table-context'))return;const record=[context.wins,context.draws,context.losses].every(Number.isFinite)?`${context.wins}–${context.draws}–${context.losses}`:'';node.insertAdjacentHTML('beforeend',`<small class="team-table-context">${record}${record&&Number.isFinite(context.rank)?' · ':''}${Number.isFinite(context.rank)?`${ordinal(context.rank)} IN ${competition}`:''}</small>`)});const week=game.raw?.week?.number||game.raw?.competitions?.[0]?.week?.number,label=game.leagueId==='ucl'?'MATCHDAY':game.leagueId==='nfl'?'WEEK':'MATCHWEEK';if(Number.isFinite(Number(week))&&!card.querySelector('.matchweek'))matchup.insertAdjacentHTML('afterend',`<small class="matchweek">${label} ${week}</small>`)})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game),matchup=card.querySelector('.list-teams');if(!game||game.sport==='baseball'||!matchup||card.querySelector('.matchweek'))return;const season=game.raw?.season?.year,fixtures=games.filter(item=>item.raw?.season?.year===season).sort((a,b)=>a.time-b.time),index=fixtures.indexOf(game),week=game.raw?.week?.number||game.raw?.competitions?.[0]?.week?.number||(index>=0?Math.floor(index/10)+1:null),label=game.leagueId==='ucl'?'MATCHDAY':game.leagueId==='nfl'?'WEEK':'MATCHWEEK';if(Number.isFinite(Number(week)))matchup.insertAdjacentHTML('afterend',`<small class="matchweek">${label} ${week}</small>`)})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>{let changed=false;games.forEach(game=>{if(game.venue){game.venue='';changed=true}});if(changed)renderList()}).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('.list-game.future .list-content>small').forEach(row=>{if(/^(Premier League|La Liga)\s*·?\s*$/.test(row.textContent.trim()))row.remove()})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('.team-table-context').forEach(context=>{if(context.dataset.split)return;context.dataset.split='true';const [record='',standing='']=context.textContent.split(' · ');context.innerHTML=`<b>${record}</b><i>${standing}</i>`})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game);if(!game)return;card.querySelectorAll('.list-teams>span').forEach((team,index)=>{const name=index===0?game.home:game.away,context=teamTable[teamTableKey(game.leagueId,name)],display=team.querySelector('.team-table-context');if(!context||!display||display.dataset.standingReady)return;const record=[context.wins,context.draws,context.losses].every(Number.isFinite)?`${context.wins}–${context.draws}–${context.losses}`:display.querySelector('b')?.textContent||'',standing=Number.isFinite(context.rank)?`${ordinal(context.rank)} IN ${tableLeagueLabel(game)}`:'—';display.dataset.standingReady='true';display.innerHTML=`<b>${record}</b><i data-standing="${standing}">${standing}</i>`})})).observe(listShell,{childList:true,subtree:true});
// The original row template includes a visual "v" separator.  Team context now
// owns that space, so remove the separator rather than trying to hide it with CSS.
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{
  const game=games.find(item=>item.id===card.dataset.game);
  const matchup=card.querySelector('.list-teams');
  if(!game||game.sport==='baseball'||!matchup)return;
  matchup.querySelector(':scope > i')?.remove();
  matchup.querySelectorAll(':scope > span').forEach((team,index)=>{
    const table=teamTable[teamTableKey(game.leagueId,index===0?game.home:game.away)];
    const context=team.querySelector('.team-table-context');
    if(!table||!context)return;
    const wins=Number(table.wins),draws=Number(table.draws),losses=Number(table.losses),rank=Number(table.rank);
    const record=[wins,draws,losses].every(Number.isFinite)?`${wins}–${draws}–${losses}`:'—';
    const standing=Number.isFinite(rank)&&rank>0?`${ordinal(rank)} IN ${tableLeagueLabel(game)}`:tableLeagueLabel(game);
    const signature=`${record}|${standing}`;
    if(context.dataset.signature===signature)return;
    context.dataset.signature=signature;
    context.dataset.split='true';
    context.dataset.standingReady='true';
    context.innerHTML=`<b>${record}</b><i data-standing="${standing}">${standing}</i>`;
  });
})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('.list-date').forEach(header=>{if(header.querySelector('.date-matchweek'))return;let node=header.nextElementSibling;while(node&&!node.matches('.list-game'))node=node.nextElementSibling;const game=node&&games.find(item=>item.id===node.dataset.game);if(game?.sport==='baseball')return;const week=game?.raw?.week?.number||game?.raw?.competitions?.[0]?.week?.number;if(Number.isFinite(Number(week)))header.insertAdjacentHTML('beforeend',`<span class="date-matchweek">MATCHDAY ${week}</span>`)})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('[data-game].past').forEach(card=>{const score=card.querySelector(':scope > strong');if(score&&!score.hasAttribute('data-watch-toggle'))score.setAttribute('data-watch-toggle','');const content=card.querySelector('.list-content'),game=games.find(g=>g.id===card.dataset.game);if(!content||!game||card.classList.contains('match-page-link'))return;const matchup=content.querySelector('.list-teams'),mark=matchup?.querySelector(':scope > i');if(mark&&mark.textContent!=='v'){mark.textContent='v';mark.classList.remove('list-final')}if(game.__showLineup&&!content.querySelector('.lineups,.lineup-empty'))content.insertAdjacentHTML('beforeend',rosterMarkup(game));const existingTabs=content.querySelector('.match-tabs');if(existingTabs)return;const tabs=document.createElement('div');tabs.className='match-tabs';tabs.innerHTML=`<button data-results class="${game.__showResults?'active':''}" title="Hold for half a second to reveal spoilers">SPOIL ME</button><button data-lineup class="${game.__showLineup?'active':''}">SHOW LINEUP</button>`;matchup?.after(tabs)})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>{const title=info.querySelector('.result-title'),tabs=info.querySelector('.detail-tabs');if(!title||!tabs)return;const watch=tabs.querySelector('[data-watch]');if(watch)watch.remove();if(!tabs.querySelector('[data-results]'))tabs.insertAdjacentHTML('afterbegin','<button data-results>SPOIL ME</button>');tabs.querySelectorAll('[data-results]').forEach(button=>{if(button.textContent!=='SPOIL ME')button.textContent='SPOIL ME'});if(title.nextElementSibling!==tabs)title.after(tabs)}).observe(info,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('[data-game].past').forEach(card=>{const game=games.find(g=>g.id===card.dataset.game),final=card.querySelector('.tab-final-score');if(!game||!final||final.dataset.enriched)return;final.dataset.enriched='true';const goals=(game.events||[]).filter(event=>event.type==='goal'||event.type==='score'),byTeam=(id,abbr,logo)=>goals.filter(event=>event.teamId===id&&event.scorer).map(event=>`${event.scorer} ${game.sport==='football'&&event.period?`Q${event.period}`:`${event.minute}'`}`).join(' · '),homeScorers=byTeam(game.homeId,game.homeAbbr,game.homeLogo),awayScorers=byTeam(game.awayId,game.awayAbbr,game.awayLogo);final.innerHTML=`<span>FINAL SCORE</span><strong><img src="${game.homeLogo||''}">${game.homeAbbr||game.home} ${game.homeScore}–${game.awayScore} ${game.awayAbbr||game.away}<img src="${game.awayLogo||''}"></strong>${homeScorers||awayScorers?`<div class="goal-scorers">${homeScorers?`<span><img src="${game.homeLogo||''}">${game.homeAbbr||game.home} · ${homeScorers}</span>`:''}${awayScorers?`<span><img src="${game.awayLogo||''}">${game.awayAbbr||game.away} · ${awayScorers}</span>`:''}</div>`:''}`;let home=0,away=0;card.querySelectorAll('.incident.goal,.incident.score').forEach((row,index)=>{if(row.dataset.scoreline)return;const event=goals[index];if(event?.teamId===game.homeId)home++;else if(event?.teamId===game.awayId)away++;const badge=row.querySelector('.incident-badge'),description=row.querySelector('span:last-child');if(badge&&game.sport==='baseball'){const mark=document.createElement('span');mark.className='goal-mark';badge.replaceWith(mark);mark.append(badge);mark.insertAdjacentHTML('beforeend',`<small>${home}–${away}</small>`)}if(description&&game.sport==='baseball'&&!/^goal/i.test(description.textContent.trim()))description.insertAdjacentHTML('afterbegin','<b class="goal-label">GOAL! </b>');row.dataset.scoreline='true'})})).observe(listShell,{childList:true,subtree:true});
const soccerBallIcon='<span class="soccer-ball" aria-hidden="true">⚽</span>';
const soccerResultEsc=value=>String(value??'').replace(/[&<>'"]/g,character=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[character]));
const soccerGoalMinute=event=>{
  const clock=String(event?.clock||'').trim().replace(/'/g,'');
  return clock?`${clock}'`:Number.isFinite(event?.minute)?`${event.minute}'`:'';
};
const soccerGoalLists=game=>{
  const goals=(game.events||[]).filter(event=>event.type==='goal'||event.type==='score');
  const scoringTeam=event=>{
    const team=String(event.teamId||'');
    if(!(event.ownGoal||/own goal/i.test(String(event.text||''))))return team;
    return team===String(game.homeId)?String(game.awayId):team===String(game.awayId)?String(game.homeId):team;
  };
  const scorers=side=>goals.filter(event=>scoringTeam(event)===String(side)).map(event=>{
    const player=event.scorer||String(event.text||'').replace(/^.*?(?:goal by|own goal by)\s*/i,'').split(/[,.]/)[0].trim()||'Goal';
    return `<span>${soccerResultEsc(player)} ${soccerGoalMinute(event)}${event.ownGoal||/own goal/i.test(String(event.text||''))?' (OG)':''}</span>`;
  }).join('');
  return `<div class="soccer-goal-list home">${scorers(game.homeId)}</div>${soccerBallIcon}<div class="soccer-goal-list away">${scorers(game.awayId)}</div>`;
};
const soccerResultCard=game=>{
  const club=(side,name,logo)=>`<div class="soccer-result-club ${side}">${logo?`<img src="${soccerResultEsc(logo)}" alt="">`:''}<b>${soccerResultEsc(name)}</b></div>`;
  return `<div class="soccer-result-card">`+
    `<div class="soccer-result-top">${club('home',game.home,game.homeLogo)}<div class="soccer-result-main"><strong>${game.homeScore??'—'}–${game.awayScore??'—'}</strong><span>FULL TIME</span></div>${club('away',game.away,game.awayLogo)}</div>`+
    `<div class="soccer-result-scorers">${soccerGoalLists(game)}</div>`+
  `</div>`;
};
new MutationObserver(()=>listShell.querySelectorAll('[data-game].past .tab-final-score').forEach(final=>{
  if(final.dataset.scoreDesign)return;
  const card=final.closest('[data-game]'),game=games.find(item=>item.id===card?.dataset.game),score=final.querySelector(':scope > strong');
  if(!game||!score)return;
  final.dataset.scoreDesign='true';
  if(game.sport==='soccer'){
    final.innerHTML=soccerResultCard(game);
    return;
  }
  const label=final.querySelector(':scope > span');
  score.className='final-scoreline';
  score.innerHTML=`<span class="final-club home"><img src="${game.homeLogo||''}" alt=""><b>${game.homeAbbr||game.home}</b></span><strong>${game.homeScore??'—'}–${game.awayScore??'—'}</strong><span class="final-club away"><b>${game.awayAbbr||game.away}</b><img src="${game.awayLogo||''}" alt=""></span>`;
})).observe(listShell,{childList:true,subtree:true});
const rosterFlagCache=JSON.parse(localStorage.getItem('must-watch-player-flags')||'{}'),rosterPortraitCache={...JSON.parse(localStorage.getItem('must-watch-player-portraits')||'{}'),...JSON.parse(localStorage.getItem('must-watch-player-portraits-v2')||'{}')},countryCode={'The Netherlands':'nl',Netherlands:'nl',England:'gb',Scotland:'gb',Wales:'gb','Northern Ireland':'gb',Ireland:'ie',France:'fr',Spain:'es',Portugal:'pt',Brazil:'br',Argentina:'ar',Belgium:'be',Germany:'de',Italy:'it',Denmark:'dk',Sweden:'se',Norway:'no',Finland:'fi',Poland:'pl',Croatia:'hr',Serbia:'rs',Ukraine:'ua','Czech Republic':'cz',Slovakia:'sk',Hungary:'hu',Austria:'at',Switzerland:'ch',Turkey:'tr',Greece:'gr',Romania:'ro',Bulgaria:'bg',Slovenia:'si',Albania:'al',Morocco:'ma',Algeria:'dz',Tunisia:'tn',Egypt:'eg',Senegal:'sn',Ghana:'gh',Nigeria:'ng','Ivory Coast':'ci',Cameroon:'cm',Mali:'ml','South Africa':'za',Japan:'jp','South Korea':'kr',China:'cn',Uruguay:'uy',Colombia:'co',Chile:'cl',Ecuador:'ec',Paraguay:'py',Peru:'pe',Mexico:'mx',Jamaica:'jm',Canada:'ca','United States':'us',Australia:'au','New Zealand':'nz'};
const fifaFlagCode={ENG:'gb',SCO:'gb',WAL:'gb',NIR:'gb',IRL:'ie',FRA:'fr',ESP:'es',POR:'pt',BRA:'br',ARG:'ar',BEL:'be',NED:'nl',GER:'de',ITA:'it',DEN:'dk',SWE:'se',NOR:'no',FIN:'fi',POL:'pl',CRO:'hr',SRB:'rs',UKR:'ua',CZE:'cz',SVK:'sk',HUN:'hu',AUT:'at',SUI:'ch',TUR:'tr',GRE:'gr',MAR:'ma',ALG:'dz',EGY:'eg',SEN:'sn',GHA:'gh',NGA:'ng',CIV:'ci',CMR:'cm',JPN:'jp',KOR:'kr',USA:'us',CAN:'ca',AUS:'au',NZL:'nz',URU:'uy',COL:'co',CHI:'cl',ECU:'ec',MEX:'mx'};
const rosterEntries=roster=>[...new Map([roster.roster,roster.athletes,roster.entries,roster.players,roster.starters,roster.startingXI,roster.substitutes,roster.bench].filter(Array.isArray).flat().filter(Boolean).map((entry,index)=>{const player=entry.athlete||entry;return [String(player.id||player.uid||player.displayName||player.fullName||`unknown-${index}`),entry]})).values()];
function hydrateRosterFlags(g){
 if(g.sport!=='soccer')return Promise.resolve();
 if(g._flagsLoading)return g._flagsPromise||Promise.resolve();
 g._flagsLoading=true;
 const players=(g.rosters||[]).flatMap(rosterEntries);
 if(!players.length){g._flagsLoading=false;return Promise.resolve()}
 const tasks=players.map(async raw=>{
  const p=raw.athlete||raw,id=p.id||p.uid||p.displayName,name=p.displayName||p.fullName;
  if(!name||p.flag?.href||raw.flag?.href)return;
  const nationality=p.country||raw.country||p.nationality||raw.nationality||p.citizenship||raw.citizenship||p.birthCountry||raw.birthCountry||'',label=typeof nationality==='string'?nationality:nationality.displayName||nationality.name||nationality.fullName||nationality.abbreviation||nationality.code||'',shortCode=typeof nationality==='string'?'':String(nationality.abbreviation||nationality.code||nationality.isoCode||'').toUpperCase(),directCode=countryCode[label]||fifaFlagCode[String(label).toUpperCase()]||fifaFlagCode[shortCode]||(/^[A-Z]{2}$/.test(shortCode)?shortCode.toLowerCase():'');
  if(directCode){p.flag={href:`https://flagcdn.com/24x18/${directCode}.png`,alt:label};rosterFlagCache[id]={code:directCode,label};return}
  const saved=rosterFlagCache[id],savedCode=typeof saved==='string'?saved:saved?.code,savedLabel=typeof saved==='object'?saved?.label:'';
  if(savedCode){const countryByCode={gb:'England',ie:'Ireland',fr:'France',es:'Spain',pt:'Portugal',br:'Brazil',ar:'Argentina',be:'Belgium',nl:'Netherlands',de:'Germany',it:'Italy',dk:'Denmark',se:'Sweden',no:'Norway',fi:'Finland',pl:'Poland',hr:'Croatia',rs:'Serbia',ua:'Ukraine',cz:'Czech Republic',sk:'Slovakia',hu:'Hungary',at:'Austria',ch:'Switzerland',tr:'Turkey',gr:'Greece',ro:'Romania',bg:'Bulgaria',si:'Slovenia',al:'Albania',ma:'Morocco',dz:'Algeria',tn:'Tunisia',eg:'Egypt',sn:'Senegal',gh:'Ghana',ng:'Nigeria',ci:'Ivory Coast',cm:'Cameroon',ml:'Mali',za:'South Africa',jp:'Japan',kr:'South Korea',cn:'China',uy:'Uruguay',co:'Colombia',cl:'Chile',ec:'Ecuador',py:'Paraguay',pe:'Peru',mx:'Mexico',jm:'Jamaica',ca:'Canada',us:'United States',au:'Australia',nz:'New Zealand'};p.flag={href:`https://flagcdn.com/24x18/${savedCode}.png`,alt:savedLabel||countryByCode[savedCode]||savedCode.toUpperCase()};return}
  try{
   const response=await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/soccer/${EPLData.leagues[g.leagueId||activeLeague]?.slug||'eng.1'}/athletes/${encodeURIComponent(p.id)}`);
   if(response.ok){const athlete=(await response.json()).athlete;if(athlete?.flag?.href){p.flag=athlete.flag;return}const code=countryCode[athlete?.citizenship]||fifaFlagCode[String(athlete?.citizenship||'').toUpperCase()];if(code){rosterFlagCache[id]={code,label:athlete.citizenship};p.flag={href:`https://flagcdn.com/24x18/${code}.png`,alt:athlete.citizenship};return}}
   const fallback=await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(name)}`);
   if(!fallback.ok)return;
   const result=await fallback.json(),candidate=(result?.player||[]).find(x=>String(x.strPlayer||'').toLowerCase()===String(name).toLowerCase()),code=candidate&&countryCode[candidate.strNationality];
   if(code){rosterFlagCache[id]={code,label:candidate.strNationality};p.flag={href:`https://flagcdn.com/24x18/${code}.png`,alt:candidate.strNationality}}
  }catch(error){}
 });
 g._flagsPromise=Promise.all(tasks).finally(()=>{g._flagsReady=true;g._flagsLoading=false;g._flagsPromise=null;localStorage.setItem('must-watch-player-flags',JSON.stringify(rosterFlagCache));});
 return g._flagsPromise;
}
// ESPN's soccer roster endpoint often contains athlete IDs but no usable
// portrait. Fetch each club's roster once instead of issuing a request for
// every player: it avoids the public fallback service's request limit.
function hydrateRosterPortraits(g){
 if(g.sport!=='soccer'||g._portraitsLoading)return g._portraitsPromise||Promise.resolve();
 const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 const groups=(g.rosters||[]).map(roster=>{
   const team=roster.team?.displayName||roster.team?.name||roster.team?.abbreviation||'';
   const players=rosterEntries(roster).filter(entry=>{
     const player=entry.athlete||entry,image=player.headshot||entry.headshot||player.photo||entry.photo||player.image||entry.image,source=typeof image==='string'?image:image?.href||image?.url||'';
     return !source;
   });
   return {team,players};
 }).filter(group=>group.team&&group.players.length);
 if(!groups.length)return Promise.resolve();
 groups.forEach(group=>group.players.forEach(entry=>{const player=entry.athlete||entry,id=String(player.id||player.uid||player.displayName||'');if(typeof rosterPortraitCache[id]==='string')player._portraitUrl=rosterPortraitCache[id]}));
 const pending=groups.filter(group=>group.players.some(entry=>!((entry.athlete||entry)._portraitUrl)));
 if(!pending.length)return Promise.resolve();
 g._portraitsLoading=true;
 const savePortrait=(entry,candidate)=>{
   const player=entry.athlete||entry,id=String(player.id||player.uid||player.displayName||''),url=candidate?.strCutout||candidate?.strThumb||candidate?.strRender||'';
   if(!url)return false;
   player._portraitUrl=url;
   rosterPortraitCache[id]=url;
   return true;
 };
 const lookupTeam=async({team,players})=>{
   try{
     const search=await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(team)}`);
     if(!search.ok)return;
     const teams=(await search.json()).teams||[],club=teams.find(candidate=>normal(candidate.strTeam)===normal(team))||teams[0];
     if(!club?.idTeam)return;
     const roster=await fetch(`https://www.thesportsdb.com/api/v1/json/3/lookup_all_players.php?id=${encodeURIComponent(club.idTeam)}`);
     if(!roster.ok)return;
     const byName=new Map(((await roster.json()).player||[]).map(candidate=>[normal(candidate.strPlayer),candidate]));
     players.forEach(entry=>savePortrait(entry,byName.get(normal((entry.athlete||entry).displayName||(entry.athlete||entry).fullName))));
     // A club roster is often incomplete or stale.  TheSportsDB also exposes
     // an exact-player search, which materially improves coverage for recent
     // transfers and academy players without delaying the first lineup paint.
     const unresolved=players.filter(entry=>!((entry.athlete||entry)._portraitUrl));
     let cursor=0;
     const searchPlayer=async()=>{
       while(cursor<unresolved.length){
         const entry=unresolved[cursor++],player=entry.athlete||entry,name=player.displayName||player.fullName||'';
         if(!name)continue;
         try{
           const response=await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(name)}`);
           if(!response.ok)continue;
           const candidate=((await response.json()).player||[]).find(item=>normal(item.strPlayer)===normal(name));
           savePortrait(entry,candidate);
         }catch(_){}
       }
     };
     await Promise.all(Array.from({length:Math.min(3,unresolved.length)},searchPlayer));
   }catch(error){}
 };
 g._portraitsPromise=Promise.all(pending.map(lookupTeam)).finally(()=>{
   g._portraitsLoading=false;g._portraitsPromise=null;
   try{localStorage.setItem('must-watch-player-portraits-v2',JSON.stringify(rosterPortraitCache))}catch(error){}
 });
 return g._portraitsPromise;
}
const actualPlayerPosition=raw=>{
 const player=raw?.athlete||raw||{};
 const label=value=>typeof value==='string'?value:(value?.abbreviation||value?.shortName||value?.displayName||value?.name||value?.code||'');
 return [player.position,player.primaryPosition,player.positionAbbreviation,player.positionName,raw?.primaryPosition,raw?.position,raw?.positionAbbreviation,raw?.positionName]
  .map(label).map(value=>String(value).trim())
  .find(value=>value&&!/^(sub|substitute|bench|reserve)$/i.test(value))||'';
};
function hydrateRosterPositions(g){
 if(g.sport!=='soccer'||g._positionsLoading||g._positionsReady)return;
 const slug=EPLData.leagues[g.leagueId||activeLeague]?.slug;
 const players=(g.rosters||[]).flatMap(rosterEntries);
 const pending=players.filter(raw=>!actualPlayerPosition(raw)&&((raw.athlete||raw).id||(raw.athlete||raw).uid));
 if(!pending.length){g._positionsReady=true;return}
 g._positionsLoading=true;
 Promise.all(pending.map(async raw=>{
  const player=raw.athlete||raw,id=player.id||player.uid;
  try{
   const response=await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/soccer/${slug}/athletes/${encodeURIComponent(id)}`);
   if(!response.ok)return;
   const athlete=(await response.json()).athlete;
   const position=athlete?.position||athlete?.primaryPosition||athlete?.positionAbbreviation||athlete?.positionName;
   if(position)player.position=typeof position==='string'?{abbreviation:position}:position;
  }catch(_){}
 })).finally(()=>{g._positionsReady=true;g._positionsLoading=false;if(g.__showLineup)paintScheduleLineupAtGame(g,{refreshContent:true})});
}
rosterMarkup=function(g){const iso={ENG:'gb',SCO:'gb',WAL:'gb',NIR:'gb',USA:'us',CAN:'ca',AUS:'au',NZ:'nz',IRL:'ie',FRA:'fr',ESP:'es',POR:'pt',BRA:'br',ARG:'ar',BEL:'be',NED:'nl',GER:'de',ITA:'it',DEN:'dk',SWE:'se',NOR:'no',FIN:'fi',POL:'pl',CRO:'hr',SRB:'rs',UKR:'ua',CZE:'cz',SVK:'sk',HUN:'hu',AUT:'at',SUI:'ch',TUR:'tr',GRE:'gr',ROU:'ro',BUL:'bg',SVN:'si',ALB:'al',MAR:'ma',ALG:'dz',TUN:'tn',EGY:'eg',SEN:'sn',GHA:'gh',NGA:'ng',CIV:'ci',CMR:'cm',MLI:'ml',RSA:'za',JPN:'jp',KOR:'kr',CHN:'cn',URU:'uy',COL:'co',CHI:'cl',ECU:'ec',PAR:'py',PER:'pe',MEX:'mx',JAM:'jm'},player=(raw,role)=>{const p=raw.athlete||raw,number=raw.jersey||p.jersey||p.jerseyNumber||'—',position=raw.position?.abbreviation||p.position?.abbreviation||raw.position?.displayName||p.position?.displayName||'—',country=p.flag||raw.flag||p.country||raw.country||p.nationality||raw.nationality||p.citizenship||raw.citizenship||{},label=country.alt||country.displayName||country.name||country.fullName||country.abbreviation||country.code||'',code=String(country.abbreviation||country.code||country.isoCode||country.id||'').toUpperCase(),url=p.flag?.href||raw.flag?.href||country.href||country.logo||(iso[code]?`https://flagcdn.com/24x18/${iso[code]}.png`:''),flag=url?`<img class="lineup-flag" src="${url}" alt="${label||'Country flag'}">`:'<i class="lineup-flag empty" aria-hidden="true"></i>';return `<div class="lineup-player ${role}"><em>${number}</em>${flag}<span title="${p.displayName||p.fullName||'Unknown player'}">${p.displayName||p.fullName||'Unknown player'}</span><small>${position}</small></div>`},groups=(g.rosters||[]).map(r=>{const name=r.team?.abbreviation||r.team?.displayName||'SQUAD',logo=r.team?.logo||r.team?.logos?.[0]?.href||(name===g.homeAbbr?g.homeLogo:name===g.awayAbbr?g.awayLogo:''),all=r.roster||r.athletes||r.entries||r.players||[],starters=r.starters||r.startingXI||all.filter(x=>x.starter===true||x.isStarter===true||x.status?.type==='starter'),subs=r.substitutes||r.bench||all.filter(x=>x.substitute===true||x.isSubstitute===true||x.status?.type==='substitute');return {name,logo,all,starters,subs,hasRoles:starters.length||subs.length}}).filter(x=>x.all.length||x.starters.length||x.subs.length);if(!groups.length)return '<p class="lineup-empty">Official lineup data is not available for this match.</p>';return `<div class="lineups">${groups.map(group=>`<section><b>${group.logo?`<img src="${group.logo}">`:''}${group.name}</b>${group.hasRoles?`${group.starters.length?`<h4>STARTING XI</h4>${group.starters.map(p=>player(p,'starter')).join('')}`:''}${group.subs.length?`<h4>BENCH</h4>${group.subs.map(p=>player(p,'sub')).join('')}`:''}`:group.all.map(p=>player(p,'squad')).join('')}</section>`).join('')}</div>`};
function incidentTimeline(g){const events=(g.events||[]).filter(e=>['goal','red','yellow','penalty','sub'].includes(e.type)).slice(0,10);return events.map(e=>{const logo=e.teamId&&e.teamId===g.homeId?g.homeLogo:e.teamId&&e.teamId===g.awayId?g.awayLogo:'',icon=e.type==='goal'&&logo?`<img class="incident-badge" src="${logo}" aria-hidden="true">`:`<i class="incident-mark ${e.type}" aria-hidden="true"></i>`,text=e.scorer&&e.text.includes(e.scorer)?e.text.split(e.scorer).join(`<strong class="incident-player">${e.scorer}</strong>`):e.text;return `<div class="incident ${e.type}"><time>${Number.isFinite(e.minute)?`${e.minute}'`:'—'}</time>${icon}<span>${text}</span></div>`}).join('')||'<p>Detailed incidents are not yet available.</p>'}function rosterMarkup(g){const groups=(g.rosters||[]).map(r=>{const name=r.team?.abbreviation||r.team?.displayName||'SQUAD',logo=r.team?.logo||r.team?.logos?.[0]?.href||(name===g.homeAbbr?g.homeLogo:name===g.awayAbbr?g.awayLogo:'');return {name,logo,players:r.roster||r.athletes||r.entries||r.players||[]}}).filter(x=>x.players.length);if(!groups.length)return '<p class="lineup-empty">Official lineup data is not available for this match.</p>';return `<div class="lineups">${groups.map(group=>`<section><b>${group.logo?`<img src="${group.logo}">`:''}${group.name}</b>${group.players.map(raw=>{const p=raw.athlete||raw,number=raw.jersey||p.jersey||'—',position=raw.position?.abbreviation||p.position?.abbreviation||raw.position?.displayName||p.position?.displayName||'—',flag=p.flag?.href||raw.flag?.href||'',country=p.flag?.alt||raw.flag?.alt||'';return `<div class="lineup-player"><em>${number}</em>${flag?`<img src="${flag}" alt="${country}">`:''}<span>${p.displayName||p.fullName||'Unknown player'}</span><small>${position}</small></div>`}).join('')}</section>`).join('')}</div>`}function openInfo(g,spoilers=false){const s=g.scoreResult||WatchScore.score(g),injuries=(g.injuries||[]).length,teams=spoilers?`<span class="result-team"><img src="${g.homeLogo||''}">${g.homeAbbr||g.home}</span><strong class="result-final">${g.homeScore}–${g.awayScore}</strong><span class="result-team"><img src="${g.awayLogo||''}">${g.awayAbbr||g.away}</span>`:`<span class="result-team"><img src="${g.homeLogo||''}">${g.homeAbbr||g.home}</span><strong class="result-versus">v</strong><span class="result-team"><img src="${g.awayLogo||''}">${g.awayAbbr||g.away}</span>`;info.innerHTML=`<button class="close" aria-label="Close">×</button><span class="eyebrow">${g.completed?'MATCH NOTES':'MATCH PREVIEW'}</span><h2 class="result-title">${teams}</h2>${g.completed?`<div class="info-score">${s?.watchScore??'—'}</div><p>${WatchScore.reasons(g,s||{}).join(' · ')}</p><div class="detail-tabs">${spoilers?'':'<button data-results>SHOW MATCH RESULTS</button>'}<button data-lineup>SHOW LINEUP</button></div>${spoilers?`<div class="incident-list">${incidentTimeline(g)}</div>`:''}<div data-lineup-content></div>`:`<p>${g.league} · ${g.venue}</p><p>${g.time.toLocaleString(undefined,{weekday:'long',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}</p>${g.rosters?.length?'<p>OFFICIAL SQUAD INFORMATION AVAILABLE</p>':''}${injuries?`<p>${injuries} provider injury / availability update${injuries>1?'s':''}`:''}`}`;info.hidden=false;info.querySelector('.close').onclick=()=>info.hidden=true;info.querySelector('[data-results]')?.addEventListener('click',()=>openInfo(g,true));info.querySelector('[data-lineup]')?.addEventListener('click',e=>{const box=info.querySelector('[data-lineup-content]');box.innerHTML=box.innerHTML?'':rosterMarkup(g);e.currentTarget.textContent=box.innerHTML?'HIDE LINEUP':'SHOW LINEUP'})}
const meterResultFor=game=>{
  const locked=game.__meterScore;
  if(Number.isFinite(Number(locked?.watchScore)))return locked;
  const supplied=game.scoreResult;
  if(Number.isFinite(Number(supplied?.watchScore)))return supplied;
  const calculated=WatchScore.score(game);
  return Number.isFinite(Number(calculated?.watchScore))?calculated:null;
};
function select(g,s,details){if(details){openInfo(g);return}const enrich=g._enrichRequest||(g._enrichRequest=EPLData.enrich(g).finally(()=>{g._enrichRequest=null}));enrich.then(()=>{const refined=meterResultFor(g);g.__watchCalculating=false;if(refined){g.scoreResult=refined;plot?.reveal(g,refined);requestAnimationFrame(()=>rerenderAtGame(g.id))}else requestAnimationFrame(()=>rerenderAtGame(g.id))}).finally(()=>{g.__watchCalculating=false;g._watchLoading=false})}
const ensurePlot=()=>{if(plot)return plot;plot=new Gameplot({games,onSelect:select});plot.setTeamFilter(activeTeams);return plot};
const deferBackground=task=>'requestIdleCallback'in window?window.requestIdleCallback(task,{timeout:1800}):window.setTimeout(task,500);
function apply(all){localStorage.setItem('must-watch-teams',JSON.stringify([...activeTeams]));plot.setTeamFilter(activeTeams);renderTeams(all);renderRibbon(all);renderList()}function timeAway(g){const m=Math.round((g.time-Date.now())/60000),past=m<0,a=Math.abs(m),value=a<60?`${Math.max(1,a)}M`:a<1440?`${Math.ceil(a/60)}H`:`${Math.ceil(a/1440)}D`;return past?`${value} AGO`:`IN ${value}`}function listRow(g){const revealed=g.completed&&g.__mwRevealed,calculating=g.completed&&g.__watchCalculating,score=g.completed?(revealed?(g.scoreResult?.watchScore??'—'):calculating?'<i class="score-spinner" aria-label="Calculating Watch Index"></i>':'?'):'',components=g.anticipationBreakdown||{},safe=g.completed?(revealed?WatchScore.reasons(g,g.scoreResult||{}).join(' · '):calculating?'CALCULATING WATCH INDEX…':'WATCH SCORE HIDDEN — SELECT THIS CARD TO REVEAL'):`${g.league} · ${g.venue}`,final=g.__showResults?`${g.homeScore}–${g.awayScore}`:'v';return `<article class="list-game ${g.completed?'past':'future'} ${calculating?'score-calculating':''} ${g.__lineupSpoilers?'lineup-spoilers':''}" data-game="${g.id}"><strong aria-hidden="${g.completed?'false':'true'}">${score}</strong><div class="list-content"><div class="list-teams"><span><img src="${g.homeLogo||''}">${g.homeAbbr||g.home}</span><i class="${g.__showResults?'list-final':''}">${final}</i><span><img src="${g.awayLogo||''}">${g.awayAbbr||g.away}</span></div><p>${g.__showResults?`${g.homeAbbr||g.home} ${final} ${g.awayAbbr||g.away}`:`${g.homeAbbr||g.home}  v  ${g.awayAbbr||g.away}`}</p><small>${safe}</small>${!g.completed?`<small>${g.league} · ${g.venue}</small><small>COMPETITIVENESS ${components.competitiveness??'—'} · CONTEXT ${components.tableContext??'—'} · TIMING ${components.seasonTiming??'—'}</small>`:''}${g.__showResults?`<div class="incident-list list-incidents">${incidentTimeline(g)}</div>`:''}</div><div class="list-meta"><b>${timeAway(g)}</b><small>${g.time.toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small>${revealed&&!g.__showResults?'<button data-results>SHOW MATCH RESULTS</button>':''}</div></article>`}function renderList(){if(!games.length)return;const visible=games.filter(g=>!activeTeams.size||activeTeams.has(g.home)||activeTeams.has(g.away)).sort((a,b)=>a.time-b.time),now=Date.now();let html='',lastDay='',nowPlaced=false;const divider='<div class="list-now" id="list-now"><span>PAST MATCHES <b>↑</b></span><i></i><span><b>↓</b> UPCOMING MATCHES</span></div>';visible.forEach(g=>{if(!nowPlaced&&g.time>=now){html+=divider;nowPlaced=true}const day=g.time.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});if(day!==lastDay){html+=`<h2 class="list-date">${day}</h2>`;lastDay=day}html+=listRow(g)});if(!nowPlaced)html+=divider;listShell.innerHTML=html;listShell.querySelectorAll('[data-game]').forEach(card=>card.onclick=e=>{const g=games.find(x=>x.id===card.dataset.game);if(e.target.closest('[data-results]')){g.__showResults=true;renderList();return}if(g.completed&&!g.__mwRevealed){plot.activate(g);requestAnimationFrame(renderList)}})}function showTeamPreview(t,b){const rows=games.filter(g=>!g.completed&&(g.home===t||g.away===t)).sort((a,b)=>a.time-b.time).slice(0,6).map(g=>`<div class="cluster-row"><b class="cluster-score">${g.anticipation}</b><span class="cluster-fixture"><span class="cluster-badges"><img src="${g.homeLogo||''}"><img src="${g.awayLogo||''}"></span><span>${g.homeAbbr||g.home} v ${g.awayAbbr||g.away}</span></span><em><strong>${timeAway(g)}</strong><small>${g.time.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small></em></div>`).join('');const r=b.getBoundingClientRect();teamPreview.innerHTML=`<div class="hover-card cluster-card"><span class="hover-kicker">${t.toUpperCase()} · UPCOMING</span><div class="cluster-rows">${rows||'<span class="team-empty">No upcoming fixtures in this window.</span>'}</div></div>`;teamPreview.style.left=`${Math.max(185,Math.min(innerWidth-185,r.left+r.width/2))}px`;teamPreview.style.top=`${r.bottom+8}px`;teamPreview.hidden=false}function renderRibbon(all){ribbon.innerHTML=`<button data-all>ALL</button><button data-clear>CLEAR</button>`+all.map(t=>`<button class="ribbon-team ${activeTeams.has(t)?'active':''}" data-team="${t}"><img src="${logos[t]||''}"></button>`).join('');ribbon.querySelector('[data-all]').onclick=()=>{activeTeams=new Set(all);apply(all)};ribbon.querySelector('[data-clear]').onclick=()=>{activeTeams.clear();apply(all)};ribbon.querySelectorAll('[data-team]').forEach(b=>{const show=()=>showTeamPreview(b.dataset.team,b);b.onclick=()=>{const t=b.dataset.team;activeTeams.has(t)?activeTeams.delete(t):activeTeams.add(t);teamPreview.hidden=true;apply(all)};b.onpointerenter=show;b.onpointermove=show;b.onpointerleave=()=>{teamPreview.hidden=true;ribbonLabel.hidden=true}})}function renderTeams(all){const q=search.value.toLowerCase();results.innerHTML=`<div class="team-tools"><button data-all>SELECT ALL</button><button data-clear>CLEAR</button></div>`+all.filter(t=>t.toLowerCase().includes(q)).slice(0,12).map(t=>`<button class="team-choice ${activeTeams.has(t)?'active':''}" data-team="${t}"><img src="${logos[t]||''}"><span>${activeTeams.has(t)?'●':'○'}</span>${t}</button>`).join('');results.querySelector('[data-all]').onclick=()=>{activeTeams=new Set(all);apply(all)};results.querySelector('[data-clear]').onclick=()=>{activeTeams.clear();apply(all)};results.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>{const t=b.dataset.team;activeTeams.has(t)?activeTeams.delete(t):activeTeams.add(t);apply(all)})}
document.getElementById('now-button').onclick=()=>document.body.classList.contains('view-list')?document.getElementById('list-now')?.scrollIntoView({behavior:'smooth',block:'center'}):ensurePlot().recenter();viewToggle.querySelectorAll('button').forEach(b=>b.onclick=()=>{const list=b.dataset.view==='list';document.body.classList.toggle('view-list',list);plotShell.hidden=list;listShell.hidden=!list;viewToggle.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));if(list){renderList();requestAnimationFrame(()=>document.getElementById('list-now')?.scrollIntoView({block:'center'}))}else{const activePlot=ensurePlot();activePlot.resize();activePlot.recenter()}});listShell.addEventListener('click',e=>{const card=e.target.closest('[data-game]'),g=card&&games.find(x=>x.id===card.dataset.game);if(e.target.closest('[data-lineup]')&&g){g.__showLineup=!g.__showLineup;e.stopPropagation();renderList();return}if(g&&g.completed&&g.__mwRevealed&&!e.target.closest('button,a')&&(g.__showResults||g.__showLineup)){g.__showResults=false;g.__showLineup=false;e.stopPropagation();renderList()}} ,true);new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const g=games.find(x=>x.id===card.dataset.game),meta=card.querySelector('.list-meta');if(g?.__mwRevealed&&meta&&!meta.querySelector('[data-lineup]'))meta.insertAdjacentHTML('beforeend','<button data-lineup>SHOW LINEUP</button>');if(g?.__showLineup){const content=card.querySelector('.list-content');if(content&&!content.querySelector('.lineups,.lineup-empty'))content.insertAdjacentHTML('beforeend',rosterMarkup(g))}})).observe(listShell,{childList:true,subtree:true});document.getElementById('reveal-all').onclick=()=>ensurePlot().games.filter(g=>g.completed&&!g.__mwRevealed).forEach(g=>plot.activate(g));
const labelSpoilerButtons=()=>listShell.querySelectorAll('[data-results]').forEach(button=>{if(/show (match )?results/i.test(button.textContent))button.textContent='SPOIL ME'});
new MutationObserver(labelSpoilerButtons).observe(listShell,{childList:true,subtree:true});
labelSpoilerButtons();
const goToNow=()=>document.body.classList.contains('view-list')?document.getElementById('list-now')?.scrollIntoView({behavior:'smooth',block:'center'}):plot?.recenter();
const teamSelector=document.getElementById('team-selector'),teamGallery=document.getElementById('team-gallery'),leagueSelector=document.getElementById('league-selector'),leagueGallery=document.getElementById('league-gallery'),teamStorageKey=league=>`spoil-me-not-team-filter:${league}`,clubSelectionStorageKey='spoil-me-not-team-filter:club-sources',allLeagueSelectionStorageKey='spoil-me-not-team-filter:all-leagues';
// A club can appear in more than one competition. Keep that intent separately
// from the league-specific lists, using a normalized name only for cross-league matching.
const teamIdentity=team=>String(team||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(?:afc|cfc|cf|fc|sc)\b/g,'').replace(/[^a-z0-9]/g,'');
const allLeagueGameKey=(league,team)=>`${league}:${team}`;
const readClubSources=()=>{try{const saved=JSON.parse(localStorage.getItem(clubSelectionStorageKey)||'{}');return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{}}catch(_){return {}}};
const writeClubSources=sources=>localStorage.setItem(clubSelectionStorageKey,JSON.stringify(sources));
const selectedClubKeys=()=>new Set(Object.entries(readClubSources()).filter(([,sources])=>Array.isArray(sources)&&sources.length).map(([key])=>key));
const readAllLeagueSelection=()=>{const raw=localStorage.getItem(allLeagueSelectionStorageKey);if(raw===null)return null;try{const saved=JSON.parse(raw);return Array.isArray(saved)?new Set(saved.map(teamIdentity).filter(Boolean)):null}catch(_){return null}};
const writeAllLeagueSelection=identities=>{if(identities.size)localStorage.setItem(allLeagueSelectionStorageKey,JSON.stringify([...identities]));else localStorage.removeItem(allLeagueSelectionStorageKey)};
const selectedKeysForAllLeagues=identities=>new Set(games.flatMap(game=>[game.home,game.away].filter(team=>!identities.size||identities.has(teamIdentity(team))).map(team=>allLeagueGameKey(game.leagueId,team))));
const setClubSelection=(team,selected)=>{const key=teamIdentity(team);if(!key)return;if(activeLeague!=='all')localStorage.removeItem(allLeagueSelectionStorageKey);const sources=readClubSources(),from=new Set(Array.isArray(sources[key])?sources[key]:[]);if(selected)from.add(activeLeague);else from.delete(activeLeague);if(from.size)sources[key]=[...from];else delete sources[key];writeClubSources(sources)};
const clearClubSelectionsFrom=league=>{if(league!=='all')localStorage.removeItem(allLeagueSelectionStorageKey);const sources=readClubSources();Object.entries(sources).forEach(([key,from])=>{const next=(Array.isArray(from)?from:[]).filter(source=>source!==league);if(next.length)sources[key]=next;else delete sources[key]});writeClubSources(sources)};
const storedTeamsForLeague=(league,teams)=>{let saved=[];try{saved=JSON.parse(localStorage.getItem(teamStorageKey(league))||'[]')}catch(_){}const valid=saved.filter(team=>teams.includes(team)),shared=teams.filter(team=>selectedClubKeys().has(teamIdentity(team)));return new Set(shared.length?(valid.length?[...valid,...shared]:shared):valid)};
const gameIsSelected=game=>activeLeague==='all'?(allLeagueTeamKeys.has(allLeagueGameKey(game.leagueId,game.home))||allLeagueTeamKeys.has(allLeagueGameKey(game.leagueId,game.away))):(!activeTeams.size||activeTeams.has(game.home)||activeTeams.has(game.away));
let ribbonTeams=[];
const allTeamsSelected=teams=>!activeTeams.size||activeTeams.size===teams.length;
const persistTeamSelection=()=>{
  if(activeLeague!=='all'){localStorage.setItem(teamStorageKey(activeLeague),JSON.stringify([...activeTeams]));return}
  const identities=new Set([...activeTeams].map(teamIdentity).filter(Boolean));
  writeAllLeagueSelection(identities);
  allLeagueTeamKeys=selectedKeysForAllLeagues(identities);
  const shared=selectedClubKeys();
  Object.keys(EPLData.leagues).forEach(league=>{
    const teams=[...new Set(games.filter(game=>game.leagueId===league).flatMap(game=>[game.home,game.away]))];
    if(!teams.length)return;
    const selected=teams.filter(team=>activeTeams.has(team)||shared.has(teamIdentity(team)));
    localStorage.setItem(teamStorageKey(league),JSON.stringify(selected.length===teams.length?[]:selected));
  });
};
const applyTeamSelection=(teams,{goNow=false}={})=>{persistTeamSelection();plot?.setTeamFilter(activeTeams);renderRibbon(teams);renderList();if(goNow)requestAnimationFrame(goToNow)};
const allLeagueOption={id:'all',name:'All Leagues',shortName:'ALL'};
const leagueOptions=()=>[allLeagueOption,...Object.values(EPLData.leagues)];
const leagueLabel=league=>({all:'ALL',epl:'EPL',laliga:'La Liga',ucl:'UCL',carabao:'Carabao',international:'International',mlb:'MLB',nfl:'NFL'}[league.id]||league.shortName||league.name);
const leagueName=league=>({all:'All Leagues',epl:'Premier League',laliga:'La Liga',ucl:'Champions League',carabao:'Carabao Cup',international:'International',mlb:'Major League Baseball',nfl:'National Football League'}[league.id]||league.name||leagueLabel(league));
const teamBadgeColor=team=>/^#[0-9a-f]{6}$/i.test(String(teamColors[team]||''))?teamColors[team]:'#454541';
const teamBadgeCode=team=>String(teamAbbrs[team]||team||'').replace(/[^a-z0-9]/gi,'').slice(0,3).toUpperCase()||'TEAM';
let pendingLeagueSelection=null,leagueSelectionDirty=false;
const renderLeagueSelector=()=>{const selection=pendingLeagueSelection||activeLeagueIds;leagueGallery.innerHTML=Object.values(EPLData.leagues).map(league=>{const active=selection.has(league.id);return `<button type="button" class="league-gallery-item ${active?'active':''}" data-select-league="${league.id}" aria-pressed="${active}">${league.logo?`<img class="league-choice-badge" src="${league.logo}" alt="">`:'<i class="league-choice-badge league-choice-all" aria-hidden="true">INT</i>'}<span>${leagueName(league)}</span><small>${active?'IN YOUR FEED':'OPEN LEAGUE'}</small></button>`}).join('')};
const paintLeagueSelectorSelection=()=>{const selection=pendingLeagueSelection||activeLeagueIds;leagueGallery.querySelectorAll('[data-select-league]').forEach(button=>{const active=selection.has(button.dataset.selectLeague);button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));const note=button.querySelector('small');if(note)note.textContent=active?'IN YOUR FEED':'OPEN LEAGUE'})};
const openLeagueSelector=()=>{teamSelector.hidden=true;pendingLeagueSelection=new Set(activeLeagueIds);leagueSelectionDirty=false;renderLeagueSelector();leagueSelector.hidden=false};
const closeLeagueSelector=()=>{leagueSelector.hidden=true;if(leagueSelectionDirty&&pendingLeagueSelection?.size)switchLeague([...pendingLeagueSelection]);pendingLeagueSelection=null;leagueSelectionDirty=false};
leagueSelector.querySelector('[data-close-leagues]').onclick=closeLeagueSelector;
leagueSelector.querySelector('[data-select-all-leagues]').onclick=()=>{pendingLeagueSelection=new Set(knownLeagueIds);leagueSelectionDirty=true;paintLeagueSelectorSelection()};
leagueGallery.addEventListener('click',event=>{const button=event.target.closest('[data-select-league]');if(!button)return;const id=button.dataset.selectLeague,selection=new Set(pendingLeagueSelection||activeLeagueIds);selection.has(id)?selection.delete(id):selection.add(id);if(!selection.size)return;pendingLeagueSelection=selection;leagueSelectionDirty=true;paintLeagueSelectorSelection()});
let pendingTeamSelection=null,pendingSelectAll=false,teamSelectionDirty=false;
const renderTeamSelector=()=>{const all=ribbonTeams,selection=pendingTeamSelection||activeTeams,allSelected=!selection.size||selection.size===all.length;teamGallery.innerHTML=all.map(team=>`<button type="button" class="team-gallery-item ${(allSelected||selection.has(team))?'active':''}" data-select-team="${team}" aria-pressed="${allSelected||selection.has(team)}" style="--team-badge-color:${teamBadgeColor(team)}"><img src="${logos[team]||''}" alt="" loading="lazy" decoding="async"><span>${team}</span></button>`).join('')};
const paintTeamSelectorSelection=()=>{const all=ribbonTeams,selection=pendingTeamSelection||activeTeams,allSelected=!selection.size||selection.size===all.length;teamGallery.querySelectorAll('[data-select-team]').forEach(button=>{const selected=allSelected||selection.has(button.dataset.selectTeam);button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))})};
const openTeamSelector=()=>{leagueSelector.hidden=true;pendingTeamSelection=new Set(activeTeams);pendingSelectAll=!activeTeams.size;teamSelectionDirty=false;renderTeamSelector();teamSelector.hidden=false};
const closeTeamSelector=()=>{teamSelector.hidden=true;if(!teamSelectionDirty){pendingTeamSelection=null;return}activeTeams=pendingSelectAll?new Set():new Set(pendingTeamSelection||[]);if(pendingSelectAll){if(activeLeague==='all')writeClubSources({});else clearClubSelectionsFrom(activeLeague)}else if(activeLeague!=='all'){clearClubSelectionsFrom(activeLeague);activeTeams.forEach(team=>setClubSelection(team,true))}pendingTeamSelection=null;teamSelectionDirty=false;listPastLimit=INITIAL_LIST_SIDE_LIMIT;listFutureLimit=INITIAL_LIST_SIDE_LIMIT;applyTeamSelection(ribbonTeams,{goNow:true})};
teamSelector.querySelector('[data-close-selector]').onclick=closeTeamSelector;
teamSelector.querySelector('[data-select-all]').onclick=()=>{pendingTeamSelection=new Set();pendingSelectAll=true;teamSelectionDirty=true;paintTeamSelectorSelection()};
teamGallery.addEventListener('click',event=>{const button=event.target.closest('[data-select-team]');if(!button)return;const team=button.dataset.selectTeam,all=ribbonTeams;let next;if(!pendingTeamSelection?.size)next=new Set([team]);else{next=new Set(pendingTeamSelection);next.has(team)?next.delete(team):next.add(team)}pendingTeamSelection=next.size===all.length||next.size===0?new Set():next;pendingSelectAll=!pendingTeamSelection.size;teamSelectionDirty=true;paintTeamSelectorSelection()});
renderRibbon=function(all){
  ribbonTeams=all;const allSelected=allTeamsSelected(all),selected=allSelected?[]:all.filter(team=>activeTeams.has(team));
  const shown=selected.slice(0,8),league=activeLeague==='all'?{id:'selection',name:`${activeLeagueIds.size} Leagues`,shortName:`${activeLeagueIds.size} LEAGUES`}:EPLData.leagues[activeLeague];
  ribbon.innerHTML=`<div class="team-band-summary"><button type="button" class="league-band-current" data-edit-leagues aria-label="Change league">${league?.logo?`<img class="league-band-logo" src="${league.logo}" alt="">`:''}<span><b>${leagueLabel(league||{})}</b><i>LEAGUE</i></span></button><span class="league-band-divider" aria-hidden="true"></span><div class="team-selection-summary"><span class="team-band-count">${allSelected?'ALL TEAMS':`${selected.length} SELECTED`}</span><div class="team-band-chosen" aria-label="${selected.map(team=>lineupEscape(team)).join(', ')}">${shown.map(team=>`<span class="team-band-badge" style="--team-badge-color:${teamBadgeColor(team)}" title="${lineupEscape(team)}"><img src="${logos[team]||''}" alt="${lineupEscape(team)}"><b>${lineupEscape(teamBadgeCode(team))}</b></span>`).join('')}${selected.length>shown.length?`<span class="team-band-more">+${selected.length-shown.length}</span>`:''}</div></div><button type="button" data-edit-teams>EDIT</button></div>`;
  ribbon.querySelector('[data-edit-leagues]').onclick=openLeagueSelector;
  ribbon.querySelector('[data-edit-teams]').onclick=openTeamSelector;
};
// The selection band is re-rendered whenever a filter or live update changes.
// Delegate its two stable actions from the ribbon so they survive every rebuild.
ribbon.addEventListener('click',event=>{
  const leagueButton=event.target.closest('[data-edit-leagues]');
  if(leagueButton){event.preventDefault();openLeagueSelector();return}
  const teamButton=event.target.closest('[data-edit-teams]');
  if(teamButton){event.preventDefault();openTeamSelector()}
});
// Baseball standings are W–L and division-based; do not squeeze them into football's W–D–L context.
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{
  const game=games.find(item=>item.id===card.dataset.game);if(game?.sport!=='baseball')return;
  card.querySelectorAll('.list-teams>span').forEach((team,index)=>{
    const table=teamTable[teamTableKey(game.leagueId,index===0?game.home:game.away)];if(!table)return;
    const wins=Number(table.wins),losses=Number(table.losses),rank=Number(table.rank);
    const record=[wins,losses].every(Number.isFinite)?`${wins}–${losses}`:'—';
    const standing=Number.isFinite(rank)&&rank>0?`${ordinal(rank)} IN DIV.`:'MLB';
    let context=team.querySelector('.team-table-context');if(!context){team.insertAdjacentHTML('beforeend','<small class="team-table-context"></small>');context=team.querySelector('.team-table-context')}
    const signature=`${record}|${standing}`;if(context.dataset.mlbSignature===signature&&context.textContent.includes(record)&&context.textContent.includes(standing))return;
    context.dataset.mlbSignature=signature;context.dataset.split='true';context.dataset.standingReady='true';context.innerHTML=`<b>${record}</b><i data-standing="${standing}">${standing}</i>`;
  });
})).observe(listShell,{childList:true,subtree:true});
const originalPod=Gameplot.prototype.pod;
const originalCountdown=Gameplot.prototype.countdown;
const originalVisible=Gameplot.prototype.visible;
Gameplot.prototype.visible=function(d){return activeLeague==='all'?d.members.some(gameIsSelected):originalVisible.call(this,d)};
Gameplot.prototype.countdown=function(game){return game.live&&!game.completed?'LIVE':originalCountdown.call(this,game)};
Gameplot.prototype.pod=function(d){
  if(d.cluster)return originalPod.call(this,d);
  const g=d.members[0],liveRing=g.live?'<circle cx="75" cy="36" r="34" fill="none" stroke="#e3e3df" stroke-width="1.5" stroke-dasharray="3 3"/>':'';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="72"><clipPath id="c"><circle cx="75" cy="36" r="30"/></clipPath><g clip-path="url(#c)"><rect x="45" y="6" width="30" height="60" fill="#5a5a57"/><rect x="75" y="6" width="30" height="60" fill="#b8b8b3"/></g><circle cx="75" cy="36" r="30" fill="none" stroke="#f3f3f1" stroke-width="2"/>${liveRing}</svg>`)}`;
};
const originalChrome=Gameplot.prototype.chrome;
Gameplot.prototype.chrome=function(){
  originalChrome.call(this);
  const live=this.games.filter(game=>game.live&&!game.completed),now=new Date(),marker=document.querySelector('#now-line b'),control=document.getElementById('now-button');
  const stamp=now.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  if(marker)marker.innerHTML=`${live.length?'LIVE NOW':'NOW'}<small>${stamp}</small>`;
  if(control){const label=live.length?'LIVE':'GO TO NOW';const text=control.querySelector('b');if(text)text.textContent=label;control.setAttribute('aria-label',live.length?'Go to live matches':'Go to now')}
};
// MLB exposes a provisional player pool well before first pitch. Only batting orders
// count as an official baseball lineup, while the soccer feed keeps its existing rule.
const hasOfficialLineup=game=>game.sport==='baseball'?game.lineupAvailable===true:(game.rosters||[]).some(roster=>rosterEntries(roster).length>0);
const formatHighlightDuration=seconds=>{
  const value=Number(seconds);
  if(!Number.isFinite(value)||value<1)return '';
  return `${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
};
const highlightMarkup=game=>{
  const highlight=game.highlight,duration=formatHighlightDuration(highlight?.durationSeconds);
  if(!game.completed)return '';
  const youtube=/^https:\/\/www\.youtube\.com\/watch\?v=/.test(highlight?.url||''),officialSearch={mlb:'MLB',nfl:'NFL',epl:'DAZN U-NEXT',laliga:'DAZN U-NEXT',ucl:'DAZN U-NEXT',carabao:'DAZN U-NEXT'}[game.leagueId]||game.league;
  const icon=youtube?`<svg viewBox="0 0 24 17" aria-hidden="true"><path d="M23.5 3.2A3 3 0 0 0 21.4 1C19.5.5 12 .5 12 .5S4.5.5 2.6 1A3 3 0 0 0 .5 3.2 31.4 31.4 0 0 0 0 8.5c0 1.8.2 3.6.5 5.3A3 3 0 0 0 2.6 16c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.2c.3-1.7.5-3.5.5-5.3s-.2-3.6-.5-5.3Z"/><path class="youtube-play" d="m9.7 12.1 6.2-3.6-6.2-3.6v7.2Z"/></svg>`:`<i class="highlight-provider" aria-hidden="true">${highlight?.source||'▶'}</i>`;
  if(highlight?.url&&duration)return `<a class="highlight-link" data-highlight href="${highlight.url}" target="_blank" rel="noopener noreferrer" aria-label="Watch official highlights, ${duration}">${icon}<span>HIGHLIGHTS</span><small>${duration}</small></a>`;
  const query=encodeURIComponent(`${officialSearch} ${game.away} vs ${game.home} highlights`);
  return `<a class="highlight-link highlight-search" data-highlight href="https://www.youtube.com/results?search_query=${query}" target="_blank" rel="noopener noreferrer" aria-label="Find official highlights for ${game.away} versus ${game.home} on YouTube"><svg viewBox="0 0 24 17" aria-hidden="true"><path d="M23.5 3.2A3 3 0 0 0 21.4 1C19.5.5 12 .5 12 .5S4.5.5 2.6 1A3 3 0 0 0 .5 3.2 31.4 31.4 0 0 0 0 8.5c0 1.8.2 3.6.5 5.3A3 3 0 0 0 2.6 16c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.2c.3-1.7.5-3.5.5-5.3s-.2-3.6-.5-5.3Z"/><path class="youtube-play" d="m9.7 12.1 6.2-3.6-6.2-3.6v7.2Z"/></svg><span>FIND HIGHLIGHTS</span></a>`;
};
const decorateCards=()=>listShell.querySelectorAll('[data-game]').forEach(card=>{
  const game=games.find(item=>item.id===card.dataset.game),content=card.querySelector('.list-content'),matchup=content?.querySelector('.list-teams'),meta=card.querySelector('.list-meta');
  if(!game||!content||!matchup||!meta)return;
  card.classList.toggle('live-game',!!game.live);
  card.classList.toggle('baseball-game',game.sport==='baseball');
  card.classList.toggle('soccer-game',game.sport==='soccer');
  if(game.sport==='baseball'&&!content.querySelector('.mlb-probables')&&!game.live&&!game.completed){
    const home=game.probableHomePitcher?.fullName||game.probableHomePitcher?.name||'',away=game.probableAwayPitcher?.fullName||game.probableAwayPitcher?.name||'';
    const details=home||away?`<div class="mlb-probables"><span>PROBABLE PITCHERS</span><div><b>${home||'TBA'}</b><i>vs</i><b>${away||'TBA'}</b></div></div>`:'<div class="mlb-probables"><span>PROBABLE PITCHERS</span><div><b>TBA</b></div></div>';
    matchup.insertAdjacentHTML('afterend',details);
  }
  // The live state is carried by the glowing stamp; keep the right-side block quiet.
  meta.querySelector('.live-indicator')?.remove();
  if(!game.completed&&hasOfficialLineup(game)&&!card.querySelector('[data-schedule-lineup]')){
    const kickoff=matchup.querySelector('.card-kickoff');
    if(kickoff){
      let actions=kickoff.querySelector('.card-kickoff-actions');
      if(!actions){actions=document.createElement('div');actions.className='card-kickoff-actions';kickoff.append(actions)}
      actions.insertAdjacentHTML('beforeend','<button class="schedule-card-lineup" type="button" data-schedule-lineup aria-expanded="false">LINEUP</button>');
    }
  }
  if(game.live&&!content.querySelector('.live-tabs')&&!matchup.querySelector('.card-kickoff')){
    matchup.insertAdjacentHTML('afterend',`<div class="match-tabs live-tabs"><button data-live-info class="${game.__showLiveInfo?'active':''}">MATCH INFO</button>${hasOfficialLineup(game)?`<button data-lineup class="${game.__showLineup?'active':''}">LINEUP</button>`:''}</div>`);
  }
  if(game.live&&game.__showLiveInfo&&!content.querySelector('.live-match-info')){const liveEvents=(game.events||[]).filter(event=>String(event.text||'').trim()),goals=liveEvents.filter(event=>['goal','score'].includes(event.type)&&event.scorer),scorers=(teamId,abbr,logo)=>goals.filter(event=>event.teamId===teamId).map(event=>`<b>${event.scorer}</b> ${Number.isFinite(event.minute)?`${event.minute}'`:''}`).join(' · '),homeScorers=scorers(game.homeId,game.homeAbbr,game.homeLogo),awayScorers=scorers(game.awayId,game.awayAbbr,game.awayLogo),timeline=liveEvents.length?incidentTimeline({...game,events:liveEvents}):'<p>Live score and official match events are updating from the match feed.</p>',infoAnchor=content.querySelector('.live-tabs')||matchup;infoAnchor?.insertAdjacentHTML('afterend',`<div class="live-match-info"><div class="tab-final-score"><span>LIVE SCORE · ${game.status||'IN PROGRESS'}</span><strong><img src="${game.homeLogo||''}">${game.homeAbbr||game.home} ${game.homeScore??'—'}–${game.awayScore??'—'} ${game.awayAbbr||game.away}<img src="${game.awayLogo||''}"></strong>${homeScorers||awayScorers?`<div class="goal-scorers">${homeScorers?`<span><img src="${game.homeLogo||''}">${game.homeAbbr||game.home} · ${homeScorers}</span>`:''}${awayScorers?`<span><img src="${game.awayLogo||''}">${game.awayAbbr||game.away} · ${awayScorers}</span>`:''}</div>`:''}</div><div class="incident-list">${timeline}</div></div>`)}
  if(game.live&&game.__showLineup&&!content.querySelector('.lineups,.lineup-empty'))content.insertAdjacentHTML('beforeend',rosterMarkup(game));
  const tabs=content.querySelector('.match-tabs');
  if(tabs&&!tabs.querySelector('[data-highlight]')){
    const highlight=highlightMarkup(game);
    if(highlight)tabs.insertAdjacentHTML('beforeend',highlight);
  }
});
const divider=listShell.querySelector('#list-now'),firstLive=listShell.querySelector('.live-game');
if(divider&&firstLive&&(divider.compareDocumentPosition(firstLive)&Node.DOCUMENT_POSITION_PRECEDING)){let anchor=firstLive;while(anchor.previousElementSibling?.matches('.list-date'))anchor=anchor.previousElementSibling;anchor.before(divider)}
if(firstLive&&!listShell.querySelector('.live-divider-past')){const original=listShell.querySelector('#list-now'),liveCards=[...listShell.querySelectorAll('.live-game')],first=liveCards[0],last=liveCards[liveCards.length-1];original?.remove();const past=document.createElement('div'),future=document.createElement('div');past.id='list-now';past.className='list-now live-divider-past';past.innerHTML='<span>PAST MATCHES <b>↑</b></span>';future.className='list-now live-divider-future';future.innerHTML='<span><b>↓</b> UPCOMING MATCHES</span>';first.before(past);last.after(future)}
let decorateCardsFrame=0;
new MutationObserver(()=>{
  if(decorateCardsFrame)return;
  decorateCardsFrame=requestAnimationFrame(()=>{decorateCardsFrame=0;decorateCards()});
}).observe(listShell,{childList:true,subtree:true});
listShell.addEventListener('click',event=>{const button=event.target.closest('[data-live-info]'),card=event.target.closest('[data-game]');if(!button||!card)return;const game=games.find(item=>item.id===card.dataset.game);if(!game)return;event.preventDefault();event.stopImmediatePropagation();game.__showLiveInfo=!game.__showLiveInfo;game.__showLineup=false;renderList()},true);
listShell.addEventListener('click',event=>{const card=event.target.closest('[data-game]'),game=card&&games.find(item=>item.id===card.dataset.game);if(!game?.live||(!game.__showLineup&&!game.__showLiveInfo)||event.target.closest('button'))return;game.__showLineup=false;game.__showLiveInfo=false;event.preventDefault();event.stopPropagation();renderList()},true);
document.getElementById('now-button').addEventListener('click',event=>{const liveCard=listShell.querySelector('.live-game');if(!liveCard||!document.body.classList.contains('view-list'))return;event.preventDefault();event.stopImmediatePropagation();liveCard.scrollIntoView({behavior:'smooth',block:'center'})},true);
rosterMarkup=function(game){
  const flagFor=raw=>{const player=raw.athlete||raw,country=player.flag||raw.flag||player.country||raw.country||player.nationality||raw.nationality||player.citizenship||raw.citizenship||player.birthCountry||raw.birthCountry||player.birthPlace?.country||{},fifa={ENG:'gb',SCO:'gb',WAL:'gb',NIR:'gb',IRL:'ie',FRA:'fr',ESP:'es',POR:'pt',BRA:'br',ARG:'ar',BEL:'be',NED:'nl',GER:'de',ITA:'it',DEN:'dk',SWE:'se',NOR:'no',FIN:'fi',POL:'pl',CRO:'hr',SRB:'rs',UKR:'ua',CZE:'cz',SVK:'sk',HUN:'hu',AUT:'at',SUI:'ch',TUR:'tr',GRE:'gr',MAR:'ma',ALG:'dz',EGY:'eg',SEN:'sn',GHA:'gh',NGA:'ng',CIV:'ci',CMR:'cm',JPN:'jp',KOR:'kr',USA:'us',CAN:'ca',AUS:'au',NZL:'nz',URU:'uy',COL:'co',CHI:'cl',ECU:'ec',MEX:'mx'};const label=typeof country==='string'?country:country.alt||country.displayName||country.name||country.fullName||country.abbreviation||country.code||'';const rawCode=typeof country==='string'?'':String(country.abbreviation||country.code||country.isoCode||country.id||'').toUpperCase();const code=countryCode[label]||countryCode[rawCode]||fifa[String(label).toUpperCase()]||fifa[rawCode]||(/^[A-Z]{2}$/.test(rawCode)?rawCode.toLowerCase():'');const url=player.flag?.href||raw.flag?.href||country.href||country.logo||(code?`https://flagcdn.com/24x18/${code}.png`:'');return url?`<img class="lineup-flag" src="${url}" alt="${label||'Country flag'}">`:'<i class="lineup-flag empty" aria-label="Nationality unavailable"></i>'};
  const player=(raw,role)=>{
    const person=raw.athlete||raw;
    const number=raw.jersey||person.jersey||person.jerseyNumber||'—';
    const positionValue=value=>typeof value==='string'?value:(value?.abbreviation||value?.shortName||value?.displayName||value?.name||value?.code||'');
    // Soccer bench entries often carry a status of "SUB" in raw.position.
    // Prefer the athlete's actual role, and never present a status as a role.
    const position=[person.position,person.primaryPosition,person.positionAbbreviation,person.positionName,raw.primaryPosition,raw.position,raw.positionAbbreviation,raw.positionName]
      .map(positionValue).map(value=>String(value).trim())
      .find(value=>value&&!/^(sub|substitute|bench|reserve)$/i.test(value))||'—';
    const country=person.flag||raw.flag||person.country||raw.country||person.nationality||raw.nationality||person.citizenship||raw.citizenship||person.birthCountry||raw.birthCountry||person.birthPlace?.country||{};
    const countryRaw=typeof country==='string'?country:country.alt||country.displayName||country.name||country.fullName||country.abbreviation||country.code||person.flag?.alt||'Country unavailable';
    const countryNames={ENG:'England',SCO:'Scotland',WAL:'Wales',NIR:'Northern Ireland',IRL:'Ireland',FRA:'France',ESP:'Spain',POR:'Portugal',BRA:'Brazil',ARG:'Argentina',BEL:'Belgium',NED:'Netherlands',GER:'Germany',ITA:'Italy',DEN:'Denmark',SWE:'Sweden',NOR:'Norway',USA:'United States',CAN:'Canada',AUS:'Australia',JPN:'Japan',KOR:'South Korea'};
    const countryName=countryNames[String(countryRaw).toUpperCase()]||countryRaw;
    const name=person.displayName||person.fullName||'Unknown player';
    return `<div class="lineup-player ${role}" tabindex="0"><em>${number}</em>${flagFor(raw)}<span title="${name}">${name}</span><small>${position}</small><aside class="player-tooltip"><b>${name}</b><span>#${number} · ${position}</span><span>${role==='starter'?'Starting XI':role==='sub'?'Substitute':'Squad'} · ${countryName}</span></aside></div>`;
  };
  const groups=(game.rosters||[]).map(roster=>{const players=rosterEntries(roster),starters=(roster.starters||roster.startingXI||[]).filter(Boolean).length?(roster.starters||roster.startingXI||[]).filter(Boolean):players.filter(player=>player.starter===true||player.isStarter===true||player.status?.type==='starter'),subs=(roster.substitutes||roster.bench||[]).filter(Boolean).length?(roster.substitutes||roster.bench||[]).filter(Boolean):players.filter(player=>player.substitute===true||player.isSubstitute===true||player.status?.type==='substitute');return {name:roster.team?.abbreviation||roster.team?.displayName||'SQUAD',logo:roster.team?.logo||roster.team?.logos?.[0]?.href||'',players,starters,subs}}).filter(group=>group.players.length||group.starters.length||group.subs.length);
  if(!groups.length)return '<p class="lineup-empty">Official lineup data is not available for this match.</p>';
  return `<div class="lineups">${groups.map(group=>`<section><b>${group.logo?`<img src="${group.logo}">`:''}${group.name}</b>${group.starters.length||group.subs.length?`${group.starters.length?`<h4>STARTING XI</h4>${group.starters.map(entry=>player(entry,'starter')).join('')}`:''}${group.subs.length?`<h4>BENCH</h4>${group.subs.map(entry=>player(entry,'sub')).join('')}`:''}`:group.players.map(entry=>player(entry,'squad')).join('')}</section>`).join('')}</div>`;
};
const rosterMarkupWithBiography=rosterMarkup;
rosterMarkup=function(game){
  const entries=(game.rosters||[]).flatMap(roster=>rosterEntries(roster));
  const normalize=value=>String(value||'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const countryMeta={ENG:['England','gb'],GB:['England','gb'],GBR:['England','gb'],ENGLAND:['England','gb'],SCO:['Scotland','gb'],SCOTLAND:['Scotland','gb'],WAL:['Wales','gb'],WALES:['Wales','gb'],NIR:['Northern Ireland','gb'],'NORTHERN IRELAND':['Northern Ireland','gb'],IRL:['Ireland','ie'],IRELAND:['Ireland','ie'],FRA:['France','fr'],FR:['France','fr'],FRANCE:['France','fr'],ESP:['Spain','es'],ES:['Spain','es'],SPAIN:['Spain','es'],POR:['Portugal','pt'],PT:['Portugal','pt'],PORTUGAL:['Portugal','pt'],BRA:['Brazil','br'],BR:['Brazil','br'],BRAZIL:['Brazil','br'],ARG:['Argentina','ar'],AR:['Argentina','ar'],ARGENTINA:['Argentina','ar'],BEL:['Belgium','be'],BE:['Belgium','be'],BELGIUM:['Belgium','be'],NED:['Netherlands','nl'],NL:['Netherlands','nl'],NETHERLANDS:['Netherlands','nl'],GER:['Germany','de'],DE:['Germany','de'],GERMANY:['Germany','de'],ITA:['Italy','it'],IT:['Italy','it'],ITALY:['Italy','it'],DEN:['Denmark','dk'],DK:['Denmark','dk'],DENMARK:['Denmark','dk'],SWE:['Sweden','se'],SE:['Sweden','se'],SWEDEN:['Sweden','se'],NOR:['Norway','no'],NO:['Norway','no'],NORWAY:['Norway','no'],FIN:['Finland','fi'],FI:['Finland','fi'],FINLAND:['Finland','fi'],POL:['Poland','pl'],PL:['Poland','pl'],POLAND:['Poland','pl'],CRO:['Croatia','hr'],HR:['Croatia','hr'],CROATIA:['Croatia','hr'],SRB:['Serbia','rs'],RS:['Serbia','rs'],SERBIA:['Serbia','rs'],UKR:['Ukraine','ua'],UA:['Ukraine','ua'],UKRAINE:['Ukraine','ua'],CZE:['Czech Republic','cz'],CZ:['Czech Republic','cz'],'CZECH REPUBLIC':['Czech Republic','cz'],SVK:['Slovakia','sk'],SK:['Slovakia','sk'],SLOVAKIA:['Slovakia','sk'],HUN:['Hungary','hu'],HU:['Hungary','hu'],HUNGARY:['Hungary','hu'],AUT:['Austria','at'],AT:['Austria','at'],AUSTRIA:['Austria','at'],SUI:['Switzerland','ch'],CH:['Switzerland','ch'],SWITZERLAND:['Switzerland','ch'],TUR:['Turkey','tr'],TR:['Turkey','tr'],TURKEY:['Turkey','tr'],MAR:['Morocco','ma'],MA:['Morocco','ma'],MOROCCO:['Morocco','ma'],ALG:['Algeria','dz'],DZ:['Algeria','dz'],ALGERIA:['Algeria','dz'],EGY:['Egypt','eg'],EG:['Egypt','eg'],EGYPT:['Egypt','eg'],SEN:['Senegal','sn'],SN:['Senegal','sn'],SENEGAL:['Senegal','sn'],GHA:['Ghana','gh'],GH:['Ghana','gh'],GHANA:['Ghana','gh'],NGA:['Nigeria','ng'],NG:['Nigeria','ng'],NIGERIA:['Nigeria','ng'],CIV:['Ivory Coast','ci'],CI:['Ivory Coast','ci'],'IVORY COAST':['Ivory Coast','ci'],CMR:['Cameroon','cm'],CM:['Cameroon','cm'],CAMEROON:['Cameroon','cm'],JPN:['Japan','jp'],JP:['Japan','jp'],JAPAN:['Japan','jp'],KOR:['South Korea','kr'],KR:['South Korea','kr'],'SOUTH KOREA':['South Korea','kr'],USA:['United States','us'],US:['United States','us'],'UNITED STATES':['United States','us'],CAN:['Canada','ca'],CA:['Canada','ca'],CANADA:['Canada','ca'],AUS:['Australia','au'],AU:['Australia','au'],AUSTRALIA:['Australia','au'],NZL:['New Zealand','nz'],NZ:['New Zealand','nz'],'NEW ZEALAND':['New Zealand','nz'],URU:['Uruguay','uy'],UY:['Uruguay','uy'],URUGUAY:['Uruguay','uy'],COL:['Colombia','co'],CO:['Colombia','co'],COLOMBIA:['Colombia','co'],CHI:['Chile','cl'],CL:['Chile','cl'],CHILE:['Chile','cl'],ECU:['Ecuador','ec'],EC:['Ecuador','ec'],ECUADOR:['Ecuador','ec'],MEX:['Mexico','mx'],MX:['Mexico','mx'],MEXICO:['Mexico','mx']};
  Object.assign(countryMeta,{IE:['Ireland','ie'],JAM:['Jamaica','jm'],JM:['Jamaica','jm'],JAMAICA:['Jamaica','jm'],ROU:['Romania','ro'],RO:['Romania','ro'],ROMANIA:['Romania','ro'],BUL:['Bulgaria','bg'],BG:['Bulgaria','bg'],BULGARIA:['Bulgaria','bg'],SVN:['Slovenia','si'],SI:['Slovenia','si'],SLOVENIA:['Slovenia','si'],ALB:['Albania','al'],AL:['Albania','al'],ALBANIA:['Albania','al'],TUN:['Tunisia','tn'],TN:['Tunisia','tn'],TUNISIA:['Tunisia','tn'],MLI:['Mali','ml'],ML:['Mali','ml'],MALI:['Mali','ml'],RSA:['South Africa','za'],ZA:['South Africa','za'],'SOUTH AFRICA':['South Africa','za'],CHN:['China','cn'],CN:['China','cn'],CHINA:['China','cn'],PAR:['Paraguay','py'],PY:['Paraguay','py'],PARAGUAY:['Paraguay','py'],PER:['Peru','pe'],PE:['Peru','pe'],PERU:['Peru','pe'],GRE:['Greece','gr'],GR:['Greece','gr'],GREECE:['Greece','gr']});
  const ageFor=person=>{const direct=Number(person.age);if(Number.isFinite(direct)&&direct>0)return Math.floor(direct);const date=person.birthDate||person.dateOfBirth||person.dateOfBirthMillis;if(!date)return null;const born=new Date(date);if(Number.isNaN(+born))return null;const now=new Date();let age=now.getFullYear()-born.getFullYear();if(now<new Date(now.getFullYear(),born.getMonth(),born.getDate()))age--;return age>0&&age<60?age:null};
  const template=document.createElement('template');template.innerHTML=rosterMarkupWithBiography(game);
  template.content.querySelectorAll('.lineups section>b').forEach((header,index)=>{
    const team=game.rosters?.[index]?.team||{};
    const fullName=team.displayName||team.name||team.abbreviation||'';
    if(fullName&&header.lastChild)header.lastChild.nodeValue=fullName;
  });
  template.content.querySelectorAll('.lineup-player').forEach(row=>{
    const name=row.querySelector('span[title]')?.getAttribute('title')||'';
    const raw=entries.find(entry=>normalize((entry.athlete||entry).displayName||(entry.athlete||entry).fullName)===normalize(name));
    const person=raw?.athlete||raw||{};
    const country=person.country||raw?.country||person.nationality||raw?.nationality||person.citizenship||raw?.citizenship||person.flag||raw?.flag||{};
    const rawCountry=typeof country==='string'?country:country.alt||country.displayName||country.name||country.fullName||country.abbreviation||country.code||'';
    const [displayCountry,flagCode]=countryMeta[String(rawCountry).toUpperCase()]||[rawCountry,''];
    const age=ageFor(person),bio=[displayCountry,age?`${age}`:''].filter(Boolean).join(' · ');
    if(bio)row.querySelector('span[title]')?.insertAdjacentHTML('beforeend',`<i class="lineup-origin">${bio}</i>`);
    const flag=row.querySelector('.lineup-flag');if(flag&&flagCode){flag.src=`https://flagcdn.com/24x18/${flagCode}.png`;flag.alt=displayCountry;}
    row.querySelector('.player-tooltip')?.remove();
  });
  return template.innerHTML;
};
const playerKey=value=>String(value||'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const samePlayer=(a,b)=>{
  const left=playerKey(a),right=playerKey(b);
  if(!left||!right)return false;
  if(left===right||left.endsWith(right)||right.endsWith(left))return true;
  // ESPN's incident feed usually supplies a full name, while a lineup may
  // abbreviate it to e.g. "L. Tchaouna". Match that safe initial + surname
  // form so incoming-substitution and card markers do not silently disappear.
  const parts=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
  const aParts=parts(a),bParts=parts(b),aLast=aParts.at(-1),bLast=bParts.at(-1);
  return !!aLast&&aLast===bLast&&aParts[0]?.[0]===bParts[0]?.[0];
};
const replacementNames=text=>{const match=String(text||'').match(/([^.,]+?)\s+replaces\s+([^.,]+)/i);if(!match)return [];return [match[1].split('.').pop().trim(),match[2].trim()]};
const playerEventMarkup=(game,name)=>{
  const grouped=new Map();
  const add=(type,minute)=>{
    const key=type;
    const group=grouped.get(key)||{type,minutes:[]};
    if(minute&&!group.minutes.includes(minute))group.minutes.push(minute);
    grouped.set(key,group);
  };
  (game.events||[]).forEach(event=>{
    const minute=Number.isFinite(event.minute)?`${event.minute}'`:'';
    if(event.type==='sub'){
      const [inPlayer,outPlayer]=replacementNames(event.text);
      if(samePlayer(name,inPlayer)){add('sub-in',minute);return}
      if(samePlayer(name,outPlayer)){add('sub-out',minute);return}
    }
    // A goal belongs only to the scorer.  ESPN’s participant list can also
    // include the assister, so it is deliberately not used for goal markers.
    const named=event.type==='goal'
      ? samePlayer(name,event.scorer)
      : [event.scorer,...(event.players||[])].some(player=>samePlayer(name,player))||String(event.text||'').toLocaleLowerCase().includes(String(name||'').toLocaleLowerCase());
    if(named&&['goal','yellow','red','injury'].includes(event.type))add(event.type,minute);
  });
  const labels={goal:'⚽',yellow:'<b class="card-glyph yellow"></b>',red:'<b class="card-glyph red"></b>',injury:'✚','sub-in':'→','sub-out':'←'};
  const titles={goal:'Goals',yellow:'Yellow cards',red:'Red cards',injury:'Injuries','sub-in':'Subbed on','sub-out':'Subbed off'};
  const items=[...grouped.values()].map(({type,minutes})=>{
    const count=minutes.length;
    // A scorer gets one compact goal pill, but it always lists every scoring
    // minute so braces and hat-tricks remain legible rather than abbreviated.
    const summary=type==='goal'
      ? (minutes.length?` ${minutes.join('·')}`:'')
      : (count>1?` ×${count}`:(minutes[0]?` ${minutes[0]}`:''));
    const detail=minutes.length?`${titles[type]}: ${minutes.join(' · ')}`:titles[type];
    return {type,markup:`<i class="player-event ${type}" title="${detail}">${labels[type]}${summary}</i>`};
  });
  const corner=types=>items.filter(item=>types.includes(item.type)).map(item=>item.markup).join('');
  // Both substitution directions share the top-left marker system: red points
  // out, green points in.  That makes a change immediately readable without
  // having to scan separate corners of the player disc.
  const topLeft=corner(['sub-out','sub-in','yellow','red','injury']),bottomLeft='',bottomRight=corner(['goal']);
  return items.length?`<span class="player-events" aria-label="Match events">${topLeft?`<span class="player-corner player-corner-top-left">${topLeft}</span>`:''}${bottomLeft?`<span class="player-corner player-corner-bottom-left">${bottomLeft}</span>`:''}${bottomRight?`<span class="player-corner player-corner-bottom-right">${bottomRight}</span>`:''}</span>`:'';
};
incidentTimeline=function(game){
  const incidentColour=teamId=>{
    const colours=statColoursFor(game),raw=String(teamId)===String(game.homeId)?colours.home:String(teamId)===String(game.awayId)?colours.away:'';
    const colour=String(raw||'').trim();
    return /^#[\da-f]{3,8}$/i.test(colour)?colour:'';
  };
  const incidentStyle=teamId=>{
    const colour=incidentColour(teamId);
    return colour?` style="--incident-team-color:${colour}"`:'';
  };
  const playerPortrait=event=>{
    const name=event.scorer||event.players?.[0]||'',entry=(game.rosters||[]).flatMap(roster=>rosterEntries(roster)).find(candidate=>samePlayer((candidate?.athlete||candidate||{}).displayName||(candidate?.athlete||candidate||{}).fullName,name));
    if(!entry)return `<span class="incident-player-photo empty" aria-label="${lineupEscape(name||'Player')}">${lineupEscape(playerCardInitials(name||'?'))}</span>`;
    const person=entry.athlete||entry,photo=playerCardPhoto(entry)||(game.sport==='soccer'?soccerHeadshot(entry):game.sport==='baseball'&&/^\d+$/.test(playerCardId(entry))?`https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/${playerCardId(entry)}/headshot/67/current`:'');
    const key=registerPlayerCard(game,entry);
    return `<button type="button" class="incident-player-photo${photo?'':' empty'}" data-player-card="${lineupEscape(key)}" aria-label="View ${lineupEscape(person.displayName||person.fullName||'player')} details">${photo?`<img src="${lineupEscape(photo)}" alt="">`:lineupEscape(playerCardInitials(person.displayName||person.fullName||'?'))}</button>`;
  };
  if(game.sport==='baseball'){
    const scoring=(game.events||[]).filter(event=>event.type==='run');
    return scoring.map(event=>{
      // MLB scoring-play payloads frequently omit teamId. The batting half is
      // authoritative: away bats in the top, home bats in the bottom.
      const isHome=/bottom/i.test(String(event.half||'')),teamId=event.teamId||(isHome?game.homeId:game.awayId);
      const logo=String(teamId)===String(game.homeId)?game.homeLogo:String(teamId)===String(game.awayId)?game.awayLogo:'';
      const half=isHome?'▼':'▲',inning=Number.isFinite(Number(event.inning))?`${half} ${event.inning}`:'—',score=Number.isFinite(event.homeScore)&&Number.isFinite(event.awayScore)?`${event.homeScore}–${event.awayScore}`:'—';
      return `<div class="incident run"${incidentStyle(teamId)}><time>${inning}</time><span class="event-badge run">${logo?`<img src="${logo}" aria-hidden="true">`:''}</span>${playerPortrait(event)}<span class="event-mark">${score}</span><span>${event.text||'Scoring play'}</span></div>`;
    }).join('')||'<p>Detailed scoring plays are not yet available.</p>';
  }
  let home=0,away=0;
  const footballClockSeconds=value=>{
    const match=String(value||'').match(/^(\d+):(\d{2})$/);
    return match?Number(match[1])*60+Number(match[2]):-1;
  };
  const events=(game.events||[]).filter(event=>['goal','score','red','yellow','penalty','sub','injury'].includes(event.type)).slice().sort((a,b)=>{
    if(game.sport!=='football')return (a.minute??999)-(b.minute??999);
    // NFL clocks count down within each quarter: Q1 15:00 comes before Q1 0:01.
    const period=(Number(a.period)||99)-(Number(b.period)||99);
    return period||footballClockSeconds(b.clock)-footballClockSeconds(a.clock);
  });
  return events.map(event=>{
    const isScore=event.type==='goal'||event.type==='score';
    if(isScore){
      if(Number.isFinite(event.homeScore)&&Number.isFinite(event.awayScore)){home=event.homeScore;away=event.awayScore}
      else if(event.teamId===game.homeId)home++;else if(event.teamId===game.awayId)away++;
    }
    const logo=event.teamId===game.homeId?game.homeLogo:event.teamId===game.awayId?game.awayLogo:'';
    const marker=isScore?(game.sport==='football'?`<span class="football-score-mark"><b>${event.scoreLabel||'SCORE'}</b><small>${home}–${away}</small></span>`:game.sport==='soccer'?`<span class="soccer-goal-score">${soccerBallIcon}<small>${home}–${away}</small></span>`:`${home}–${away}`):event.type==='sub'?'↔':event.type==='yellow'?'<b class="card-glyph yellow"></b>':event.type==='red'?'<b class="card-glyph red"></b>':event.type==='injury'?'✚':'P';
    const badge=logo?`<span class="event-badge ${event.type}"><img src="${logo}" aria-hidden="true"></span>`:`<span class="event-badge fallback ${event.type}"></span>`;
    const eventText=event.scorer&&event.text.includes(event.scorer)?event.text.split(event.scorer).join(`<strong class="incident-player">${event.scorer}</strong>`):event.text;
    // The marker and score already say "goal". Provider prose sometimes starts
    // with one or more redundant Goal! labels, which would otherwise repeat it.
    const rawText=game.sport==='soccer'&&isScore
      ?String(eventText||'').replace(/^(?:\s*goal!\s*)+/i,'')
      :eventText;
    // Football's compact score rail already names the scoring play, so it
    // should never repeat TOUCHDOWN / FIELD GOAL above the description.
    const label='';
    const clock=game.sport==='football'?(event.period?`Q${event.period}${event.clock?` · ${event.clock}`:''}`:event.clock||'—'):(Number.isFinite(event.minute)?`${event.minute}'`:'—');
    return `<div class="incident ${event.type}"${incidentStyle(event.teamId)}><time>${clock}</time>${badge}${playerPortrait(event)}<span class="event-mark">${marker}</span><span>${label}${rawText||'Scoring play'}</span></div>`;
  }).join('')||'<p>Detailed incidents are not yet available.</p>';
};
new MutationObserver(()=>listShell.querySelectorAll('[data-game] .lineup-player:not([data-events])').forEach(row=>{
  row.dataset.events='true';
  row.removeAttribute('tabindex');
  const game=games.find(item=>item.id===row.closest('[data-game]')?.dataset.game),name=row.querySelector('span[title]')?.getAttribute('title')||row.querySelector('span')?.textContent;
  if(game?.__lineupSpoilers&&name&&!row.querySelector('.player-events'))row.querySelector('span[title]')?.insertAdjacentHTML('afterend',playerEventMarkup(game,name));
})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('[data-game].past').forEach(card=>{
  const game=games.find(item=>item.id===card.dataset.game),lineups=card.querySelector('.lineups');
  if(!game||!lineups||card.querySelector('.lineup-spoiler-control'))return;
  const control=document.createElement('div');
  control.className='lineup-spoiler-control';
  control.innerHTML=`<span class="spoiler-label">SPOILER?</span><button data-lineup-spoilers role="switch" aria-checked="${!!game.__lineupSpoilers}"><i class="toggle-knob"></i><b>${game.__lineupSpoilers?'ON':'OFF'}</b></button>`;
  const tabs=card.querySelector('.match-tabs');if(tabs)tabs.append(control);else lineups.before(control);
})).observe(listShell,{childList:true,subtree:true});
listShell.addEventListener('click',event=>{
  const button=event.target.closest('[data-lineup-spoilers]'),card=event.target.closest('[data-game]');
  if(!button||!card)return;
  const game=games.find(item=>item.id===card.dataset.game);if(!game)return;
  event.preventDefault();event.stopImmediatePropagation();
  game.__lineupSpoilers=!game.__lineupSpoilers;renderList();
},true);
const rosterMarkupWithProviderBench=rosterMarkup;
rosterMarkup=function(game){
  (game.rosters||[]).forEach(roster=>{
    if((roster.substitutes||roster.bench||[]).length)return;
    const teamId=String(roster.team?.id||(roster.team?.abbreviation===game.homeAbbr?game.homeId:roster.team?.abbreviation===game.awayAbbr?game.awayId:''));
    if(!teamId)return;
    const used=(game.events||[]).filter(event=>event.type==='sub'&&String(event.teamId)===teamId).map(event=>replacementNames(event.text)[0]||event.players?.[0]).filter(Boolean);
    const unique=[...new Map(used.map(name=>[playerKey(name),name])).values()];
    if(unique.length){roster.substitutes=unique.map(name=>({athlete:{displayName:name},substitute:true}));game._flagsReady=false}
  });
  return rosterMarkupWithProviderBench(game);
};
const rosterMarkupWithSportTerms=rosterMarkup;
const lineupEscape=value=>String(value??'').replace(/[&<>'"]/g,character=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[character]));
// Player details are deliberately registered as a lineup is rendered and only
// fetched when a person is tapped.  This keeps the spoiler-free roster quick.
const playerCardEntries=new Map(),playerCardRequests=new Map();
const playerCardId=entry=>{const player=entry?.athlete||entry||{},raw=String(player.id||player.uid||entry?.id||'');return raw.match(/(?:^|[~:])a:(\d+)/)?.[1]||raw.match(/(\d+)$/)?.[1]||raw||String(player.displayName||player.fullName||'unknown').toLowerCase()};
const playerCardPhoto=entry=>{const player=entry?.athlete||entry||{},image=player.headshot||entry?.headshot||player.photo||entry?.photo||player.image||entry?.image||'';return typeof image==='string'?image:(image?.href||player._portraitUrl||'')};
const registerPlayerCard=(game,entry,teamColour='',formation=null)=>{
  const player=entry?.athlete||entry||{},id=playerCardId(entry),key=`${game.id}:${id}`;
  const roster=(game.rosters||[]).find(group=>rosterEntries(group).some(candidate=>playerCardId(candidate)===id));
  const teamName=roster?.team?.displayName||roster?.team?.name||roster?.team?.abbreviation||'';
  playerCardEntries.set(key,{game,entry,player,teamColour,teamName,formation});
  return key;
};
const soccerHeadshot=entry=>{
  const player=entry?.athlete||entry||{},image=player.headshot||entry?.headshot||player.photo||entry?.photo||player.image||entry?.image||'';
  if(typeof image==='string'&&image)return image;
  if(image?.href)return image.href;
  if(player._portraitUrl)return player._portraitUrl;
  // ESPN's roster player IDs map to this stable portrait endpoint.  The image
  // still has an initials fallback when a player does not have a portrait.
  // Some lineup feeds use a compound UID such as `s:600~a:12345`; its final
  // athlete segment, rather than the full UID, is what the image service uses.
  const rawId=String(player.id||player.uid||entry?.id||'');
  const id=rawId.match(/(?:^|[~:])a:(\d+)/)?.[1]||rawId.match(/(\d+)$/)?.[1]||'';
  return id?`https://a.espncdn.com/i/headshots/soccer/players/full/${encodeURIComponent(id)}.png`:'';
};
const soccerPosition=entry=>{
  const player=entry?.athlete||entry||{};
  const value=[entry?.position,player.position,entry?.primaryPosition,player.primaryPosition,entry?.positionAbbreviation,player.positionAbbreviation]
    .map(item=>typeof item==='string'?item:item?.abbreviation||item?.shortName||item?.displayName||item?.name||'')
    .find(Boolean)||'';
  const position=String(value).toUpperCase();
  if(/^(?:GK|G)$|GOAL/.test(position))return 'gk';
  if(/^(?:D)$|CB|LB|RB|WB|DEF|BACK/.test(position))return 'def';
  if(/^(?:M)$|DM|CM|AM|MF|MID/.test(position))return 'mid';
  if(/^(?:F)$|ST|CF|FW|ATT|WING|FORWARD/.test(position))return 'att';
  return '';
};
const soccerPositionDetail=entry=>{
  const player=entry?.athlete||entry||{};
  const value=[entry?.position,player.position,entry?.primaryPosition,player.primaryPosition,entry?.positionAbbreviation,player.positionAbbreviation]
    .map(item=>typeof item==='string'?item:item?.abbreviation||item?.shortName||item?.displayName||item?.name||'')
    .find(Boolean)||'';
  return String(value).toUpperCase().replace(/[^A-Z]/g,'');
};
const soccerLineOrder=(players,side)=>{
  const rank=entry=>{
    const code=soccerPositionDetail(entry);
    if(/(?:RB|RWB|\bDR\b|RIGHTBACK|RIGHTWINGBACK|\bRW\b|\bRM\b)/.test(code))return 0;
    if(/(?:RCB|CDR|DCR|RIGHTCENT|RCM|CMR|RIGHTMID)/.test(code))return 1;
    if(/(?:LCB|CDL|DCL|LEFTCENT|LCM|CML|LEFTMID)/.test(code))return 3;
    if(/(?:LB|LWB|\bDL\b|LEFTBACK|LEFTWINGBACK|\bLW\b|\bLM\b)/.test(code))return 4;
    return 2;
  };
  return players.map((entry,index)=>({entry,index,rank:rank(entry)})).sort((a,b)=>side==='home'?(a.rank-b.rank||a.index-b.index):(b.rank-a.rank||a.index-b.index)).map(item=>item.entry);
};
const soccerTeamColor=(group,game,side)=>{
  const selected=statColoursFor(game),raw=String(side==='home'?selected.home:selected.away).replace(/^#/, '').trim();
  return /^[\da-f]{3}(?:[\da-f]{3})?(?:[\da-f]{2})?$/i.test(raw)?`#${raw}`:'#353533';
};
const soccerTeamInk=colour=>{
  let hex=String(colour||'').replace('#','');
  if(hex.length===3)hex=hex.split('').map(value=>value+value).join('');
  const rgb=[0,2,4].map(offset=>parseInt(hex.slice(offset,offset+2),16));
  if(rgb.some(Number.isNaN))return '#f1f1ed';
  return ((rgb[0]*299+rgb[1]*587+rgb[2]*114)/255000)>.62?'#1a1a18':'#f5f5f1';
};
const soccerFlagStamp=entry=>{
  const player=entry?.athlete||entry||{},country=player.flag||entry?.flag||player.country||entry?.country||player.nationality||entry?.nationality||player.citizenship||entry?.citizenship||{};
  const label=typeof country==='string'?country:country.alt||country.displayName||country.name||country.fullName||country.abbreviation||country.code||'';
  const rawCode=typeof country==='string'?'':String(country.abbreviation||country.code||country.isoCode||country.id||'').toUpperCase();
  const code=countryCode[label]||countryCode[rawCode]||fifaFlagCode[String(label).toUpperCase()]||fifaFlagCode[rawCode]||(/^[A-Z]{2}$/.test(rawCode)?rawCode.toLowerCase():'');
  const src=player.flag?.href||entry?.flag?.href||country?.href||country?.logo||(code?`https://flagcdn.com/24x18/${code}.png`:'');
  return src?`<img class="soccer-player-flag" src="${lineupEscape(src)}" alt="${lineupEscape(label||'Country flag')}">`:'';
};
const soccerFormationLineup=(roster,index)=>{
  const players=rosterEntries(roster);
  const direct=(roster.starters||roster.startingXI||[]).filter(Boolean);
  const starters=(direct.length?direct:players.filter(player=>player.starter===true||player.isStarter===true||player.status?.type==='starter')).slice(0,11);
  const team=roster.team||{},name=team.displayName||team.name||team.abbreviation||`TEAM ${index+1}`;
  const logo=team.logo||team.logos?.[0]?.href||'';
  const values=[roster.formation,roster.formationName,roster.team?.formation,roster.team?.formationName].filter(Boolean);
  const explicit=values.map(value=>String(value).match(/\d(?:\s*[-–]\s*\d){1,4}/)?.[0]).find(Boolean)?.replace(/\s/g,'')||'';
  const rows={gk:[],def:[],mid:[],att:[],unknown:[]};
  starters.forEach(player=>rows[soccerPosition(player)||'unknown'].push(player));
  if(!rows.gk.length&&rows.unknown.length)rows.gk.push(rows.unknown.shift());
  if(rows.unknown.length){
    const fallback=[['def',4],['mid',3],['att',3]];
    fallback.forEach(([role,count])=>{while(rows[role].length<count&&rows.unknown.length)rows[role].push(rows.unknown.shift())});
    while(rows.unknown.length)rows.att.push(rows.unknown.shift());
  }
  const explicitLines=explicit.split('-').map(Number).filter(count=>Number.isFinite(count)&&count>0);
  const fieldPlayers=[...rows.def,...rows.mid,...rows.att,...rows.unknown];
  const lines=['def','mid','att'].map(role=>rows[role].length).filter(Boolean);
  const formationRows=explicitLines.length&&explicitLines.reduce((sum,count)=>sum+count,0)===fieldPlayers.length
    ? (()=>{
      const slots=explicitLines.map(count=>[]),last=slots.length-1;
      // The provider's position symbol is more meaningful than roster order.
      // In a 4-2-3-1, for example, a CM is a pivot and ST/CF is the lone 9;
      // this avoids pushing a midfielder into the striker slot just because it
      // appeared later in ESPN's athlete list.
      const preferredRow=player=>{
        const code=soccerPositionDetail(player),role=soccerPosition(player);
        if(role==='def')return 0;
        if(/(?:ST|CF|FW|FORWARD|STRIKER)/.test(code))return last;
        if(/(?:LW|RW|LF|RF|WING)/.test(code))return slots.length>=4&&explicitLines[last]===1?Math.max(1,last-1):last;
        if(/(?:AM|CAM|ATTACKINGMID)/.test(code))return Math.max(1,last-1);
        if(/(?:DM|CDM|DEFENSIVEMID)/.test(code))return Math.min(1,last);
        if(/(?:CM|MF|MID)/.test(code))return Math.min(1,last);
        return role==='att'?last:Math.min(1,last);
      };
      const players=fieldPlayers.slice().sort((left,right)=>{
        const leftCode=soccerPositionDetail(left),rightCode=soccerPositionDetail(right);
        const certainty=code=>/^(?:GK|G|CB|LB|RB|LWB|RWB|DM|CDM|CM|AM|CAM|LM|RM|LW|RW|LF|RF|ST|CF|FW)$/.test(code)?1:0;
        return certainty(rightCode)-certainty(leftCode);
      });
      players.forEach(player=>{
        const preferred=preferredRow(player),candidates=[preferred,preferred-1,preferred+1,0,last].filter((row,index,array)=>row>=0&&row<=last&&array.indexOf(row)===index);
        const row=candidates.find(index=>slots[index].length<explicitLines[index])??slots.findIndex((line,index)=>line.length<explicitLines[index]);
        if(row>=0)slots[row].push(player);
      });
      return slots;
    })()
    : ['def','mid','att'].map(role=>rows[role]).filter(row=>row.length);
  return {roster,starters,rows,formationRows,name,logo,formation:explicit||lines.join('-')||'STARTING XI'};
};
function soccerFormationMarkup(game){
  const classicMarkup=rosterMarkupWithSportTerms(game);
  const groups=(game.rosters||[]).map(soccerFormationLineup).filter(group=>group.starters.length);
  // A pitch is only useful when the feed has both teams' full XIs.  Retain the
  // familiar list if a late or incomplete feed has not supplied them yet.
  if(groups.length!==2||groups.some(group=>group.starters.length<10))return classicMarkup;
  const ordered=groups.sort((left,right)=>{
    const home=String(left.roster.team?.id||'')===String(game.homeId),rightHome=String(right.roster.team?.id||'')===String(game.homeId);
    return Number(rightHome)-Number(home);
  });
  const eventMode=Boolean(game.__lineupSpoilers);
  const playerMarkup=(entry,side,vertical,rowIndex,rowLength,teamColor)=>{
    const person=entry?.athlete||entry||{},name=person.displayName||person.fullName||'Unknown player',shortName=person.shortName||name.split(' ').slice(-1)[0]||name,number=entry?.jersey||person.jersey||person.jerseyNumber||'—',portrait=soccerHeadshot(entry),initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'?',countryValue=person.country||entry?.country||person.nationality||entry?.nationality||person.citizenship||entry?.citizenship||person.flag||entry?.flag||{},countryRaw=typeof countryValue==='string'?countryValue:countryValue.displayName||countryValue.name||countryValue.alt||countryValue.fullName||countryValue.abbreviation||countryValue.code||'',countryNames={ENG:'England',SCO:'Scotland',WAL:'Wales',NIR:'Northern Ireland',IRL:'Ireland',FRA:'France',ESP:'Spain',POR:'Portugal',BRA:'Brazil',ARG:'Argentina',BEL:'Belgium',NED:'Netherlands',GER:'Germany',ITA:'Italy',DEN:'Denmark',SWE:'Sweden',NOR:'Norway',USA:'United States',CAN:'Canada',AUS:'Australia',JPN:'Japan',KOR:'South Korea'},countryName=countryNames[String(countryRaw).toUpperCase()]||countryRaw;
    // Every row uses the same visual column rhythm. A two-player pivot sits
    // on the two inner columns of a back four, rather than drifting apart.
    const formationColumns={1:[50],2:[36.667,63.333],3:[23.333,50,76.667],4:[10,36.667,63.333,90],5:[10,30,50,70,90]};
    const x=formationColumns[rowLength]?.[rowIndex]??(10+(rowIndex/Math.max(1,rowLength-1))*80);
    const events=eventMode?playerEventMarkup(game,name):'';
    const edgeClass=x<=12?' edge-left':x>=88?' edge-right':'';
    return `<div class="soccer-pitch-player lineup-player starter ${side}${edgeClass}" role="button" tabindex="0" data-player-card="${lineupEscape(registerPlayerCard(game,entry,teamColor,{x,y:vertical,side}))}" style="--x:${x.toFixed(2)}%;--y:${vertical}%;--team-colour:${lineupEscape(teamColor)};--team-ink:${soccerTeamInk(teamColor)}">`+
      `<div class="soccer-player-photo${portrait?'':' no-photo'}">${portrait?`<img class="soccer-player-headshot" src="${lineupEscape(portrait)}" alt="" decoding="async" onerror="this.style.display='none';this.parentElement.classList.add('no-photo');if(this.nextElementSibling)this.nextElementSibling.style.display='grid'">`:''}<i aria-hidden="true">${lineupEscape(initials)}</i>${soccerFlagStamp(entry)}</div>`+
      `<span title="${lineupEscape(name)}">${number!=='—'?`<b class="soccer-player-number">${lineupEscape(number)}</b> `:''}${lineupEscape(shortName)}${countryName?`<i class="soccer-player-country">${lineupEscape(countryName)}</i>`:''}</span>${events}</div>`;
  };
  const sideMarkup=(group,side)=>{
    const teamColor=soccerTeamColor(group,game,side);
    const goalkeeper=group.rows.gk[0];
    const rows=group.formationRows||[];
    const rowPosition=(index,total)=>{
      // Treat the goalkeeper, each outfield line, and halfway as a single
      // rhythm. Three outfield rows (4-4-2) get four equal spaces; four rows
      // (4-2-3-1) get five slightly tighter spaces. That keeps labels clear
      // without creating dead zones near either goal or the centre line.
      const step=total>=4?9:11,homeKeeper=6,awayKeeper=94;
      const offset=step*(index+1);
      return side==='home'?homeKeeper+offset:awayKeeper-offset;
    };
    // Keep the home keeper in the goalmouth.  The outfield rows, rather than
    // the keeper, move upward to remove dead space below the keeper's label.
    const goalkeeperY=side==='home'?6:94;
    const players=[
      ...(goalkeeper?[playerMarkup(goalkeeper,side,goalkeeperY,0,1,teamColor)]:[]),
      ...rows.flatMap((row,rowIndex)=>{const orderedRow=soccerLineOrder(row,side);return orderedRow.map((entry,index)=>playerMarkup(entry,side,rowPosition(rowIndex,rows.length),index,orderedRow.length,teamColor))})
    ].join('');
    return `<header class="soccer-pitch-team ${side}">${group.logo?`<img src="${lineupEscape(group.logo)}" alt="">`:''}<span>${lineupEscape(group.name)}</span><small>${lineupEscape(group.formation)}</small></header>${players}`;
  };
  const template=document.createElement('template');
  template.innerHTML=classicMarkup;
  const benches=template.content.querySelector('.lineups');
  if(benches){
    benches.classList.add('soccer-bench-list');
    benches.querySelectorAll('h4').forEach(heading=>{if(/starting|xi/i.test(heading.textContent||''))heading.remove()});
    benches.querySelectorAll('.lineup-player.starter').forEach(player=>player.remove());
    // The bench is where an incoming substitute is most legible.  Add the
    // same spoiler marker there rather than leaving the substitution only on
    // the player who is already on the pitch.
    if(eventMode)benches.querySelectorAll('.lineup-player.sub').forEach(player=>{
      const name=player.querySelector('span[title]')?.getAttribute('title');
      if(name&&!player.querySelector('.player-events'))player.querySelector('span[title]')?.insertAdjacentHTML('afterend',playerEventMarkup(game,name));
    });
    benches.querySelectorAll('section').forEach(section=>{if(!section.querySelector('.lineup-player'))section.remove()});
    const allEntries=(game.rosters||[]).flatMap(roster=>rosterEntries(roster));
    benches.querySelectorAll('.lineup-player').forEach(node=>{
      const name=node.querySelector('span[title]')?.getAttribute('title')||'';
      const entry=allEntries.find(item=>String((item?.athlete||item||{}).displayName||(item?.athlete||item||{}).fullName||'').toLowerCase()===name.toLowerCase());
      if(entry){node.dataset.playerCard=registerPlayerCard(game,entry);node.setAttribute('role','button');node.tabIndex=0;}
    });
  }
  return `<div class="soccer-lineup-view"><div class="soccer-pitch${eventMode?' soccer-pitch-events':''}" role="group" aria-label="Starting formations">${sideMarkup(ordered[0],'home')}<div class="soccer-halfway-line" aria-hidden="true"></div><div class="soccer-centre-circle" aria-hidden="true"></div>${sideMarkup(ordered[1],'away')}</div>${benches?.outerHTML||''}</div>`;
}
rosterMarkup=function(game){
  if(game.sport==='soccer')return soccerFormationMarkup(game);
  if(game.sport!=='baseball')return rosterMarkupWithSportTerms(game);
  const key=entry=>{const player=entry?.athlete||entry||{};return String(player.id||player.uid||player.displayName||player.fullName||'')};
  const player=(entry,order='')=>{
    const raw=entry?.athlete||entry||{},number=entry?.jersey||raw.jersey||raw.jerseyNumber||'—',position=entry?.position?.abbreviation||raw.position?.abbreviation||entry?.position?.code||raw.position?.code||'—',countryValue=raw.country||entry?.country||raw.flag||entry?.flag||{},country=typeof countryValue==='string'?countryValue:countryValue.displayName||countryValue.name||countryValue.alt||'',flag=raw.flag?.href||entry?.flag?.href||'',name=raw.displayName||raw.fullName||'Unknown player';
    return `<div class="lineup-player baseball-player" role="button" tabindex="0" data-player-card="${lineupEscape(registerPlayerCard(game,entry))}"><em>${order||number}</em>${flag?`<img class="lineup-flag" src="${flag}" alt="${country||'Country flag'}">`:'<i class="lineup-flag empty" aria-hidden="true"></i>'}<span title="${name}">${name}${country?`<i class="lineup-origin">${country}</i>`:''}</span><small>${position}</small></div>`;
  };
  const groups=(game.rosters||[]).map(roster=>{
    const all=rosterEntries(roster),pitcher=roster.startingPitcher||all.find(entry=>{const raw=entry?.athlete||entry||{};return (entry?.position?.abbreviation||raw.position?.abbreviation)==='P'&&entry?.substitute!==true}),starterKeys=new Set((roster.starters||[]).map(key)),batters=(roster.starters||[]).filter(entry=>key(entry)!==key(pitcher)).sort((left,right)=>(Number(left?.battingOrder)||99)-(Number(right?.battingOrder)||99)),fallbackBatters=all.filter(entry=>key(entry)!==key(pitcher)&&((entry?.position?.abbreviation||(entry?.athlete||entry)?.position?.abbreviation)!=='P')).slice(0,9),order=(batters.length?batters:fallbackBatters).slice(0,9),used=new Set([key(pitcher),...order.map(key)]),bench=(roster.substitutes||all.filter(entry=>!starterKeys.has(key(entry)))).filter(entry=>!used.has(key(entry))),name=roster.team?.displayName||roster.team?.name||roster.team?.abbreviation||'TEAM',logo=roster.team?.logo||roster.team?.logos?.[0]?.href||(roster.team?.abbreviation===game.homeAbbr?game.homeLogo:roster.team?.abbreviation===game.awayAbbr?game.awayLogo:'');
    return {name,logo,pitcher,order,bench};
  }).filter(group=>group.pitcher||group.order.length||group.bench.length);
  if(!groups.length)return '<p class="lineup-empty">Official lineup data is not available for this game.</p>';
  return `<div class="lineups baseball-lineups">${groups.map(group=>`<section><b>${group.logo?`<img src="${group.logo}" alt="">`:''}${group.name}</b>${group.pitcher?`<h4>STARTING PITCHER</h4>${player(group.pitcher,'P')}`:''}${group.order.length?`<h4>BATTING ORDER</h4>${group.order.map((entry,index)=>player(entry,index+1)).join('')}`:''}${group.bench.length?`<h4>BENCH</h4>${group.bench.map(entry=>player(entry)).join('')}`:''}</section>`).join('')}</div>`;
};
const playerCardModal=document.getElementById('player-card-modal'),playerCardContent=playerCardModal?.querySelector('[data-player-card-content]');
const playerCardInitials=name=>String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'?';
const playerCardPosition=entry=>{const player=entry?.athlete||entry||{},value=entry?.position||player.position||entry?.primaryPosition||player.primaryPosition||'';return typeof value==='string'?value:(value.abbreviation||value.shortName||value.displayName||value.name||'PLAYER')};
const playerCardNumber=entry=>{const player=entry?.athlete||entry||{};return entry?.jersey||player.jersey||player.jerseyNumber||''};
const playerCardCountry=entry=>{
  const player=entry?.athlete||entry||{},country=player.country||entry?.country||player.nationality||entry?.nationality||player.citizenship||entry?.citizenship||player.flag||entry?.flag||{},name=typeof country==='string'?country:country.displayName||country.name||country.alt||country.fullName||country.abbreviation||country.code||'';
  return name?`<small class="player-card-country">${soccerFlagStamp(entry)}${lineupEscape(name)}</small>`:'';
};
const playerCardRows=(rows,empty='Season statistics are not yet available from the provider.')=>rows?.length?`<div class="player-card-stats">${rows.map(([label,value])=>`<div><span>${lineupEscape(label)}</span><b>${lineupEscape(value)}</b></div>`).join('')}</div>`:`<p class="player-card-empty">${empty}</p>`;
const playerStatLabel=value=>String(value||'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const playerGameRows=item=>{
  const raw=item.entry?.statistics||item.entry?.stats||item.entry?.batting||item.entry?.pitching||{},rows=[];
  const visit=value=>{if(!value)return;if(Array.isArray(value))return value.forEach(visit);if(typeof value==='object'){if(value.name&&(value.value!==undefined||value.displayValue!==undefined))rows.push([value.displayName||value.name,value.displayValue??value.value]);else Object.entries(value).forEach(([key,child])=>{if(typeof child==='number'||typeof child==='string'&&/^[\d.]+$/.test(child))rows.push([playerStatLabel(key),child]);else if(child&&typeof child==='object')visit(child)})}};
  visit(raw);return [...new Map(rows.filter(([,value])=>value!==''&&value!==undefined&&value!==null).map(([label,value])=>[String(label),[String(label),value]])).values()].slice(0,15);
};
const playerCardTabBody=(key,item,seasonRows,tab,loading)=>{
  const tabs=[['game','GAME STATS'],['season','SEASON']];
  const gameRows=playerGameRows(item),rows=tab==='game'?gameRows:seasonRows,empty=tab==='game'?'Official match statistics are not available for this player.':'Season statistics are not yet available from the provider.';
  return `<nav class="player-card-tabs" role="tablist">${tabs.map(([id,label])=>`<button type="button" role="tab" data-player-card-tab="${id}" data-player-card-key="${lineupEscape(key)}" class="${tab===id?'active':''}" aria-selected="${tab===id}">${label}</button>`).join('')}</nav>${playerCardRows(rows,loading&&tab==='season'?'':empty)}`;
};
const playerCardDeck=key=>{
  const item=playerCardEntries.get(key),keys=[...playerCardEntries.entries()].filter(([,entry])=>entry.game.id===item?.game.id).map(([entryKey])=>entryKey),index=keys.indexOf(key);
  if(index<0||keys.length<2)return '';
  const previous=keys[(index-1+keys.length)%keys.length],next=keys[(index+1)%keys.length];
  return `<nav class="player-card-deck" aria-label="Browse match players"><button type="button" data-player-card-step="${lineupEscape(previous)}" aria-label="Previous player">‹</button><span>${index+1} / ${keys.length}</span><button type="button" data-player-card-step="${lineupEscape(next)}" aria-label="Next player">›</button></nav>`;
};
const playerCardFormation=item=>{
  const point=item.formation;if(!point)return '';
  const dots=[...playerCardEntries.values()].filter(candidate=>candidate.game.id===item.game.id&&candidate.formation?.side===point.side).map(candidate=>`<i class="${candidate===item?'player-dot selected':'player-dot'}" style="--x:${candidate.formation.x}%;--y:${candidate.formation.y}%"></i>`).join('');
  return `<figure class="player-card-formation" aria-label="Player position in the match formation"><figcaption>MATCH POSITION</figcaption><div>${dots}</div></figure>`;
};
const playerCardShell=(item,body,loading=false)=>{
  const {game,entry,player,teamColour,teamName}=item,name=player.displayName||player.fullName||'Unknown player',number=playerCardNumber(entry),position=playerCardPosition(entry),id=playerCardId(entry),photo=playerCardPhoto(entry)||(game.sport==='soccer'?soccerHeadshot(entry):game.sport==='baseball'&&/^\d+$/.test(id)?`https://img.mlbstatic.com/mlb-photos/image/upload/w_400,q_auto:best/v1/people/${id}/headshot/67/current`:''),tone=teamColour||(teamName===game.home||teamName===game.homeAbbr?game.homeColor:game.awayColor)||'#d6574f';
  return `<div class="player-card-face" style="--player-card-tone:${lineupEscape(tone)}"><header class="player-card-hero"><div class="player-card-portrait${photo?'':' no-photo'}">${photo?`<img src="${lineupEscape(photo)}" alt="" onerror="this.remove();this.parentElement.classList.add('no-photo')">`:''}<b>${lineupEscape(playerCardInitials(name))}</b></div><div><p>${lineupEscape(game.league||game.sport||'PLAYER PROFILE')}</p><h2 id="player-card-name">${lineupEscape(name)}</h2><span>${number?`#${lineupEscape(number)} · `:''}${lineupEscape(position)}${teamName?` · ${lineupEscape(teamName)}`:''}</span>${playerCardCountry(entry)}</div></header>${playerCardFormation(item)}<section class="player-card-season"><header><b>${new Date(game.time||Date.now()).getFullYear()} SEASON</b>${loading?'<i>LOADING</i>':''}</header>${body}</section></div>${playerCardDeck(`${game.id}:${playerCardId(entry)}`)}`;
};
const numberStat=value=>value===undefined||value===null||value===''?'—':String(value);
const baseballSeasonRows=payload=>{
  const groups=payload?.stats||[],pitching=payload?.pitching||groups.find(group=>String(group.group?.displayName||group.group?.name||'').toLowerCase().includes('pitch'))?.splits?.[0]?.stat,batting=payload?.batting||groups.find(group=>String(group.group?.displayName||group.group?.name||'').toLowerCase().includes('hit'))?.splits?.[0]?.stat;
  const stat=pitching?.inningsPitched||pitching?.era?pitching:batting;
  if(!stat)return [];
  return stat===pitching?[['G',numberStat(stat.gamesPlayed)],['W–L',`${numberStat(stat.wins)}–${numberStat(stat.losses)}`],['ERA',numberStat(stat.era)],['IP',numberStat(stat.inningsPitched)],['SO',numberStat(stat.strikeOuts)],['BB',numberStat(stat.baseOnBalls)],['SAVES',numberStat(stat.saves)]]:[['G',numberStat(stat.gamesPlayed)],['AVG',numberStat(stat.avg)],['HR',numberStat(stat.homeRuns)],['RBI',numberStat(stat.rbi)],['RUNS',numberStat(stat.runs)],['HITS',numberStat(stat.hits)],['OPS',numberStat(stat.ops)],['SB',numberStat(stat.stolenBases)],['SO',numberStat(stat.strikeOuts)],['BB',numberStat(stat.baseOnBalls)]];
};
const soccerSeasonRows=payload=>{
  const flat=[];const visit=value=>{if(!value)return;if(Array.isArray(value))return value.forEach(visit);if(typeof value==='object'){if(value.name&&(value.value!==undefined||value.displayValue!==undefined))flat.push(value);Object.values(value).forEach(child=>{if(child&&typeof child==='object')visit(child)})}};visit(payload?.stats||payload?.athlete?.statistics||payload?.statistics||payload);
  const find=terms=>{const key=item=>String(item.name||item.label||item.abbreviation||'').toLowerCase().replace(/[^a-z]/g,''),row=flat.find(item=>terms.includes(key(item)))||flat.find(item=>terms.some(term=>key(item).includes(term)));return row?.displayValue??row?.value};
  return [['APPEARANCES',find(['appearances','gamesplayed'])],['STARTS',find(['gamesstarted','starts'])],['GOALS',find(['totalgoals','goals'])],['ASSISTS',find(['goalassists','assists'])],['MINUTES',find(['minutes','minutesplayed'])],['SHOTS',find(['totalshots','shots'])],['ON TARGET',find(['shotsontarget'])],['PASSES',find(['totalpasses','passes'])],['PASS %',find(['passpct','passingpercentage'])],['TACKLES WON',find(['effectivetackles','tackleswon'])],['INTERCEPTIONS',find(['interceptions'])],['YELLOW',find(['yellowcards'])],['RED',find(['redcards'])]].filter(([,value])=>value!==undefined&&value!==null&&value!=='');
};
const playerCardStats=async item=>{
  const id=playerCardId(item.entry),key=`${item.game.sport}:${id}`;
  if(playerCardRequests.has(key))return playerCardRequests.get(key);
  const request=(async()=>{
    if(!id||!/^\d+$/.test(id))return [];
    try{
      if(item.game.sport==='baseball'){
        const embedded=baseballSeasonRows(item.entry?.seasonStats);if(embedded.length)return embedded;
        const response=await fetch(`https://statsapi.mlb.com/api/v1/people/${encodeURIComponent(id)}/stats?stats=season&season=${new Date().getFullYear()}&group=hitting,pitching`);
        return response.ok?baseballSeasonRows(await response.json()):[];
      }
      const slug=EPLData?.leagues?.[item.game.leagueId]?.slug||item.game.espnLeague||'';
      if(!slug)return [];
      const season=new Date(item.game.time||Date.now()).getUTCFullYear();
      const response=await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${encodeURIComponent(slug)}/seasons/${season}/types/1/athletes/${encodeURIComponent(id)}/statistics?lang=en&region=us`);
      return response.ok?soccerSeasonRows(await response.json()):[];
    }catch(_){return []}
  })();
  playerCardRequests.set(key,request);return request;
};
const closePlayerCard=()=>{if(playerCardModal)playerCardModal.hidden=true};
const openPlayerCard=async (key,tab='season')=>{
  const item=playerCardEntries.get(key);if(!item||!playerCardModal||!playerCardContent)return;
  playerCardContent.innerHTML=playerCardShell(item,playerCardTabBody(key,item,[],tab,true),true);playerCardModal.hidden=false;
  const rows=await playerCardStats(item);
  if(!playerCardModal.hidden&&playerCardEntries.get(key)===item)playerCardContent.innerHTML=playerCardShell(item,playerCardTabBody(key,item,rows,tab,false),false);
};
document.addEventListener('click',event=>{const trigger=event.target.closest('[data-player-card]');if(trigger){event.preventDefault();event.stopPropagation();openPlayerCard(trigger.dataset.playerCard);return}const step=event.target.closest('[data-player-card-step]');if(step){event.preventDefault();event.stopPropagation();openPlayerCard(step.dataset.playerCardStep);return}const tab=event.target.closest('[data-player-card-tab]');if(tab){event.preventDefault();event.stopPropagation();openPlayerCard(tab.dataset.playerCardKey,tab.dataset.playerCardTab);return}if(event.target.closest('[data-player-card-close]'))closePlayerCard()},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!playerCardModal?.hidden){closePlayerCard();return}if(!playerCardModal?.hidden&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){const buttons=playerCardModal.querySelectorAll('[data-player-card-step]'),button=event.key==='ArrowLeft'?buttons[0]:buttons[1];if(button){event.preventDefault();openPlayerCard(button.dataset.playerCardStep)}return}const trigger=event.target.closest?.('[data-player-card]');if(trigger&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openPlayerCard(trigger.dataset.playerCard)}},true);
function boxScoreMarkup(game){const teams=game.summary?.boxscore?.teams||game.summary?.boxscore?.teamStats||[],home=teams.find(team=>String(team.team?.id||team.id||'')===String(game.homeId)),away=teams.find(team=>String(team.team?.id||team.id||'')===String(game.awayId)),value=(team,keys)=>{const stat=(team?.statistics||team?.stats||[]).find(item=>keys.includes(String(item.name||item.label||'').toLowerCase().replace(/[^a-z]/g,'')));return stat?.displayValue??stat?.value??''},rows=[['SHOTS',['shots']],['ON TARGET',['shotsontarget','shotsongoal']],['CORNERS',['corners','cornerkicks']],['SAVES',['saves']],['POSSESSION',['possession','possessionpct']]].map(([label,keys])=>({label,home:value(home,keys),away:value(away,keys)})).filter(row=>row.home!==''||row.away!=='');return rows.length?`<section class="box-score" aria-label="Match statistics"><h3>MATCH STATS</h3>${rows.map(row=>`<div><b>${row.home||'—'}</b><span>${row.label}</span><b>${row.away||'—'}</b></div>`).join('')}</section>`:''}
boxScoreMarkup=function(game){const teams=game.summary?.boxscore?.teams||game.summary?.boxscore?.teamStats||[],home=teams.find(team=>String(team.team?.id||team.id||'')===String(game.homeId)),away=teams.find(team=>String(team.team?.id||team.id||'')===String(game.awayId)),value=(team,keys)=>{const stat=(team?.statistics||team?.stats||[]).find(item=>keys.includes(String(item.name||item.label||'').toLowerCase().replace(/[^a-z]/g,'')));return stat?.displayValue??stat?.value??''},number=value=>Number(String(value).replace(/[^\d.]/g,'')),mark=(value,other,color)=>`<b class="${number(value)>number(other)?'stat-lead':''}" ${number(value)>number(other)?`style="--team:${color}"`:''}>${value||'—'}</b>`,rows=[['SHOTS',['shots']],['ON TARGET',['shotsontarget','shotsongoal']],['CORNERS',['corners','cornerkicks']],['SAVES',['saves']],['TOUCHES IN BOX',['touchesinoppositionbox','touchesinoppositionarea','touchesinbox']]].map(([label,keys])=>({label,home:value(home,keys),away:value(away,keys)})).filter(row=>row.home!==''||row.away!==''),homePossession=value(home,['possession','possessionpct']),awayPossession=value(away,['possession','possessionpct']),possession=homePossession!==''||awayPossession!==''?`<div class="box-possession"><span>POSSESSION</span><div><i style="flex:${number(homePossession)||0};background:${game.homeColor}">${homePossession||'—'}</i><i style="flex:${number(awayPossession)||0};background:${game.awayColor}">${awayPossession||'—'}</i></div></div>`:'';return rows.length||possession?`<section class="box-score" aria-label="Match statistics">${rows.map(row=>`<div>${mark(row.home,row.away,game.homeColor)}<span>${row.label}</span>${mark(row.away,row.home,game.awayColor)}</div>`).join('')}${possession}</section>`:''};
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game),incidents=card.querySelector('.list-incidents');if(game?.__showResults&&game.__resultTab==='legacy'&&game.sport!=='baseball'&&incidents&&!card.querySelector('.box-score')){const markup=boxScoreMarkup(game);if(markup)incidents.insertAdjacentHTML('beforebegin',markup)}})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>{const title=info.querySelector('.result-title')?.textContent||'',game=games.find(item=>title.includes(item.homeAbbr||item.home)&&title.includes(item.awayAbbr||item.away)),incidents=info.querySelector('.incident-list');if(game&&game.sport!=='baseball'&&incidents&&!info.querySelector('.box-score')){const markup=boxScoreMarkup(game);if(markup)incidents.insertAdjacentHTML('beforebegin',markup)}}).observe(info,{childList:true,subtree:true});
// ESPN sometimes supplies nearly identical primary colours. In that case the
// stat comparison loses its two-team meaning, so prefer a badge-recognisable
// secondary colour before falling back to the provider's alternate colour.
const STAT_SECONDARY_COLOURS={'Ipswich Town':'#d71920'};
const statHex=value=>{const hex=String(value||'').replace('#','');return /^[0-9a-f]{6}$/i.test(hex)?`#${hex}`:''};
const statColourDistance=(left,right)=>{const a=statHex(left),b=statHex(right);if(!a||!b)return 255;const channels=value=>[1,3,5].map(index=>parseInt(value.slice(index,index+2),16));const [ar,ag,ab]=channels(a),[br,bg,bb]=channels(b);return Math.hypot(ar-br,ag-bg,ab-bb)};
const statColoursFor=game=>{
  const home=statHex(game.homeColor)||'#c7c7c1',away=statHex(game.awayColor)||'#666662';
  if(statColourDistance(home,away)>=82)return {home,away};
  const brandedChoices=[
    {side:'home',color:statHex(STAT_SECONDARY_COLOURS[game.home])},
    {side:'away',color:statHex(STAT_SECONDARY_COLOURS[game.away])}
  ].filter(choice=>choice.color);
  const choices=(brandedChoices.length?brandedChoices:[
    {side:'home',color:statHex(game.homeAlternateColor)},
    {side:'away',color:statHex(game.awayAlternateColor)}
  ]).filter(choice=>choice.color);
  const best=choices.map(choice=>({...choice,distance:statColourDistance(choice.color,choice.side==='home'?away:home)})).sort((a,b)=>b.distance-a.distance)[0];
  if(!best||best.distance<82)return {home,away};
  return best.side==='home'?{home:best.color,away}:{home,away:best.color};
};
boxScoreMarkup=function(game){
  const teams=game.summary?.boxscore?.teams||game.summary?.boxscore?.teamStats||[];
  const home=teams.find(team=>String(team.team?.id||team.id||'')===String(game.homeId))||teams.find(team=>team.homeAway==='home'||team.team?.homeAway==='home')||teams[0];
  const away=teams.find(team=>String(team.team?.id||team.id||'')===String(game.awayId))||teams.find(team=>team.homeAway==='away'||team.team?.homeAway==='away')||teams[1];
  const value=(team,keys)=>{const stat=(team?.statistics||team?.stats||[]).find(item=>keys.includes(String(item.name||item.label||'').toLowerCase().replace(/[^a-z]/g,'')));return stat?.displayValue??stat?.value??''};
  const number=value=>Number(String(value).replace(/[^\d.]/g,''));
  const colour=(value,fallback)=>{const hex=String(value||'').replace('#','');return /^[0-9a-f]{6}$/i.test(hex)?`#${hex}`:fallback};
  const statColours=statColoursFor(game),homeColour=colour(statColours.home,'#c7c7c1'),awayColour=colour(statColours.away,'#666662');
  const ink=color=>{const hex=String(color||'').replace('#','');if(!/^[0-9a-f]{6}$/i.test(hex))return '#f3efe5';const [r,g,b]=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));return (.2126*r+.7152*g+.0722*b)/255>.6?'#11110f':'#f3efe5'};
  const mark=(value,other,color)=>`<b class="${number(value)>number(other)?'stat-lead':''}" ${number(value)>number(other)?`style="--team:${color}"`:''}>${value||'—'}</b>`;
  const metricRows=game.sport==='baseball'?
    [['RUNS',['runs']],['HITS',['hits']],['HOME RUNS',['homeruns']],['STRIKEOUTS',['strikeouts']],['WALKS',['baseonballs']],['ERRORS',['errors']]]:
    [['TOTAL SHOTS',['shots','totalshots','shotstotal']],['ON TARGET',['shotsontarget','shotsongoal']],['CORNERS',['corners','cornerkicks','totalcorners']],['SAVES',['saves','goalkeepersaves']],['TOUCHES IN BOX',['touchesinoppositionbox','touchesinoppositionarea','touchesinthebox','touchesinbox']],['FOULS',['fouls','foulscommitted']],['OFFSIDES',['offsides','offsidescommitted']]];
  const recap=game.mlbRecap||{},baseballFallback=(side,key)=>recap?.[side]?.[key]??(key==='runs'?(side==='home'?game.homeScore:game.awayScore):'');
  const rows=metricRows.map(([label,keys])=>{
    const fallback=game.sport==='baseball'?({RUNS:'runs',HITS:'hits',ERRORS:'errors'}[label]||''):'';
    return {label,home:value(home,keys)||baseballFallback('home',fallback),away:value(away,keys)||baseballFallback('away',fallback)};
  }).filter(row=>row.home!==''||row.away!=='');
  const homePossession=game.sport==='baseball'?'':value(home,['possession','possessionpct','possessionpercentage']),awayPossession=game.sport==='baseball'?'':value(away,['possession','possessionpct','possessionpercentage']);
  if(game.sport==='baseball'){
    const safe=value=>lineupEscape(value),sideName=(name,abbr)=>safe(abbr||name||'—');
    const statRow=row=>{const homeLead=number(row.home)>number(row.away),awayLead=number(row.away)>number(row.home);return `<div class="soccer-stat-row"><b class="${homeLead?'is-leading':''}" ${homeLead?`style="--side-color:${homeColour};--side-ink:${ink(homeColour)}"`:''}>${safe(row.home||'—')}</b><span>${row.label}</span><b class="${awayLead?'is-leading':''}" ${awayLead?`style="--side-color:${awayColour};--side-ink:${ink(awayColour)}"`:''}>${safe(row.away||'—')}</b></div>`};
    return rows.length?`<section class="box-score soccer-box-score baseball-match-stats" aria-label="Baseball match statistics" style="--home-color:${homeColour};--away-color:${awayColour};--home-ink:${ink(homeColour)};--away-ink:${ink(awayColour)}"><header class="soccer-stat-header"><span class="home">${game.homeLogo?`<img src="${safe(game.homeLogo)}" alt="">`:''}${sideName(game.home,game.homeAbbr)}</span><b>MATCH STATS</b><span class="away">${sideName(game.away,game.awayAbbr)}${game.awayLogo?`<img src="${safe(game.awayLogo)}" alt="">`:''}</span></header><div class="soccer-stat-rows">${rows.map(statRow).join('')}</div></section>`:'';
  }
  if(game.sport!=='soccer'){
    const possession=homePossession!==''||awayPossession!==''?`<div class="box-possession"><span>POSSESSION</span><div><i style="flex:${number(homePossession)||0};background:${homeColour};color:${ink(homeColour)}">${homePossession||'—'}</i><i style="flex:${number(awayPossession)||0};background:${awayColour};color:${ink(awayColour)}">${awayPossession||'—'}</i></div></div>`:'';
    return rows.length||possession?`<section class="box-score" aria-label="Match statistics">${rows.map(row=>`<div>${mark(row.home,row.away,homeColour)}<span>${row.label}</span>${mark(row.away,row.home,awayColour)}</div>`).join('')}${possession}</section>`:'';
  }
  const statRows=[
    ['EXPECTED GOALS (xG)',['expectedgoals','expectedgoal','xg','expectedgoalsxg']],
    ['TOTAL SHOTS',['shots','totalshots','shotstotal']],
    ['SHOTS ON TARGET',['shotsontarget','shotsongoal']],
    ['BLOCKED SHOTS',['blockedshots','shotsblocked']],
    ['TOUCHES IN OPP. BOX',['touchesinoppositionbox','touchesinoppositionarea','touchesinthebox','touchesinbox']],
    ['BIG CHANCES',['bigchances','bigchancescreated','bigchancecreated','clearcutchances','chancescreated']],
    ['BIG CHANCES MISSED',['bigchancesmissed','bigchancemissed','clearcutchancesmissed']],
    ['PASSES',['passes','totalpasses','passestotal','passescompleted']],
    ['PASS ACCURACY',['passaccuracy','passaccuracypercentage','passingaccuracy','accuratepasspercentage']],
    ['CORNERS',['corners','cornerkicks','totalcorners']],
    ['FOULS',['fouls','foulscommitted','totalfouls']],
    ['OFFSIDES',['offsides','offsidescommitted']],
    ['YELLOW CARDS',['yellowcards','yellowcard']],
    ['SAVES',['saves','goalkeepersaves']]
  ].map(([label,keys])=>({label,home:value(home,keys),away:value(away,keys)})).filter(row=>row.home!==''||row.away!=='');
  const safe=value=>lineupEscape(value);
  const sideName=(name,abbr)=>safe(abbr||name||'—');
  const statRow=row=>{
    const homeLead=number(row.home)>number(row.away),awayLead=number(row.away)>number(row.home);
    return `<div class="soccer-stat-row"><b class="${homeLead?'is-leading':''}" ${homeLead?`style="--side-color:${homeColour};--side-ink:${ink(homeColour)}"`:''}>${safe(row.home||'—')}</b><span>${row.label}</span><b class="${awayLead?'is-leading':''}" ${awayLead?`style="--side-color:${awayColour};--side-ink:${ink(awayColour)}"`:''}>${safe(row.away||'—')}</b></div>`;
  };
  const possession=homePossession!==''||awayPossession!==''?`<section class="soccer-possession"><b>POSSESSION</b><div class="soccer-possession-track"><i class="home" style="flex:${Math.max(number(homePossession),.01)};--side-color:${homeColour};--side-ink:${ink(homeColour)}">${safe(homePossession||'—')}</i><i class="away" style="flex:${Math.max(number(awayPossession),.01)};--side-color:${awayColour};--side-ink:${ink(awayColour)}">${safe(awayPossession||'—')}</i></div></section>`:'';
  const source=[game.summary?.momentum,game.summary?.momentumChart,game.summary?.boxscore?.momentum,game.summary?.gameInfo?.momentum].map(raw=>Array.isArray(raw)?raw:raw?.items||raw?.data||raw?.values||raw?.moments||raw?.plays).find(items=>Array.isArray(items)&&items.length>=6);
  const pick=(entry,keys)=>{for(const key of keys){const raw=entry?.[key];const parsed=Number(typeof raw==='object'?(raw?.value??raw?.displayValue):raw);if(Number.isFinite(parsed))return parsed}return null};
  const momentum=(source||[]).map((entry,index)=>{
    const homeValue=pick(entry,['homeMomentum','homeValue','home']),awayValue=pick(entry,['awayMomentum','awayValue','away']),direct=pick(entry,['momentum','value']);
    let score=null;
    if(homeValue!==null&&awayValue!==null)score=(homeValue-awayValue)/(Math.abs(homeValue)+Math.abs(awayValue)||1);
    else if(direct!==null)score=direct;
    if(score===null)return null;
    return {score,minute:pick(entry,['minute','minutes','time','clock'])??index};
  }).filter(Boolean);
  const momentumMarkup=(()=>{
    if(momentum.length<6)return '';
    const maximum=Math.max(1,...momentum.map(point=>Math.abs(point.score)));
    const points=momentum.map((point,index)=>({x:3+(94*index/Math.max(1,momentum.length-1)),y:22-(Math.max(-1,Math.min(1,point.score/maximum))*18)}));
    if(points.every(point=>Math.abs(point.y-22)<.2))return '';
    const areas=points.slice(1).map((point,index)=>{const previous=points[index],side=(previous.y+point.y)/2<=22?'home':'away',colour=side==='home'?homeColour:awayColour;return `<path d="M ${previous.x.toFixed(2)} 22 L ${previous.x.toFixed(2)} ${previous.y.toFixed(2)} L ${point.x.toFixed(2)} ${point.y.toFixed(2)} L ${point.x.toFixed(2)} 22 Z" fill="${colour}"/>`}).join('');
    const goalMarks=(game.events||[]).filter(event=>event.type==='goal'&&Number.isFinite(Number(event.minute))).map(event=>{const homeSide=String(event.teamId||'')===String(game.homeId),x=Math.min(97,Math.max(3,3+94*Number(event.minute)/90)),y=homeSide?4:40;return `<circle cx="${x.toFixed(2)}" cy="${y}" r="2.3" fill="${homeSide?homeColour:awayColour}" stroke="#171715" stroke-width=".8"><title>Goal, ${safe(event.minute)}′</title></circle>`}).join('');
    return `<section class="soccer-momentum" aria-label="Match momentum from the match provider"><div><b>MOMENTUM</b><small>${sideName(game.home,game.homeAbbr)} <i aria-hidden="true">▲</i> ${sideName(game.away,game.awayAbbr)}</small></div><svg viewBox="0 0 100 44" preserveAspectRatio="none" role="img" aria-label="Momentum chart, ${sideName(game.home,game.homeAbbr)} above the line and ${sideName(game.away,game.awayAbbr)} below"><line x1="0" x2="100" y1="22" y2="22"/>${areas}${goalMarks}</svg><footer><span>0′</span><span>HT</span><span>FT</span></footer></section>`;
  })();
  if(!statRows.length&&!possession&&!momentumMarkup)return '';
  return `<section class="box-score soccer-box-score" aria-label="Match statistics" style="--home-color:${homeColour};--away-color:${awayColour};--home-ink:${ink(homeColour)};--away-ink:${ink(awayColour)}"><header class="soccer-stat-header"><span class="home">${game.homeLogo?`<img src="${safe(game.homeLogo)}" alt="">`:''}${sideName(game.home,game.homeAbbr)}</span><b>MATCH STATS</b><span class="away">${sideName(game.away,game.awayAbbr)}${game.awayLogo?`<img src="${safe(game.awayLogo)}" alt="">`:''}</span></header>${momentumMarkup}${possession}<div class="soccer-stat-rows">${statRows.map(statRow).join('')}</div></section>`;
};
function matchSummaryMarkup(game){
  const safe=value=>lineupEscape(value);
  const hasScore=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const homeScore=hasScore(game.homeScore)?Number(game.homeScore):null,awayScore=hasScore(game.awayScore)?Number(game.awayScore):null;
  const score=homeScore!==null&&awayScore!==null?`${homeScore}–${awayScore}`:'the final score';
  const eventTypes=game.sport==='baseball'?['run']:['goal','score'];
  const clock=event=>{if(game.sport==='football'&&event.period)return `Q${event.period}${event.clock?` · ${event.clock}`:''}`;const value=String(event.clock||'').trim().replace(/'/g,'');if(value)return `${value}'`;if(Number.isFinite(Number(event.minute)))return `${event.minute}'`;return 'the match'};
  const creditedTeam=event=>{const id=String(event.teamId||'');if(game.sport==='soccer'&&(event.ownGoal||/own goal/i.test(String(event.text||''))))return id===String(game.homeId)?String(game.awayId):id===String(game.awayId)?String(game.homeId):id;return id};
  const teamName=id=>String(id)===String(game.homeId)?game.home:String(id)===String(game.awayId)?game.away:'';
  const scoreInText=event=>{const escapeRegex=value=>String(value||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),match=String(event.text||'').match(new RegExp(`${escapeRegex(game.home)}\\s+(\\d+)\\s*,\\s*${escapeRegex(game.away)}\\s+(\\d+)`,'i'));return match?{home:Number(match[1]),away:Number(match[2])}:null};
  const isPenaltyGoal=event=>game.sport==='soccer'&&event.type==='penalty'&&/\b(?:scores?|scored|converts?|converted|goal)\b/i.test(String(event.text||''));
  const goals=(game.events||[]).filter(event=>eventTypes.includes(event.type)||isPenaltyGoal(event)).map(event=>({...event,creditedId:creditedTeam(event)}));
  let runningHome=0,runningAway=0,lastLead=0,leadChanges=0,equalisers=0;
  goals.forEach(event=>{
    const textScore=scoreInText(event),reported=hasScore(event.homeScore)&&hasScore(event.awayScore)?{home:Number(event.homeScore),away:Number(event.awayScore)}:null,cumulative=textScore&&textScore.home+textScore.away>runningHome+runningAway?textScore:reported&&reported.home+reported.away>runningHome+runningAway?reported:null;
    if(cumulative){
      const homeDelta=cumulative.home-runningHome,awayDelta=cumulative.away-runningAway;
      if(homeDelta>awayDelta)event.creditedId=String(game.homeId);else if(awayDelta>homeDelta)event.creditedId=String(game.awayId);
      runningHome=cumulative.home;runningAway=cumulative.away;
    }else if(event.creditedId===String(game.homeId))runningHome++;else if(event.creditedId===String(game.awayId))runningAway++;
    const lead=Math.sign(runningHome-runningAway);
    if(lead===0&&lastLead!==0)equalisers++;
    if(lead!==0&&lastLead!==0&&lead!==lastLead)leadChanges++;
    if(lead!==0)lastLead=lead;
    event.runningScore=`${runningHome}–${runningAway}`;
  });
  const result=homeScore===null||awayScore===null?`${safe(game.home)} and ${safe(game.away)} completed their match.`:homeScore===awayScore?`${safe(game.home)} and ${safe(game.away)} finished level at ${score}.`:`${safe(homeScore>awayScore?game.home:game.away)} defeated ${safe(homeScore>awayScore?game.away:game.home)} ${score}.`;
  const goalSuffix=event=>`${event.ownGoal||/own goal/i.test(String(event.text||''))?' (OG)':''}${game.sport==='soccer'&&(event.isPenalty||isPenaltyGoal(event))?' (PK)':''}`;
  const describe=event=>{const scorer=event.scorer?`${safe(event.scorer)}${goalSuffix(event)}`:`a ${game.sport==='baseball'?'run':'scoring play'}`,team=safe(teamName(event.creditedId)||'the scoring side');return `${scorer} for ${team} in ${clock(event)}`};
  const narrative=[];
  if(goals.length===1)narrative.push(`The only ${game.sport==='baseball'?'run':'goal'} of the match came from ${describe(goals[0])}.`);
  else if(goals.length>1){
    narrative.push(`The scoring started with ${describe(goals[0])}; the last scoring event was ${describe(goals.at(-1))}.`);
    if(leadChanges||equalisers)narrative.push(`${leadChanges?`${leadChanges} lead change${leadChanges===1?'':'s'}`:''}${leadChanges&&equalisers?' and ':''}${equalisers?`${equalisers} equaliser${equalisers===1?'':'s'}`:''} appeared in the scoring sequence.`);
    const scoringTimeline=goals.map(event=>`${clock(event)} ${safe(event.scorer||teamName(event.creditedId)||'scoring play')}${goalSuffix(event)} (${event.runningScore})`).join(' · ');
    narrative.push(`Scoring timeline: ${scoringTimeline}.`);
  }
  if(game.sport==='soccer'&&goals.length){
    const timedGoals=goals.filter(event=>Number.isFinite(Number(event.minute))),firstHalf=timedGoals.filter(event=>Number(event.minute)<=45),lateGoals=timedGoals.filter(event=>Number(event.minute)>=75),halfTime=firstHalf.at(-1)?.runningScore;
    if(halfTime)narrative.push(`The first half ended with the score at ${halfTime}${firstHalf.length?`, after ${firstHalf.length} scoring moment${firstHalf.length===1?'':'s'}`:''}.`);
    if(lateGoals.length)narrative.push(`The closing phase stayed active: ${lateGoals.map(event=>describe(event)).join('; ')}.`);
    if(goals.length>=4)narrative.push(`${goals.length} goals made this a high-scoring match, with every scoring event retained above rather than reduced to a bare result.`);
  }
  const teams=game.summary?.boxscore?.teams||game.summary?.boxscore?.teamStats||[];
  const homeTeam=teams.find(team=>String(team.team?.id||team.id||'')===String(game.homeId)),awayTeam=teams.find(team=>String(team.team?.id||team.id||'')===String(game.awayId));
  const stat=(team,keys)=>{const row=(team?.statistics||team?.stats||[]).find(item=>keys.includes(String(item.name||item.label||'').toLowerCase().replace(/[^a-z]/g,'')));return row?.displayValue??row?.value??''};
  const statFacts=[];
  if(game.sport==='soccer'){
    const xgHome=stat(homeTeam,['expectedgoals','expectedgoal','xg','expectedgoalsxg']),xgAway=stat(awayTeam,['expectedgoals','expectedgoal','xg','expectedgoalsxg']),shotsHome=stat(homeTeam,['shots','totalshots','shotstotal']),shotsAway=stat(awayTeam,['shots','totalshots','shotstotal']),possessionHome=stat(homeTeam,['possession','possessionpct','possessionpercentage']),possessionAway=stat(awayTeam,['possession','possessionpct','possessionpercentage']);
    if(xgHome!==''||xgAway!=='')statFacts.push(`xG: ${safe(game.home)} ${safe(xgHome||'—')} · ${safe(game.away)} ${safe(xgAway||'—')}`);
    if(shotsHome!==''||shotsAway!=='')statFacts.push(`Shots: ${safe(game.home)} ${safe(shotsHome||'—')} · ${safe(game.away)} ${safe(shotsAway||'—')}`);
    if(possessionHome!==''||possessionAway!==''){const percentage=value=>value===''||value==='—'?value:String(value).includes('%')?value:`${value}%`;statFacts.push(`Possession: ${safe(game.home)} ${safe(percentage(possessionHome||'—'))} · ${safe(game.away)} ${safe(percentage(possessionAway||'—'))}`)}
    const extraStats=[
      ['Shots on target',['shotsontarget','shotsontargettotal','ontarget']],
      ['Big chances',['bigchances','bigchancescreated']],
      ['Big chances missed',['bigchancesmissed']],
      ['Touches in opposition box',['touchesinoppositionbox','touchesinopponentsbox','touchesinbox']],
      ['Passes',['totalpasses','passes','passescompleted']],
      ['Corners',['corners','cornerkicks']],
      ['Fouls',['foulscommitted','fouls']],
      ['Offsides',['offsides']],
      ['Saves',['saves']]
    ];
    const comparisonFacts=[];
    extraStats.forEach(([label,keys])=>{const home=stat(homeTeam,keys),away=stat(awayTeam,keys);if(home===''&&away==='')return;statFacts.push(`${label}: ${safe(game.home)} ${safe(home||'—')} · ${safe(game.away)} ${safe(away||'—')}`);comparisonFacts.push({label,home,away})});
    const numeric=value=>Number(String(value??'').replace(/[^\d.-]/g,''));
    const comparison=[];
    if(Number.isFinite(numeric(xgHome))&&Number.isFinite(numeric(xgAway))&&xgHome!==''&&xgAway!=='')comparison.push(`${safe(numeric(xgHome)>numeric(xgAway)?game.home:numeric(xgAway)>numeric(xgHome)?game.away:'Neither side')} ${numeric(xgHome)===numeric(xgAway)?'matched the other side on xG':`led xG ${safe(xgHome)}–${safe(xgAway)}`}`);
    if(Number.isFinite(numeric(shotsHome))&&Number.isFinite(numeric(shotsAway))&&shotsHome!==''&&shotsAway!=='')comparison.push(`${safe(numeric(shotsHome)>numeric(shotsAway)?game.home:numeric(shotsAway)>numeric(shotsHome)?game.away:'Both teams')} ${numeric(shotsHome)===numeric(shotsAway)?'finished level for shots':`had more shots, ${safe(shotsHome)}–${safe(shotsAway)}`}`);
    if(Number.isFinite(numeric(possessionHome))&&Number.isFinite(numeric(possessionAway))&&possessionHome!==''&&possessionAway!=='')comparison.push(`${safe(numeric(possessionHome)>numeric(possessionAway)?game.home:numeric(possessionAway)>numeric(possessionHome)?game.away:'The teams')} ${numeric(possessionHome)===numeric(possessionAway)?'shared possession evenly':`had more possession (${safe(possessionHome)}–${safe(possessionAway)})`}`);
    if(comparison.length)narrative.push(`Across the match, ${comparison.join('; ')}.`);
    const chanceFacts=comparisonFacts.filter(item=>/Shots on target|Big chances|Touches/.test(item.label)).filter(item=>Number.isFinite(numeric(item.home))&&Number.isFinite(numeric(item.away))&&numeric(item.home)!==numeric(item.away));
    if(chanceFacts.length){const emphasis=chanceFacts.slice(0,2).map(item=>`${safe(numeric(item.home)>numeric(item.away)?game.home:game.away)} led ${item.label.toLowerCase()} ${safe(item.home)}–${safe(item.away)}`).join('; ');narrative.push(`The deeper chance data adds context: ${emphasis}.`)}
  }
  const scorerRows=[
    [String(game.homeId),game.home,game.homeAbbr,game.homeLogo],
    [String(game.awayId),game.away,game.awayAbbr,game.awayLogo]
  ].map(([id,name,abbr,logo])=>{
    const entries=goals.filter(event=>event.creditedId===id);if(!entries.length)return '';
    return `<div><b>${logo?`<img src="${safe(logo)}" alt="">`:''}${safe(abbr||name)}</b><span>${entries.map(event=>`${safe(event.scorer||'Scoring play')} ${safe(clock(event))}${goalSuffix(event)}`).join(' · ')}</span></div>`;
  }).join('');
  return `<section class="match-summary ${safe(game.sport)}-summary" aria-label="Spoiler match summary"><header><span aria-hidden="true">◉</span><div><b>SUMMARY</b><small>PROVIDER-BASED MATCH RECAP</small></div></header><p class="match-summary-result">${result}</p>${narrative.map(paragraph=>`<p>${paragraph}</p>`).join('')}${scorerRows?`<div class="match-summary-scorers" aria-label="Goals and scoring plays">${scorerRows}</div>`:''}${statFacts.length?`<ul class="match-summary-facts">${statFacts.map(fact=>`<li>${fact}</li>`).join('')}</ul>`:''}<footer>Built from the loaded match events and statistics.</footer></section>`;
}
const baseballScorecard=game=>{
  const safe=value=>lineupEscape(value);
  const recap=game.mlbRecap,innings=recap?.innings||[];
  if(!recap&&!Number.isFinite(game.homeScore)&&!Number.isFinite(game.awayScore))return '';
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const displayInnings=Array.from({length:9},(_,index)=>{
    const values=innings.length>9&&index===8?innings.slice(8):innings[index]?[innings[index]]:[];
    return {label:index===8&&innings.length>9?'9+':String(index+1),away:values.length?values.reduce((sum,inning)=>sum+number(inning.away),0):'—',home:values.length?values.reduce((sum,inning)=>sum+number(inning.home),0):'—'};
  });
  const teamCell=(name,abbr,logo)=>`<th class="sport-scorecard-team baseball-scorecard-team" scope="row" aria-label="${safe(name)}"><span class="sport-scorecard-identity">${logo?`<img src="${safe(logo)}" alt="${safe(name)}">`:`<b>${safe(abbr)}</b>`}</span></th>`;
  const row=(name,abbr,logo,side,totals)=>`<tr>${teamCell(name,abbr,logo)}${displayInnings.map(inning=>`<td>${inning[side]}</td>`).join('')}<td class="baseball-total">${totals?.runs??'—'}</td><td class="baseball-total">${totals?.hits??'—'}</td><td class="baseball-total">${totals?.errors??'—'}</td></tr>`;
  const decisions=[['W',recap?.winner,recap?.winnerLine],['L',recap?.loser,recap?.loserLine],['SV',recap?.save,recap?.saveLine]].filter(([,name])=>name).map(([label,name,line])=>`<div class="baseball-decision"><b>${label}</b><span><strong>${name}</strong>${line?`<small>${line}</small>`:''}</span></div>`).join('');
  const ordinal=inning=>{const value=Number(inning),tail=value%100;return `${value}${tail>=11&&tail<=13?'th':value%10===1?'st':value%10===2?'nd':value%10===3?'rd':'th'}`};
  const homers=(recap?.homeRuns||[]).map(homeRun=>{const teamId=String(homeRun.teamId||''),home=teamId===String(game.homeId),logo=home?game.homeLogo:game.awayLogo,name=home?game.home:game.away,detail=[homeRun.inning&&`${ordinal(homeRun.inning)} inning`,homeRun.total>1&&`${homeRun.total}-run`,Number.isFinite(homeRun.seasonHomeRuns)&&`${homeRun.seasonHomeRuns} HR this season`].filter(Boolean).join(' · ');return `<li>${logo?`<img src="${logo}" alt="${name}" title="${name}">`:''}<span><strong>${homeRun.batter||'Home run'}</strong>${detail?`<small>${detail}</small>`:''}</span></li>`}).join('');
  const lineScore=`<div class="sport-scorecard-scroll"><table class="baseball-linescore" aria-label="Inning-by-inning score"><thead><tr><th scope="col">TEAM</th>${displayInnings.map(inning=>`<th scope="col">${inning.label}</th>`).join('')}<th class="baseball-totals-start" scope="col" title="Runs">R</th><th scope="col" title="Hits">H</th><th scope="col" title="Errors">E</th></tr></thead><tbody>${row(game.away,game.awayAbbr||game.away,game.awayLogo,'away',recap?.away)}${row(game.home,game.homeAbbr||game.home,game.homeLogo,'home',recap?.home)}</tbody></table></div>`;
  return `<section class="baseball-scorecard sport-scorecard" aria-label="Baseball scorecard"><header><b>LINE SCORE</b><small>INNINGS · RUNS · HITS · ERRORS</small></header>${lineScore}${decisions||homers?`<div class="baseball-recap-meta">${decisions?`<div class="baseball-decisions" aria-label="Pitching decisions">${decisions}</div>`:''}${homers?`<div class="baseball-homers"><b>HOME RUNS</b><ul>${homers}</ul></div>`:''}</div>`:''}</section>`;
};
const footballScorecard=game=>{
  const safe=value=>lineupEscape(value);
  // The enriched ESPN summary, not the lightweight scoreboard event, contains
  // the reliable per-quarter linescores for many completed NFL games.
  const competition=game.summary?.header?.competitions?.[0]||game.raw?.competitions?.[0],competitors=competition?.competitors||[],side=id=>competitors.find(item=>String(item.team?.id||item.id||'')===String(id)),home=side(game.homeId),away=side(game.awayId);
  let homeLines=home?.linescores||[],awayLines=away?.linescores||[],length=Math.max(homeLines.length,awayLines.length);
  if(!length){
    // Some summaries omit the line score but still provide cumulative scores
    // for each scoring play. Reconstruct each quarter from those official
    // score changes so the scorecard does not vanish.
    const clockSeconds=value=>{const match=String(value||'').match(/^(\d+):(\d{2})$/);return match?Number(match[1])*60+Number(match[2]):-1};
    const scoring=(game.events||[]).filter(event=>event.type==='score'&&Number(event.period)>0&&Number.isFinite(Number(event.homeScore))&&Number.isFinite(Number(event.awayScore))).slice().sort((a,b)=>(Number(a.period)-Number(b.period))||clockSeconds(b.clock)-clockSeconds(a.clock));
    if(!scoring.length)return '';
    const periodCount=Math.max(4,...scoring.map(event=>Number(event.period))),latestByPeriod=new Map();
    scoring.forEach(event=>latestByPeriod.set(Number(event.period),{home:Number(event.homeScore),away:Number(event.awayScore)}));
    let previous={home:0,away:0};
    homeLines=[];awayLines=[];
    for(let period=1;period<=periodCount;period++){
      const current=latestByPeriod.get(period)||previous;
      homeLines.push({displayValue:current.home-previous.home});
      awayLines.push({displayValue:current.away-previous.away});
      previous=current;
    }
    length=periodCount;
  }
  if(!length)return '';
  const points=line=>line?.displayValue??line?.value??line?.score??'—';
  const periodLabel=index=>index<4?`Q${index+1}`:index===4?'OT':`${index-3}OT`;
  const teamCell=(name,abbr,logo)=>`<th class="sport-scorecard-team football-scorecard-team" scope="row" aria-label="${safe(name)}"><span class="sport-scorecard-identity">${logo?`<img src="${safe(logo)}" alt="${safe(name)}">`:`<b>${safe(abbr)}</b>`}</span></th>`;
  const row=(name,abbr,logo,lines,total)=>`<tr>${teamCell(name,abbr,logo)}${Array.from({length},(_,index)=>`<td>${points(lines[index])}</td>`).join('')}<td class="football-total">${total??'—'}</td></tr>`;
  return `<section class="football-scorecard sport-scorecard" aria-label="Football scorecard"><header><b>SCORING BY QUARTER</b><small>FINAL LINE</small></header><div class="sport-scorecard-scroll"><table class="football-linescore"><thead><tr><th scope="col">TEAM</th>${Array.from({length},(_,index)=>`<th scope="col">${periodLabel(index)}</th>`).join('')}<th scope="col">T</th></tr></thead><tbody>${row(game.away,game.awayAbbr||game.away,game.awayLogo,awayLines,game.awayScore)}${row(game.home,game.homeAbbr||game.home,game.homeLogo,homeLines,game.homeScore)}</tbody></table></div></section>`;
};
const applyStatBadgeContrast=root=>root.querySelectorAll('.stat-lead:not([data-contrast])').forEach(badge=>{const hex=badge.style.getPropertyValue('--team').replace('#','');if(!/^[0-9a-f]{6}$/i.test(hex))return;const [r,g,b]=[0,2,4].map(index=>parseInt(hex.slice(index,index+2),16));const luminance=(.2126*r+.7152*g+.0722*b)/255;badge.style.setProperty('--team-ink',luminance>.6?'#11110f':'#f3efe5');badge.dataset.contrast='true'});
new MutationObserver(()=>{applyStatBadgeContrast(listShell);applyStatBadgeContrast(info)}).observe(document.body,{childList:true,subtree:true});
const stampCountdown=game=>{const minutes=Math.max(0,Math.round((game.time-Date.now())/60000));if(minutes<60)return `${Math.max(1,minutes)}m`;if(minutes<1440)return `${Math.ceil(minutes/60)}h`;return `${Math.ceil(minutes/1440)}d`};
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game),stamp=card.querySelector(':scope > strong');if(!game||!stamp)return;card.tabIndex=0;stamp.classList.add('match-stamp');const league=stamp.querySelector('.stamp-league')?.outerHTML||'';if(game.live){stamp.classList.add('live');stamp.dataset.label='';const label=`<span class="live-stamp-label">LIVE</span>${league}`;if(stamp.innerHTML!==label)stamp.innerHTML=label}else if(game.completed){stamp.classList.add('past');stamp.dataset.label='';const meta=card.querySelector('.list-meta small'),markup=cardDateMarkup(game.time);if(meta&&meta.innerHTML!==markup)meta.innerHTML=markup}else{stamp.classList.add('future');stamp.dataset.label='';const label=`<i>IN</i><b>${stampCountdown(game)}</b>${league}`;if(stamp.innerHTML!==label)stamp.innerHTML=label;const meta=card.querySelector('.list-meta small'),markup=cardDateMarkup(game.time);if(meta&&meta.innerHTML!==markup)meta.innerHTML=markup}})).observe(listShell,{childList:true,subtree:true});
const refreshTimeUI=async()=>{
  if(plot){plot.now=new Date();plot.render()}
  await EPLData.refresh(games);
  const live=games.filter(game=>game.live&&!game.completed),upcoming=games.filter(game=>!game.completed&&!game.live&&game.time>Date.now()).sort((a,b)=>a.time-b.time),lineupHorizon=Date.now()+3*60*60*1000,refreshable=[...live,...upcoming.filter(game=>game.sport!=='baseball'||game.time<=lineupHorizon).slice(0,6)];
  if(refreshable.length)await Promise.all(refreshable.map(game=>EPLData.enrich(game,{refresh:true})));
  listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game);if(!game)return;card.classList.toggle('live-game',!!game.live);if(!game.live)card.querySelector('.live-indicator')?.remove();if(game.__showLiveInfo)card.querySelector('.live-match-info')?.remove()});
  decorateCards();
  listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game),relative=card.querySelector('.list-meta>b');if(game&&relative)relative.textContent=game.live?'IN PROGRESS':timeAway(game)});
  plot?.render();
};
window.setInterval(()=>{if(!matchRouteId)refreshTimeUI()},60*1000);
const INITIAL_LIST_SIDE_LIMIT=30,LIST_PAGE_SIZE=40;
let listPastLimit=INITIAL_LIST_SIDE_LIMIT,listFutureLimit=INITIAL_LIST_SIDE_LIMIT;
renderList=function(){
  if(!games.length)return;
  const visible=games.filter(game=>gameIsSelected(game)&&(activeLeague!=='international'||internationalCompetition==='all'||game.competition===internationalCompetition)).sort((a,b)=>a.time-b.time),now=Date.now(),allPast=visible.filter(game=>!game.live&&game.time<now),live=visible.filter(game=>game.live),allFuture=visible.filter(game=>!game.live&&game.time>=now),past=allPast.slice(-listPastLimit),future=allFuture.slice(0,listFutureLimit);
  const dateRows=items=>{let last='';return items.map(game=>{const day=game.time.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}),heading=day===last?'':`<h2 class="list-date">${day}</h2>`;last=day;return heading+listRow(game)}).join('')};
  const pastMarker='<div class="list-now live-divider-past" id="list-now"><span>PAST MATCHES <b>↑</b></span></div>',futureMarker='<div class="list-now live-divider-future"><span><b>↓</b> UPCOMING MATCHES</span></div>';
  const hasHiddenFuture=!future.length&&games.some(game=>!game.live&&game.time>=now);
  const futureEmpty=hasHiddenFuture?'<p class="fixture-filter-note">No upcoming fixtures match your selected teams. <button type="button" data-adjust-teams>EDIT TEAMS</button></p>':'';
  const older=allPast.length>past.length?`<button type="button" class="fixture-page-control" data-load-older>SHOW ${Math.min(LIST_PAGE_SIZE,allPast.length-past.length)} EARLIER MATCHES</button>`:'',later=allFuture.length>future.length?`<button type="button" class="fixture-page-control" data-load-later>SHOW ${Math.min(LIST_PAGE_SIZE,allFuture.length-future.length)} LATER MATCHES</button>`:'';
  listShell.innerHTML=live.length?`${older}${dateRows(past)}${pastMarker}${dateRows(live)}${futureMarker}${futureEmpty}${dateRows(future)}${later}`:`${older}${dateRows(past)}${pastMarker}${futureMarker}${futureEmpty}${dateRows(future)}${later}`;
  listShell.querySelector('[data-load-older]')?.addEventListener('click',()=>{listPastLimit+=LIST_PAGE_SIZE;renderList()});
  listShell.querySelector('[data-load-later]')?.addEventListener('click',()=>{listFutureLimit+=LIST_PAGE_SIZE;renderList()});
  listShell.querySelector('[data-adjust-teams]')?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openTeamSelector()});
  listShell.querySelectorAll('[data-game]').forEach(card=>card.onclick=event=>{
    const game=games.find(item=>item.id===card.dataset.game);
    if(!game)return;
    if(event.target.closest('[data-results]')){
      game.__showResults=true;
      renderList();
      return;
    }
    // Meter, lineup, standings and highlight controls own their clicks.  A
    // normal completed-card click must never trigger a second meter refresh:
    // it causes a visual nudge and can redraw the hidden state over a reveal.
    if(event.target.closest('button,a,input,label,[role="tab"]'))return;
  });
};
const cardDateMarkup=time=>{
  const date=time.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  const clock=time.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  return `<span>${date}</span><time>${clock}</time>`;
};
const fitTeamNames=root=>root.querySelectorAll('.team-name').forEach(name=>{
  let size=Number.parseFloat(getComputedStyle(name).fontSize)||20;
  // Club names are allowed two calm, readable lines. Only names that would
  // need a third line scale down, so a narrow card never cuts a word in half.
  const minimum=10;
  name.style.removeProperty('font-size');
  size=Number.parseFloat(getComputedStyle(name).fontSize)||size;
  while(size>minimum&&(name.scrollWidth>name.clientWidth+1||name.scrollHeight>name.clientHeight+1)){
    size-=.5;
    name.style.setProperty('font-size',`${size}px`,'important');
  }
});
const eplMatchday=game=>{
  if(game.leagueId!=='epl')return null;
  const providerRound=Number(game.matchday);
  if(Number.isFinite(providerRound)&&providerRound>=1&&providerRound<=38)return providerRound;
  // ESPN's `week.number` on this scoreboard window is a competition-stage
  // value (and is currently 1 for later EPL fixtures), not the league round.
  // The official opening weekend is present in our season window, so derive
  // the round from its actual seven-day fixture cadence instead.
  const seasonYear=game.raw?.season?.year;
  const seasonGames=games
    .filter(item=>item.leagueId==='epl'&&(!seasonYear||item.raw?.season?.year===seasonYear))
    .sort((left,right)=>left.time-right.time);
  const opener=seasonGames[0]?.time;
  if(!opener)return null;
  const calendarDay=value=>Date.UTC(value.getFullYear(),value.getMonth(),value.getDate());
  const days=Math.floor((calendarDay(game.time)-calendarDay(opener))/864e5);
  const round=Math.floor(days/7)+1;
  return round>=1&&round<=38?round:null;
};
listRow=function(game){
  const meterScore=Number(game.scoreResult?.watchScore);
  const revealed=game.completed&&game.__mwRevealed&&Number.isFinite(meterScore);
  const calculating=game.completed&&game.__watchCalculating;
  const stamp=game.live?'<span class="live-stamp-label">LIVE</span>':game.completed?(revealed?String(Math.round(meterScore)):calculating?'<span class="score-pending" role="status" aria-label="Calculating Spoil Meter"><i class="score-spinner" aria-hidden="true"></i><em>···</em></span>':'?'):'';
  const state=game.live?'live':game.completed?'past':'future';
  const scoreMessage='';
  const team=(side,name,logo)=>`<span class="${side}-team"><img src="${logo||''}" alt=""><b class="team-name" title="${name}">${name}</b></span>`;
  const anticipation=game.anticipationBreakdown||{};
  const preview=!game.completed&&!game.live?`<small class="match-preview">COMPETITIVENESS ${anticipation.competitiveness??'—'} · CONTEXT ${anticipation.tableContext??'—'} · TIMING ${anticipation.seasonTiming??'—'}</small>`:'';
  const sportScorecard=game.sport==='baseball'?baseballScorecard(game):game.sport==='football'?footballScorecard(game):'';
  const details=game.__showResults?`${sportScorecard}<div class="incident-list list-incidents">${incidentTimeline(game)}</div>`:'';
  // The competition mark shares the score/countdown stamp in the combined feed.
  // It is a local asset so this cue remains available even if a provider is down.
  const leagueStamp=activeLeague==='all'&&game.leagueLogo
    ?`<span class="stamp-league" title="${game.league||''}" aria-label="${game.league||''}"><img src="${game.leagueLogo}" alt="${game.league||''}"></span>`
    :'';
  const round=eplMatchday(game);
  const matchday=game.leagueId==='epl'&&Number.isFinite(round)?`<small class="card-matchday">MATCHDAY ${round}</small>`:game.competitionLabel?`<small class="card-matchday competition-label">${game.competitionLabel}</small>`:'';
  const formShown=!!game.__showForm||futureFormSpoilers.has(String(game.id));
  const formToggle=!game.completed&&!game.live?`<label class="form-spoiler-toggle"><input type="checkbox" data-form-spoilers aria-label="Show records and standings" ${formShown?'checked':''}><span class="form-spoiler-show">SPOILER</span><span class="form-spoiler-hide">HIDE</span></label>`:'';
  return `<article class="list-game ${state} ${game.sport==='football'?'football-game':''} ${game.__showResults?'spoiled':''} ${formShown?'form-spoilers':''} ${calculating?'score-calculating':''} ${game.__lineupSpoilers?'lineup-spoilers':''}" data-game="${game.id}"><strong aria-hidden="${game.completed?'false':'true'}">${stamp}${leagueStamp}</strong><div class="list-content"><div class="list-teams">${team('home',game.home,game.homeLogo)}${team('away',game.away,game.awayLogo)}</div>${scoreMessage?`<small class="score-message">${scoreMessage}</small>`:''}${preview}${details}</div><div class="list-meta"><b>${game.live?'IN PROGRESS':timeAway(game)}</b><small class="match-datetime">${cardDateMarkup(game.time)}</small>${matchday}${formToggle}${revealed&&!game.__showResults?'<button data-results title="Hold for half a second to reveal spoilers">SPOIL ME</button>':''}</div></article>`;
};
const formItemFromEvent=(event,teamId)=>{
  const competition=event?.competitions?.[0]||event?.competition||{},teams=competition.competitors||event?.competitors||[],team=teams.find(item=>String(item.team?.id||item.id||'')===String(teamId)),opponent=teams.find(item=>String(item.team?.id||item.id||'')!==String(teamId));
  const completed=event?.status?.type?.completed===true||competition?.status?.type?.completed===true;
  const scoreValue=side=>side?.score?.displayValue??side?.score?.value??side?.score;
  const ownScore=standingNumber(scoreValue(team)),opponentScore=standingNumber(scoreValue(opponent));
  if(!team||!opponent||!completed||ownScore===null||opponentScore===null)return null;
  return {id:String(event.id||`${event.date||''}:${teamId}`),time:new Date(event.date||competition.date||0).getTime(),result:ownScore>opponentScore?'W':ownScore===opponentScore?'D':'L',score:`${ownScore}–${opponentScore}`,venue:team.homeAway==='home'?'H':'A',opponent:opponent.team?.displayName||opponent.team?.name||'Opponent',abbr:opponent.team?.abbreviation||opponent.team?.shortDisplayName||opponent.team?.displayName||'OPP',logo:opponent.team?.logo||opponent.team?.logos?.[0]?.href||''};
};
const localTeamForm=(game,teamId)=>games.filter(item=>item.completed&&item.time<=game.time&&(String(item.homeId)===String(teamId)||String(item.awayId)===String(teamId))).map(item=>{
  const home=String(item.homeId)===String(teamId),ownScore=home?item.homeScore:item.awayScore,opponentScore=home?item.awayScore:item.homeScore;
  if(!Number.isFinite(ownScore)||!Number.isFinite(opponentScore))return null;
  return {id:String(item.id),time:item.time,result:ownScore>opponentScore?'W':ownScore===opponentScore?'D':'L',score:`${ownScore}–${opponentScore}`,venue:home?'H':'A',opponent:home?item.away:item.home,abbr:home?(item.awayAbbr||item.away):(item.homeAbbr||item.home),logo:home?item.awayLogo:item.homeLogo};
}).filter(Boolean).sort((left,right)=>right.time-left.time).slice(0,5);
const mlbFormItemFromEvent=(event,teamId)=>{
  const home=event?.teams?.home,away=event?.teams?.away,team=String(home?.team?.id)===String(teamId)?home:String(away?.team?.id)===String(teamId)?away:null,opponent=team===home?away:home;
  const complete=/final/i.test(String(event?.status?.abstractGameState||event?.status?.detailedState||''));
  const ownScore=standingNumber(team?.score),opponentScore=standingNumber(opponent?.score);
  if(!team||!opponent||!complete||ownScore===null||opponentScore===null)return null;
  const opponentTeam=opponent.team||{};
  return {id:String(event.gamePk||event.gameGuid||`${event.gameDate||''}:${teamId}`),time:new Date(event.gameDate||0).getTime(),result:ownScore>opponentScore?'W':ownScore===opponentScore?'D':'L',score:`${ownScore}–${opponentScore}`,venue:team===home?'H':'A',opponent:opponentTeam.name||'Opponent',abbr:opponentTeam.abbreviation||opponentTeam.teamCode||opponentTeam.name||'OPP',logo:opponentTeam.id?`https://www.mlbstatic.com/team-logos/${opponentTeam.id}.svg`:''};
};
async function loadMlbTeamForm(game,teamId){
  const fallback=()=>localTeamForm(game,teamId),season=game.time.getUTCFullYear(),key=`mlb:${teamId}:${season}:${game.id}`;
  if(!teamId)return fallback();
  if(!teamFormRequests.has(key))teamFormRequests.set(key,(async()=>{
    try{
      const endDate=new Date(game.time).toISOString().slice(0,10),endpoint=`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${encodeURIComponent(teamId)}&gameType=R&startDate=${season}-03-01&endDate=${endDate}&hydrate=team`,response=await fetch(endpoint),payload=response.ok?await response.json():null;
      const form=(payload?.dates||[]).flatMap(date=>date.games||[]).map(event=>mlbFormItemFromEvent(event,teamId)).filter(Boolean).sort((left,right)=>right.time-left.time).slice(0,5);
      return form.length?form:fallback();
    }catch(_){return fallback()}
  })());
  return teamFormRequests.get(key);
}
async function loadTeamForm(game,teamId){
  const fallback=()=>localTeamForm(game,teamId),league=EPLData.leagues[game.leagueId],providerSlug=game.espnLeague||league?.slug,season=Number(game.raw?.season?.year)||game.time.getFullYear(),key=`${providerSlug||game.leagueId}:${teamId}:${season}`;
  if(game.sport==='baseball')return loadMlbTeamForm(game,teamId);
  if(game.sport!=='soccer'||!league||!teamId)return fallback();
  if(!teamFormRequests.has(key))teamFormRequests.set(key,(async()=>{
    try{
      const endpoint=`https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${providerSlug}/teams/${teamId}/schedule`,response=await fetch(endpoint),payload=response.ok?await response.json():null;
      const form=[...new Map((payload?.events||[]).map(event=>formItemFromEvent(event,teamId)).filter(Boolean).map(item=>[item.id,item])).values()].sort((left,right)=>right.time-left.time).slice(0,5);
      return form.length?form:fallback();
    }catch(_){return fallback()}
  })());
  return teamFormRequests.get(key);
}
async function loadTeamForms(game){
  if(game.__teamForm)return game.__teamForm;
  game.__teamFormLoading=true;
  const [home,away]=await Promise.all([loadTeamForm(game,game.homeId),loadTeamForm(game,game.awayId)]);
  game.__teamForm={home,away};game.__teamFormLoading=false;
  return game.__teamForm;
}
const embeddedStandingRows=game=>{
  const groups=game.summary?.standings?.groups||[];
  const entries=groups.flatMap(group=>group?.standings?.entries||[]);
  if(!entries.length)return [];
  const rows=entries.map(entry=>{
    const value=names=>standingStat(entry,names),team=typeof entry.team==='object'?entry.team:{},id=String(team.id||entry.id||''),name=team.displayName||team.name||entry.team||'',wins=value(['wins']),draws=value(['ties','draws']),losses=value(['losses']),gp=value(['gamesplayed','games','matchesplayed'])||((standingNumber(wins)??0)+(standingNumber(draws)??0)+(standingNumber(losses)??0));
    const logo=team.logos?.[0]?.href||team.logo||entry.logo?.[0]?.href||entry.logo?.href||'';
    return {id,name,abbr:team.abbreviation||team.shortDisplayName||name,logo,rank:standingNumber(value(['leaguerank','rank','playoffseed','divisionrank'])),gp,wins,draws,losses,for:value(['pointsfor','goalsfor','goals']),against:value(['pointsagainst','goalsagainst','goalsconceded']),gd:value(['pointdifferential','goaldifference','differential']),points:value(['points','leaguepoints']),pct:value(['winpercent','winpercentage','winningpercentage','winpct','percentage']),gamesBack:value(['gamesbehind','gamesback','gb']),leagueId:game.leagueId};
  }).filter(row=>row.name);
  return rows.sort((left,right)=>(left.rank??999)-(right.rank??999));
};
const leagueTableMarkup=game=>{
  const key=standingsKey(game),embedded=embeddedStandingRows(game),rows=(leagueStandings[key]?.length?leagueStandings[key]:embedded);
  if(embedded.length&&!leagueStandings[key]){leagueStandings[key]=embedded;applyStandingRows(embedded)}
  if(!rows.length)return `<p class="spoiler-empty">${game.__leagueTableLoading?'Loading official league table…':'Official league table is not available for this competition.'}</p>`;
  const safe=value=>lineupEscape(value);
  const cell=value=>value===''||value===null||value===undefined?'—':safe(value);
  const columns=game.sport==='baseball'?[['GP','gp'],['W','wins'],['L','losses'],['GB','gamesBack'],['PCT','pct'],['R','for'],['RA','against'],['DIFF','gd']]:game.sport==='football'?[['GP','gp'],['W','wins'],['L','losses'],['T','draws'],['PF','for'],['PA','against'],['DIFF','gd'],['PCT','pct']]:[['GP','gp'],['W','wins'],['D','draws'],['L','losses'],['+','for'],['−','against'],['GD','gd'],['PTS','points']];
  const finalColumn=columns.at(-1)?.[1];
  const table=entries=>`<div class="league-table-scroll"><table><thead><tr><th>#</th><th>TEAM</th>${columns.map(([label])=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${entries.map(row=>{const side=String(row.id)===String(game.homeId)||row.name===game.home?'home':String(row.id)===String(game.awayId)||row.name===game.away?'away':'';const colour=side==='home'?game.homeColor:game.awayColor;return `<tr class="${side?`is-${side}`:''}" ${side?`style="--table-team:${safe(colour)}"`:''}><td>${cell(row.rank)}</td><th scope="row">${row.logo?`<img src="${safe(row.logo)}" alt="">`:''}<span title="${safe(row.name)}">${safe(row.abbr)}</span></th>${columns.map(([,key])=>`<td>${key===finalColumn?`<b>${cell(row[key])}</b>`:cell(row[key])}</td>`).join('')}</tr>`}).join('')}</tbody></table></div>`;
  const divisional=['baseball','football'].includes(game.sport),teamDivisions=new Set(rows.filter(row=>String(row.id)===String(game.homeId)||String(row.id)===String(game.awayId)).map(row=>row.division).filter(Boolean));
  const groups=divisional?[...teamDivisions].map(division=>[division,rows.filter(row=>row.division===division)]).filter(([,entries])=>entries.length):[];
  const body=groups.length?groups.map(([division,entries])=>`<section class="division-table"><b>${safe(division)}</b>${table(entries)}</section>`).join(''):table(rows);
  return `<section class="league-table ${safe(game.sport)}-league-table" aria-label="${safe(tableLeagueLabel(game))} league table"><header><b>${safe(tableLeagueLabel(game))} ${divisional?'DIVISION STANDINGS':'TABLE'}</b><small>THE TWO TEAMS ARE HIGHLIGHTED</small></header>${body}</section>`;
};
const teamFormMarkup=(game,name,logo,items)=>{
  const safe=value=>lineupEscape(value);
  if(!items?.length)return `<section class="team-form"><header>${logo?`<img src="${safe(logo)}" alt="">`:''}<div><b>${safe(name)}</b><small>LAST FIVE RESULTS</small></div></header><p>No completed results are available in the provider feed.</p></section>`;
  return `<section class="team-form"><header>${logo?`<img src="${safe(logo)}" alt="">`:''}<div><b>${safe(name)}</b><small>LAST ${items.length} RESULTS</small></div></header><ol>${items.map(item=>`<li class="form-${item.result.toLowerCase()}"><b>${item.result}</b><span>${item.logo?`<img src="${safe(item.logo)}" alt="">`:''}<strong>${safe(item.abbr)}</strong><small>${safe(item.venue)} · ${safe(item.score)}</small></span></li>`).join('')}</ol></section>`;
};
const formMarkup=game=>game.__teamForm?`<section class="match-form" aria-label="Recent team form">${teamFormMarkup(game,game.home,game.homeLogo,game.__teamForm.home)}${teamFormMarkup(game,game.away,game.awayLogo,game.__teamForm.away)}</section>`:`<p class="spoiler-empty">${game.__teamFormLoading?'Loading each team’s last five official results…':'Recent team form is not available yet.'}</p>`;
const resultWorkspaceMarkup=(game,{includeScorecard=true}={})=>{
  const tabs=['lineup','stats','moments','summary',...(game.competition==='friendly'?[]:['table']),'form'];
  const tab=tabs.includes(game.__resultTab)?game.__resultTab:'lineup';
  if(tab==='lineup')game.__lineupSpoilers=true;
  const scorecard=includeScorecard?(game.sport==='baseball'?baseballScorecard(game):game.sport==='football'?footballScorecard(game):game.sport==='soccer'?soccerResultCard(game):''):'';
  const stats=boxScoreMarkup(game)||'<p class="spoiler-empty">Official match statistics are not available for this game.</p>';
  const content=tab==='stats'?stats:tab==='moments'?`<div class="incident-list list-incidents">${incidentTimeline(game)}</div>`:tab==='summary'?matchSummaryMarkup(game):tab==='table'?leagueTableMarkup(game):tab==='form'?formMarkup(game):`<section class="spoiler-lineup spoiler-lineup-events" aria-label="Lineups with match events">${rosterMarkup(game)}</section>`;
  const button=name=>`<button type="button" role="tab" data-result-tab="${name}" aria-selected="${tab===name}" class="${tab===name?'active':''}">${name.toUpperCase()}</button>`;
  return `<section class="spoiler-workspace" aria-label="Spoiler match details">${scorecard}<div class="spoiler-tabs" style="--spoiler-tab-count:${tabs.length}" role="tablist" aria-label="Spoiler details">${tabs.map(button).join('')}</div><div class="spoiler-panel" role="tabpanel">${content}</div></section>`;
};
const scheduleHref=game=>{const url=new URL(location.href);url.searchParams.set('league',activeLeague);if(activeLeagueIds.size>1)url.searchParams.set('leagues',[...activeLeagueIds].join(','));else url.searchParams.delete('leagues');if(activeLeague==='international')url.searchParams.set('international',internationalCompetition);url.searchParams.delete('match');return url.toString()};
const matchPageTeamContext=(game,side)=>{
  const name=side==='home'?game.home:game.away,row=teamTable[teamTableKey(game.leagueId,name)];
  if(!row)return '<small class="match-page-team-context is-loading">STANDINGS LOADING</small>';
  const values=game.sport==='soccer'?[row.wins,row.draws,row.losses]:game.sport==='football'?[row.wins,row.losses,row.draws]:[row.wins,row.losses];
  const record=values.every(Number.isFinite)?values.join('–'):'';
  const standing=Number.isFinite(row.rank)?`${ordinal(row.rank)} IN ${tableLeagueLabel(game)}`:'';
  return `<small class="match-page-team-context">${record?`<b>${lineupEscape(record)}</b>`:''}${standing?`<i>${lineupEscape(standing)}</i>`:''}</small>`;
};
const matchPageMeter=game=>{
  const result=game.__meterScore||game.scoreResult||WatchScore.score(game),score=Math.round(Number(result?.watchScore));
  if(!Number.isFinite(score))return '';
  const band=score>=80?4:score>=65?3:score>=45?2:score>=25?1:0;
  const label=score>=80?'MUST WATCH':score>=65?'WORTH IT':score>=45?'YOUR CALL':score>=25?'SAVE YOUR 90':"DON'T BOTHER";
  return `<span class="match-page-meter" data-meter-band="${band}" aria-label="Spoil Meter: ${lineupEscape(label)}, ${score} out of 100"><b>${score}</b><i>${lineupEscape(label)}</i></span>`;
};
const matchPageMarkup=game=>{
  const safe=value=>lineupEscape(value),score=game.homeScore===null||game.homeScore===undefined?'—':`${game.homeScore}–${game.awayScore??'—'}`;
  const date=game.time.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}),time=game.time.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  const scorers=game.sport==='soccer'?`<div class="match-page-scorers">${soccerGoalLists(game)}</div>`:'';
  return `<article class="match-page-card" data-game="${safe(game.id)}"><header class="match-page-top"><a href="${safe(scheduleHref(game))}" data-match-back>← ALL MATCHES</a><div class="match-page-nav-meta">${matchPageMeter(game)}<span class="match-page-league">${game.leagueLogo?`<img src="${safe(game.leagueLogo)}" alt="">`:''}${safe(game.league||'MATCH')}</span></div></header><section class="match-page-hero"><div class="match-page-team home">${game.homeLogo?`<img src="${safe(game.homeLogo)}" alt="">`:''}<b>${safe(game.home)}</b>${matchPageTeamContext(game,'home')}</div><div class="match-page-final"><strong>${score}</strong><small>FULL TIME</small><time>${safe(date)} · ${safe(time)}</time></div><div class="match-page-team away">${game.awayLogo?`<img src="${safe(game.awayLogo)}" alt="">`:''}<b>${safe(game.away)}</b>${matchPageTeamContext(game,'away')}</div></section>${scorers}<div class="match-page-actions">${highlightMarkup(game)}</div>${resultWorkspaceMarkup(game,{includeScorecard:['baseball','football'].includes(game.sport)})}</article>`;
};
const renderMatchPage=game=>{
  // Tab and lineup changes replace only this focused page. Preserve the reader's
  // position so a click never feels like the old card expansion has nudged it.
  const scrollY=window.scrollY;
  matchPage.innerHTML=matchPageMarkup(game);
  matchPage.hidden=false;
  applyStatBadgeContrast(matchPage);
  requestAnimationFrame(()=>window.scrollTo(0,scrollY));
};
// The cached match route opens before its detailed lineup request finishes.
// Keep that first paint instant, then refresh the focused Lineup tab once its
// events, flags, and portrait fallbacks are all available.
const hydrateMatchLineup=game=>{
  if(game.sport!=='soccer')return Promise.resolve(game);
  if(game._matchLineupHydration)return game._matchLineupHydration;
  const request=EPLData.enrich(game,{refresh:true,lineup:true})
    .then(()=>Promise.all([hydrateRosterFlags(game),hydrateRosterPortraits(game)]))
    .then(()=>game)
    .catch(()=>game)
    .finally(()=>{if(game._matchLineupHydration===request)game._matchLineupHydration=null});
  game._matchLineupHydration=request;
  return request;
};
const closeCachedMatchPage=()=>{
  document.documentElement.classList.remove('view-match');
  document.body.classList.remove('view-match');
  matchPage.hidden=true;
  listShell.hidden=false;
  plotShell.hidden=true;
  requestAnimationFrame(()=>fitTeamNames(listShell));
};
const openCachedMatchPage=(game,card)=>{
  const url=matchHref(game,card);
  history.pushState({spoilMatch:String(game.id)},'',url);
  document.documentElement.classList.add('view-match');
  document.body.classList.add('view-match');
  plotShell.hidden=true;
  listShell.hidden=true;
  game.__resultTab='lineup';
  renderMatchPage(game);
  fetchLeagueStandings(EPLData.leagues[game.leagueId],game.espnLeague).finally(()=>renderMatchPage(game));
  // The schedule remains mounted underneath the focused route. Refresh only
  // the selected game so return is instant while its richer detail arrives.
  hydrateMatchLineup(game).finally(()=>renderMatchPage(game));
};
window.addEventListener('popstate',()=>{
  if(!new URL(location.href).searchParams.get('match'))closeCachedMatchPage();
});
matchPage.addEventListener('click',event=>{
  const back=event.target.closest('[data-match-back]');
  if(back){
    event.preventDefault();
    // A client-side spoiler route leaves the schedule mounted underneath it.
    // Browser back therefore restores the exact same list and scroll state.
    if(history.state?.spoilMatch){history.back();return}
    location.assign(back.href);return;
  }
  const card=event.target.closest('[data-game]'),game=card&&games.find(item=>String(item.id)===String(card.dataset.game));
  if(!game)return;
  const button=event.target.closest('[data-result-tab]');
  if(!button)return;
  const tab=button.dataset.resultTab;
  if(!['stats','moments','summary','table','form','lineup'].includes(tab))return;
  event.preventDefault();game.__resultTab=tab;
  if(tab==='lineup'){game.__lineupSpoilers=true;renderMatchPage(game);hydrateMatchLineup(game).finally(()=>renderMatchPage(game));return}
  if(tab==='table'&&!leagueStandings[standingsKey(game)]){game.__leagueTableLoading=true;renderMatchPage(game);fetchLeagueStandings(EPLData.leagues[game.leagueId],game.espnLeague).finally(()=>{game.__leagueTableLoading=false;renderMatchPage(game)});return}
  if(tab==='form'&&!game.__teamForm){renderMatchPage(game);loadTeamForms(game).finally(()=>renderMatchPage(game));return}
  renderMatchPage(game);
});
listRow=function(game){
  const meterScore=Number(game.scoreResult?.watchScore);
  const revealed=game.completed&&game.__mwRevealed&&Number.isFinite(meterScore);
  const calculating=game.completed&&game.__watchCalculating;
  const stamp=game.live?'<span class="live-stamp-label">LIVE</span>':game.completed?(revealed?String(Math.round(meterScore)):calculating?'<span class="score-pending" role="status" aria-label="Calculating Spoil Meter"><i class="score-spinner" aria-hidden="true"></i><em>···</em></span>':'?'):'';
  const state=game.live?'live':game.completed?'past':'future';
  const scoreMessage='';
  const team=(side,name,logo)=>`<span class="${side}-team"><img src="${logo||''}" alt=""><b class="team-name" title="${name}">${name}</b></span>`;
  const anticipation=game.anticipationBreakdown||{};
  const preview=!game.completed&&!game.live?`<small class="match-preview">COMPETITIVENESS ${anticipation.competitiveness??'—'} · CONTEXT ${anticipation.tableContext??'—'} · TIMING ${anticipation.seasonTiming??'—'}</small>`:'';
  const lineupAction=(game.completed||hasOfficialLineup(game))?`<button class="schedule-card-lineup" type="button" data-schedule-lineup aria-expanded="${!!game.__showLineup}">LINEUP</button>`:'';
  const squadAction=game.leagueId==='international'&&!game.completed&&!game.live?`<button class="schedule-card-lineup international-squad-button" type="button" data-international-squad aria-expanded="${!!game.__showSquad}">SQUAD</button>`:'';
  const details=(lineupAction||squadAction)?`${lineupAction?`<section class="schedule-lineup-shell${game.__showLineup?' schedule-lineup':''}" aria-label="Spoiler-free lineup" ${game.__showLineup?'':'hidden'}><p class="lineup-loading">LOADING OFFICIAL LINEUP…</p></section>`:''}${squadAction?`<section class="schedule-lineup-shell international-squad-shell" data-international-squad-panel aria-label="National team squads" ${game.__showSquad?'':'hidden'}><p class="lineup-loading">LOADING NATIONAL TEAM SQUADS…</p></section>`:''}`:'';
  const leagueStamp=activeLeague==='all'&&game.leagueLogo?`<span class="stamp-league" title="${game.league||''}" aria-label="${game.league||''}"><img src="${game.leagueLogo}" alt="${game.league||''}"></span>`:'';
  const round=eplMatchday(game);
  const matchday=game.leagueId==='epl'&&Number.isFinite(round)?`<small class="card-matchday">MATCHDAY ${round}</small>`:game.competitionLabel?`<small class="card-matchday competition-label">${game.competitionLabel}</small>`:'';
  const formShown=!!game.__showForm||futureFormSpoilers.has(String(game.id));
  const formToggle=!game.completed&&!game.live&&game.competition!=='friendly'?`<button class="form-spoiler-toggle" type="button" data-form-spoilers aria-pressed="${formShown}" aria-label="Show standings">SHOW STANDINGS</button>`:'';
  const liveInfoAction=game.live?`<button class="schedule-card-info" type="button" data-live-info aria-expanded="${!!game.__showLiveInfo}">MATCH INFO</button>`:'';
  const actions=[formToggle,liveInfoAction,lineupAction,squadAction].filter(Boolean).join('');
  const kickoff=`<div class="card-kickoff"><b>${game.live?'IN PROGRESS':timeAway(game)}</b><small class="match-datetime">${cardDateMarkup(game.time)}</small>${matchday}${actions?`<div class="card-kickoff-actions">${actions}</div>`:''}</div>`;
  return `<article class="list-game ${state} ${game.completed?'match-page-link':''} ${game.sport==='football'?'football-game':''} ${formShown?'form-spoilers':''} ${calculating?'score-calculating':''}" data-game="${game.id}"><strong aria-hidden="${game.completed?'false':'true'}">${stamp}${leagueStamp}</strong><div class="list-content"><div class="list-teams">${team('home',game.home,game.homeLogo)}${kickoff}${team('away',game.away,game.awayLogo)}</div>${preview}${details}</div><div class="list-meta"></div></article>`;
};
const hasSpoilerFreeLineup=game=>Array.isArray(game?.rosters)&&game.rosters.some(roster=>rosterEntries(roster).length);
const hasInternationalSquads=game=>Array.isArray(game?._internationalSquads)&&game._internationalSquads.some(roster=>rosterEntries(roster).length);
const internationalSquadMarkup=game=>{
  if(!hasInternationalSquads(game))return '<p class="lineup-empty">An up-to-date national-team squad is not available for this fixture.</p>';
  const squadGame={...game,rosters:game._internationalSquads};
  const source=game._internationalSquadSources?.find(Boolean);
  const note=source?`<a href="${lineupEscape(source.url)}" target="_blank" rel="noreferrer">${lineupEscape(source.label)} · CURRENT CALL-UP</a>`:'CURRENT NATIONAL-TEAM SQUAD · NOT A CONFIRMED MATCHDAY XI';
  return `<div class="international-squad-view"><p class="international-squad-note">${note}</p>${rosterMarkupWithSportTerms(squadGame)}</div>`;
};
const loadInternationalSquads=game=>{
  if(game.leagueId!=='international'||game.completed||game.live)return Promise.resolve(game);
  if(hasInternationalSquads(game))return Promise.resolve(game);
  if(game._internationalSquadRequest)return game._internationalSquadRequest;
  const league=String(game.espnLeague||'');
  const sides=[
    {id:game.homeId,name:game.home,abbreviation:game.homeAbbr,logo:game.homeLogo},
    {id:game.awayId,name:game.away,abbreviation:game.awayAbbr,logo:game.awayLogo}
  ].filter(side=>side.id&&league);
  const request=Promise.all(sides.map(async side=>{
    const official=EPLData.currentNationalSquad?.(game,side);
    if(official){
      game._internationalSquadSources=[...(game._internationalSquadSources||[]),{url:official.source,label:official.sourceLabel}];
      return {team:{id:side.id,displayName:side.name,abbreviation:side.abbreviation,logo:side.logo},roster:official.players.map(displayName=>({athlete:{displayName,fullName:displayName,country:{displayName:side.name}}}))};
    }
    const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(league)}/teams/${encodeURIComponent(side.id)}/roster`);
    if(!response.ok)return null;
    const payload=await response.json(),athletes=payload.athletes||[];
    return athletes.length?{team:{id:side.id,displayName:side.name,abbreviation:side.abbreviation,logo:side.logo},roster:athletes.map(athlete=>({athlete}))}:null;
  })).then(rosters=>{game._internationalSquads=rosters.filter(Boolean);return game}).catch(()=>game).finally(()=>{if(game._internationalSquadRequest===request)game._internationalSquadRequest=null});
  game._internationalSquadRequest=request;
  return request;
};
function paintInternationalSquadsAtGame(game){
  const card=[...listShell.querySelectorAll('[data-game]')].find(node=>String(node.dataset.game)===String(game.id));
  if(!card)return;
  const button=card.querySelector('[data-international-squad]'),panel=card.querySelector('[data-international-squad-panel]');
  if(!panel)return;
  button?.setAttribute('aria-expanded',String(!!game.__showSquad));
  panel.hidden=!game.__showSquad;
  if(game.__showSquad)panel.innerHTML=hasInternationalSquads(game)?internationalSquadMarkup(game):'<p class="lineup-loading">LOADING NATIONAL TEAM SQUADS…</p>';
}
const toggleInternationalSquads=(button,card)=>{
  const game=games.find(item=>String(item.id)===String(card?.dataset.game));
  if(!game)return;
  game.__showSquad=!game.__showSquad;
  game.__showLineup=false;game.__showResults=false;game.__showSummary=false;game.__showLiveInfo=false;
  paintInternationalSquadsAtGame(game);
  if(game.__showSquad)loadInternationalSquads(game).finally(()=>paintInternationalSquadsAtGame(game));
};
const loadSpoilerFreeLineup=game=>{
  const finishDetails=()=>{
    // Nationality flags and missing positions are enhancements, not a reason
    // to hold the official lineup behind a loading message.
    paintScheduleLineupAtGame(game);
    hydrateRosterFlags(game).catch(()=>{}).finally(()=>paintScheduleLineupAtGame(game,{refreshContent:true}));
    hydrateRosterPortraits(game).catch(()=>{}).finally(()=>paintScheduleLineupAtGame(game,{refreshContent:true}));
    hydrateRosterPositions(game);
    const providerDetails=game._lineupDetailsPromise;
    if(providerDetails)Promise.resolve(providerDetails).catch(()=>{}).finally(()=>paintScheduleLineupAtGame(game,{refreshContent:true}));
    return game;
  };
  if(hasSpoilerFreeLineup(game))return Promise.resolve(finishDetails());
  if(game._lineupRequest)return game._lineupRequest;
  const request=EPLData.enrich(game,{lineup:true})
    .then(finishDetails)
    .catch(()=>game)
    .finally(()=>{if(game._lineupRequest===request)game._lineupRequest=null});
  game._lineupRequest=request;
  return request;
};
let lineupPrefetchSerial=0;
const prefetchCardLineups=matches=>{
  const serial=++lineupPrefetchSerial,now=Date.now(),recent=matches
    .filter(game=>game.completed&&game.time>=now-21*864e5&&!hasSpoilerFreeLineup(game))
    .sort((left,right)=>Math.abs(left.time-now)-Math.abs(right.time-now));
  const upcoming=lineupCandidates(matches).filter(game=>!hasSpoilerFreeLineup(game));
  const queue=[...recent,...upcoming].slice(0,activeLeague==='all'?16:24);
  let cursor=0;
  const worker=()=>{
    if(serial!==lineupPrefetchSerial)return;
    const game=queue[cursor++];if(!game)return;
    loadSpoilerFreeLineup(game).catch(()=>{}).finally(worker);
  };
  const begin=()=>Array.from({length:2},worker);
  if('requestIdleCallback'in window)window.requestIdleCallback(begin,{timeout:2500});else window.setTimeout(begin,1200);
};
function paintScheduleLineupAtGame(game,{deferContent=false,refreshContent=false}={}){
  const current=[...listShell.querySelectorAll('[data-game]')].find(node=>String(node.dataset.game)===String(game.id));
  if(!current)return;
  const control=current.querySelector('[data-schedule-lineup]');
  control?.setAttribute('aria-expanded',String(!!game.__showLineup));
  let section=current.querySelector('.schedule-lineup,.schedule-lineup-shell');
  if(!section){section=document.createElement('section');section.className='schedule-lineup-shell';section.hidden=true;section.setAttribute('aria-label','Spoiler-free lineup');section.innerHTML='<p class="lineup-loading">LOADING OFFICIAL LINEUP…</p>';current.querySelector('.list-content')?.append(section)}
  section.classList.toggle('schedule-lineup',!!game.__showLineup);
  section.hidden=!game.__showLineup;
  if(deferContent)return;
  if(hasSpoilerFreeLineup(game)){
    if(refreshContent||section.dataset.lineupReady!=='true'){section.innerHTML=rosterMarkup(game);section.dataset.lineupReady='true'}
  }else if(section.dataset.lineupReady!=='true'&&!section.querySelector('.lineup-loading'))section.innerHTML='<p class="lineup-loading">LOADING OFFICIAL LINEUP…</p>';
}
const toggleScheduleLineup=(button,card)=>{
  const game=games.find(item=>String(item.id)===String(card?.dataset.game));
  if(!game)return;
  const now=performance.now();
  if(now-(game.__lineupToggleAt||0)<800)return;
  game.__lineupToggleAt=now;
  game.__showLineup=!game.__showLineup;
  game.__lineupSpoilers=false;
  game.__showResults=false;
  game.__showSummary=false;
  game.__showLiveInfo=false;
  if(!game.__showLineup){paintScheduleLineupAtGame(game);return}
  game.__lineupLoading=!hasSpoilerFreeLineup(game);
  paintScheduleLineupAtGame(game,{deferContent:true});
  requestAnimationFrame(()=>paintScheduleLineupAtGame(game));
  loadSpoilerFreeLineup(game).finally(()=>{game.__lineupLoading=false;paintScheduleLineupAtGame(game)});
};
const toggleFutureStandings=(button,card)=>{
  const game=games.find(item=>String(item.id)===String(card?.dataset.game));
  if(!game||game.completed||game.live)return;
  const show=button.getAttribute('aria-pressed')!=='true';
  show?futureFormSpoilers.add(String(game.id)):futureFormSpoilers.delete(String(game.id));
  game.__showForm=show;
  card.classList.toggle('form-spoilers',show);
  button.setAttribute('aria-pressed',String(show));
  paintStandingContextAtCard(card,game);
  if(show&&!teamTable[teamTableKey(game.leagueId,game.home)]){
    fetchLeagueStandings(EPLData.leagues[game.leagueId],game.espnLeague).finally(()=>{
      const current=[...listShell.querySelectorAll('[data-game]')].find(node=>String(node.dataset.game)===String(game.id));
      if(current)paintStandingContextAtCard(current,game);
    });
  }
};
const paintMeterAtCard=(card,game)=>{
  const stamp=card?.querySelector(':scope > strong');
  if(!stamp)return;
  const score=Number(game.__meterScore?.watchScore);
  let control=stamp.querySelector('.spoil-meter-value');
  if(!control){control=document.createElement('button');control.type='button';control.className='spoil-meter-value';control.dataset.watchToggle='';control.setAttribute('aria-label','Toggle Spoil Meter');stamp.prepend(control)}
  const setControlText=value=>{
    const text=control.firstChild;
    if(text?.nodeType===Node.TEXT_NODE&&control.childNodes.length===1)text.nodeValue=value;
    else control.replaceChildren(document.createTextNode(value));
  };
  card.classList.toggle('score-calculating',!!game.__watchCalculating);
  if(game.__watchCalculating){
    setControlText('···');
    window.refreshSpoilMeterStamp?.(stamp);
    return;
  }
  setControlText(game.__mwRevealed&&Number.isFinite(score)?String(Math.round(score)):'?');
  window.refreshSpoilMeterStamp?.(stamp);
};
const toggleCardMeter=(button,card)=>{
  const game=games.find(item=>String(item.id)===String(card?.dataset.game));
  if(!game?.completed)return;
  const now=performance.now();
  // The stamp is observed and rebuilt as it changes. Ignore duplicate calls
  // from the same physical click while that rebuild is in flight.
  if(now-(game.__meterToggleAt||0)<250)return;
  game.__meterToggleAt=now;
  if(game.__watchCalculating)return;
  if(game.__mwRevealed){
    game.__mwRevealed=false;
    game.displayScore=50;
    if(!document.body.classList.contains('view-list'))plot?.render();
    paintMeterAtCard(card,game);
    syncMeterRevealControl();
    return;
  }
  // Freeze the first valid calculation for this reveal.  Previously a second
  // provider pass painted over the number and rebuilt the long fixture list,
  // which made the score flicker and occasionally displaced the reader.
  const reveal=score=>{
    if(!score||!Number.isFinite(Number(score.watchScore)))return false;
    game.__meterScore={...score,watchScore:Math.round(Number(score.watchScore))};
    game.scoreResult=game.__meterScore;
    game.displayScore=game.__meterScore.watchScore;
    game.__mwRevealed=true;
    game.__watchCalculating=false;
    game._watchLoading=false;
    if(!document.body.classList.contains('view-list'))plot?.render();
    paintMeterAtCard(card,game);
    syncMeterRevealControl();
    return true;
  };
  const immediate=meterResultFor(game);
  if(immediate){
    reveal(immediate);
    return;
  }
  game.__watchCalculating=true;
  game._watchLoading=true;
  paintMeterAtCard(card,game);
  const request=game._enrichRequest||EPLData.enrich(game);
  request.then(()=>reveal(meterResultFor(game))).catch(()=>{}).finally(()=>{
    if(game._meterRequest!==request)return;
    game.__watchCalculating=false;
    game._watchLoading=false;
    if(!game.__mwRevealed)paintMeterAtCard(card,game);
    game._meterRequest=null;
  });
  game._meterRequest=request;
};
listShell.addEventListener('click',event=>{
  const button=event.target.closest('[data-schedule-lineup]'),card=event.target.closest('[data-game]');
  if(!button||!card)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  toggleScheduleLineup(button,card);
},true);
listShell.addEventListener('click',event=>{
  const button=event.target.closest('[data-international-squad]'),card=event.target.closest('[data-game]');
  if(!button||!card)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  toggleInternationalSquads(button,card);
},true);
listShell.addEventListener('click',event=>{
  const button=event.target.closest('[data-result-tab]'),card=event.target.closest('[data-game]');
  if(!button||!card)return;
  const game=games.find(item=>String(item.id)===String(card.dataset.game));
  if(!game?.__showResults)return;
  const tab=button.dataset.resultTab;
  if(!['stats','moments','summary','table','form'].includes(tab))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  game.__resultTab=tab;
  if(tab==='table'&&!leagueStandings[standingsKey(game)]){
    game.__leagueTableLoading=true;
    rerenderAtCard(card);
    fetchLeagueStandings(EPLData.leagues[game.leagueId],game.espnLeague).finally(()=>{game.__leagueTableLoading=false;rerenderAtGame(game.id)});
    return;
  }
  if(tab==='form'&&!game.__teamForm){
    rerenderAtCard(card);
    loadTeamForms(game).finally(()=>rerenderAtGame(game.id));
    return;
  }
  rerenderAtCard(card);
},true);
new MutationObserver(()=>listShell.querySelectorAll('[data-game].past').forEach(card=>{
  const game=games.find(item=>item.id===card.dataset.game),tabs=card.querySelector('.match-tabs');
  if(!game||!tabs||tabs.dataset.spoilerControls==='true')return;
  tabs.dataset.spoilerControls='true';
  tabs.innerHTML=`<button data-results class="${game.__showResults?'active':''}" title="Hold for half a second to reveal spoilers">SPOIL ME</button><button data-lineup class="${game.__showLineup?'active':''}">SHOW LINEUP</button>`;
})).observe(listShell,{childList:true,subtree:true});
const renderListWithResponsiveNames=renderList;
renderList=function(){
  renderListWithResponsiveNames();
  requestAnimationFrame(()=>fitTeamNames(listShell));
};
const drawResponsiveList=renderList;
renderList=function(){
  const lock=listPositionLock&&listPositionLock.until>Date.now()?listPositionLock:null;
  drawResponsiveList();
  if(!lock)return;
  const holdPosition=()=>{
    const card=[...listShell.querySelectorAll('[data-game]')].find(node=>node.dataset.game===lock.id);
    if(!card)return;
    const drift=card.getBoundingClientRect().top-lock.top;
    if(Math.abs(drift)>.5)listShell.scrollTop=Math.max(0,listShell.scrollTop+drift);
  };
  requestAnimationFrame(()=>{holdPosition();requestAnimationFrame(holdPosition)});
};
window.addEventListener('resize',()=>requestAnimationFrame(()=>fitTeamNames(listShell)),{passive:true});
function prefetchCompleted(matches){const queue=matches.filter(game=>game.completed&&!game._enriched).sort((a,b)=>b.time-a.time).slice(0,6);let next=0;const worker=()=>{const game=queue[next++];if(!game)return;(game._enrichRequest||(game._enrichRequest=EPLData.enrich(game).finally(()=>{game._enrichRequest=null}))).then(()=>{if(game.completed&&!['baseball','football'].includes(game.sport))game.scoreResult=WatchScore.score(game)}).catch(()=>{}).finally(worker)};const begin=()=>Array.from({length:2},worker);if('requestIdleCallback'in window)window.requestIdleCallback(begin,{timeout:2200});else window.setTimeout(begin,1000)}
function prepareGames(loaded){
  games=loaded;logos={};teamColors={};teamAbbrs={};games.forEach(game=>{game.anticipation=Anticipation.score(game);game.anticipationBreakdown=Anticipation.breakdown(game);game.displayScore=50;logos[game.home]=game.homeLogo;logos[game.away]=game.awayLogo;teamColors[game.home]=game.homeColor;teamColors[game.away]=game.awayColor;teamAbbrs[game.home]=game.homeAbbr;teamAbbrs[game.away]=game.awayAbbr});
  const all=[...new Set(games.flatMap(game=>[game.home,game.away]))].sort();
  try{
    if(activeLeague==='all'){
      // An explicit All Leagues choice wins. Its identities survive changing
      // fixture windows, unlike an old snapshot of game ids.
      const explicit=readAllLeagueSelection();
      if(explicit){
        allLeagueTeamKeys=selectedKeysForAllLeagues(explicit);
      }else{
        // Backward-compatible fallback: if any individual league has a
        // specific team choice, All Leagues is the union of those choices.
        // Only when no choices exist at all do we default to every team.
        const chosen=new Set(selectedClubKeys());
        Object.keys(EPLData.leagues).forEach(leagueId=>{
          const leagueTeams=[...new Set(games.filter(game=>game.leagueId===leagueId).flatMap(game=>[game.home,game.away]))];
          let saved=[];
          try{saved=JSON.parse(localStorage.getItem(teamStorageKey(leagueId))||'[]')}catch(_){}
          saved.filter(team=>leagueTeams.includes(team)).forEach(team=>chosen.add(teamIdentity(team)));
        });
        allLeagueTeamKeys=selectedKeysForAllLeagues(chosen);
      }
      activeTeams=new Set();
      games.forEach(game=>[game.home,game.away].forEach(team=>{
        if(allLeagueTeamKeys.has(allLeagueGameKey(game.leagueId,team)))activeTeams.add(team);
      }));
    }else{
      allLeagueTeamKeys=new Set();
      activeTeams=storedTeamsForLeague(activeLeague,all);
    }
  }catch(_){activeTeams=new Set()}
  return all;
}
function renderInternationalFilter(){
  const visible=activeLeague==='international';
  internationalFilter.hidden=!visible;
  if(!visible)return;
  const options=[['all','ALL'],['nations','NATIONS LEAGUE'],['friendly','FRIENDLIES']];
  internationalFilter.innerHTML=options.map(([id,label])=>`<button type="button" data-international="${id}" class="${internationalCompetition===id?'active':''}" aria-pressed="${internationalCompetition===id}">${label}</button>`).join('');
}
internationalFilter.addEventListener('click',event=>{const button=event.target.closest('[data-international]');if(!button)return;internationalCompetition=button.dataset.international;localStorage.setItem('spoil-me-not-international-filter',internationalCompetition);listPastLimit=INITIAL_LIST_SIDE_LIMIT;listFutureLimit=INITIAL_LIST_SIDE_LIMIT;renderInternationalFilter();renderList();requestAnimationFrame(()=>document.getElementById('list-now')?.scrollIntoView({block:'center'}))});
function renderLeagueSwitcher(){leagueSwitcher.innerHTML=leagueOptions().map(league=>`<button type="button" data-league="${league.id}" class="${league.id===activeLeague?'active':''}">${leagueLabel(league)}</button>`).join('');renderInternationalFilter()}
leagueSwitcher.addEventListener('click',event=>{const button=event.target.closest('[data-league]');if(!button)return;event.preventDefault();switchLeague(button.dataset.league)});
const lineupCandidates=source=>{const horizon=Date.now()+3*60*60*1000;return source.filter(game=>game.live||(!game.completed&&game.time>Date.now()&&(game.sport!=='baseball'||game.time<=horizon))).sort((a,b)=>a.time-b.time).slice(0,activeLeague==='all'?8:12)};
async function switchLeague(request){
  const requested=request==='all'?knownLeagueIds:validLeagueIds(Array.isArray(request)?request.join(','):request);
  if(!requested.length)return;
  const ids=[...new Set(requested)],id=ids.length===1?ids[0]:'all',league=id==='all'?allLeagueOption:EPLData.leagues[id];
  if(!league)return;
  const unchanged=ids.length===activeLeagueIds.size&&ids.every(value=>activeLeagueIds.has(value));
  if(unchanged&&games.length)return;
  const serial=++leagueLoadSerial;
  document.body.classList.add('league-switching');info.hidden=true;showLoader(`LOADING ${ids.length===1?leagueName(league).toUpperCase():`${ids.length} LEAGUES`}…`);
  try{
    EPLData.setLeague(id);
    const loaded=await EPLData.load(ids);
    if(serial!==leagueLoadSerial)return;
    activeLeague=id;activeLeagueIds=new Set(ids);
    listPastLimit=INITIAL_LIST_SIDE_LIMIT;listFutureLimit=INITIAL_LIST_SIDE_LIMIT;
    localStorage.setItem('spoil-me-not-last-league',id);
    localStorage.setItem('spoil-me-not-visible-leagues',JSON.stringify(ids));
    const all=prepareGames(loaded);
    if(plot){plot.games=games;plot.now=new Date();plot.setTeamFilter(activeTeams);plot.recenter()}
    renderLeagueSwitcher();renderRibbon(all);renderList();deferBackground(()=>loadTeamTable(id));
    requestAnimationFrame(()=>{document.getElementById('list-now')?.scrollIntoView({block:'center'});decorateCards();fitTeamNames(listShell)})
  }catch(error){const box=document.getElementById('error');box.textContent=`LIVE DATA UNAVAILABLE — ${error.message}`;box.hidden=false}
  finally{if(serial===leagueLoadSerial){document.body.classList.remove('league-switching');await hideLoader();prefetchCompleted(games);prefetchCardLineups(games)}}
}
window.addEventListener('spoil-me-not:choose-league',event=>{const id=event.detail?.id;if(id)switchLeague(id)});
window.addEventListener('spoil-me-not:choose-leagues',event=>{const ids=event.detail?.ids;if(Array.isArray(ids)&&ids.length)switchLeague(ids)});
const meterRevealControl=document.getElementById('reveal-all'),meterRevealWrap=document.createElement('div');
leagueSwitcher.hidden=true;meterRevealWrap.className='meter-reveal-control';meterRevealWrap.innerHTML='<span>SPOIL METERS?</span>';meterRevealWrap.append(meterRevealControl);document.querySelector('.masthead-actions')?.insertBefore(meterRevealWrap,document.getElementById('now-button'));
const syncMeterRevealControl=()=>{const completed=games.filter(game=>game.completed),allRevealed=completed.length>0&&completed.every(game=>game.__mwRevealed),label=allRevealed?'HIDE ALL':'SPOIL ALL',icon=allRevealed?String(completed.length):'?';meterRevealControl.innerHTML=`<i class="meter-all-icon" aria-hidden="true">${icon}</i><b>${label}</b>`;meterRevealControl.setAttribute('role','switch');meterRevealControl.setAttribute('aria-checked',String(allRevealed));meterRevealControl.setAttribute('aria-label',allRevealed?'Hide all Spoil Meters':'Reveal all Spoil Meters');meterRevealControl.title=meterRevealControl.getAttribute('aria-label')};
syncMeterRevealControl();
const enrichForReveal=async completed=>{let cursor=0;const worker=async()=>{while(cursor<completed.length){const game=completed[cursor++];if(!game._enriched)await EPLData.enrich(game).catch(()=>game)}};await Promise.all(Array.from({length:3},worker))};
meterRevealControl.onclick=async event=>{event.preventDefault();event.stopImmediatePropagation();const completed=games.filter(game=>game.completed),allRevealed=completed.length>0&&completed.every(game=>game.__mwRevealed);if(allRevealed){completed.forEach(game=>{game.__mwRevealed=false;game.displayScore=50});plot?.render();renderList();syncMeterRevealControl();return}meterRevealControl.disabled=true;await enrichForReveal(completed);completed.forEach(game=>{const score=game.scoreResult||(['baseball','football'].includes(game.sport)?null:WatchScore.score(game));if(score){game.scoreResult=score;plot?.reveal(game,score)}});renderList();meterRevealControl.disabled=false;syncMeterRevealControl()};
new MutationObserver(syncMeterRevealControl).observe(listShell,{childList:true,subtree:true});
async function boot(){const serial=++leagueLoadSerial;showLoader(matchRouteId?'PREPARING FULL MATCH SPOILER':'SYNCING LEAGUES & FIXTURES',1000);try{EPLData.setLeague(activeLeague);const all=prepareGames(await EPLData.load([...activeLeagueIds]));if(serial!==leagueLoadSerial)return;if(matchRouteId){const game=games.find(item=>String(item.id)===String(matchRouteId));if(!game)throw Error('This match is not available in the current season feed.');document.documentElement.classList.add('view-match');document.body.classList.add('view-match');plotShell.hidden=true;listShell.hidden=true;await EPLData.enrich(game,{refresh:true,lineup:true});if(!game.scoreResult)game.scoreResult=WatchScore.score(game);game.__resultTab='lineup';renderMatchPage(game);fetchLeagueStandings(EPLData.leagues[game.leagueId],game.espnLeague).finally(()=>renderMatchPage(game));await hideLoader();Promise.all([hydrateRosterFlags(game),hydrateRosterPortraits(game)]).then(()=>renderMatchPage(game));return}renderLeagueSwitcher();renderRibbon(all);renderList();deferBackground(()=>loadTeamTable(activeLeague));document.body.classList.add('view-list');plotShell.hidden=true;listShell.hidden=false;await hideLoader();prefetchCompleted(games);prefetchCardLineups(games);requestAnimationFrame(()=>{const restored=restoreListRoutePosition();if(!restored)document.getElementById('list-now')?.scrollIntoView({block:'center'});decorateCards();fitTeamNames(listShell)});search.oninput=()=>renderTeams(all);search.onfocus=()=>renderTeams(all)}catch(error){if(serial!==leagueLoadSerial)return;await hideLoader();const box=document.getElementById('error');box.textContent=`LIVE DATA UNAVAILABLE — ${error.message}`;box.hidden=false}}boot()})();
