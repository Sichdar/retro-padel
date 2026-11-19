import Phaser from 'phaser';
import { buildPixelFont, loadPixelFont } from '../ui/pixelFont';
import { PAL } from '../ui/palette';

// First scene: waits for the pixel font, makes the shared textures, then
// opens the title screen.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    void loadPixelFont().then(() => {
      buildPixelFont(this);
      this.makeBallTextures();
      this.scene.start('Title');
    });
  }

  private makeBallTextures(): void {
    const g = this.make.graphics({}, false);
    // Ball: 5x5 with a dark rim and a highlight.
    const ball = ['.XXX.', 'XYWYX', 'XYYYX', 'XYYDX', '.XXX.'];
    ball.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const c = { X: PAL.ink, Y: PAL.ball, W: PAL.white, D: PAL.yellow }[ch];
        if (c !== undefined) g.fillStyle(c, 1).fillRect(x, y, 1, 1);
      }),
    );
    g.generateTexture('ball', 5, 5);
    g.clear();
    // Shadow: a flat dark oval.
    g.fillStyle(PAL.black, 1);
    g.fillRect(1, 0, 4, 1).fillRect(0, 1, 6, 1).fillRect(1, 2, 4, 1);
    g.generateTexture('ball-shadow', 6, 3);
    g.destroy();
  }
}
