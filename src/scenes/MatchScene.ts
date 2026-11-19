import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { FixedStep } from '../game/fixedStep';
import { HUMAN, HumanInput, Match, MatchEvent } from '../game/match';
import { speedOf } from '../game/physics';
import { Player } from '../game/players';
import { DEFAULT_VIEW, project } from '../game/projection';
import { PointReason } from '../game/referee';
import { Team } from '../game/scoring';
import {
  audioSettings,
  sfxBounce,
  sfxCrowd,
  sfxFault,
  sfxGlass,
  sfxHit,
  sfxLose,
  sfxMesh,
  sfxNet,
  sfxNetCord,
  sfxOut,
  sfxPointLost,
  sfxPointWon,
  sfxSmash,
  sfxWin,
  unlockAudio,
  vibrate,
} from '../audio/sfx';
import { TouchControls } from '../ui/controls';
import { drawNearWall, drawNet } from '../ui/courtArt';
import { PAL } from '../ui/palette';
import { pixelText } from '../ui/pixelFont';
import { FOOT_Y, FRAME, LOOKS, SPRITE_H, ensurePlayerTexture } from '../ui/sprites';
import { t } from '../ui/strings';
import { makeButton } from '../ui/widgets';
import { ensureBackdrop } from './backdrop';

// Quick match against the computer: you and a computer partner (near end,
// bottom of the screen) against two computer players (far end).

const VIEW = DEFAULT_VIEW;
const DEPTH_NET = 10; // things are layered by court length x (0..20); the net sits at 10
const DEPTH_NEAR_WALL = 50;
const DEPTH_HUD = 90;
const DEPTH_CONTROLS = 95;
const DEPTH_BANNER = 100;
const DEPTH_OVERLAY = 200;
const TRAIL = 6;

const REASON_TEXT: Record<PointReason, string> = {
  net: t.reasonNet,
  wall: t.reasonWall,
  out: t.reasonOut,
  'double-bounce': t.reasonDoubleBounce,
  'out-after-bounce': t.reasonOutAfterBounce,
  'came-back': t.reasonCameBack,
  'double-fault': t.reasonDoubleFault,
};

const FAULT_TEXT = { box: t.faultBox, net: t.faultNet, wall: t.faultWall, mesh: t.faultMesh, out: t.faultOut };

interface PlayerView {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  step: number;
}

export class MatchScene extends Phaser.Scene {
  private match!: Match;
  private clock = new FixedStep();
  private controls!: TouchControls;
  private views: PlayerView[] = [];
  private ballImg!: Phaser.GameObjects.Image;
  private ballShadow!: Phaser.GameObjects.Image;
  private trail: Phaser.GameObjects.Image[] = [];
  private trailPos: { x: number; y: number; depth: number }[] = [];
  private marker!: Phaser.GameObjects.Image;

  private hudTexts: Phaser.GameObjects.BitmapText[] = [];
  private serveDot!: Phaser.GameObjects.Image;
  private banner?: Phaser.GameObjects.Container;
  private serveHint?: Phaser.GameObjects.Container;
  private paused = false;
  private overlay?: Phaser.GameObjects.Container;
  private speed = 1;
  private demo = false;
  private wakeLock: { release: () => Promise<void> } | null = null;

  constructor() {
    super('Match');
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    this.demo = params.has('demo');
    this.speed = import.meta.env.DEV ? Math.max(1, Number(params.get('speed')) || 1) : 1;
    this.match = new Match({ allCpu: this.demo, seed: Date.now() });
    this.paused = false;
    this.overlay = undefined;
    this.banner = undefined;
    this.serveHint = undefined;

    this.add.image(0, 0, ensureBackdrop(this, false)).setOrigin(0).setDepth(-100);
    drawNet(this.add.graphics().setDepth(DEPTH_NET), VIEW);
    drawNearWall(this.add.graphics().setDepth(DEPTH_NEAR_WALL), VIEW);
    this.makeTextures();

    this.views = this.match.players.map((_p, i) => {
      const key = ensurePlayerTexture(this, `player-${i}`, LOOKS[i]);
      const shadow = this.add.image(0, 0, 'player-shadow').setAlpha(0.4);
      const sprite = this.add.image(0, 0, key, FRAME.idle).setOrigin(0.5, FOOT_Y / SPRITE_H);
      if (LOOKS[i].front) sprite.setFlipX(true);
      return { sprite, shadow, step: 0 };
    });
    this.marker = this.add.image(0, 0, 'marker').setDepth(DEPTH_HUD - 1).setVisible(!this.demo);

    this.ballShadow = this.add.image(0, 0, 'ball-shadow').setAlpha(0.45);
    this.trail = [];
    for (let i = 0; i < TRAIL; i++) {
      this.trail.push(this.add.image(0, 0, 'ball').setAlpha(0).setScale(0.6).setTint(PAL.yellowLight));
    }
    this.ballImg = this.add.image(0, 0, 'ball');
    this.trailPos = [];

    this.makeHud();
    this.controls = new TouchControls(this, DEPTH_CONTROLS);
    this.controls.setVisible(!this.demo);

    this.input.on('pointerdown', () => unlockAudio());
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard?.on('keydown-P', () => this.togglePause());
    // Phone locked or app switched mid-match: pause.
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.autoPause, this);
    this.events.once('shutdown', () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.autoPause, this);
      void this.wakeLock?.release().catch(() => undefined);
      this.wakeLock = null;
    });
    this.keepAwake();

    if (import.meta.env.DEV) (window as unknown as { __match: Match }).__match = this.match;

    this.showBanner(t.quickMatch, t.firstTo4, PAL.yellow, 1600);
    this.handle(this.match.start());
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  // ---- Set-up ----------------------------------------------------------------

  private makeTextures(): void {
    if (!this.textures.exists('player-shadow')) {
      const g = this.make.graphics({}, false);
      g.fillStyle(PAL.black, 1);
      g.fillRect(2, 0, 8, 1).fillRect(0, 1, 12, 2).fillRect(2, 3, 8, 1);
      g.generateTexture('player-shadow', 12, 4);
      g.clear();
      // "You" marker: a small yellow arrow pointing down.
      g.fillStyle(PAL.ink, 1).fillRect(0, 0, 7, 2).fillRect(1, 2, 5, 1).fillRect(2, 3, 3, 1).fillRect(3, 4, 1, 1);
      g.fillStyle(PAL.yellow, 1).fillRect(1, 0, 5, 1).fillRect(2, 1, 3, 1).fillRect(3, 2, 1, 1);
      g.generateTexture('marker', 7, 5);
      g.clear();
      // Pause icon.
      g.fillStyle(PAL.white, 1).fillRect(0, 0, 3, 9).fillRect(5, 0, 3, 9);
      g.generateTexture('icon-pause', 8, 9);
      g.destroy();
    }
  }

  private makeHud(): void {
    const panel = this.add.graphics();
    panel.fillStyle(PAL.ink, 0.88).fillRect(0, 0, GAME_W, 27);
    panel.fillStyle(PAL.yellow, 1).fillRect(0, 27, GAME_W, 1);
    panel.fillStyle(PAL.black, 0.6).fillRect(0, 28, GAME_W, 1);
    // Column boxes for games and points.
    panel.fillStyle(PAL.navy, 1).fillRect(96, 3, 22, 22).fillRect(122, 3, 30, 22);
    const txt = (x: number, y: number, s: string, c: number, ox = 0) =>
      this.add.bitmapText(x, y, 'px8', s).setOrigin(ox, 0).setTint(c);
    this.hudTexts = [
      txt(14, 5, t.you, PAL.skyLight),
      txt(14, 16, t.cpu, PAL.red),
      txt(107, 5, '0', PAL.white, 0.5),
      txt(107, 16, '0', PAL.white, 0.5),
      txt(137, 5, '0', PAL.yellow, 0.5),
      txt(137, 16, '0', PAL.yellow, 0.5),
      txt(158, 10, '', PAL.grey),
    ];
    this.serveDot = this.add.image(7, 9, 'ball');
    const pause = this.add.image(196, 14, 'icon-pause');
    const pauseHit = this.add.zone(184, 0, 32, 28).setOrigin(0).setInteractive({ useHandCursor: true });
    pauseHit.on('pointerup', () => this.togglePause());
    this.add.container(0, 0, [panel, ...this.hudTexts, this.serveDot, pause]).setDepth(DEPTH_HUD);
    pauseHit.setDepth(DEPTH_HUD + 1);
    this.updateHud();
  }

  private updateHud(): void {
    const s = this.match.score;
    const [, , g0, g1, p0, p1, tag] = this.hudTexts;
    g0.setText(String(s.games[0]));
    g1.setText(String(s.games[1]));
    p0.setText(s.call(0));
    p1.setText(s.call(1));
    tag.setText(s.tiebreak ? 'TB' : s.isGoldenPoint ? 'GP' : '');
    tag.setTint(s.isGoldenPoint ? PAL.yellow : PAL.grey);
    this.serveDot.setY(s.servingTeam === 0 ? 9 : 20);
  }

  private keepAwake(): void {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request('screen')
      .then((l) => (this.wakeLock = l))
      .catch(() => undefined);
  }

  // ---- Loop ------------------------------------------------------------------

  update(_time: number, deltaMs: number): void {
    this.controls.update();
    if (!this.paused) {
      let presses = this.controls.consume();
      const frame = (deltaMs / 1000) * this.speed;
      const ticks = (dt: number) => {
        const input: HumanInput = {
          mx: this.controls.mx,
          my: this.controls.my,
          active: this.controls.active,
          hit: presses.hit,
          lob: presses.lob,
        };
        presses = { hit: false, lob: false }; // a press counts once
        this.match.setAim(this.controls.mx);
        this.handle(this.match.step(input, dt));
      };
      if (this.speed > 1) for (let i = 0; i < this.speed; i++) this.clock.advance(frame / this.speed, ticks);
      else this.clock.advance(frame, ticks);
    } else this.controls.consume();
    this.draw();
  }

  private handle(events: MatchEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'ball':
          this.onBall(e.e.surface, e.e.speed);
          break;
        case 'hit':
          this.onHit(e);
          break;
        case 'serve-ready':
          this.updateHud();
          this.onServeReady();
          break;
        case 'fault':
          sfxFault();
          this.showBanner(t.fault, `${FAULT_TEXT[e.why]}\n${t.secondServe}`, PAL.orange, 1000);
          break;
        case 'let':
          sfxFault();
          this.showBanner(t.let, t.replay, PAL.cyan, 1000);
          break;
        case 'point':
          this.onPoint(e);
          break;
        case 'match-over':
          this.time.delayedCall(400, () => this.showEnd(e.winner));
          break;
        case 'swing':
          break;
      }
    }
  }

  private onBall(surface: string, speed: number): void {
    switch (surface) {
      case 'floor':
        sfxBounce(speed);
        break;
      case 'glass':
        sfxGlass(speed);
        break;
      case 'mesh':
        sfxMesh(speed);
        break;
      case 'net':
        sfxNet();
        break;
      case 'netcord':
        sfxNetCord();
        break;
      case 'out':
        sfxOut();
        break;
    }
  }

  private onHit(e: Extract<MatchEvent, { type: 'hit' }>): void {
    this.serveHint?.destroy();
    this.serveHint = undefined;
    if (e.kind === 'smash') {
      sfxSmash();
      this.cameras.main.shake(120, 0.008);
    } else sfxHit();
    if (e.player !== HUMAN || this.demo) {
      if (e.kind === 'smash') this.popText(this.match.players[e.player], t.smash, PAL.orange);
      return;
    }
    vibrate(e.kind === 'smash' ? 30 : 15);
    if (e.kind === 'serve') return;
    const [label, colour] =
      e.kind === 'smash'
        ? [t.smash, PAL.orange]
        : e.timing === 'perfect'
          ? [t.perfect, PAL.green]
          : e.timing === 'early'
            ? [t.early, PAL.cyan]
            : [t.late, PAL.pink];
    this.popText(this.match.players[HUMAN], label, colour);
  }

  private onServeReady(): void {
    this.serveHint?.destroy();
    this.serveHint = undefined;
    const s = this.match.score;
    if (s.isGoldenPoint) this.showBanner(t.golden, '', PAL.yellow, 1100);
    else if (s.isDeuce && this.match.faults === 0) this.showBanner(t.deuce, '', PAL.white, 900);
    if (this.match.humanToServe && !this.demo) {
      const c = this.add.container(0, 0, [
        pixelText(this, GAME_W / 2, 309, t.serveHint, { colour: PAL.yellow, outline: PAL.ink, shadow: PAL.black }),
      ]);
      c.setDepth(DEPTH_BANNER);
      this.tweens.add({ targets: c, alpha: { from: 1, to: 0.25 }, duration: 450, yoyo: true, repeat: -1 });
      this.serveHint = c;
    }
  }

  private onPoint(e: Extract<MatchEvent, { type: 'point' }>): void {
    this.serveHint?.destroy();
    this.serveHint = undefined;
    this.updateHud();
    const ours = e.winner === 0;
    if (ours) {
      sfxPointWon();
      sfxCrowd(e.rally >= 8 || !!e.result.game);
    } else {
      sfxPointLost();
      if (e.rally >= 8) sfxCrowd(false);
    }
    const ace = e.rally === 1 && e.reason !== 'double-fault';
    const sub = ace ? t.ace : REASON_TEXT[e.reason];
    const colour = ours ? PAL.green : PAL.red;
    if (e.result.match !== undefined) {
      this.showBanner(t.game + ' ' + t.set, sub, colour, 1500);
    } else if (e.result.set !== undefined) {
      this.showBanner(`${t.set} ${ours ? t.you : t.cpu}`, sub, colour, 1500);
    } else if (e.result.game !== undefined) {
      const s = this.match.score;
      this.showBanner(`${t.game} ${ours ? t.you : t.cpu}`, `${s.games[0]} - ${s.games[1]}`, colour, 1500);
      if (s.tiebreak) this.time.delayedCall(1550, () => this.showBanner(t.tiebreak, t.firstTo7, PAL.yellow, 1100));
    } else {
      this.showBanner(ours ? t.yourPoint : t.cpuPoint, sub, colour, 1300);
    }
  }

  // ---- Drawing ---------------------------------------------------------------

  private draw(): void {
    const m = this.match;
    m.players.forEach((p, i) => this.drawPlayer(p, this.views[i]));
    const me = m.players[HUMAN];
    const mp = project(VIEW, me.x, me.y, 0);
    this.marker.setPosition(Math.round(mp.x), Math.round(mp.y) - 31 + (Math.floor(this.time.now / 300) % 2));

    const b = m.ball;
    const ground = project(VIEW, b.x, b.y, 0);
    const air = project(VIEW, b.x, b.y, Math.max(0, b.z));
    const depth = b.x + 0.05;
    this.ballShadow
      .setPosition(Math.round(ground.x), Math.round(ground.y))
      .setDepth(depth - 0.1)
      .setVisible(!b.out && b.z > -0.5)
      .setAlpha(Math.max(0.15, 0.5 - b.z * 0.06));
    this.ballImg.setPosition(Math.round(air.x), Math.round(air.y) - 2).setDepth(depth).setVisible(b.z > -0.5);

    const fast = speedOf(b) > 12 && !b.dead && !m.ballHeld;
    this.trailPos.unshift({ x: Math.round(air.x), y: Math.round(air.y) - 2, depth: depth - 0.05 });
    this.trailPos.length = Math.min(this.trailPos.length, TRAIL * 2);
    this.trail.forEach((img, i) => {
      const p = this.trailPos[(i + 1) * 2];
      if (!p || !fast) return img.setAlpha(0);
      img.setPosition(p.x, p.y).setDepth(p.depth).setAlpha(0.5 * (1 - i / TRAIL));
    });
  }

  private drawPlayer(p: Player, v: PlayerView): void {
    const g = project(VIEW, p.x, p.y, 0);
    const x = Math.round(g.x);
    const y = Math.round(g.y);
    v.sprite.setPosition(x, y).setDepth(p.x);
    v.shadow.setPosition(x, y).setDepth(p.x - 0.01);
    const moving = Math.hypot(p.vx, p.vy);
    v.step += moving * (1 / 60) * 2.2;
    let frame: number = FRAME.idle;
    if (p.cheer > 0) frame = Math.floor(p.cheer * 6) % 2 ? FRAME.cheer : FRAME.idle;
    else if (p.swing >= 0 && p.swing < 0.3) frame = FRAME[p.pose];
    else if (moving > 0.6) frame = Math.floor(v.step) % 2 ? FRAME.run1 : FRAME.run2;
    v.sprite.setFrame(frame);
  }

  private popText(p: Player, text: string, colour: number): void {
    const g = project(VIEW, p.x, p.y, 0);
    const c = pixelText(this, Math.round(g.x), Math.round(g.y) - 34, text, { colour, outline: PAL.ink }).setDepth(DEPTH_BANNER);
    this.tweens.add({ targets: c, y: c.y - 10, alpha: { from: 1, to: 0 }, delay: 250, duration: 450, onComplete: () => c.destroy() });
  }

  private showBanner(title: string, sub: string, colour: number, ms: number): void {
    this.banner?.destroy();
    const parts: Phaser.GameObjects.GameObject[] = [];
    const lines = sub ? sub.split('\n') : [];
    const h = 30 + lines.length * 11;
    const bg = this.add.graphics();
    bg.fillStyle(PAL.ink, 0.82).fillRect(0, -h / 2, GAME_W, h);
    bg.fillStyle(colour, 1).fillRect(0, -h / 2, GAME_W, 1).fillRect(0, h / 2 - 1, GAME_W, 1);
    parts.push(bg);
    parts.push(pixelText(this, GAME_W / 2, -h / 2 + 14, title, { colour, outline: PAL.black, scale: 2 }));
    lines.forEach((l, i) => parts.push(pixelText(this, GAME_W / 2, -h / 2 + 32 + i * 11, l, { colour: PAL.white, outline: PAL.ink })));
    const c = this.add.container(0, 168, parts).setDepth(DEPTH_BANNER);
    this.banner = c;
    c.setScale(1, 0.2);
    this.tweens.add({ targets: c, scaleY: 1, duration: 120 });
    this.tweens.add({ targets: c, alpha: 0, delay: ms, duration: 220, onComplete: () => c.destroy() });
  }

  // ---- Pause and end ------------------------------------------------------

  private autoPause(): void {
    if (!this.paused && this.match.phase !== 'match-over') this.togglePause();
  }

  private togglePause(): void {
    if (this.match.phase === 'match-over') return;
    this.paused = !this.paused;
    this.overlay?.destroy();
    this.overlay = undefined;
    this.controls.setVisible(!this.paused && !this.demo);
    if (!this.paused) return;
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.rectangle(0, 0, GAME_W, GAME_H, PAL.black, 0.7).setOrigin(0).setInteractive());
    items.push(pixelText(this, GAME_W / 2, 110, t.paused, { colour: PAL.yellow, outline: PAL.redDark, shadow: PAL.ink, scale: 2 }));
    items.push(makeButton(this, GAME_W / 2, 160, 150, 34, t.resume, () => this.togglePause(), PAL.blue));
    const soundBtn = (): Phaser.GameObjects.Container =>
      makeButton(this, GAME_W / 2, 204, 150, 34, audioSettings.effects ? t.soundOn : t.soundOff, () => {
        audioSettings.effects = !audioSettings.effects;
        audioSettings.music = audioSettings.effects;
        this.togglePause();
        this.togglePause();
      }, PAL.purple);
    items.push(soundBtn());
    items.push(makeButton(this, GAME_W / 2, 248, 150, 34, t.quit, () => this.leave(), PAL.redDark));
    items.push(pixelText(this, GAME_W / 2, 290, t.pauseHint, { colour: PAL.grey }));
    this.overlay = this.add.container(0, 0, items).setDepth(DEPTH_OVERLAY);
  }

  private showEnd(winner: Team): void {
    this.controls.setVisible(false);
    this.serveHint?.destroy();
    const won = winner === 0;
    if (won) {
      sfxWin();
      sfxCrowd(true);
    } else sfxLose();
    const m = this.match;
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.rectangle(0, 0, GAME_W, GAME_H, PAL.black, 0.72).setOrigin(0).setInteractive());
    const title = this.demo ? (won ? 'BLUE WINS' : 'RED WINS') : won ? t.youWin : t.youLose;
    items.push(pixelText(this, GAME_W / 2, 64, title, { colour: won ? PAL.yellow : PAL.red, outline: PAL.ink, shadow: PAL.black, scale: 2 }));
    const sets = m.score.history.map(([a, b]) => `${a}-${b}`).join('  ');
    items.push(pixelText(this, GAME_W / 2, 90, sets, { colour: PAL.white, outline: PAL.ink, scale: 2 }));

    const panel = this.add.graphics();
    panel.fillStyle(PAL.ink, 0.95).fillRect(16, 110, GAME_W - 32, 112);
    panel.lineStyle(1, PAL.yellow, 1).strokeRect(16.5, 110.5, GAME_W - 33, 111);
    items.push(panel);
    const row = (y: number, label: string, a: string, b: string) => {
      items.push(pixelText(this, 24, y, label, { colour: PAL.grey, originX: 0 }));
      items.push(pixelText(this, 150, y, a, { colour: PAL.skyLight }));
      items.push(pixelText(this, 180, y, b, { colour: PAL.red }));
    };
    const [s0, s1] = m.stats;
    row(122, '', t.you, t.cpu);
    row(140, t.statWinners, String(s0.winners), String(s1.winners));
    row(156, t.statErrors, String(s0.errors + s0.doubleFaults), String(s1.errors + s1.doubleFaults));
    row(172, t.statAces, String(s0.aces), String(s1.aces));
    row(188, t.statSmashes, String(s0.smashes), String(s1.smashes));
    items.push(pixelText(this, 24, 206, t.statRally, { colour: PAL.grey, originX: 0 }));
    items.push(pixelText(this, 165, 206, `${m.longestRally}`, { colour: PAL.yellow }));

    items.push(makeButton(this, GAME_W / 2, 258, 160, 36, t.rematch, () => this.scene.restart(), PAL.blue));
    items.push(makeButton(this, GAME_W / 2, 304, 160, 36, t.menu, () => this.leave(), PAL.greyDark));
    const c = this.add.container(0, 0, items).setDepth(DEPTH_OVERLAY).setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 300 });
    this.overlay = c;
  }

  private leave(): void {
    this.paused = true;
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Menu'));
  }
}
