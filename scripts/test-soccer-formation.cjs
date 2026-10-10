const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const context = { rosterEntries: roster => roster.roster };
vm.createContext(context);
vm.runInContext(
  source.slice(source.indexOf('const soccerPosition='), source.indexOf('const soccerTeamColor=')) +
  source.slice(source.indexOf('const soccerFormationLineup='), source.indexOf('function soccerFormationMarkup')) +
  ';this.formation=soccerFormationLineup;this.order=soccerLineOrder;', context
);
// Chelsea v Bournemouth, ESPN 401878775: preserve these match-specific roles.
const chelsea = [
  ['Martínez', 'G'], ['Lacroix', 'CD'], ['Colwill', 'CD-L'], ['Acheampong', 'CD-R'],
  ['Caicedo', 'CM-L'], ['Henderson', 'CM-R'], ['Chavarría', 'LM'], ['Neto', 'RM'],
  ['João Pedro', 'F'], ['Rogers', 'CF-L'], ['Palmer', 'CF-R']
];
const players = entries => entries.map(([displayName, abbreviation]) => ({
  athlete: { displayName }, position: { abbreviation }, starter: true
}));
const names = row => Array.from(row, player => player.athlete.displayName);
for (let offset = 0; offset < chelsea.length; offset++) {
  const shuffled = chelsea.slice(offset).concat(chelsea.slice(0, offset));
  const result = context.formation({ formation: '3-4-2-1', roster: players(shuffled) }, 0);
  assert.deepEqual(names(result.formationRows[3]), ['João Pedro']);
  assert.deepEqual(names(context.order(result.formationRows[2], 'home')), ['Palmer', 'Rogers']);
  assert.deepEqual(names(context.order(result.formationRows[2], 'away')), ['Rogers', 'Palmer']);
  assert.deepEqual(names(context.order(result.formationRows[0], 'home')), ['Acheampong', 'Lacroix', 'Colwill']);
  assert.deepEqual(names(context.order(result.formationRows[1], 'home')), ['Neto', 'Henderson', 'Caicedo', 'Chavarría']);
}
const fourFourTwo = players([
  ['Keeper', 'G'], ['RB', 'RB'], ['CDR', 'CD-R'], ['CDL', 'CD-L'], ['LB', 'LB'],
  ['RM', 'RM'], ['CMR', 'CM-R'], ['CML', 'CM-L'], ['LM', 'LM'], ['Left forward', 'CF-L'], ['Right forward', 'CF-R']
]);
const result = context.formation({ formation: '4-4-2', roster: fourFourTwo }, 0);
assert.deepEqual(names(context.order(result.formationRows[2], 'home')), ['Right forward', 'Left forward']);
assert.deepEqual(names(context.order(result.formationRows[0], 'home')), ['RB', 'CDR', 'CDL', 'LB']);
console.log('PASS: Chelsea 3-4-2-1 in 11 roster orders, both orientations, and 4-4-2 roles');
