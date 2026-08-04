import { MODE_CONFIG } from '../data/players.js'

// ─── Team Strength ─────────────────────────────────────────────────────────

export function calcTeamStrength(team, manager, mode) {
  if (!team || team.length === 0) return 50

  // Batting: avg overall of batsmen + half of all-rounders
  // Bowling: avg overall of bowlers + half of all-rounders
  // Overall: avg of batting and bowling
  const BAT_ROLES  = new Set(['opener','top-order','middle-order','wicket-keeper'])
  const BOWL_ROLES = new Set(['pace-bowler','spin-bowler'])

  let batSum = 0, batCount = 0
  let bowlSum = 0, bowlCount = 0

  team.forEach(p => {
    const ovr = p.overall
    if (p.role === 'all-rounder') {
      batSum  += ovr / 2;  batCount  += 0.5
      bowlSum += ovr / 2;  bowlCount += 0.5
    } else if (BAT_ROLES.has(p.role)) {
      batSum  += ovr;  batCount++
    } else if (BOWL_ROLES.has(p.role)) {
      bowlSum += ovr;  bowlCount++
    }
  })

  const batting = batCount  > 0 ? batSum  / batCount  : 50
  const bowling = bowlCount > 0 ? bowlSum / bowlCount : 50
  const fielding = team.reduce((s, p) => s + (p.fielding ?? 70), 0) / team.length

  const base = Math.round(0.45 * batting + 0.45 * bowling + 0.10 * fielding)
  const bonus = (manager?.wcWinnerFor?.includes(mode) ? (manager?.bonus?.strength ?? 0) : 0)

  // Position mismatch penalty (simulation impact)
  // Rule 1: any opener not in positions 1-3 → flat -3
  // Rule 2: any pure batsman behind any pure bowler → flat -2
  const PURE_BAT_ROLES = new Set(['opener','top-order','middle-order'])
  const BOWL_ROLES_P   = new Set(['pace-bowler','spin-bowler'])
  const numOpeners     = team.filter(p => p.role === 'opener').length
  const openersInTop3  = team.slice(0, 3).filter(p => p.role === 'opener').length
  const misplacedOpeners = Math.max(0, Math.min(numOpeners, 2) - openersInTop3)

  // WK and all-rounders can bat anywhere — only pure batsmen (opener/top/middle) trigger penalty
  const firstBowlerIdx  = team.findIndex(p => BOWL_ROLES_P.has(p.role))
  const lastPureBatIdx  = team.reduce((acc, p, i) => PURE_BAT_ROLES.has(p.role) ? i : acc, -1)
  const batsmanBelowBowler = firstBowlerIdx !== -1 && lastPureBatIdx > firstBowlerIdx

  const positionPenalty = (misplacedOpeners > 0 ? 3 : 0) + (batsmanBelowBowler ? 2 : 0)

  return Math.max(30, Math.min(99, base + bonus - positionPenalty))
}

// ─── Player stats generation ───────────────────────────────────────────────

function weightedPick(players, key) {
  // Squared weights so high-rated players dominate much more strongly
  const weights = players.map(p => Math.pow(p[key] || 1, 2))
  const total = weights.reduce((s, w) => s + w, 0)
  let rand = Math.random() * total
  for (let i = 0; i < players.length; i++) {
    rand -= weights[i]
    if (rand <= 0) return players[i]
  }
  return players[players.length - 1]
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }
function rng(min, max) { return min + Math.random() * (max - min) }

export function generateMatchStats(team, won, format) {
  if (!team || team.length === 0) return null

  const batters = team.filter(p =>
    ['opener','top-order','middle-order','wicket-keeper','all-rounder'].includes(p.role)
  )
  const bowlers = team.filter(p =>
    ['pace-bowler','spin-bowler','all-rounder'].includes(p.role)
  )

  if (batters.length === 0) return null

  // Top scorer
  const scorer = weightedPick(batters, 'batting')
  const runsBase  = format === 't20' ? 18 : 30
  const runsRange = format === 't20' ? (won ? 72 : 42) : (won ? 110 : 70)
  const rMin  = 0.45 + (scorer.batting / 100) * 0.25
  const rMax  = 0.70 + (scorer.batting / 100) * 0.40
  const runs  = Math.round(clamp(runsBase + Math.pow(scorer.batting / 100, 1.3) * runsRange * rng(rMin, rMax), runsBase, format === 't20' ? 110 : 180))
  const sr    = format === 't20' ? rng(110, 165) : rng(75, 120)
  const balls = Math.round(runs / sr * 100)

  // Second batter highlight (occasionally)
  let scorer2 = null
  if (Math.random() > 0.4 && batters.length > 1) {
    const remaining = batters.filter(p => p.id !== scorer.id)
    if (remaining.length > 0) {
      scorer2 = weightedPick(remaining, 'batting')
      const r2max = format === 't20' ? 60 : 90
      const r2runs = Math.round(10 + (scorer2.batting / 100) * r2max * rng(0.3, 0.8))
      const r2balls = Math.round(r2runs / (sr * 0.85) * 100)
      scorer2 = { name: scorer2.name, runs: r2runs, balls: r2balls, role: scorer2.role }
    }
  }

  // Top bowler — also track balls bowled + runs conceded for economy
  let topBowler = null
  if (bowlers.length > 0) {
    const bowler = weightedPick(bowlers, 'bowling')
    const maxWkts = won ? 4 : 3
    const wickets = Math.min(5, Math.floor(rng(0.3, 0.8) + Math.pow(bowler.bowling / 100, 1.3) * maxWkts * rng(0.6, 1.3)))
    const rc = Math.round(rng(15, 35) + wickets * 5)
    const overs = format === 't20' ? rng(2.5, 4) : rng(6, 10)
    const bowlBalls = Math.round(overs * 6)
    topBowler = { name: bowler.name, wickets, runsConceded: rc, bowlBalls, role: bowler.role }
  }

  // Fielding highlight
  const fielder = team[Math.floor(Math.random() * team.length)].name
  const fieldHighlight = Math.random() > 0.5
    ? `${fielder} took a stunning catch`
    : `${fielder} pulled off a direct hit run-out`

  return {
    topScorer:  { name: scorer.name, runs, balls, sr: sr.toFixed(0), role: scorer.role },
    topScorer2: scorer2,
    topBowler,
    fieldHighlight,
  }
}

// ─── Score generation ──────────────────────────────────────────────────────

function t20Score(battingStr, bowlingStr) {
  const base = 120 + (battingStr - bowlingStr) * 0.5
  const runs = Math.round(clamp(base + rng(-20, 30), 80, 230))
  const wickets = Math.floor(rng(2, 10))
  return { runs, wickets }
}

function odiScore(battingStr, bowlingStr) {
  const base = 245 + (battingStr - bowlingStr) * 0.8
  const runs = Math.round(clamp(base + rng(-40, 50), 120, 400))
  const wickets = Math.floor(rng(2, 10))
  return { runs, wickets }
}

function buildResult(myScore, oppScore, won) {
  const fmt = s => `${s.runs}/${s.wickets}`
  if (won) {
    if (myScore.runs > oppScore.runs) {
      return { summary: `Won by ${myScore.runs - oppScore.runs} runs`, myScore: fmt(myScore), oppScore: fmt(oppScore) }
    }
    const wl = 10 - myScore.wickets
    return { summary: `Won by ${wl} wicket${wl !== 1 ? 's' : ''}`, myScore: fmt(myScore), oppScore: fmt(oppScore) }
  } else {
    if (oppScore.runs > myScore.runs) {
      return { summary: `Lost by ${oppScore.runs - myScore.runs} runs`, myScore: fmt(myScore), oppScore: fmt(oppScore) }
    }
    const wl = 10 - oppScore.wickets
    return { summary: `Lost by ${wl} wicket${wl !== 1 ? 's' : ''}`, myScore: fmt(myScore), oppScore: fmt(oppScore) }
  }
}

// ─── Opponent per-match stats (for MatchCard display) ──────────────────────

function generateOppMatchStats(oppName, oppStrength, format) {
  const stars = getOppStars(oppName)
  const str   = oppStrength ?? 65

  // Pick a batter star
  const batStar  = stars.find(s => ['opener','top-order','middle-order','wicket-keeper','all-rounder'].includes(s.role)) || stars[0]
  const batStar2 = stars.find(s => s !== batStar && ['opener','top-order','middle-order','wicket-keeper','all-rounder'].includes(s.role))
  const bowlStar = stars.find(s => ['pace-bowler','spin-bowler','all-rounder'].includes(s.role))

  const runsBase  = format === 't20' ? 14 : 28
  const runsRange = format === 't20' ? 62 : 95
  const runs  = Math.round(clamp(runsBase + (str / 100) * runsRange * rng(0.3, 1.0), runsBase, format === 't20' ? 100 : 165))
  const balls = Math.round(runs / rng(110, 160) * 100)
  const runs2 = batStar2 ? Math.round(clamp(8 + (str / 100) * 55 * rng(0.3, 0.8), 8, format === 't20' ? 60 : 90)) : null
  const wickets = bowlStar ? Math.min(5, Math.floor(rng(0.5, 1) + (str / 100) * 4 * rng(0.4, 1.1))) : 0
  const runsConceded = Math.round(rng(15, 35))

  return {
    topScorer:  { name: batStar.name, runs, balls },
    topScorer2: batStar2 && runs2 ? { name: batStar2.name, runs: runs2 } : null,
    topBowler:  bowlStar ? { name: bowlStar.name, wickets, runsConceded } : null,
  }
}

// ─── Single Match ──────────────────────────────────────────────────────────

export function simulateMatch(myStrength, opponent, format, matchNum, team) {
  const diff = myStrength - opponent.strength
  const winProb = clamp(1 / (1 + Math.exp(-diff / 12)) + rng(-0.05, 0.05), 0.05, 0.95)
  const won = Math.random() < winProb

  const scoreFn = format === 'odi' ? odiScore : t20Score

  let myScore, oppScore
  if (won) {
    if (Math.random() < 0.5) {
      myScore  = scoreFn(myStrength, opponent.strength)
      oppScore = { runs: clamp(myScore.runs - Math.round(rng(5, 50)), 50, myScore.runs - 1), wickets: Math.floor(rng(4, 10)) }
    } else {
      oppScore = scoreFn(opponent.strength, myStrength)
      const wl = Math.floor(rng(1, 8))
      myScore  = { runs: oppScore.runs + Math.round(rng(1, 10)), wickets: 10 - wl }
    }
  } else {
    if (Math.random() < 0.5) {
      myScore  = scoreFn(myStrength, opponent.strength)
      oppScore = { runs: myScore.runs + Math.round(rng(5, 40)), wickets: Math.floor(rng(2, 8)) }
    } else {
      oppScore = scoreFn(opponent.strength, myStrength)
      myScore  = { runs: clamp(oppScore.runs - Math.round(rng(5, 50)), 50, oppScore.runs - 1), wickets: Math.floor(rng(6, 10)) }
    }
  }

  const result   = buildResult(myScore, oppScore, won)
  const stats    = team ? generateMatchStats(team, won, format) : null
  const oppStats = generateOppMatchStats(opponent.name, opponent.strength, format)

  return { matchNum, opponent: opponent.name, won, ...result, stats, oppStats }
}

// ─── Tournament structure ──────────────────────────────────────────────────

function makeOpponents(mode, count, options = {}) {
  const config = MODE_CONFIG[mode]
  const { preDrawnNames, excludeName } = options
  // If pre-drawn names provided (from group draw), use those; otherwise shuffle pool
  let pool
  if (preDrawnNames) {
    pool = [...preDrawnNames]
  } else {
    pool = [...config.opponents]
    // Shuffle for variety
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
  }
  // Exclude a specific name if needed (SF opponent excluded from Final draw)
  if (excludeName) {
    const filtered = pool.filter(n => n !== excludeName)
    if (filtered.length > 0) pool = filtered
  }
  const opponents = []
  for (let i = 0; i < count; i++) {
    const name = pool[i % pool.length]
    const baseStrength = 55 + (i / Math.max(count, 1)) * 22
    opponents.push({ name, strength: clamp(baseStrength + rng(-8, 8), 50, 87) })
  }
  return opponents
}

// ─── Opponent star player pools (for tournament best XI) ───────────────────

const OPP_STARS = {
  'Mumbai Indians':                [{ name: 'Rohit Sharma', role: 'opener' },    { name: 'Jasprit Bumrah', role: 'pace-bowler' },   { name: 'Suryakumar Yadav', role: 'top-order' }],
  'Chennai Super Kings':           [{ name: 'MS Dhoni', role: 'wicket-keeper' }, { name: 'Ravindra Jadeja', role: 'all-rounder' },  { name: 'Ruturaj Gaikwad', role: 'opener' }],
  'Royal Challengers Bangalore':   [{ name: 'Virat Kohli', role: 'top-order' },  { name: 'AB de Villiers', role: 'wicket-keeper' }, { name: 'Mohammed Siraj', role: 'pace-bowler' }],
  'Royal Challengers Bengaluru':   [{ name: 'Virat Kohli', role: 'top-order' },  { name: 'Rajat Patidar', role: 'opener' },         { name: 'Josh Hazlewood', role: 'pace-bowler' }],
  'Kolkata Knight Riders':         [{ name: 'Andre Russell', role: 'all-rounder' }, { name: 'Sunil Narine', role: 'all-rounder' },  { name: 'Pat Cummins', role: 'pace-bowler' }],
  'Delhi Capitals':                [{ name: 'Rishabh Pant', role: 'wicket-keeper' }, { name: 'Kuldeep Yadav', role: 'spin-bowler' }, { name: 'David Warner', role: 'opener' }],
  'Rajasthan Royals':              [{ name: 'Jos Buttler', role: 'opener' },     { name: 'Yashasvi Jaiswal', role: 'opener' },      { name: 'Trent Boult', role: 'pace-bowler' }],
  'Sunrisers Hyderabad':           [{ name: 'Travis Head', role: 'opener' },     { name: 'Heinrich Klaasen', role: 'wicket-keeper' },{ name: 'Pat Cummins', role: 'pace-bowler' }],
  'Punjab Kings':                  [{ name: 'Shikhar Dhawan', role: 'opener' },  { name: 'Arshdeep Singh', role: 'pace-bowler' },   { name: 'Babar Azam', role: 'top-order' }],
  'Lucknow Super Giants':          [{ name: 'KL Rahul', role: 'wicket-keeper' }, { name: 'Nicholas Pooran', role: 'middle-order' }, { name: 'Ravi Bishnoi', role: 'spin-bowler' }],
  'Gujarat Titans':                [{ name: 'Shubman Gill', role: 'opener' },    { name: 'Rashid Khan', role: 'all-rounder' },      { name: 'Mohammed Shami', role: 'pace-bowler' }],
  'Australia':                     [{ name: 'David Warner', role: 'opener' },    { name: 'Steve Smith', role: 'top-order' },        { name: 'Mitchell Starc', role: 'pace-bowler' }],
  'England':                       [{ name: 'Joe Root', role: 'top-order' },     { name: 'Ben Stokes', role: 'all-rounder' },       { name: 'Jofra Archer', role: 'pace-bowler' }],
  'India':                         [{ name: 'Rohit Sharma', role: 'opener' },    { name: 'Virat Kohli', role: 'top-order' },        { name: 'Jasprit Bumrah', role: 'pace-bowler' }],
  'Pakistan':                      [{ name: 'Babar Azam', role: 'top-order' },   { name: 'Shaheen Afridi', role: 'pace-bowler' },   { name: 'Mohammad Rizwan', role: 'wicket-keeper' }],
  'South Africa':                  [{ name: 'Quinton de Kock', role: 'wicket-keeper' }, { name: 'Kagiso Rabada', role: 'pace-bowler' }, { name: 'David Miller', role: 'middle-order' }],
  'New Zealand':                   [{ name: 'Kane Williamson', role: 'top-order' }, { name: 'Trent Boult', role: 'pace-bowler' },   { name: 'Devon Conway', role: 'opener' }],
  'West Indies':                   [{ name: 'Chris Gayle', role: 'opener' },     { name: 'Andre Russell', role: 'all-rounder' },    { name: 'Kieron Pollard', role: 'all-rounder' }],
  'Sri Lanka':                     [{ name: 'Kusal Mendis', role: 'opener' },    { name: 'Wanindu Hasaranga', role: 'spin-bowler' },{ name: 'Lasith Malinga', role: 'pace-bowler' }],
  'Bangladesh':                    [{ name: 'Shakib Al Hasan', role: 'all-rounder' }, { name: 'Mushfiqur Rahim', role: 'wicket-keeper' }, { name: 'Mustafizur Rahman', role: 'pace-bowler' }],
  'Afghanistan':                   [{ name: 'Rashid Khan', role: 'spin-bowler' }, { name: 'Mohammed Nabi', role: 'all-rounder' },   { name: 'Ibrahim Zadran', role: 'opener' }],
}

function getOppStars(oppName) {
  return OPP_STARS[oppName] || [
    { name: `${oppName} Opener`,  role: 'opener' },
    { name: `${oppName} Captain`, role: 'all-rounder' },
    { name: `${oppName} Bowler`,  role: 'pace-bowler' },
  ]
}

// ─── Full Season / Tournament ──────────────────────────────────────────────

// ─── Shared stat accumulation helper ─────────────────────────────────────────

function accumulateMatchStats(result, runTotals, ballTotals, wicketTotals, bowlBallTotals, bowlRunTotals, oppRunTotals, oppWicketTotals, oppRoleMap, oppTeamMap, format, oppName, oppStrength) {
  if (result.stats) {
    const { topScorer, topScorer2, topBowler } = result.stats
    if (topScorer) {
      runTotals[topScorer.name]  = (runTotals[topScorer.name]  || 0) + topScorer.runs
      ballTotals[topScorer.name] = (ballTotals[topScorer.name] || 0) + (topScorer.balls || 0)
    }
    if (topScorer2) {
      runTotals[topScorer2.name]  = (runTotals[topScorer2.name]  || 0) + topScorer2.runs
      ballTotals[topScorer2.name] = (ballTotals[topScorer2.name] || 0) + (topScorer2.balls || 0)
    }
    if (topBowler) {
      wicketTotals[topBowler.name]  = (wicketTotals[topBowler.name]  || 0) + topBowler.wickets
      bowlBallTotals[topBowler.name] = (bowlBallTotals[topBowler.name] || 0) + (topBowler.bowlBalls || 0)
      bowlRunTotals[topBowler.name]  = (bowlRunTotals[topBowler.name]  || 0) + (topBowler.runsConceded || 0)
    }
  }
  const stars = getOppStars(oppName)
  const oppStr = oppStrength ?? 65
  const isBatStarIdx  = Math.floor(Math.random() * Math.min(2, stars.length))
  const isBowlStarIdx = stars.findIndex(s => ['pace-bowler','spin-bowler','all-rounder'].includes(s.role))
  if (stars[isBatStarIdx]) {
    const star = stars[isBatStarIdx]
    const runsBase  = format === 't20' ? 14 : 28
    const runsRange = format === 't20' ? 62 : 95
    const oppRuns   = Math.round(clamp(runsBase + (oppStr / 100) * runsRange * rng(0.3, 1.0), runsBase, format === 't20' ? 100 : 165))
    oppRunTotals[star.name]  = (oppRunTotals[star.name]  || 0) + oppRuns
    oppRoleMap[star.name]    = star.role
    oppTeamMap[star.name]    = oppName
  }
  if (isBowlStarIdx >= 0 && stars[isBowlStarIdx]) {
    const star = stars[isBowlStarIdx]
    const oppWkts = Math.min(5, Math.floor(rng(0.5, 1) + (oppStr / 100) * 4 * rng(0.4, 1.1)))
    oppWicketTotals[star.name] = (oppWicketTotals[star.name] || 0) + oppWkts
    oppRoleMap[star.name]      = star.role
    oppTeamMap[star.name]      = oppName
  }
}

// ─── Match Event generation ────────────────────────────────────────────────

export function generateMatchEvent(team, matchIndex, eventIndices) {
  if (!eventIndices.has(matchIndex)) return null

  const batters  = team.filter(p => ['opener','top-order','middle-order','wicket-keeper','all-rounder'].includes(p.role))
  const bowlers  = team.filter(p => ['pace-bowler','spin-bowler','all-rounder'].includes(p.role))
  const fielders = team

  const rand = Math.random()

  // Fielding events (catch, run-out) — 25%
  if (rand < 0.25 && fielders.length > 0) {
    const player = fielders[Math.floor(Math.random() * fielders.length)]
    const type   = Math.random() < 0.55 ? 'catch' : 'run-out'
    return { type, playerName: player.name }
  }

  // DRS event — 10%
  if (rand < 0.35 && batters.length > 0) {
    const player = batters[Math.floor(Math.random() * batters.length)]
    return { type: 'drs', playerName: player.name }
  }

  // Bowling hat-trick — 15%
  if (rand < 0.50 && bowlers.length > 0) {
    const player = bowlers[Math.floor(Math.random() * bowlers.length)]
    return { type: 'hat-trick', playerName: player.name }
  }

  // Batting milestones — 50%
  if (batters.length > 0) {
    const player  = batters[Math.floor(Math.random() * batters.length)]
    const batRand = Math.random()
    if (batRand < 0.005) {
      // 0.5% chance of 200 — extremely rare
      return { type: '200', playerName: player.name }
    }
    if (batRand < 0.012) {
      // 0.7% chance of 150 — very very rare
      return { type: '150', playerName: player.name }
    }
    if (batRand < 0.35) {
      // 29% chance of century
      return { type: 'century', playerName: player.name, milestone: 99 }
    }
    // 65% chance of half-century
    return { type: 'half-century', playerName: player.name, milestone: 49 }
  }

  return null
}

export function simulateFullSeason(team, mode, manager, options = {}) {
  const config      = MODE_CONFIG[mode]
  const myStr       = calcTeamStrength(team, manager, mode)
  const format      = config.format
  const totalTarget = config.totalMatches

  // Pre-assign which match indices get events (avg ~10, max 2/match, total 6-14)
  const eventCount    = 4 + Math.floor(Math.random() * 3)   // 4–6 (max 6)
  const totalMatches  = config.totalMatches + 3             // approx upper bound inc. playoffs
  const eventIndices  = new Set()
  let attempts = 0
  while (eventIndices.size < Math.min(eventCount, totalMatches) && attempts < 100) {
    eventIndices.add(Math.floor(Math.random() * totalMatches))
    attempts++
  }

  const results = []
  let wins = 0

  // Stat accumulators — batting
  const runTotals = {}, ballTotals = {}
  // Stat accumulators — bowling
  const wicketTotals = {}, bowlBallTotals = {}, bowlRunTotals = {}
  // Opposition stats
  const oppRunTotals = {}, oppWicketTotals = {}, oppRoleMap = {}, oppTeamMap = {}

  // ─── Run a single match and accumulate stats ───────────────────────────────
  function playMatch(stage, matchNum, opp) {
    const result = simulateMatch(myStr, opp, format, matchNum, team)
    result.stage = stage
    // Attach match event if this match index was selected
    const event = generateMatchEvent(team, results.length, eventIndices)
    if (event) result.event = event
    accumulateMatchStats(result, runTotals, ballTotals, wicketTotals, bowlBallTotals, bowlRunTotals, oppRunTotals, oppWicketTotals, oppRoleMap, oppTeamMap, format, opp.name, opp.strength)
    results.push(result)
    if (result.won) wins++
    return result
  }

  let stageReached = 'Group Stage'
  let actualWinner = null  // null = 'Your XI' won; string = that team won

  // ── IPL: 14-match league (no elimination during league) ───────────────────
  if (mode === 'ipl') {
    const leagueOpps = makeOpponents(mode, 14)
    leagueOpps.forEach((opp, i) => playMatch('League', i + 1, opp))
    stageReached = 'League'
  }

  // ── ODI WC: 9 group matches → qualify if wins ≥ 5 → Semi → Final ─────────
  else if (mode === 'odi-wc') {
    const groupOpps = options.groupOppNames
      ? options.groupOppNames.map((name, i, arr) => ({ name, strength: clamp(55 + (i / arr.length) * 22 + rng(-8, 8), 50, 87) }))
      : makeOpponents(mode, 9)
    let groupWins = 0
    groupOpps.forEach((opp, i) => {
      const r = playMatch('Group Stage', i + 1, opp)
      if (r.won) groupWins++
    })

    // Qualification: need 5+ wins out of 9 to be in top 4
    if (groupWins < 5) {
      stageReached = 'Group Stage'
      actualWinner = makeOpponents(mode, 1)[0].name
    } else {
      stageReached = 'Semi-Final'
      const semiOpp = makeOpponents(mode, 1)[0]
      const semi = playMatch('Semi-Final', 10, { name: semiOpp.name, strength: clamp(68 + rng(0, 12), 60, 85) })
      if (semi.won) {
        stageReached = 'Final'
        // Final opponent must be different from Semi opponent
        const finalOpp = makeOpponents(mode, 1, { excludeName: semiOpp.name })[0]
        const final = playMatch('Final', 11, { name: finalOpp.name, strength: clamp(73 + rng(0, 12), 65, 90) })
        stageReached = final.won ? 'Champion' : 'Runner-up'
        actualWinner = final.won ? null : finalOpp.name
      } else {
        // Lost the semi — the team that beat us potentially wins; pick finalOpp as winner
        actualWinner = semiOpp.name
      }
    }
  }

  // ── T20 WC: 4 group → qualify if wins ≥ 2 → 3 Super 8 → qualify if wins ≥ 2 → Semi → Final ─
  else if (mode === 't20-wc') {
    const groupOpps = options.groupOppNames
      ? options.groupOppNames.map((name, i, arr) => ({ name, strength: clamp(55 + (i / arr.length) * 22 + rng(-8, 8), 50, 87) }))
      : makeOpponents(mode, 4)
    let groupWins = 0
    groupOpps.forEach((opp, i) => {
      const r = playMatch('Group Stage', i + 1, opp)
      if (r.won) groupWins++
    })

    if (groupWins < 2) {
      stageReached = 'Group Stage'
      actualWinner = makeOpponents(mode, 1)[0].name
    } else {
      const super8Opps = makeOpponents(mode, 3)
      let super8Wins = 0
      super8Opps.forEach((opp, i) => {
        const r = playMatch('Super 8', i + 5, { ...opp, strength: clamp(opp.strength + 5, 55, 88) })
        if (r.won) super8Wins++
      })

      if (super8Wins < 2) {
        stageReached = 'Super 8'
        actualWinner = makeOpponents(mode, 1)[0].name
      } else {
        stageReached = 'Semi-Final'
        const semiOpp = makeOpponents(mode, 1)[0]
        const semi = playMatch('Semi-Final', 8, { name: semiOpp.name, strength: clamp(70 + rng(0, 12), 62, 88) })
        if (semi.won) {
          stageReached = 'Final'
          // Final opponent must be different from Semi opponent
          const finalOpp = makeOpponents(mode, 1, { excludeName: semiOpp.name })[0]
          const final = playMatch('Final', 9, { name: finalOpp.name, strength: clamp(75 + rng(0, 12), 68, 92) })
          stageReached = final.won ? 'Champion' : 'Runner-up'
          actualWinner = final.won ? null : finalOpp.name
        } else {
          actualWinner = semiOpp.name
        }
      }
    }
  }

  const losses  = results.filter(r => !r.won).length
  const perfect = wins === results.length && results.length === totalTarget

  const winRatio = results.length > 0 ? wins / results.length : 0

  // Max user-team slots in the Best XI — capped at 8 always; proportional to stage
  const maxUserSlots = (() => {
    if (mode === 'ipl') {
      return Math.min(8, Math.max(1, Math.round(winRatio * 11 * 0.75)))
    }
    const stageSlots = {
      'Group Stage': 2, 'League': 2,
      'Super 8': 4, 'Quarter-Final': 4,
      'Semi-Final': 6,
      'Final': 8, 'Runner-up': 8,
      'Champion': 8,
    }
    return stageSlots[stageReached] ?? 2
  })()

  // Build user-team leaderboards
  const topScorers = Object.entries(runTotals)
    .map(([name, runs]) => ({ name, runs }))
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 5)

  const topWicketTakers = Object.entries(wicketTotals)
    .map(([name, wickets]) => ({ name, wickets }))
    .sort((a, b) => b.wickets - a.wickets)
    .slice(0, 5)

  // Player of tournament (from user's team only)
  const allNames = new Set([...Object.keys(runTotals), ...Object.keys(wicketTotals)])
  let potm = null, bestScore = -1
  allNames.forEach(name => {
    const score = (runTotals[name] || 0) + (wicketTotals[name] || 0) * 15
    if (score > bestScore) { bestScore = score; potm = name }
  })

  // Per-player stats for the stats table
  const playerStats = team.map(p => {
    const runs      = runTotals[p.name]      || 0
    const balls     = ballTotals[p.name]     || 0
    const wickets   = wicketTotals[p.name]   || 0
    const bowlBalls = bowlBallTotals[p.name] || 0
    const bowlRuns  = bowlRunTotals[p.name]  || 0
    const sr        = balls > 0 ? ((runs / balls) * 100).toFixed(1) : '—'
    const economy   = bowlBalls > 0 ? ((bowlRuns / bowlBalls) * 6).toFixed(2) : '—'
    return { name: p.name, role: p.role, runs, balls, sr, wickets, bowlBalls, bowlRuns, economy }
  })

  // My team best XI — pure stats, no rating bias
  const bestXI = team.map(p => ({
    player: p,
    runs:    runTotals[p.name]    || 0,
    wickets: wicketTotals[p.name] || 0,
    impact:  (runTotals[p.name] || 0) + (wicketTotals[p.name] || 0) * 25,
  })).sort((a, b) => b.impact - a.impact)

  // Tournament Best XI — pure stats for everyone; user slots capped by team finishing position
  const myPlayerPool = team.map(p => ({
    name:    p.name,
    role:    p.role,
    team:    'Your XI',
    runs:    runTotals[p.name]    || 0,
    wickets: wicketTotals[p.name] || 0,
    impact:  (runTotals[p.name] || 0) + (wicketTotals[p.name] || 0) * 25,
    isUser:  true,
  })).sort((a, b) => b.impact - a.impact)

  const allOppNames = new Set([...Object.keys(oppRunTotals), ...Object.keys(oppWicketTotals)])
  const oppPlayers = [...allOppNames]
    .map(name => {
      const oppRuns = oppRunTotals[name] || 0
      const oppWkts = oppWicketTotals[name] || 0
      return {
        name,
        role:    oppRoleMap[name] || 'top-order',
        team:    oppTeamMap[name] || 'Opposition',
        runs:    oppRuns,
        wickets: oppWkts,
        impact:  oppRuns + oppWkts * 25,
        isUser:  false,
      }
    })
    .filter(p => p.runs >= 25 || p.wickets >= 2)
    .sort((a, b) => b.impact - a.impact)

  // Tournament Best XI — up to maxUserSlots (max 8) from user, rest from opposition
  const userXI = myPlayerPool.slice(0, maxUserSlots)
  const remainingSlots = 11 - userXI.length
  const usedNames = new Set(userXI.map(p => p.name))
  const oppFill = oppPlayers.filter(p => !usedNames.has(p.name)).slice(0, remainingSlots)
  const tournamentBestXI = [...userXI, ...oppFill].sort((a, b) => b.impact - a.impact)

  return {
    results,
    wins,
    losses,
    myStrength: myStr,
    perfect,
    total: results.length,
    stageReached,
    actualWinner,
    tournamentStats: { topScorers, topWicketTakers, potm, bestXI, tournamentBestXI, playerStats },
  }
}

// ─── IPL Table ─────────────────────────────────────────────────────────────

const IPL_FRANCHISE_NAMES = [
  'Mumbai Indians', 'Chennai Super Kings', 'Royal Challengers Bengaluru',
  'Kolkata Knight Riders', 'Delhi Capitals', 'Rajasthan Royals',
  'Sunrisers Hyderabad', 'Punjab Kings', 'Lucknow Super Giants', 'Gujarat Titans',
]

export function generateIPLTable(userWins) {
  const others = IPL_FRANCHISE_NAMES.slice(0, 9).map(name => {
    const wins = Math.round(rng(4, 11))
    const nrrSign = Math.random() > 0.5 ? '+' : '-'
    return {
      team: name,
      wins,
      losses: 14 - wins,
      points: wins * 2,
      nrr: nrrSign + rng(0.05, 0.95).toFixed(3),
      isUser: false,
    }
  })

  const userEntry = {
    team: 'Your XI',
    wins: userWins,
    losses: 14 - userWins,
    points: userWins * 2,
    nrr: '+' + rng(0.10, 0.55).toFixed(3),
    isUser: true,
  }

  const table = [...others, userEntry].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return parseFloat(b.nrr) - parseFloat(a.nrr)
  })

  const position = table.findIndex(t => t.isUser) + 1
  return { table, position, qualified: position <= 4 }
}

// ─── IPL Playoffs ──────────────────────────────────────────────────────────

export function simulateIPLPlayoffs(team, manager, position, tableTeams = []) {
  const myStr = calcTeamStrength(team, manager, 'ipl')
  const results = []
  let matchNum = 15

  // Use real team names from the IPL table when available
  // tableTeams is sorted by position (index 0 = 1st place, etc.)
  const tn = (idx, fallback) => tableTeams[idx]?.team ?? fallback
  const opp = (name, base) => ({ name, strength: clamp(Math.round(base + rng(-5, 8)), 55, 90) })

  let finalOppName

  if (position <= 2) {
    // Qualifier 1: 1st vs 2nd
    const q1OppIdx = position === 1 ? 1 : 0
    const q1OppName = tn(q1OppIdx, position === 1 ? '2nd place side' : '1st place side')
    const q1 = simulateMatch(myStr, opp(q1OppName, 68), 't20', matchNum++, team)
    q1.stage = 'Qualifier 1'
    results.push(q1)

    if (q1.won) {
      // Q2 winner (from 3rd/4th) faces us in Final
      const q2WinnerIdx = Math.random() < 0.5 ? 2 : 3
      finalOppName = tn(q2WinnerIdx, '3rd place side')
    } else {
      // Qualifier 2: us vs Eliminator winner (3rd or 4th)
      const elimWinnerIdx = Math.random() < 0.5 ? 2 : 3
      const q2 = simulateMatch(myStr, opp(tn(elimWinnerIdx, 'Eliminator winner'), 65), 't20', matchNum++, team)
      q2.stage = 'Qualifier 2'
      results.push(q2)
      if (!q2.won) return { results, outcome: 'eliminated' }
      // Final vs the team that beat us in Q1
      finalOppName = q1OppName
    }
  } else {
    // Eliminator: 3rd vs 4th
    const elimOppIdx = position === 3 ? 3 : 2
    const elimOppName = tn(elimOppIdx, position === 3 ? '4th place side' : '3rd place side')
    const elim = simulateMatch(myStr, opp(elimOppName, 63), 't20', matchNum++, team)
    elim.stage = 'Eliminator'
    results.push(elim)
    if (!elim.won) return { results, outcome: 'eliminated' }

    // Qualifier 2: us vs Q1 loser (one of the top-2 teams)
    const q1LoserIdx = Math.random() < 0.5 ? 0 : 1
    const q2 = simulateMatch(myStr, opp(tn(q1LoserIdx, 'Q1 loser'), 66), 't20', matchNum++, team)
    q2.stage = 'Qualifier 2'
    results.push(q2)
    if (!q2.won) return { results, outcome: 'eliminated' }

    // Final vs Q1 winner (the other top-2 team)
    const q1WinnerIdx = q1LoserIdx === 0 ? 1 : 0
    finalOppName = tn(q1WinnerIdx, '1st place side')
  }

  // Final
  const final = simulateMatch(myStr, opp(finalOppName, 71), 't20', matchNum++, team)
  final.stage = 'Final'
  results.push(final)

  return { results, outcome: final.won ? 'champion' : 'runner-up' }
}
