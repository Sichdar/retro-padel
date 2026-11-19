// Runs the game logic in fixed 1/60 s steps, whatever the screen's frame rate.
// A slow phone simply runs two steps in one frame; a fast one waits.

export class FixedStep {
  private acc = 0;

  constructor(
    readonly step = 1 / 60,
    private readonly maxStepsPerFrame = 5,
  ) {}

  /** Feed the real time since the last frame; calls `tick` once per step due. */
  advance(frameSeconds: number, tick: (dt: number) => void): number {
    this.acc += Math.min(Math.max(frameSeconds, 0), 0.25);
    let n = 0;
    while (this.acc >= this.step - 1e-9 && n < this.maxStepsPerFrame) {
      tick(this.step);
      this.acc -= this.step;
      n++;
    }
    // Far behind (tab was hidden, phone stalled): drop the backlog, don't race.
    if (n === this.maxStepsPerFrame) this.acc = 0;
    return n;
  }
}
