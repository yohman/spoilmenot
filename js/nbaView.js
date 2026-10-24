window.NBAView=(()=>{
  const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function leadChart(game,colours){
    const readable=colour=>{const hex=String(colour||'').replace('#','');if(!/^[a-f0-9]{6}$/i.test(hex))return colour;const [r,g,b]=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));return .2126*r+.7152*g+.0722*b<55?'#b9c5cc':colour};
    colours={home:readable(colours.home),away:readable(colours.away)};
    const t=window.NBAInsights.timeline(game.summary||{});
    if(!t.scores.length)return '';
    const extent=Math.max(5,...t.points.map(p=>Math.abs(p.difference))),x=time=>36+time/t.end*568,y=d=>104-d/extent*72;
    const points=t.points.map(p=>`${x(p.time).toFixed(2)},${y(p.difference).toFixed(2)}`).join(' ');
    const area=`M36,104 L${points.replace(/ /g,' L')} L604,104 Z`;
    // Separate clip regions share the same curve: each fill stops precisely
    // at zero, including possessions where the lead changes sides.
    const id=`nba-lead-${String(game.id).replace(/[^a-z0-9]/gi,'')}`;
    const ticks=[0,720,1440,2160,2880,...Array.from({length:Math.max(0,Math.ceil((t.end-2880)/300))},(_,i)=>3180+i*300)].filter(v=>v<=t.end);
    return `<section class="nba-lead-chart" aria-label="Score difference over time"><header><b>THE LEAD</b><span>${t.leadChanges} lead changes · ${t.ties} ties</span></header><div class="nba-lead-legend"><span><i style="background:${safe(colours.home)}"></i>${safe(game.homeAbbr||game.home)}</span><span><i style="background:${safe(colours.away)}"></i>${safe(game.awayAbbr||game.away)}</span></div><svg viewBox="0 0 640 220" role="img" aria-label="${safe(game.home)} above zero; ${safe(game.away)} below zero. Vertical distance is the lead in points; horizontal position is elapsed game time."><defs><clipPath id="${id}-above"><rect x="36" y="20" width="568" height="84"/></clipPath><clipPath id="${id}-below"><rect x="36" y="104" width="568" height="84"/></clipPath></defs>${ticks.map(v=>`<line class="nba-chart-grid" x1="${x(v)}" x2="${x(v)}" y1="25" y2="183"/>`).join('')}<path d="${area}" fill="${safe(colours.home)}" fill-opacity=".55" clip-path="url(#${id}-above)"/><path d="${area}" fill="${safe(colours.away)}" fill-opacity=".55" clip-path="url(#${id}-below)"/><line class="nba-chart-zero" x1="36" x2="604" y1="104" y2="104"/><polyline points="${points}" fill="none" stroke="${safe(colours.home)}" stroke-width="2" clip-path="url(#${id}-above)"/><polyline points="${points}" fill="none" stroke="${safe(colours.away)}" stroke-width="2" clip-path="url(#${id}-below)"/><text x="27" y="35" text-anchor="end">+${extent}</text><text x="27" y="108" text-anchor="end">0</text><text x="27" y="180" text-anchor="end">−${extent}</text>${ticks.map((v,i)=>`<text x="${x(v)}" y="205" text-anchor="middle">${i===0?'TIP':v===2880?'Q4':v>2880?`OT${(v-2880)/300}`:`Q${v/720}`}</text>`).join('')}</svg><p>Lead in points · home above / away below · elapsed game time</p></section>`;
  }
  function boxScore(game,register){
    const teams=game.summary?.boxscore?.players||[];
    if(!teams.length)return '<p class="spoiler-empty">Official player statistics are not available yet.</p>';
    const columns=['MIN','PTS','REB','AST','FG','FG%','3PT','FT','OREB','DREB','STL','BLK','TO','PF','+/-'];
    const percentage=value=>{const [made,attempted]=String(value||'').split('-').map(Number);return attempted>0?(made/attempted*100).toFixed(1):'—'};
    return `<div class="nba-boxscores">${teams.map(team=>{
      const blocks=(team.statistics||[]).filter(group=>group.athletes?.length);
      return `<section class="nba-player-boxscore"><header>${team.team?.logo?`<img src="${safe(team.team.logo)}" alt="">`:''}<b>${safe(team.team?.displayName||'TEAM')}</b><small>GAME BOX SCORE</small></header>${blocks.map(group=>{
        const labels=group.labels||group.names||[],index=label=>labels.findIndex(value=>String(value).toUpperCase()===label),get=(row,label)=>label==='FG%'?percentage(row.stats?.[index('FG')]):row.stats?.[index(label)]??'—';
        const row=(entry,total=false)=>{const p=entry.athlete||{},name=p.displayName||'TEAM TOTAL',initials=name.split(/\s+/).slice(0,2).map(s=>s[0]).join(''),photo=p.headshot?.href||'',key=total?'':register(entry),nameCell=total?'<b>TEAM TOTAL</b>':`<button type="button" data-player-card="${safe(key)}"><span class="nba-box-avatar">${photo?`<img src="${safe(photo)}" alt="" loading="lazy" onerror="this.remove()">`:''}<i>${safe(initials)}</i></span><span>${safe(p.shortName||name)}<small>${safe(p.position?.abbreviation||'')}</small></span></button>`;
          return `<tr${total?' class="nba-box-total"':''}><th scope="row">${nameCell}</th>${columns.map(label=>`<td${label==='PTS'?' class="nba-box-points"':''}>${safe(get(entry,label))}</td>`).join('')}</tr>`;};
        const athletes=group.athletes||[],starters=athletes.filter(p=>p.starter&&!p.didNotPlay),bench=athletes.filter(p=>!p.starter&&!p.didNotPlay),dnp=athletes.filter(p=>p.didNotPlay);
        const section=(title,entries)=>entries.length?`<tr class="nba-box-divider"><th colspan="${columns.length+1}">${title}</th></tr>${entries.map(entry=>row(entry)).join('')}`:'';
        return `<div class="nba-box-scroll" role="region" aria-label="${safe(team.team?.displayName)} player statistics, scroll for more columns" tabindex="0"><table><thead><tr><th scope="col">PLAYER</th>${columns.map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${section('STARTERS',starters)}${section('BENCH',bench)}${group.totals?.length?row({stats:group.totals},true):''}</tbody></table></div>${dnp.length?`<p class="nba-box-dnp"><b>DID NOT PLAY</b> ${dnp.map(p=>`${safe(p.athlete?.displayName)} (${safe(p.reason||'DNP')})`).join(' · ')}</p>`:''}`;
      }).join('')}</section>`;
    }).join('')}<p class="nba-box-key">FG / 3PT / FT: made–attempted · TO: turnovers · PF: fouls · +/−: scoring margin while on court. Swipe the table for all shooting and defensive stats.</p></div>`;
  }
  function teamStats(game,colours){
    const teams=game.summary?.boxscore?.teams||[];
    const side=which=>teams.find(team=>String(team.team?.id)===String(game[`${which}Id`]));
    const home=side('home'),away=side('away');
    if(!home&&!away)return '';
    const value=(team,key)=>{const item=(team?.statistics||[]).find(stat=>stat.name===key);return item?.displayValue??item?.value??''};
    const metrics=[['FIELD GOALS','fieldGoalsMade-fieldGoalsAttempted'],['FG %','fieldGoalPct'],['3-POINTERS','threePointFieldGoalsMade-threePointFieldGoalsAttempted'],['3PT %','threePointFieldGoalPct'],['FREE THROWS','freeThrowsMade-freeThrowsAttempted'],['FT %','freeThrowPct'],['REBOUNDS','totalRebounds'],['OFFENSIVE REBOUNDS','offensiveRebounds'],['DEFENSIVE REBOUNDS','defensiveRebounds'],['ASSISTS','assists'],['STEALS','steals'],['BLOCKS','blocks'],['TURNOVERS','totalTurnovers'],['FOULS','fouls'],['FAST BREAK POINTS','fastBreakPoints'],['POINTS IN THE PAINT','pointsInPaint']];
    const identity=which=>`<span class="nba-stat-team" style="--nba-side:${safe(colours[which])}">${game[`${which}Logo`]?`<img src="${safe(game[`${which}Logo`])}" alt="">`:''}<b>${safe(game[`${which}Abbr`]||game[which])}</b></span>`;
    const rows=metrics.map(([label,key])=>({label,home:value(home,key),away:value(away,key)})).filter(row=>row.home!==''||row.away!=='');
    return `<section class="nba-team-stats" aria-label="NBA team statistics"><header>${identity('home')}<h3>TEAM STATS</h3>${identity('away')}</header>${rows.map(row=>`<div class="nba-team-stat"><b>${safe(row.home===''?'—':row.home)}</b><span>${row.label}</span><b>${safe(row.away===''?'—':row.away)}</b></div>`).join('')}</section>`;
  }
  return {leadChart,boxScore,teamStats};
})();
