(() => {
  const categories = [
    [80, 'Must Watch', 4],
    [65, 'Worth It', 3],
    [45, 'Your Call', 2],
    [25, 'Save Your 90', 1],
    [0, "Don't Bother", 0]
  ];

  const categoryFor = score => categories.find(([minimum]) => score >= minimum) || categories.at(-1);
  const meterPaletteFor = score => {
    if (score >= 80) return {
      tone: '#e13f45', deep: '#65131e', highlight: '#ffd2b8', edge: '#ffb5a2', glow: 'rgba(225,63,69,.48)', ink: '#fffaf4'
    };
    if (score >= 65) return {
      tone: '#ea7436', deep: '#773117', highlight: '#ffe1a5', edge: '#ffc27d', glow: 'rgba(234,116,54,.38)', ink: '#fffaf1'
    };
    if (score >= 45) return {
      tone: '#c79b39', deep: '#5c4715', highlight: '#fff0ad', edge: '#e6c46b', glow: 'rgba(199,155,57,.25)', ink: '#fffbed'
    };
    if (score >= 25) return {
      tone: '#59666e', deep: '#273238', highlight: '#c9d8dd', edge: '#84969d', glow: 'rgba(98,121,130,.17)', ink: '#f1f5f4'
    };
    return {
      tone: '#34383a', deep: '#171a1b', highlight: '#a7afb0', edge: '#626a6b', glow: 'rgba(0,0,0,.24)', ink: '#d8dddc'
    };
  };

  const applySpoilMeter = root => {
    root.querySelectorAll('.match-stamp.past').forEach(stamp => {
      // A calculating stamp contains only an icon, whose empty text used to
      // coerce to Number('') === 0 and briefly paint a false meter score.
      const rawValue = stamp.textContent.trim();
      const value = rawValue === '' ? NaN : Number(rawValue);
      if (Number.isFinite(value) && value >= 0 && value <= 100) {
        const [, label, band] = categoryFor(value);
        const palette = meterPaletteFor(value);
        stamp.classList.add('spoil-meter-badge');
        stamp.classList.remove('spoil-meter-trigger');
        stamp.dataset.spoilCategory = label;
        stamp.dataset.meterBand = band;
        stamp.style.setProperty('--meter-tone', palette.tone);
        stamp.style.setProperty('--meter-deep', palette.deep);
        stamp.style.setProperty('--meter-highlight', palette.highlight);
        stamp.style.setProperty('--meter-edge', palette.edge);
        stamp.style.setProperty('--meter-glow', palette.glow);
        stamp.style.setProperty('--meter-ink', palette.ink);
        if (!stamp.querySelector('.spoil-meter-value')) {
          const leagueMark = stamp.querySelector('.stamp-league')?.outerHTML || '';
          stamp.innerHTML = `<button type="button" class="spoil-meter-value" data-watch-toggle aria-label="Toggle Spoil Meter">${value}</button>${leagueMark}`;
        }
      } else if (stamp.textContent.trim() === '?') {
        stamp.classList.add('spoil-meter-badge', 'spoil-meter-trigger');
        stamp.dataset.spoilCategory = 'SPOIL METER';
        delete stamp.dataset.meterBand;
        stamp.style.removeProperty('--meter-tone');
        stamp.style.removeProperty('--meter-deep');
        stamp.style.removeProperty('--meter-highlight');
        stamp.style.removeProperty('--meter-edge');
        stamp.style.removeProperty('--meter-glow');
        stamp.style.removeProperty('--meter-ink');
        if (!stamp.querySelector('.spoil-meter-value')) {
          const leagueMark = stamp.querySelector('.stamp-league')?.outerHTML || '';
          stamp.innerHTML = `<button type="button" class="spoil-meter-value" data-watch-toggle aria-label="Toggle Spoil Meter">?</button>${leagueMark}`;
        }
      }
    });
  };

  const rebrandText = root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (node.parentElement?.closest('script,style')) return;
      node.nodeValue = node.nodeValue
        .replace(/Must Watch/g, 'Spoil Me Not')
        .replace(/WATCH SCORE/gi, 'SPOIL METER')
        .replace(/WATCH INDEX/gi, 'SPOIL METER');
    });
  };

  const promoteResultDetails = root => {
    root.querySelectorAll('.list-game').forEach(card => {
      const content = card.querySelector(':scope > .list-content');
      if (!content) return;
      const details = [...content.querySelectorAll(':scope > .tab-final-score, :scope > .box-score, :scope > .incident-list')];
      if (details.length) content.after(...details);
    });
  };

  const refresh = () => {
    rebrandText(document.body);
    applySpoilMeter(document);
    promoteResultDetails(document);
  };

  const modal = document.getElementById('spoil-meter-modal');
  const modalVersionKey = 'league-choice-introduced-v1';
  const dismiss = () => {
    modal?.setAttribute('hidden', '');
    sessionStorage.setItem(modalVersionKey, 'true');
  };
  modal?.querySelector('[data-dismiss-spoil-meter]')?.addEventListener('click', dismiss);
  modal?.addEventListener('click', event => {
    const choice = event.target.closest('[data-choose-league]');
    if (!choice) return;
    window.dispatchEvent(new CustomEvent('spoil-me-not:choose-league', { detail: { id: choice.dataset.chooseLeague } }));
    dismiss();
  });
  if (new URLSearchParams(location.search).has('match')) {
    modal?.setAttribute('hidden', '');
  } else if (sessionStorage.getItem(modalVersionKey) === 'true') dismiss();

  const guide = document.getElementById('spoil-meter-guide');
  const guideTrigger = document.getElementById('spoil-meter-help');
  const closeGuide = () => {
    guide?.setAttribute('hidden', '');
    guideTrigger?.setAttribute('aria-expanded', 'false');
    guideTrigger?.focus();
  };
  const openGuide = () => {
    guide?.removeAttribute('hidden');
    guideTrigger?.setAttribute('aria-expanded', 'true');
    guide?.querySelector('[data-close-spoil-meter-guide]')?.focus();
  };
  guideTrigger?.addEventListener('click', openGuide);
  guide?.addEventListener('click', event => {
    if (event.target === guide || event.target.closest('[data-close-spoil-meter-guide]')) closeGuide();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !guide?.hidden) closeGuide();
  });

  refresh();
  new MutationObserver(refresh).observe(document.body, {childList: true, subtree: true});
})();
