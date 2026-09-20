(() => {
  const categories = [[80, 'Must Watch', 4], [65, 'Worth It', 3], [45, 'Your Call', 2], [25, 'Save Your 90', 1], [0, "Don't Bother", 0]];
  const categoryFor = score => categories.find(([minimum]) => score >= minimum) || categories.at(-1);
  const meterPaletteFor = score => score >= 80
    ? { tone:'#e13f45', deep:'#65131e', highlight:'#ffd2b8', edge:'#ffb5a2', glow:'rgba(225,63,69,.48)', ink:'#fffaf4' }
    : score >= 65 ? { tone:'#ea7436', deep:'#773117', highlight:'#ffe1a5', edge:'#ffc27d', glow:'rgba(234,116,54,.38)', ink:'#fffaf1' }
    : score >= 45 ? { tone:'#c79b39', deep:'#5c4715', highlight:'#fff0ad', edge:'#e6c46b', glow:'rgba(199,155,57,.25)', ink:'#fffbed' }
    : score >= 25 ? { tone:'#59666e', deep:'#273238', highlight:'#c9d8dd', edge:'#84969d', glow:'rgba(98,121,130,.17)', ink:'#f1f5f4' }
    : { tone:'#34383a', deep:'#171a1b', highlight:'#a7afb0', edge:'#626a6b', glow:'rgba(0,0,0,.24)', ink:'#d8dddc' };
  const meterStampsIn = root => [
    ...(root instanceof Element && root.matches('.match-stamp.past') ? [root] : []),
    ...(root.querySelectorAll?.('.match-stamp.past') || [])
  ];
  const applySpoilMeter = root => meterStampsIn(root).forEach(stamp => {
    const rawValue = stamp.textContent.trim(), value = rawValue === '' ? NaN : Number(rawValue);
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      const [, label, band] = categoryFor(value), palette = meterPaletteFor(value);
      stamp.classList.add('spoil-meter-badge');
      stamp.classList.remove('spoil-meter-trigger');
      stamp.dataset.spoilCategory = label;
      stamp.dataset.meterBand = band;
      Object.entries({ '--meter-tone':palette.tone, '--meter-deep':palette.deep, '--meter-highlight':palette.highlight, '--meter-edge':palette.edge, '--meter-glow':palette.glow, '--meter-ink':palette.ink }).forEach(([key, color]) => stamp.style.setProperty(key, color));
      if (!stamp.querySelector('.spoil-meter-value')) {
        const leagueMark = stamp.querySelector('.stamp-league')?.outerHTML || '';
        stamp.innerHTML = `<button type="button" class="spoil-meter-value" data-watch-toggle aria-label="Toggle Spoil Meter">${value}</button>${leagueMark}`;
      }
    } else if (rawValue === '?') {
      stamp.classList.add('spoil-meter-badge', 'spoil-meter-trigger');
      stamp.dataset.spoilCategory = 'SPOIL METER';
      delete stamp.dataset.meterBand;
      ['--meter-tone','--meter-deep','--meter-highlight','--meter-edge','--meter-glow','--meter-ink'].forEach(key => stamp.style.removeProperty(key));
      if (!stamp.querySelector('.spoil-meter-value')) {
        const leagueMark = stamp.querySelector('.stamp-league')?.outerHTML || '';
        stamp.innerHTML = `<button type="button" class="spoil-meter-value" data-watch-toggle aria-label="Toggle Spoil Meter">?</button>${leagueMark}`;
      }
    }
  });
  window.refreshSpoilMeterStamp = stamp => applySpoilMeter(stamp);
  const rebrandText = root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (!node.parentElement?.closest('script,style')) node.nodeValue = node.nodeValue.replace(/Must Watch/g, 'Spoil Me Not').replace(/WATCH SCORE/gi, 'SPOIL METER').replace(/WATCH INDEX/gi, 'SPOIL METER');
    });
  };
  const promoteResultDetails = root => {
    const cards = [...(root instanceof Element && root.matches('.list-game') ? [root] : []), ...(root.querySelectorAll?.('.list-game') || [])];
    cards.forEach(card => {
      const content = card.querySelector(':scope > .list-content');
      if (!content) return;
      const details = [...content.querySelectorAll(':scope > .tab-final-score, :scope > .box-score, :scope > .incident-list')];
      if (details.length) content.after(...details);
    });
  };
  const refresh = (root = document.body) => { rebrandText(root); applySpoilMeter(root); promoteResultDetails(root); };
  const modal = document.getElementById('spoil-meter-modal'), modalVersionKey = 'league-choice-introduced-v1';
  const dismiss = () => { modal?.setAttribute('hidden', ''); sessionStorage.setItem(modalVersionKey, 'true'); };
  modal?.querySelector('[data-dismiss-spoil-meter]')?.addEventListener('click', dismiss);
  modal?.addEventListener('click', event => {
    const choice = event.target.closest('[data-choose-league]');
    if (!choice) return;
    window.dispatchEvent(new CustomEvent('spoil-me-not:choose-league', { detail:{ id:choice.dataset.chooseLeague } }));
    dismiss();
  });
  if (new URLSearchParams(location.search).has('match')) modal?.setAttribute('hidden', '');
  else if (sessionStorage.getItem(modalVersionKey) === 'true') dismiss();
  const guide = document.getElementById('spoil-meter-guide'), guideTrigger = document.getElementById('spoil-meter-help');
  const closeGuide = () => { guide?.setAttribute('hidden', ''); guideTrigger?.setAttribute('aria-expanded', 'false'); guideTrigger?.focus(); };
  const openGuide = () => { guide?.removeAttribute('hidden'); guideTrigger?.setAttribute('aria-expanded', 'true'); guide?.querySelector('[data-close-spoil-meter-guide]')?.focus(); };
  guideTrigger?.addEventListener('click', openGuide);
  guide?.addEventListener('click', event => { if (event.target === guide || event.target.closest('[data-close-spoil-meter-guide]')) closeGuide(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !guide?.hidden) closeGuide(); });
  refresh();
  const roots = new Set(); let refreshFrame = 0;
  const queueRefresh = root => {
    if (!root) return;
    roots.add(root.closest?.('.match-stamp.past, .list-game') || root);
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => { refreshFrame = 0; [...roots].forEach(refresh); roots.clear(); });
  };
  new MutationObserver(records => records.forEach(record => {
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    if (target?.closest('.match-stamp.past, .list-game')) queueRefresh(target);
    record.addedNodes.forEach(node => {
      if (!(node instanceof Element)) return;
      if (node.matches('.list-game, .match-stamp.past')) queueRefresh(node);
      else if (node.querySelector('.match-stamp.past, .list-game')) queueRefresh(node);
    });
  })).observe(document.body, { childList:true, subtree:true });
})();
