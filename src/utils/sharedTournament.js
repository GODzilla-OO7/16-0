/**
 * sharedTournament.js
 * Pre-simulates an entire shared IPL league (14 matches each + playoffs) for two H2H players.
 * All randomness happens once upfront; players just "reveal" results together.
 *
 * Supabase migration required (run once in Supabase SQL editor):
 *   alter table h2h_rooms add column if not exists league_mode text default 'classic';
 *   alter table h2h_rooms add column if not exists tournament jsonb;
 */

import { calcTeamStrength } from './simulator.js'

// ─── AI team pool ─────────────────────────────────────────────────────────────

const AI_TEAMS = [
  { name: 'Mumbai Indians',        strength: 83 },
  { name: 'Chennai Super Kings',   strength: 81 },
  { name: 'Royal Challengers',     strength: 77 },
  { name: 'Kolkata Knight Riders', strength: 76 },
  { name: 'Rajasthan Royals',      strength: 74 },
  { name: 'Delhi Capitals',        strength: 73 },
  { name: 'Sunrisers Hyderabad',   strength: 71 },
  { name: 'Punjab Kings',          strength: 69 },
]

// ─── Utils ────────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
function rng(a, b) { return a + Math.random() * (b - a) }
function rngInt(a, b) { return Math.floor(rng(a, b + 1)) }

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function t20Scores(batStr, bowlStr) {
  const base = 155 + (batStr - bowlStr) * 0.45
  const runs = Math.round(clamp(base + rng(-22, 28), 108, 235))
  const wkts = rngInt(3, 9)
  return { runs, wickets: wkts }
}

function marginStr(winnerRuns, winnerWkts, loserRuns, battedFirst) {
  if (battedFirst) return `${winnerRuns - loserRuns} runs`
  return `${10 - winnerWkts} wickets`
}

// ─── Single match simulation ──────────────────────────────────────────────────

function simulateFixture(myStr, oppStr, oppName) {
  const diff    = myStr - oppStr
  const winProb = clamp(1 / (1 + Math.exp(-diff / 12)) + rng(-0.06, 0.06), 0.05, 0.95)
  const won     = Math.random() < winProb
  const first   = Math.random() < 0.5  // did I bat first?

  let myScore, oppScore
  if (won) {
    if (first) {
      myScore  = t20Scores(myStr, oppStr)
      oppScore = { runs: clamp(myScore.runs - rngInt(5, 48), 50, myScore.runs - 1), wickets: rngInt(5, 10) }
    } else {
      oppScore = t20Scores(oppStr, myStr)
      myScore  = { runs: oppScore.runs + rngInt(1, 14), wickets: rngInt(1, 7) }
    }
  } else {
    if (first) {
      myScore  = t20Scores(myStr, oppStr)
      oppScore = { runs: myScore.runs + rngInt(4, 38), wickets: rngInt(2, 8) }
    } else {
      oppScore = t20Scores(oppStr, myStr)
      myScore  = { runs: clamp(oppScore.runs - rngInt(4, 46), 50, oppScore.runs - 1), wickets: rngInt(6, 10) }
    }
  }

  const margin = won
    ? marginStr(myScore.runs, myScore.wickets, oppScore.runs, first)
    : marginStr(oppScore.runs, oppScore.wickets, myScore.runs, !first)

  return {
    is_h2h:      false,
    opponent:    oppName,
    opp_str:     oppStr,
    won,
    my_runs:     myScore.runs,
    my_wickets:  myScore.wickets,
    opp_runs:    oppScore.runs,
    opp_wickets: oppScore.wickets,
    margin,
  }
}

// ─── H2H fixture (host perspective) ──────────────────────────────────────────

function simulateH2HFixture(hostStr, guestStr) {
  const diff    = hostStr - guestStr
  const winProb = clamp(1 / (1 + Math.exp(-diff / 12)) + rng(-0.06, 0.06), 0.05, 0.95)
  const hostWon = Math.random() < winProb
  const first   = Math.random() < 0.5  // did host bat first?

  let hostScore, guestScore
  if (hostWon) {
    if (first) {
      hostScore  = t20Scores(hostStr, guestStr)
      guestScore = { runs: clamp(hostScore.runs - rngInt(5, 48), 50, hostScore.runs - 1), wickets: rngInt(5, 10) }
    } else {
      guestScore = t20Scores(guestStr, hostStr)
      hostScore  = { runs: guestScore.runs + rngInt(1, 14), wickets: rngInt(1, 7) }
    }
  } else {
    if (first) {
      hostScore  = t20Scores(hostStr, guestStr)
      guestScore = { runs: hostScore.runs + rngInt(4, 38), wickets: rngInt(2, 8) }
    } else {
      guestScore = t20Scores(guestStr, hostStr)
      hostScore  = { runs: clamp(guestScore.runs - rngInt(4, 46), 50, guestScore.runs - 1), wickets: rngInt(6, 10) }
    }
  }

  const hostMargin = hostWon
    ? marginStr(hostScore.runs, hostScore.wickets, guestScore.runs, first)
    : marginStr(guestScore.runs, guestScore.wickets, hostScore.runs, !first)

  return {
    host_won:     hostWon,
    host_runs:    hostScore.runs,
    host_wickets: hostScore.wickets,
    guest_runs:   guestScore.runs,
    guest_wickets: guestScore.wickets,
    margin:       hostMargin, // from host perspective: "won/lost by X"
  }
}

// ─── Playoff simulation ───────────────────────────────────────────────────────

function simulatePlayoffMatch(teamA, strA, teamB, strB) {
  const diff    = strA - strB
  const winProb = clamp(1 / (1 + Math.exp(-diff / 12)) + rng(-0.06, 0.06), 0.05, 0.95)
  const aWon    = Math.random() < winProb
  const first   = Math.random() < 0.5

  let aScore, bScore
  if (aWon) {
    if (first) {
      aScore = t20Scores(strA, strB)
      bScore = { runs: clamp(aScore.runs - rngInt(5, 48), 50, aScore.runs - 1), wickets: rngInt(5, 10) }
    } else {
      bScore = t20Scores(strB, strA)
      aScore = { runs: bScore.runs + rngInt(1, 14), wickets: rngInt(1, 7) }
    }
  } else {
    if (first) {
      aScore = t20Scores(strA, strB)
      bScore = { runs: aScore.runs + rngInt(4, 38), wickets: rngInt(2, 8) }
    } else {
      bScore = t20Scores(strB, strA)
      aScore = { runs: clamp(bScore.runs - rngInt(4, 46), 50, bScore.runs - 1), wickets: rngInt(6, 10) }
    }
  }

  const winner = aWon ? teamA : teamB
  const loser  = aWon ? teamB : teamA
  const margin = aWon
    ? marginStr(aScore.runs, aScore.wickets, bScore.runs, first)
    : marginStr(bScore.runs, bScore.wickets, aScore.runs, !first)

  return {
    teamA, teamB,
    a_runs: aScore.runs, a_wickets: aScore.wickets,
    b_runs: bScore.runs, b_wickets: bScore.wickets,
    winner, loser, margin,
  }
}

function generatePlayoffs(standings, hostName, guestName, hostStr, guestStr) {
  const top4 = standings.slice(0, 4)

  function getStr(name) {
    if (name === hostName)  return hostStr
    if (name === guestName) return guestStr
    const ai = AI_TEAMS.find(t => t.name === name)
    return ai ? ai.strength : 72
  }

  // Q1: 1st vs 2nd (winner → Final directly)
  const q1 = simulatePlayoffMatch(
    top4[0].name, getStr(top4[0].name),
    top4[1].name, getStr(top4[1].name),
  )

  // Eliminator: 3rd vs 4th (loser → out)
  const elim = simulatePlayoffMatch(
    top4[2].name, getStr(top4[2].name),
    top4[3].name, getStr(top4[3].name),
  )

  // Q2: Q1 loser vs Eliminator winner (winner → Final)
  const q2 = simulatePlayoffMatch(
    q1.loser,   getStr(q1.loser),
    elim.winner, getStr(elim.winner),
  )

  // Final: Q1 winner vs Q2 winner
  const final = simulatePlayoffMatch(
    q1.winner, getStr(q1.winner),
    q2.winner, getStr(q2.winner),
  )

  return {
    q1, elim, q2, final,
    champion: final.winner,
    // current_stage: which playoff match are we currently revealing
    // 0 = Q1+Elim, 1 = Q2, 2 = Final, 3 = done
    current_stage:      0,
    host_ready:         false,
    guest_ready:        false,
  }
}

// ─── AI standings (pre-generated, scaled in display by progress) ──────────────

function generateAIStandings() {
  return shuffle([...AI_TEAMS]).map(team => {
    const wBase = Math.round((team.strength - 55) / 2.8)
    const wins  = clamp(wBase + rngInt(-2, 2), 3, 12)
    return { name: team.name, wins, losses: 14 - wins, points: wins * 2 }
  })
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function generateTournament(hostTeam, guestTeam, hostManager, guestManager, hostName, guestName) {
  const hostStr  = calcTeamStrength(hostTeam,  hostManager  ?? null, 'ipl')
  const guestStr = calcTeamStrength(guestTeam, guestManager ?? null, 'ipl')

  // H2H match is inserted at a random position between match 4 and 10 (0-indexed)
  const h2hAt = 4 + Math.floor(Math.random() * 6)

  // Build AI schedules (13 opponents each — independent, adds variety)
  function makeSchedule() {
    const sched = []
    const pool  = shuffle([...AI_TEAMS])
    while (sched.length < 13) {
      for (const t of shuffle([...pool])) {
        if (sched.length >= 13) break
        sched.push(t)
      }
    }
    return sched
  }

  const hostSchedule  = makeSchedule()
  const guestSchedule = makeSchedule()

  // Simulate host fixtures
  const hostFixtures = []
  let hIdx = 0
  for (let i = 0; i < 14; i++) {
    if (i === h2hAt) { hostFixtures.push(null) }  // filled below
    else { hostFixtures.push(simulateFixture(hostStr, hostSchedule[hIdx].strength, hostSchedule[hIdx].name)); hIdx++ }
  }

  // Simulate guest fixtures
  const guestFixtures = []
  let gIdx = 0
  for (let i = 0; i < 14; i++) {
    if (i === h2hAt) { guestFixtures.push(null) }
    else { guestFixtures.push(simulateFixture(guestStr, guestSchedule[gIdx].strength, guestSchedule[gIdx].name)); gIdx++ }
  }

  // H2H match
  const h2h = simulateH2HFixture(hostStr, guestStr)

  // Fill H2H slots
  const hWon = h2h.host_won
  const hMarginFull = hWon
    ? `Won by ${h2h.margin}`
    : `Lost by ${h2h.margin}`
  const gMarginFull = !hWon
    ? `Won by ${h2h.margin}`
    : `Lost by ${h2h.margin}`

  hostFixtures[h2hAt] = {
    is_h2h:      true,
    opponent:    guestName ?? 'Opponent',
    opp_str:     guestStr,
    won:         hWon,
    my_runs:     h2h.host_runs,
    my_wickets:  h2h.host_wickets,
    opp_runs:    h2h.guest_runs,
    opp_wickets: h2h.guest_wickets,
    margin:      hMarginFull,
  }
  guestFixtures[h2hAt] = {
    is_h2h:      true,
    opponent:    hostName ?? 'Opponent',
    opp_str:     hostStr,
    won:         !hWon,
    my_runs:     h2h.guest_runs,
    my_wickets:  h2h.guest_wickets,
    opp_runs:    h2h.host_runs,
    opp_wickets: h2h.host_wickets,
    margin:      gMarginFull,
  }

  // Pre-generate AI standings for the points table
  const aiStandings = generateAIStandings()

  // Compute final standings after all 14 matches
  const hostWins  = hostFixtures.filter(f => f.won).length
  const guestWins = guestFixtures.filter(f => f.won).length

  const allStandings = [
    { name: hostName  ?? 'Host XI',  wins: hostWins,  losses: 14 - hostWins,  points: hostWins  * 2, is_host: true  },
    { name: guestName ?? 'Guest XI', wins: guestWins, losses: 14 - guestWins, points: guestWins * 2, is_guest: true },
    ...aiStandings,
  ].sort((a, b) => b.points - a.points || b.wins - a.wins)

  // Generate playoff bracket
  const playoffs = generatePlayoffs(allStandings, hostName ?? 'Host XI', guestName ?? 'Guest XI', hostStr, guestStr)

  return {
    // Meta
    host_name:    hostName  ?? 'Host XI',
    guest_name:   guestName ?? 'Guest XI',
    host_str:     hostStr,
    guest_str:    guestStr,

    // League
    phase:         'league',   // 'league' | 'playoffs' | 'done'
    current_match: 0,          // 0–13 during league
    host_ready:    false,
    guest_ready:   false,
    h2h_match_idx: h2hAt,
    host_fixtures:  hostFixtures,
    guest_fixtures: guestFixtures,
    h2h_result:    h2h,
    ai_standings:  aiStandings,
    final_standings: allStandings,

    // Playoffs (pre-simulated, revealed match by match)
    playoffs,
  }
}

// ─── Points table helper (call with current_match to get live standings) ──────

export function getLiveStandings(tournament, revealedMatches) {
  const { host_fixtures, guest_fixtures, ai_standings, host_name, guest_name } = tournament

  const hostWins  = host_fixtures.slice(0, revealedMatches).filter(f => f?.won).length
  const guestWins = guest_fixtures.slice(0, revealedMatches).filter(f => f?.won).length

  // Scale AI standings proportionally to matches played
  const scale = revealedMatches / 14
  const aiRows = ai_standings.map(t => ({
    name:   t.name,
    wins:   Math.round(t.wins   * scale),
    losses: Math.round(t.losses * scale),
    points: Math.round(t.wins   * scale) * 2,
  }))

  return [
    { name: host_name,  wins: hostWins,  losses: revealedMatches - hostWins,  points: hostWins  * 2, is_host:  true },
    { name: guest_name, wins: guestWins, losses: revealedMatches - guestWins, points: guestWins * 2, is_guest: true },
    ...aiRows,
  ].sort((a, b) => b.points - a.points || b.wins - a.wins)
}
