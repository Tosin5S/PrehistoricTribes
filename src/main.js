import { GameEngine } from './game/engine.js';
import { GameUI } from './game/ui.js';

// Wait for DOM load
document.addEventListener('DOMContentLoaded', () => {
  // Instantiate the core rendering engine
  const engine = new GameEngine('game-canvas');

  // Instantiate the UI dashboard and events controller
  const ui = new GameUI(engine);

  // Hook globally for developer troubleshooting if needed
  window.gameEngine = engine;
  window.gameUI = ui;
});
