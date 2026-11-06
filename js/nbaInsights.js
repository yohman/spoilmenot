/* Shared, deterministic NBA play-by-play analysis. No extra network requests. */
window.NBAInsights = (() => {
  const clamp=(n,lo=0,hi=100)=>Math.max(lo,Math.min(hi,n));
  const period=p=>Number(p.period?.number||p.period)||1;
  const remaining=p=>{const value=String(p.clock?.displayValue??p.clock??'0');const parts=value.split(':');return parts.length===2?Number(parts[0])*60+Number(parts[1]):Number(value)||0};
  const elapsed=p=>{const q=period(p);return (q<=4?(q-1)*720:2880+(q-5)*300)+(q<=4?720:300)-remaining(p)};
  function timeline(summary){
    const plays=(summary.plays?.length?summary.plays:summary.scoringPlays||[]).filter(p=>p.homeScore!=null&&p.awayScore!=null&&Number.isFinite(Number(p.homeScore))&&Number.isFinite(Number(p.awayScore))).slice().sort((a,b)=>elapsed(a)-elapsed(b)||Number(a.sequenceNumber||0)-Number(b.sequenceNumber||0));
    let home=0,away=0,leader=0,changes=0,ties=0,lateChanges=0,closeSeconds=0,lateCloseSeconds=0,lastTime=0,lastDifference=0;
    const points=[{time:0,difference:0,home:0,away:0}],scores=[];
    const end=Math.max(2880,...plays.map(elapsed));
    for(const play of plays){
      const time=elapsed(play),h=Number(play.homeScore),a=Number(play.awayScore);
      if(Math.abs(lastDifference)<=5){closeSeconds+=Math.max(0,time-lastTime);lateCloseSeconds+=Math.max(0,time-Math.max(lastTime,2160));}
      lastTime=time;
      if(h===home&&a===away)continue;
      // Ignore score corrections rather than treating them as exciting plays.
      if(h<home||a<away){home=h;away=a;lastDifference=h-a;continue;}
      const difference=h-a,next=Math.sign(difference),leadChange=!!(next&&leader&&next!==leader),tie=next===0;
      if(leadChange){changes++;if(time>=2160)lateChanges++;}
      if(tie)ties++;
      if(next)leader=next;
      scores.push({play,time,home:h,away:a,difference,leadChange,tie,points:(h-home)+(a-away)});
      points.push({time,difference,home:h,away:a});home=h;away=a;lastDifference=difference;
    }
    if(Math.abs(lastDifference)<=5){closeSeconds+=end-lastTime;lateCloseSeconds+=Math.max(0,end-Math.max(lastTime,2160));}
    if(points.at(-1).time<end)points.push({...points.at(-1),time:end});
    return {points,scores,end,leadChanges:changes,ties,lateChanges,closeShare:closeSeconds/end,lateCloseShare:lateCloseSeconds/Math.max(720,end-2160)};
  }
  function individualPerformance(summary){
    let best={bonus:0,floor:0,reason:null};
    for(const team of summary.boxscore?.players||[])for(const group of team.statistics||[]){
      const keys=(group.labels||group.names||[]).map(key=>String(key).toUpperCase());
      for(const player of group.athletes||[]){
        if(player.didNotPlay)continue;
        const stat=key=>Number(player.stats?.[keys.indexOf(key)])||0;
        const pts=stat('PTS'),reb=stat('REB'),ast=stat('AST'),blk=stat('BLK'),stl=stat('STL');
        const doubles=[pts,reb,ast,blk,stl].filter(n=>n>=10).length;
        let bonus=0,floor=0,milestone='';
        // Statistical milestones, not unverified claims that a league record was broken.
        if(pts>=50&&reb>=20&&(blk>=5||ast>=10)){bonus=14;floor=94;milestone='Historic all-around performance';}
        else if(pts>=70||doubles>=4){bonus=14;floor=94;milestone=pts>=70?'70-point performance':'Quadruple-double';}
        else if(pts>=60||(pts>=50&&reb>=20)||(pts>=40&&doubles>=3)){bonus=12;floor=90;milestone='Exceptional individual performance';}
        else {
          // A single-category outlier matters even without a rare combined line.
          const outliers=[
            [pts>=50?8:0,'50-point performance'],
            [reb>=25?8:reb>=20?5:0,`${reb}-rebound performance`],
            [ast>=20?8:ast>=15?5:0,`${ast}-assist performance`],
            [blk>=10?10:blk>=7?6:0,`${blk}-block performance`],
            [stl>=10?10:stl>=7?6:0,`${stl}-steal performance`],
            [doubles>=3?6:0,'Triple-double']
          ];
          [bonus,milestone]=outliers.reduce((best,item)=>item[0]>best[0]?item:best,[0,'']);
        }
        if(bonus>best.bonus)best={bonus,floor,reason:`${player.athlete?.displayName||'Player'}: ${milestone} (${pts} PTS, ${reb} REB, ${ast} AST, ${blk} BLK, ${stl} STL)`};
      }
    }
    return best;
  }
  function score(game,summary){
    const t=timeline(summary),margin=Math.abs(Number(game.homeScore)-Number(game.awayScore)),total=Number(game.homeScore)+Number(game.awayScore),overtime=t.end>2880;
    const finish=margin<=3?21:margin<=5?18:margin<=8?12:margin<=12?6:margin<=18?0:-10;
    // Bounded contributions: an ordinary 120-point night is not exceptional.
    let value=46+finish+t.closeShare*8+Math.min(10,t.leadChanges*.7)+Math.min(6,t.lateChanges*1.5)+t.lateCloseShare*3+(overtime?7:0)+clamp((total-210)/18,0,3);
    if(margin>=15)value=Math.min(value,72);if(margin>=25)value=Math.min(value,55);
    const performance=individualPerformance(summary);
    // One standout performance per game; retain blowout discounts. Truly rare
    // lines in a close finish deserve must-watch status even with sparse PBP.
    value+=performance.bonus*(margin>=15?.65:1);
    if(margin<=5&&performance.floor)value=Math.max(value,performance.floor);
    const watchScore=Math.round(clamp(value));
    return {watchScore,nba:true,drama:Math.round(clamp(finish*2+t.lateChanges*8+t.leadChanges*2)),action:Math.round(clamp(45+(total-190)*.4)),exceptional:Math.round(Math.max(t.closeShare*100,performance.bonus/14*100)),surpriseContext:Number.isFinite(game.contextScore)?game.contextScore:40,reasons:[margin<=3&&'One-possession finish',overtime&&'Overtime',t.leadChanges&&`${t.leadChanges} lead changes`,t.lateChanges&&`${t.lateChanges} fourth-quarter / OT swings`,performance.reason].filter(Boolean),diagnostics:{...t,individualPerformance:performance}};
  }
  function moments(events,limit=18){
    const scores=events.filter(e=>e.type==='score'&&e.homeScore!=null&&e.awayScore!=null),ranked=[];
    let leader=0;
    scores.forEach((e,index)=>{const next=Math.sign(e.homeScore-e.awayScore),change=next&&leader&&next!==leader,tie=next===0,late=Number(e.period)>=4,close=Math.abs(e.homeScore-e.awayScore)<=5;const importance=(change?30:tie?17:0)+(late?12:0)+(late&&close?15:0)+(index===scores.length-1?60:0);if(next)leader=next;ranked.push({e,index,importance});});
    // Quarter-ending baskets provide context even in a one-sided game.
    const ends=new Map();ranked.forEach(item=>ends.set(item.e.period,item));ends.forEach(item=>item.importance+=25);
    const essential=[...ends.values()],keys=new Set(essential.map(item=>item.index));
    const picked=[...essential,...ranked.filter(item=>!keys.has(item.index)&&item.importance>=25).sort((a,b)=>b.importance-a.importance||b.index-a.index).slice(0,Math.max(0,limit-essential.length))].slice(0,limit).sort((a,b)=>a.index-b.index);
    return picked.map(item=>item.e);
  }
  const divisions=[['Eastern Conference','Atlantic',[2,17,18,20,28]],['Eastern Conference','Central',[4,5,8,11,15]],['Eastern Conference','Southeast',[1,30,14,19,27]],['Western Conference','Northwest',[7,16,25,22,26]],['Western Conference','Pacific',[9,12,13,21,23]],['Western Conference','Southwest',[6,10,29,3,24]]];
  const division=id=>{const group=divisions.find(([, ,ids])=>ids.includes(Number(id)));return group?{conference:group[0],division:group[1]}:{conference:'NBA',division:'Other'};};
  return {timeline,score,moments,division,elapsed};
})();
