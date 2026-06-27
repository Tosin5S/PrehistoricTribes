class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    // Core Resources
    this.wood = 50;
    this.stone = 0;
    this.rawFood = 15;
    this.cookedFood = 25;
    this.weapons = 0;
    this.maxPopulation = 6;
    this.danger = 0; // 0 to 100. Spawns raids at 100.
    this.storageLimit = 200; // Base storage capacity

    // Time & Cycles
    this.daysSurvived = 0;
    this.dayTime = 0.2; // 0.0 to 1.0 (0 is dawn, 0.5 is noon, 0.8 is dusk, 0.95 is midnight)
    this.dayLength = 60000; // 60 seconds per game day
    this.season = 'Spring'; // 'Spring', 'Summer', 'Autumn', 'Winter'
    this.weather = 'Sunny'; // 'Sunny', 'Rainy', 'Foggy', 'Snowy'
    
    // Season progress
    this.seasonProgress = 0;
    this.daysPerSeason = 5;

    // Game stats
    this.stats = {
      woodGathered: 50,
      stoneGathered: 0,
      foodGathered: 40,
      foodCooked: 25,
      maxPopReached: 4,
      raidsDefeated: 0,
      babiesBorn: 0,
    };

    // System States
    this.gameOver = false;
    this.gameStarted = false;
    this.gameOverReason = '';
    this.logs = [];
    this.activeRaid = false;
    this.raidTimer = 0;

    // Entities List (references will be populated here)
    this.villagers = [];
    this.enemies = [];
    this.animals = [];
    this.buildings = [];
    this.projectiles = [];
    this.particles = [];
  }

  // Add resources with capacity checks
  addWood(amount) {
    const space = Math.max(0, this.storageLimit - this.wood);
    const added = Math.min(amount, space);
    this.wood += added;
    this.stats.woodGathered += added;
    return added;
  }

  addStone(amount) {
    const space = Math.max(0, this.storageLimit - this.stone);
    const added = Math.min(amount, space);
    this.stone += added;
    this.stats.stoneGathered += added;
    return added;
  }

  addRawFood(amount) {
    const space = Math.max(0, this.storageLimit - this.rawFood);
    const added = Math.min(amount, space);
    this.rawFood += added;
    this.stats.foodGathered += added;
    return added;
  }

  addCookedFood(amount) {
    const space = Math.max(0, this.storageLimit - this.cookedFood);
    const added = Math.min(amount, space);
    this.cookedFood += added;
    this.stats.foodCooked += added;
    return added;
  }

  addWeapons(amount) {
    const space = Math.max(0, this.storageLimit - this.weapons);
    const added = Math.min(amount, space);
    this.weapons += added;
    return added;
  }

  // Adjust danger and check bounds
  increaseDanger(amount) {
    if (this.activeRaid) return;
    this.danger = Math.min(100, this.danger + amount);
  }

  decreaseDanger(amount) {
    this.danger = Math.max(0, this.danger - amount);
  }

  // Add logs to chronical console
  addLog(text, type = 'system') {
    const timeString = `[Day ${this.daysSurvived + 1}]`;
    const message = { text: `${timeString} ${text}`, type, id: Date.now() + Math.random() };
    this.logs.push(message);
    
    // Cap logs size
    if (this.logs.length > 50) {
      this.logs.shift();
    }

    // Trigger custom event for UI updates
    const event = new CustomEvent('game-log', { detail: message });
    window.dispatchEvent(event);
  }

  // Update Game Season Cycle
  advanceTime(deltaTime) {
    if (!this.gameStarted || this.gameOver) return;

    // Advance day clock
    const dayProgress = deltaTime / this.dayLength;
    this.dayTime += dayProgress;

    if (this.dayTime >= 1.0) {
      this.dayTime -= 1.0;
      this.daysSurvived++;
      this.seasonProgress++;
      
      this.addLog(`A new day dawns.`, 'system');

      // Daily food spoilage: 10% of raw food spoils
      if (this.rawFood > 0) {
        const spoiled = Math.ceil(this.rawFood * 0.1);
        this.rawFood -= spoiled;
        this.addLog(`${spoiled} raw food spoiled in storage.`, 'warn');
      }

      // Check Season Change
      if (this.seasonProgress >= this.daysPerSeason) {
        this.seasonProgress = 0;
        this.changeSeason();
      } else {
        // Change weather occasionally
        if (Math.random() < 0.4) {
          this.changeWeather();
        }
      }
    }
  }

  changeSeason() {
    const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
    const currentIdx = seasons.indexOf(this.season);
    const nextIdx = (currentIdx + 1) % seasons.length;
    this.season = seasons[nextIdx];

    this.addLog(`Season change! It is now ${this.season}.`, 'warn');
    this.changeWeather();
  }

  changeWeather() {
    const weatherMap = {
      'Spring': ['Sunny', 'Sunny', 'Rainy', 'Foggy'],
      'Summer': ['Sunny', 'Sunny', 'Sunny', 'Rainy'],
      'Autumn': ['Rainy', 'Rainy', 'Foggy', 'Sunny'],
      'Winter': ['Snowy', 'Snowy', 'Foggy', 'Snowy']
    };

    const options = weatherMap[this.season] || ['Sunny'];
    const oldWeather = this.weather;
    this.weather = options[Math.floor(Math.random() * options.length)];

    if (oldWeather !== this.weather) {
      this.addLog(`The weather is now ${this.weather}.`, 'system');
    }
  }

  // Check if we hit game over
  checkGameOver() {
    if (this.villagers.length === 0 && this.gameStarted && !this.gameOver) {
      this.gameOver = true;
      this.gameOverReason = "All your villagers have perished. The prehistoric wilderness has reclaimed your village.";
      this.addLog("ALL VILLAGERS DECEASED. Game Over.", "danger");
      
      const event = new CustomEvent('game-over');
      window.dispatchEvent(event);
    }
  }
}

export const gameState = new GameState();
export default gameState;
