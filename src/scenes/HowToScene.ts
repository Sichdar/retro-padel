import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { playMusic } from '../audio/music';
import { sfxBlip } from '../audio/sfx';
import { PAL } from '../ui/palette';
import { pixelText } from '../ui/pixelFont';
import { t } from '../ui/strings';
import { makeButton } from '../ui/widgets';
import { BACKDROP_KEY, ensureBackdrop } from './backdrop';

// How to play: 5 pixel-art panels (controls, serve, walls, losing a point,
// scoring). Each court panel shows a small court from above with a ball
// running along an example shot.

const CX = 108;
const TOP = 52;
const PPM = 7; // pixels per metre on the little court

/** Court metres (x along, y across) to screen pixels on the little court. */
const at = (x: number, y: number) => ({ x: CX + (y - 5) * PPM, y: TOP + x * PPM });

type Mark = { x: number; y: number; kind: 'bounce' | 'glass' | 'bad' | 'good' };
interface Diagram {
  path: [number, number][];
  marks: Mark[];
  players: { x: number; y: number; team: 0 | 1 }[];
  box?: { x0: number; x1: number; y0: number; y1: number };
}

const DIAGRAMS: (Diagram | null)[] = [
  null, // controls: drawn separately
  {
    // Serve from the near right, diagonally into the far box.
    path: [[17.6, 6.7], [16.6, 6.4], [6.2, 2.6], [1.6, 1.0]],
    marks: [{ x: 16.6, y: 6.4, kind: 'bounce' }, { x: 6.2, y: 2.6, kind: 'good' }],
    players: [{ x: 17.8, y: 6.9, team: 0 }, { x: 13.2, y: 2.7, team: 0 }, { x: 1.4, y: 2.6, team: 1 }, { x: 3.8, y: 7.3, team: 1 }],
    box: { x0: 3.05, x1: 10, y0: 0, y1: 5 },
  },
  {
    // A good shot: bounces, hits the back glass, comes back and is played.
    path: [[15.5, 3.5], [4.2, 6.6], [0.1, 7.6], [3.2, 8.2]],
    marks: [{ x: 4.2, y: 6.6, kind: 'bounce' }, { x: 0.1, y: 7.6, kind: 'glass' }, { x: 3.2, y: 8.2, kind: 'good' }],
    players: [{ x: 15.7, y: 3.2, team: 0 }, { x: 13, y: 7.5, team: 0 }, { x: 3.6, y: 8.6, team: 1 }, { x: 5, y: 2.6, team: 1 }],
  },
  {
    // A losing shot: straight into the far glass without bouncing.
    path: [[15.5, 6.5], [0.1, 3.2], [2.0, 3.6]],
    marks: [{ x: 0.1, y: 3.2, kind: 'bad' }],
    players: [{ x: 15.7, y: 6.8, team: 0 }, { x: 13, y: 2.5, team: 0 }, { x: 4.5, y: 7.6, team: 1 }, { x: 4.5, y: 2.4, team: 1 }],
  },
  null, // scoring: a scoreboard
];

export class HowToScene extends Phaser.Scene {
  private page = 0;
  private layer?: Phaser.GameObjects.Container;
  private ball?: Phaser.GameObjects.Arc;
  private ballShadow?: Phaser.GameObjects.Arc;
  private pathT = 0;
  private back = 'Menu';

  constructor() {
    super('HowTo');
  }

  init(data: { back?: string }): void {
    this.back = data?.back ?? 'Menu';
    this.page = 0;
  }

  create(): void {
    ensureBackdrop(this);
    this.add.image(0, 0, BACKDROP_KEY).setOrigin(0);
    this.add.rectangle(0, 0, GAME_W, GAME_H, PAL.black, 0.72).setOrigin(0);
    playMusic('menu');
    pixelText(this, GAME_W / 2, 18, t.howTitle, { colour: PAL.yellow, outline: PAL.redDark, shadow: PAL.ink, scale: 2 });

    // Swipe left or right to turn the page.
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const dx = p.x - p.downX;
      if (Math.abs(dx) > 40 && Math.abs(p.y - p.downY) < 40) this.turn(dx < 0 ? 1 : -1);
    });
    const kb = this.input.keyboard;
    kb?.on('keydown-RIGHT', () => this.turn(1));
    kb?.on('keydown-ENTER', () => this.turn(1));
    kb?.on('keydown-LEFT', () => this.turn(-1));
    kb?.on('keydown-ESC', () => this.leave());

    this.showPage();
    this.cameras.main.fadeIn(200, 0, 0, 0);
  }

  private turn(dir: number): void {
    const n = t.howPages.length;
    const p = this.page + dir;
    if (p < 0) return this.leave();
    if (p >= n) return this.leave();
    sfxBlip();
    this.page = p;
    this.showPage();
  }

  private showPage(): void {
    this.layer?.destroy();
    const items: Phaser.GameObjects.GameObject[] = [];
    const page = t.howPages[this.page];
    const n = t.howPages.length;
    items.push(pixelText(this, GAME_W / 2, 38, `${this.page + 1}/${n}  ${page.title}`, { colour: PAL.white, outline: PAL.ink }));

    const g = this.add.graphics();
    items.push(g);
    const d = DIAGRAMS[this.page];
    if (d) this.drawCourt(g, d, items);
    else if (this.page === 0) this.drawControls(g, items);
    else this.drawScoreboard(g, items);

    // Panel of text under the picture.
    g.fillStyle(PAL.ink, 0.92).fillRect(8, 206, GAME_W - 16, 96);
    g.lineStyle(1, PAL.yellow, 1).strokeRect(8.5, 206.5, GAME_W - 17, 95);
    page.lines.forEach((line, i) =>
      items.push(pixelText(this, GAME_W / 2, 220 + i * 14, line, { colour: i % 2 ? PAL.white : PAL.skyLight })),
    );

    // Page dots.
    for (let i = 0; i < n; i++) {
      g.fillStyle(i === this.page ? PAL.yellow : PAL.greyDark, 1).fillRect(GAME_W / 2 - n * 5 + i * 10 + 2, 318, 6, 6);
    }
    items.push(makeButton(this, 46, GAME_H - 24, 74, 30, t.back, () => this.turn(-1), PAL.greyDark));
    items.push(makeButton(this, GAME_W - 46, GAME_H - 24, 74, 30, this.page === n - 1 ? t.done : t.next, () => this.turn(1), PAL.blue));

    this.ball = undefined;
    this.ballShadow = undefined;
    if (d) {
      this.ballShadow = this.add.circle(0, 0, 2, PAL.black, 0.5);
      this.ball = this.add.circle(0, 0, 2, PAL.ball).setStrokeStyle(1, PAL.ink);
      items.push(this.ballShadow, this.ball);
      this.pathT = 0;
    }
    this.layer = this.add.container(0, 0, items);
  }

  private drawCourt(g: Phaser.GameObjects.Graphics, d: Diagram, items: Phaser.GameObjects.GameObject[]): void {
    const a = at(0, 0);
    const b = at(20, 10);
    g.fillStyle(PAL.courtDark, 1).fillRect(a.x - 3, a.y - 3, b.x - a.x + 6, b.y - a.y + 6);
    g.fillStyle(PAL.court, 1).fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    if (d.box) {
      const p = at(d.box.x0, d.box.y0);
      const q = at(d.box.x1, d.box.y1);
      g.fillStyle(PAL.yellow, 0.35).fillRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x), Math.abs(q.y - p.y));
    }
    // Lines: service lines, centre line, net.
    g.fillStyle(PAL.lines, 1);
    for (const x of [3.05, 16.95]) {
      const p = at(x, 0);
      g.fillRect(p.x, p.y, 70, 1);
    }
    const c0 = at(3.05, 5);
    g.fillRect(c0.x, c0.y, 1, 13.9 * PPM);
    const n = at(10, 0);
    g.fillStyle(PAL.white, 1).fillRect(n.x - 3, n.y - 1, 76, 2);
    g.fillStyle(PAL.ink, 1).fillRect(n.x - 4, n.y - 2, 2, 4).fillRect(n.x + 72, n.y - 2, 2, 4);
    // Walls: glass at the back and the first 2 m of each side, mesh in between.
    const wall = (x0: number, y0: number, x1: number, y1: number, glass: boolean) => {
      const p = at(x0, y0);
      const q = at(x1, y1);
      g.fillStyle(glass ? PAL.glass : PAL.grey, glass ? 1 : 0.8);
      g.fillRect(Math.min(p.x, q.x) - 1, Math.min(p.y, q.y) - 1, Math.abs(q.x - p.x) + 2, Math.abs(q.y - p.y) + 2);
    };
    wall(0, -0.3, 0, 10.3, true);
    wall(20, -0.3, 20, 10.3, true);
    for (const y of [-0.3, 10.3]) {
      wall(0, y, 2, y, true);
      wall(18, y, 20, y, true);
      wall(2, y, 18, y, false);
    }
    // Legend.
    g.fillStyle(PAL.glass, 1).fillRect(160, 60, 8, 3);
    g.fillStyle(PAL.grey, 1).fillRect(160, 76, 8, 3);
    items.push(pixelText(this, 171, 62, 'GLASS', { colour: PAL.glass, originX: 0, scale: 1 }));
    items.push(pixelText(this, 171, 78, 'MESH', { colour: PAL.grey, originX: 0 }));
    // Players.
    for (const p of d.players) {
      const s = at(p.x, p.y);
      g.fillStyle(PAL.ink, 1).fillRect(s.x - 3, s.y - 3, 7, 7);
      g.fillStyle(p.team === 0 ? PAL.sky : PAL.red, 1).fillRect(s.x - 2, s.y - 2, 5, 5);
    }
    // Marks.
    for (const m of d.marks) {
      const s = at(m.x, m.y);
      if (m.kind === 'bounce') {
        g.lineStyle(1, PAL.yellowLight, 1).strokeCircle(s.x, s.y, 3);
      } else if (m.kind === 'glass') {
        g.fillStyle(PAL.white, 1).fillRect(s.x - 4, s.y - 1, 9, 2).fillRect(s.x - 1, s.y - 4, 2, 9);
      } else if (m.kind === 'bad') {
        g.lineStyle(2, PAL.red, 1).lineBetween(s.x - 4, s.y - 4, s.x + 4, s.y + 4).lineBetween(s.x - 4, s.y + 4, s.x + 4, s.y - 4);
      } else {
        g.lineStyle(2, PAL.green, 1).lineBetween(s.x - 4, s.y, s.x - 1, s.y + 3).lineBetween(s.x - 1, s.y + 3, s.x + 5, s.y - 4);
      }
    }
    // Dotted path.
    for (let i = 1; i < d.path.length; i++) {
      const p = at(...d.path[i - 1]);
      const q = at(...d.path[i]);
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      for (let s = 0; s < len; s += 4) {
        g.fillStyle(PAL.yellowLight, 0.5).fillRect(Math.round(p.x + ((q.x - p.x) * s) / len), Math.round(p.y + ((q.y - p.y) * s) / len), 1, 1);
      }
    }
  }

  private drawControls(g: Phaser.GameObjects.Graphics, items: Phaser.GameObjects.GameObject[]): void {
    // A phone's bottom strip: stick on the left, HIT and LOB on the right.
    g.fillStyle(PAL.ink, 1).fillRect(28, 60, 160, 130);
    g.lineStyle(2, PAL.greyDark, 1).strokeRect(28, 60, 160, 130);
    g.fillStyle(PAL.court, 1).fillRect(34, 66, 148, 58);
    g.fillStyle(PAL.lines, 1).fillRect(34, 95, 148, 1);
    g.lineStyle(2, PAL.white, 0.6).strokeCircle(70, 156, 20);
    g.fillStyle(PAL.skyLight, 1).fillCircle(78, 150, 9);
    g.fillStyle(PAL.red, 0.85).fillCircle(160, 150, 18);
    g.fillStyle(PAL.purple, 0.85).fillCircle(124, 172, 12);
    items.push(pixelText(this, 160, 150, t.hit, { colour: PAL.white, outline: PAL.ink }));
    items.push(pixelText(this, 124, 172, t.lob, { colour: PAL.white, outline: PAL.ink }));
    items.push(pixelText(this, 70, 184, 'MOVE', { colour: PAL.grey }));
    items.push(pixelText(this, 108, 80, t.perfect, { colour: PAL.green, outline: PAL.ink }));
    // Arrows round the stick.
    g.fillStyle(PAL.yellow, 1);
    g.fillTriangle(70, 128, 66, 134, 74, 134).fillTriangle(42, 156, 48, 152, 48, 160).fillTriangle(98, 156, 92, 152, 92, 160);
  }

  private drawScoreboard(g: Phaser.GameObjects.Graphics, items: Phaser.GameObjects.GameObject[]): void {
    g.fillStyle(PAL.ink, 1).fillRect(30, 70, 156, 60);
    g.fillStyle(PAL.yellow, 1).fillRect(30, 130, 156, 2);
    g.fillStyle(PAL.navy, 1).fillRect(110, 76, 22, 48).fillRect(138, 76, 40, 48);
    items.push(pixelText(this, 40, 88, t.you, { colour: PAL.skyLight, originX: 0 }));
    items.push(pixelText(this, 40, 112, t.cpu, { colour: PAL.red, originX: 0 }));
    items.push(pixelText(this, 121, 88, '3', { colour: PAL.white }));
    items.push(pixelText(this, 121, 112, '3', { colour: PAL.white }));
    const gp = pixelText(this, 158, 88, '40', { colour: PAL.yellow });
    items.push(gp, pixelText(this, 158, 112, '40', { colour: PAL.yellow }));
    const golden = pixelText(this, GAME_W / 2, 160, t.golden, { colour: PAL.yellow, outline: PAL.redDark, scale: 2 });
    items.push(golden);
    this.tweens.add({ targets: golden, alpha: { from: 1, to: 0.3 }, duration: 500, yoyo: true, repeat: -1 });
  }

  update(_time: number, delta: number): void {
    const d = DIAGRAMS[this.page];
    if (!d || !this.ball || !this.ballShadow) return;
    // Ball runs along the path at about 9 m/s, waits, then starts again.
    const segs = d.path.slice(1).map((q, i) => Math.hypot(q[0] - d.path[i][0], q[1] - d.path[i][1]));
    const total = segs.reduce((a, b) => a + b, 0);
    this.pathT += (delta / 1000) * 9;
    if (this.pathT > total + 6) this.pathT = 0;
    let s = Math.min(this.pathT, total);
    let i = 0;
    while (i < segs.length - 1 && s > segs[i]) s -= segs[i++];
    const p = d.path[i];
    const q = d.path[i + 1];
    const k = segs[i] ? Math.min(1, s / segs[i]) : 0;
    const pos = at(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k);
    // A little hop between bounces, so the shadow shows the height.
    const hop = Math.sin(Math.PI * k) * (segs[i] > 5 ? 8 : 3);
    this.ballShadow.setPosition(pos.x, pos.y);
    this.ball.setPosition(pos.x, pos.y - hop);
  }

  private leave(): void {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.back));
  }
}
