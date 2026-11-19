import '@fontsource/press-start-2p/latin-400.css';
import './style.css';
import Phaser from 'phaser';
import { GAME_H, GAME_W } from './config';
import { computeScale } from './ui/scaling';
import { t } from './ui/strings';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { MenuScene } from './scenes/MenuScene';

const parent = document.getElementById('game')!;
const rotateText = document.querySelector('#rotate p');
if (rotateText) rotateText.textContent = t.rotate;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  banner: false,
  input: { activePointers: 3 },
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    autoRound: false,
  },
  fps: { target: 60 },
  scene: [BootScene, TitleScene, MenuScene],
});

// Scale the game up by whole numbers (crisp pixels), centred, inside the
// phone's safe area (away from the notch). The rest of the screen stays black.
function fit(): void {
  const w = parent.clientWidth;
  const h = parent.clientHeight;
  if (w === 0 || h === 0) return;
  const s = computeScale(w, h, window.devicePixelRatio || 1, GAME_W, GAME_H);
  game.scale.setZoom(s.cssWidth / GAME_W);
}

window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 200));
window.visualViewport?.addEventListener('resize', fit);
game.events.once(Phaser.Core.Events.READY, fit);

if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
