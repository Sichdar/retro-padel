import '@fontsource/press-start-2p/latin-400.css';
import './style.css';
import Phaser from 'phaser';
import { GAME_H, GAME_W } from './config';
import { computeScale } from './ui/scaling';
import { t } from './ui/strings';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { MenuScene } from './scenes/MenuScene';
import { BallLabScene } from './scenes/BallLabScene';
import { MatchScene } from './scenes/MatchScene';
import { SettingsScene } from './scenes/SettingsScene';
import { HowToScene } from './scenes/HowToScene';
import { audioSettings } from './audio/sfx';
import { refreshMusic } from './audio/music';
import { onSettingsChange, settings } from './settings';

// Sound follows the saved settings.
onSettingsChange(() => {
  audioSettings.effects = settings.effects;
  audioSettings.music = settings.music;
  audioSettings.vibration = settings.vibration;
  refreshMusic();
});

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
  // Up to 4 thumbs at once: two players on one phone in couch mode.
  input: { activePointers: 4 },
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    autoRound: false,
  },
  fps: { target: 60 },
  scene: [BootScene, TitleScene, MenuScene, BallLabScene, MatchScene, SettingsScene, HowToScene],
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
