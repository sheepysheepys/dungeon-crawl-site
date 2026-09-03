// Silly flavor text + viewership badges
(function (App) {
  App.Features = App.Features || {};

  function pick(arr) {
    if (!arr?.length) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  const DAMAGE_QUIPS = {
    light: [
      "That's gotta hurt!",
      'Oof — solid hit.',
      'You felt that one.',
      'Not great, not terrible.',
      'The table winces sympathetically.',
    ],
    heavy: [
      'That one stung!',
      'Big hit — buckle up.',
      'Yikes. The crowd goes quiet.',
      'Someone audibly gasped.',
      'That left a mark.',
    ],
    brutal: [
      'Absolutely brutal!',
      'That was vicious!',
      'The dungeon itself flinched.',
      'Maximum ow. Maximum drama.',
      'Highlight-reel pain right there.',
    ],
    glancing: [
      'Barely a scratch.',
      'More bark than bite.',
      'You shrug most of it off.',
      'Could have been worse!',
    ],
  };

  const STRIP_QUIPS = {
    1: [
      'Wardrobe malfunction!',
      'Was that velcro giving up?',
      'One layer down — dignity holding on by a thread.',
      'The crowd notices. Oh, they notice.',
      'A button pops. A legend is born.',
      'That was your favorite layer, wasn\'t it?',
      'The dungeon keeps score. You\'re losing.',
      'Somewhere, a viewer rewinds.',
    ],
    2: [
      'Double wardrobe malfunction!',
      'That outfit is losing the argument.',
      'Two layers gone — the viewers are leaning in.',
      'Fashion emergency declared.',
      'You are now dangerously close to the plot.',
      'Two down. The chat is unhinged.',
      'That\'s not a look, that\'s a cry for help.',
      'Double or nothing — and you got nothing.',
    ],
    3: [
      'Triple strip! The dungeon approves.',
      'At this rate you\'re a highlight reel.',
      'Three layers? Someone\'s taking notes.',
      'The silhouette updates in real time. Yikes.',
      'Three layers gone — call a stylist. Or don\'t.',
      'The audience has entered a fugue state.',
      'You\'re one bad roll from a montage.',
      'Legendary strip arc unlocked.',
    ],
    knockdown: [
      'Knocked down — fully exposed! The crowd erupts.',
      'Zero layers. Maximum drama. Encore?',
      'Down and stripped bare — legendary viewership spike incoming.',
      'The dungeon floor claims another outfit. All of it.',
      'Flat on your back and out of excuses.',
      'The strip counter hits zero. The cheers do not.',
      'Down goes the fighter — and every last layer.',
      'KO\'d, bare, and somehow still the main character.',
    ],
  };

  function damageQuip({ hpLoss = 0 } = {}) {
    const loss = Math.max(0, Number(hpLoss) || 0);
    if (loss >= 3) return pick(DAMAGE_QUIPS.brutal);
    if (loss === 2) return pick(DAMAGE_QUIPS.heavy);
    if (loss === 1) return pick(DAMAGE_QUIPS.light);
    return pick(DAMAGE_QUIPS.glancing);
  }

  function stripQuip({ stripHits = 0, knockedDown = false } = {}) {
    if (knockedDown) return pick(STRIP_QUIPS.knockdown);
    const key = Math.min(3, Math.max(1, Number(stripHits) || 0));
    if (key <= 0) return '';
    return pick(STRIP_QUIPS[key]);
  }

  const BADGES = {
    crown: { emoji: '👑', label: 'Viewer King', className: 'fun-badge--crown' },
    underdog: {
      emoji: '🐸',
      label: 'Underdog Energy',
      className: 'fun-badge--underdog',
    },
  };

  function renderBadgeEl(el, type) {
    if (!el) return;
    const b = BADGES[type];
    if (!b) {
      el.hidden = true;
      el.textContent = '';
      el.className = 'fun-badge';
      return;
    }
    el.hidden = false;
    el.className = `fun-badge ${b.className}`;
    el.textContent = `${b.emoji} ${b.label}`;
    el.title = b.label;
  }

  /**
   * Compare viewer counts across active characters.
   * Returns 'crown' | 'underdog' | null for the given character.
   */
  async function viewershipBadgeFor(sb, chId) {
    if (!sb || !chId) return null;

    const { data: chars } = await sb
      .from('characters')
      .select('id')
      .eq('is_active', true);
    const ids = (chars || []).map((c) => c.id);
    if (ids.length < 2) return null;

    const { data: vw } = await sb
      .from('character_viewership')
      .select('character_id, viewers')
      .in('character_id', ids);

    const rows = (vw || []).filter(
      (r) =>
        r.viewers !== null &&
        r.viewers !== undefined &&
        r.viewers !== '' &&
        Number.isFinite(Number(r.viewers))
    );
    if (rows.length < 2) return null;

    const mine = rows.find((r) => r.character_id === chId);
    if (!mine) return null;

    const counts = rows.map((r) => Number(r.viewers));
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const myCount = Number(mine.viewers);

    if (max === min) return null;
    if (myCount === max) return 'crown';
    if (myCount === min) return 'underdog';
    return null;
  }

  async function applyViewershipBadges(sb, chId) {
    const type = await viewershipBadgeFor(sb, chId);
    renderBadgeEl(document.getElementById('vwBadge'), type);
    renderBadgeEl(document.getElementById('vwBadgePanel'), type);
  }

  /** Map charId -> 'crown' | 'underdog' | null for DM party table */
  async function viewershipBadgesForParty(sb, charIds) {
    const out = new Map();
    if (!sb || !charIds?.length) return out;

    const { data: vw } = await sb
      .from('character_viewership')
      .select('character_id, viewers')
      .in('character_id', charIds);

    const rows = (vw || []).filter((r) => Number.isFinite(Number(r.viewers)));
    if (rows.length < 2) return out;

    const counts = rows.map((r) => Number(r.viewers));
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max === min) return out;

    for (const r of rows) {
      const n = Number(r.viewers);
      if (n === max) out.set(r.character_id, 'crown');
      else if (n === min) out.set(r.character_id, 'underdog');
    }
    return out;
  }

  function badgeEmoji(type) {
    return BADGES[type]?.emoji || '';
  }

  App.Features.flavor = {
    pick,
    damageQuip,
    stripQuip,
    applyViewershipBadges,
    viewershipBadgeFor,
    viewershipBadgesForParty,
    badgeEmoji,
  };
})(window.App || (window.App = {}));
