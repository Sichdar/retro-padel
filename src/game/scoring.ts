// Padel scoring: 15-30-40-game, deuce with advantage or golden point,
// sets with a tie-break, and who serves next. No Phaser here, so it is tested.

export type Team = 0 | 1;

export interface MatchRules {
  /** Sets needed to win the match (1 for a single set, 2 for best of 3). */
  setsToWin: number;
  /** Games needed to win a set (with a 2-game lead, unless a tie-break decides it). */
  gamesPerSet: number;
  /** At this many games each, a tie-break decides the set. */
  tiebreakAt: number;
  /** At 40-40 the next point wins the game (no advantage). */
  goldenPoint: boolean;
  /** Points needed to win a tie-break (with a 2-point lead). */
  tiebreakPoints: number;
}

/** Quick match: first to 4 games (tie-break at 3-3), golden point. */
export const QUICK_MATCH: MatchRules = { setsToWin: 1, gamesPerSet: 4, tiebreakAt: 3, goldenPoint: true, tiebreakPoints: 7 };
export const ONE_SET: MatchRules = { setsToWin: 1, gamesPerSet: 6, tiebreakAt: 6, goldenPoint: false, tiebreakPoints: 7 };
export const BEST_OF_3: MatchRules = { setsToWin: 2, gamesPerSet: 6, tiebreakAt: 6, goldenPoint: false, tiebreakPoints: 7 };

/**
 * Serving order of the four players (ids 0-3): team 0 = players 0 and 1,
 * team 1 = players 2 and 3. Serve passes from team to team every game.
 */
export const SERVE_ORDER = [0, 2, 1, 3] as const;

export function teamOf(player: number): Team {
  return player < 2 ? 0 : 1;
}

export interface PointResult {
  game?: Team;
  set?: Team;
  match?: Team;
}

export class Score {
  points: [number, number] = [0, 0];
  games: [number, number] = [0, 0];
  sets: [number, number] = [0, 0];
  /** Finished sets, as games won by each team. */
  history: [number, number][] = [];
  tiebreak = false;
  winner: Team | null = null;
  /** Position in SERVE_ORDER of the player serving this game. */
  private slot = 0;
  /** Slot that served the first point of the current tie-break. */
  private tbStart = 0;

  constructor(readonly rules: MatchRules = QUICK_MATCH, firstServerSlot = 0) {
    this.slot = firstServerSlot;
  }

  /** Player id (0-3) serving the next point. */
  get server(): number {
    if (!this.tiebreak) return SERVE_ORDER[this.slot];
    const n = this.points[0] + this.points[1];
    return SERVE_ORDER[(this.tbStart + Math.floor((n + 1) / 2)) % 4];
  }

  get servingTeam(): Team {
    return teamOf(this.server);
  }

  /** 'right' (deuce side) on even points, 'left' (advantage side) on odd. */
  get serveSide(): 'right' | 'left' {
    return (this.points[0] + this.points[1]) % 2 === 0 ? 'right' : 'left';
  }

  /** True when the next point decides the game under the golden point rule. */
  get isGoldenPoint(): boolean {
    return !this.tiebreak && this.rules.goldenPoint && this.points[0] === 3 && this.points[1] === 3;
  }

  get isDeuce(): boolean {
    return !this.tiebreak && !this.rules.goldenPoint && this.points[0] >= 3 && this.points[0] === this.points[1];
  }

  /** What the umpire would call for one team: 0, 15, 30, 40, AD (or tie-break points). */
  call(team: Team): string {
    const p = this.points[team];
    if (this.tiebreak) return String(p);
    const o = this.points[1 - team];
    if (p >= 3 && o >= 3) return p > o ? 'AD' : '40';
    return ['0', '15', '30', '40'][Math.min(p, 3)];
  }

  pointWon(team: Team): PointResult {
    if (this.winner !== null) return { match: this.winner };
    const other = (1 - team) as Team;
    this.points[team]++;
    const p = this.points[team];
    const o = this.points[other];

    if (this.tiebreak) {
      if (p >= this.rules.tiebreakPoints && p - o >= 2) return this.gameWon(team);
      return {};
    }
    if (this.rules.goldenPoint && p === 4 && o === 3) return this.gameWon(team);
    if (p >= 4 && p - o >= 2) return this.gameWon(team);
    // Back to deuce: keep the numbers small (and the deuce/advantage side right).
    if (p === 4 && o === 4) this.points = [3, 3];
    return {};
  }

  private gameWon(team: Team): PointResult {
    const result: PointResult = { game: team };
    const other = (1 - team) as Team;
    const wasTiebreak = this.tiebreak;
    this.games[team]++;
    this.points = [0, 0];
    const g = this.games[team];
    const og = this.games[other];

    const setWon = wasTiebreak || (g >= this.rules.gamesPerSet && g - og >= 2);
    if (wasTiebreak) {
      this.tiebreak = false;
      this.slot = (this.tbStart + 1) % 4;
    } else {
      this.slot = (this.slot + 1) % 4;
    }
    if (!setWon && g === this.rules.tiebreakAt && og === this.rules.tiebreakAt) {
      this.tiebreak = true;
      this.tbStart = this.slot;
    }
    if (setWon) {
      result.set = team;
      this.sets[team]++;
      this.history.push([this.games[0], this.games[1]]);
      this.games = [0, 0];
      if (this.sets[team] >= this.rules.setsToWin) {
        this.winner = team;
        result.match = team;
      }
    }
    return result;
  }
}
