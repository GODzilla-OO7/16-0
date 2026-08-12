/**
 * useProfile — local-first profile system, API-ready.
 *
 * Storage: localStorage now.
 * Future: swap `storage` calls for `await api.post('/profile', ...)` etc.
 */

const STORAGE_KEY = 'cricket16_profile'

// ─── Award definitions ──────────────────────────────────────────────────────

export const AWARDS = [
  {
    id:    'perfect_season',
    icon:  '💎',
    name:  'Flawless',
    desc:  'Complete a perfect unbeaten season',
    check: ({ wins, losses, perfect }) => perfect === true || losses === 0,
  },
  {
    id:    'world_champion',
    icon:  '🏆',
    name:  'World Champion',
    desc:  'Win an ODI or T20 World Cup',
    check: ({ stageReached, mode }) => stageReached === 'Champion' && (mode === 'odi-wc' || mode === 't20-wc'),
  },
  {
    id:    'ipl_champion',
    icon:  '🌟',
    name:  'IPL Champion',
    desc:  'Win the IPL',
    check: ({ iplOutcome }) => iplOutcome === 'champion',
  },
  {
    id:    'final_appearance',
    icon:  '🥈',
    name:  'Finalist',
    desc:  'Reach a WC or IPL Final',
    check: ({ stageReached, iplOutcome }) =>
      stageReached === 'Runner-up' || stageReached === 'Champion' || stageReached === 'Final' ||
      iplOutcome === 'champion' || iplOutcome === 'runner-up',
  },
  {
    id:    'semi_finalist',
    icon:  '⚡',
    name:  'Semi-Finalist',
    desc:  'Reach a World Cup Semi-Final',
    check: ({ stageReached }) => ['Semi-Final', 'Runner-up', 'Champion'].includes(stageReached),
  },
  {
    id:    'all_modes',
    icon:  '🌍',
    name:  'All-Format Legend',
    desc:  'Win a season in IPL, ODI WC, and T20 WC',
    check: ({ modesWon }) => modesWon?.has('ipl') && modesWon?.has('odi-wc') && modesWon?.has('t20-wc'),
  },
  {
    id:    'ten_seasons',
    icon:  '📋',
    name:  'Veteran',
    desc:  'Complete 10 seasons total',
    check: ({ totalSeasons }) => (totalSeasons ?? 0) >= 10,
  },
  {
    id:    'dominant_run',
    icon:  '👑',
    name:  'Dominant',
    desc:  'Finish a season with 85%+ win rate',
    check: ({ wins, total }) => total > 0 && wins / total >= 0.85,
  },
  {
    id:    'underdog',
    icon:  '🐉',
    name:  'Underdog',
    desc:  'Win a tournament predicted to finish in the bottom group',
    check: ({ stageReached, iplOutcome, predictedPos }) =>
      (stageReached === 'Champion' || iplOutcome === 'champion') &&
      (predictedPos === 'Bottom 3' || predictedPos === 'Group stage'),
  },
  {
    id:    'hard_champion',
    icon:  '🔒',
    name:  'Iron Will',
    desc:  'Win a championship on Hard difficulty',
    check: ({ stageReached, iplOutcome, difficulty }) =>
      difficulty === 'hard' &&
      (stageReached === 'Champion' || iplOutcome === 'champion'),
  },
  // ── New medals ────────────────────────────────────────────────────────────
  {
    id:    'quarter_century',
    icon:  '🎯',
    name:  'Quarter Century',
    desc:  'Play 25 seasons',
    check: ({ totalSeasons }) => (totalSeasons ?? 0) >= 25,
  },
  {
    id:    'dynasty',
    icon:  '👸',
    name:  'Dynasty',
    desc:  'Win the IPL 3 times',
    check: ({ iplWins }) => (iplWins ?? 0) >= 3,
  },
  {
    id:    'back_to_back',
    icon:  '🔁',
    name:  'Back to Back',
    desc:  'Win the IPL two seasons in a row',
    // history is the OLD history (before current season is appended), so history[0] = previous season
    check: ({ iplOutcome, history }) =>
      iplOutcome === 'champion' && history?.length >= 1 && history[0]?.iplOutcome === 'champion',
  },
  {
    id:    'run_double',
    icon:  '🔥',
    name:  'On Fire',
    desc:  'Win the IPL twice in a row in the same session',
    // Both this season and last must share the same runId, meaning they're from the same continuous play session
    check: ({ iplOutcome, history, runId }) =>
      iplOutcome === 'champion' &&
      history?.length >= 1 &&
      history[0]?.iplOutcome === 'champion' &&
      history[0]?.runId === runId,
  },
  {
    id:    'run_triple',
    icon:  '👑🔥',
    name:  'Reign of Fire',
    desc:  'Win the IPL three times in a row in the same session',
    check: ({ iplOutcome, history, runId }) =>
      iplOutcome === 'champion' &&
      history?.length >= 2 &&
      history[0]?.iplOutcome === 'champion' &&
      history[1]?.iplOutcome === 'champion' &&
      history[0]?.runId === runId &&
      history[1]?.runId === runId,
  },
  {
    id:    'big_guns',
    icon:  '💪',
    name:  'Big Guns',
    desc:  'Finish an IPL season with 12 or more wins',
    check: ({ wins, mode }) => wins >= 12 && mode === 'ipl',
  },
  {
    id:    'trust_gaffer',
    icon:  '🤝',
    name:  'Trust the Gaffer',
    desc:  'Win with a coach who has a tournament bonus',
    check: ({ stageReached, iplOutcome, manager, mode }) =>
      (stageReached === 'Champion' || iplOutcome === 'champion') &&
      manager != null &&
      (manager.wcWinnerFor ?? []).includes(mode) &&
      (manager.bonus?.strength ?? 0) > 0,
  },
  {
    id:    'prime_time',
    icon:  '⚡',
    name:  'Prime Time',
    desc:  'Win a championship in Prime ratings mode',
    check: ({ stageReached, iplOutcome, ratingType }) =>
      ratingType === 'prime' &&
      (stageReached === 'Champion' || iplOutcome === 'champion'),
  },
  {
    id:    'flawless_cup',
    icon:  '🎖️',
    name:  'Immaculate',
    desc:  'Win a World Cup without losing a single match',
    check: ({ losses, stageReached, mode }) =>
      losses === 0 &&
      stageReached === 'Champion' &&
      (mode === 'odi-wc' || mode === 't20-wc'),
  },
  {
    id:    'half_century',
    icon:  '🏟️',
    name:  'Half Century',
    desc:  'Play 50 seasons',
    check: ({ totalSeasons }) => (totalSeasons ?? 0) >= 50,
  },
  {
    id:    'ipl_playoff_reach',
    icon:  '🎪',
    name:  'Playoff Bound',
    desc:  'Qualify for the IPL Playoffs (top 4)',
    check: ({ iplPosition }) => iplPosition != null && iplPosition <= 4,
  },
  // ── Cult / squad medals ───────────────────────────────────────────────────
  {
    id:    'desh_bhakt',
    icon:  '🇮🇳',
    name:  'Desh Bhakt',
    desc:  'Win the IPL with an all-Indian squad',
    check: ({ iplOutcome, team }) =>
      iplOutcome === 'champion' &&
      Array.isArray(team) && team.length > 0 &&
      team.every(p => p.nationality === 'India'),
  },
  {
    id:    'two_man_army',
    icon:  '🎯',
    name:  'Two-Man Army',
    desc:  'Win the IPL with only 2 bowlers in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      ((composition['pace-bowler'] ?? 0) + (composition['spin-bowler'] ?? 0)) <= 2,
  },
  {
    id:    'streets_wont_forget',
    icon:  '🌟',
    name:  "Streets Won't Forget",
    desc:  'Win the IPL with a squad averaging 92+ overall',
    check: ({ iplOutcome, team }) => {
      if (iplOutcome !== 'champion' || !Array.isArray(team) || team.length === 0) return false
      const avg = team.reduce((s, p) => s + (p.overall ?? 0), 0) / team.length
      return avg >= 92
    },
  },
  {
    id:    'cult_xi',
    icon:  '👑',
    name:  'Cult XI',
    desc:  'Win the IPL with 3 or more players rated 95+ overall',
    check: ({ iplOutcome, team }) =>
      iplOutcome === 'champion' &&
      Array.isArray(team) &&
      team.filter(p => (p.overall ?? 0) >= 95).length >= 3,
  },
  {
    id:    'spider_web',
    icon:  '🌀',
    name:  "Spider's Web",
    desc:  'Win the IPL using 4+ spinners in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      (composition['spin-bowler'] ?? 0) >= 4,
  },
  {
    id:    'pace_is_pace',
    icon:  '💨',
    name:  'Pace is Pace',
    desc:  'Win the IPL using 4+ pace bowlers in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      (composition['pace-bowler'] ?? 0) >= 4,
  },
  {
    id:    'united_nations',
    icon:  '🌍',
    name:  'United Nations',
    desc:  'Win a championship with players from 5+ different countries',
    check: ({ stageReached, iplOutcome, team }) => {
      if (!(stageReached === 'Champion' || iplOutcome === 'champion')) return false
      if (!Array.isArray(team) || team.length === 0) return false
      return new Set(team.map(p => p.nationality).filter(Boolean)).size >= 5
    },
  },
  {
    id:    'all_rounders_army',
    icon:  '⚡',
    name:  "All-Rounder's Army",
    desc:  'Win the IPL with 4 or more all-rounders in your squad',
    check: ({ iplOutcome, composition }) =>
      iplOutcome === 'champion' &&
      composition != null &&
      (composition['all-rounder'] ?? 0) >= 4,
  },
  {
    id:    'batting_blitz',
    icon:  '💥',
    name:  'Batting Blitz',
    desc:  'Win the IPL with 7+ batters (openers + top + middle + keeper)',
    check: ({ iplOutcome, composition }) => {
      if (iplOutcome !== 'champion' || composition == null) return false
      const batters = (composition['opener'] ?? 0) + (composition['top-order'] ?? 0)
        + (composition['middle-order'] ?? 0) + (composition['wicket-keeper'] ?? 0)
      return batters >= 7
    },
  },
  {
    id:    'global_xi',
    icon:  '🗺️',
    name:  'Global XI',
    desc:  'Win a World Cup with players from 4+ different countries',
    check: ({ stageReached, mode, team }) => {
      if (stageReached !== 'Champion') return false
      if (!(mode === 'odi-wc' || mode === 't20-wc')) return false
      if (!Array.isArray(team) || team.length === 0) return false
      return new Set(team.map(p => p.nationality).filter(Boolean)).size >= 4
    },
  },
]

// ─── Default profile shape ──────────────────────────────────────────────────

function defaultProfile() {
  return {
    email:         null,
    displayName:   null,
    createdAt:     new Date().toISOString(),
    totalSeasons:  0,
    iplWins:       0,            // count of IPL championships
    modesWon:      [],           // array (serialised Set)
    awards:        [],           // earned award IDs
    history:       [],           // [{mode, wins, losses, stageReached, iplOutcome, rating, date}]
  }
}

// ─── Storage layer (swap for API calls when hosting) ───────────────────────

const storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  },
  save(profile) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)) }
    catch { /* quota exceeded / SSR */ }
  },
  clear() {
    try { localStorage.removeItem(STORAGE_KEY) }
    catch { /* */ }
  },
}

// ─── Public API ────────────────────────────────────────────────────────────

export function loadProfile() {
  return storage.load() ?? defaultProfile()
}

export function saveProfile(profile) {
  storage.save(profile)
}

export function updateEmail(email, displayName) {
  const p = loadProfile()
  p.email       = email?.trim() || null
  p.displayName = displayName?.trim() || null
  saveProfile(p)
  return p
}

/**
 * Called after every season. Records history, checks awards, returns updated profile.
 * `data` shape:
 *   { mode, wins, losses, total, stageReached, iplOutcome, iplPosition,
 *     perfect, difficulty, predictedPos, manager }
 */
export function recordSeason(data) {
  const p = loadProfile()

  // Increment counters
  p.totalSeasons = (p.totalSeasons ?? 0) + 1
  if (data.iplOutcome === 'champion') p.iplWins = (p.iplWins ?? 0) + 1

  // Track modes won
  const modesWonSet = new Set(p.modesWon ?? [])
  if (data.iplOutcome === 'champion') modesWonSet.add('ipl')
  if (data.stageReached === 'Champion' && data.mode === 'odi-wc') modesWonSet.add('odi-wc')
  if (data.stageReached === 'Champion' && data.mode === 't20-wc') modesWonSet.add('t20-wc')
  p.modesWon = [...modesWonSet]

  // Check awards
  const earnedSet = new Set(p.awards ?? [])
  const context = { ...data, modesWon: modesWonSet, totalSeasons: p.totalSeasons, iplWins: p.iplWins, history: p.history ?? [], runId: data.runId ?? null }
  const newlyEarned = []

  for (const award of AWARDS) {
    if (earnedSet.has(award.id)) continue
    try {
      if (award.check(context)) {
        earnedSet.add(award.id)
        newlyEarned.push(award)
      }
    } catch { /* */ }
  }
  p.awards = [...earnedSet]

  // Add to history (keep last 50)
  p.history = [
    {
      mode:         data.mode,
      wins:         data.wins,
      losses:       data.losses,
      stageReached: data.stageReached,
      iplOutcome:   data.iplOutcome,
      difficulty:   data.difficulty,
      manager:      data.manager?.name ?? null,
      runId:        data.runId ?? null,
      seasonNumber: data.seasonNumber ?? null,
      date:         new Date().toISOString(),
    },
    ...(p.history ?? []),
  ].slice(0, 50)

  saveProfile(p)
  return { profile: p, newlyEarned }
}

export function clearProfile() {
  storage.clear()
}
