const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8'),handlers={};
class Image {
  constructor(src,sources){this.src=src;this.dataset={soccerPortrait:'123',portraitSources:JSON.stringify(sources)};this.naturalWidth=120;this.parentElement={classList:{remove(){}}};}
  getAttribute(name){return name==='src'?this.src:null;}
}
const context={HTMLImageElement:Image,document:{addEventListener(type,handler){handlers[type]=handler}},rosterPortraitCache:{},playerCardId:e=>String((e.athlete||e).id),lineupEscape:String};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('const confirmedSoccerPortraits='),source.indexOf('const soccerPosition='))+';this.headshot=soccerHeadshot;',context);
const espn='https://a.espncdn.com/i/headshots/soccer/players/full/123.png';
const entry={athlete:{id:'123'}};
const working=new Image(espn,[espn]);handlers.load({target:working});
entry.athlete._portraitUrl='https://alternate.invalid/player.png';
assert.equal(context.headshot(entry),espn,'background enrichment must not replace a proven portrait');
// Even a fresh athlete object after match enrichment retains the loaded URL.
assert.equal(context.headshot({athlete:{id:'123',_portraitUrl:'https://alternate.invalid/player.png'}}),espn);
const broken=new Image('https://bad.invalid/player.png',['https://bad.invalid/player.png',espn]);let stopped=false;
handlers.error({target:broken,stopImmediatePropagation(){stopped=true}});
assert.equal(broken.src,espn);assert.equal(stopped,true,'fallback must run before the inline initials handler');
const exhausted=new Image('https://bad.invalid/player.png',['https://bad.invalid/player.png']);stopped=false;
handlers.error({target:exhausted,stopImmediatePropagation(){stopped=true}});
assert.equal(stopped,false,'initials remain available when every source fails');
console.log('PASS: stable loaded portraits, refreshed athlete objects, alternate-source retry, and final initials fallback');
