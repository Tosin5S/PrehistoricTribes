import { gameState } from './state.js';
import { gameAudio } from './audio.js';
import { BUILDING_TYPES } from './buildings.js';

export class GameUI {
  constructor(engine) {
    this.engine = engine;
    this.selectedVillager = null;

    this.initUIListeners();
    this.startUIUpdater();
  }

  initUIListeners() {
    // Sound FX Toggle
    const sfxBtn = document.getElementById('sound-effects-btn');
    sfxBtn.addEventListener('click', () => {
      gameAudio.sfxEnabled = !gameAudio.sfxEnabled;
      sfxBtn.querySelector('span').innerText = `SFX: ${gameAudio.sfxEnabled ? 'ON' : 'OFF'}`;
      sfxBtn.classList.toggle('active', !gameAudio.sfxEnabled);
      gameAudio.playClick();
    });

    // Music Toggle
    const musicBtn = document.getElementById('music-btn');
    musicBtn.addEventListener('click', () => {
      const active = gameAudio.toggleMusic();
      musicBtn.querySelector('span').innerText = `MUSIC: ${active ? 'ON' : 'OFF'}`;
      musicBtn.classList.toggle('active', active);
      gameAudio.playClick();
    });

    // Start Button
    const startBtn = document.getElementById('start-game-btn');
    startBtn.addEventListener('click', () => {
      document.getElementById('intro-dialog').classList.remove('show');
      gameAudio.init(); // enable sound on click
      this.engine.start();
    });

    // Restart Button
    const restartBtn = document.getElementById('restart-game-btn');
    restartBtn.addEventListener('click', () => {
      window.location.reload();
    });

    // Modal Close
    const closeBtn = document.getElementById('modal-close');
    closeBtn.addEventListener('click', () => {
      document.getElementById('villager-modal').style.display = 'none';
      this.selectedVillager = null;
    });

    // Closing modal on clicking outside
    window.addEventListener('click', (e) => {
      const modal = document.getElementById('villager-modal');
      if (e.target === modal) {
        modal.style.display = 'none';
        this.selectedVillager = null;
      }
    });

    // Handle villager selection events from engine
    window.addEventListener('villager-selected', (e) => {
      this.openVillagerModal(e.detail);
    });

    // Handle selection cleared
    window.addEventListener('selection-cleared', () => {
      // Selected empty grid, don't close modal unless user clicks close, but clear references
    });

    // Handle Log Event
    window.addEventListener('game-log', (e) => {
      this.appendLogMessage(e.detail);
    });

    // Handle Game Over
    window.addEventListener('game-over', () => {
      this.showGameOverScreen();
    });

    // Build buttons listener
    const buildBtns = document.querySelectorAll('.build-btn');
    buildBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = btn.dataset.building;
        
        // If already selected, turn off
        if (this.engine.buildPlacementMode === type) {
          this.engine.buildPlacementMode = null;
        } else {
          this.engine.buildPlacementMode = type;
          gameState.addLog(`Click on the map to place a ${BUILDING_TYPES[type].name}.`, 'system');
        }
        
        this.updateBuildButtonsState();
        gameAudio.playClick();
      });
    });

    // Modal Job Selector Dropdown Change
    const jobSelect = document.getElementById('modal-job-select');
    jobSelect.addEventListener('change', () => {
      if (this.selectedVillager) {
        this.selectedVillager.setJob(jobSelect.value);
        this.renderVillagersList();
        this.renderGlobalJobAllocations();
        gameAudio.playClick();
      }
    });

    // Listen to building completed state to reset build states
    window.addEventListener('build-mode-changed', () => {
      this.updateBuildButtonsState();
    });
  }

  // Periodic UI update (fast loop for numbers, slow loop for lists)
  startUIUpdater() {
    // Fast numbers loop (100ms)
    setInterval(() => {
      this.updateResourceStats();
      this.updateBuildButtonsState();
    }, 100);

    // Slow lists loop (500ms)
    setInterval(() => {
      if (gameState.gameStarted && !gameState.gameOver) {
        this.renderVillagersList();
        this.renderGlobalJobAllocations();
        this.updateWeatherVisuals();
        this.updateModalStats();
      }
    }, 500);
  }

  updateResourceStats() {
    document.getElementById('cooked-food-val').innerText = Math.floor(gameState.cookedFood);
    document.getElementById('raw-food-val').innerText = Math.floor(gameState.rawFood);
    document.getElementById('wood-val').innerText = Math.floor(gameState.wood);
    document.getElementById('stone-val').innerText = Math.floor(gameState.stone);
    document.getElementById('weapons-val').innerText = Math.floor(gameState.weapons);
    document.getElementById('pop-val').innerText = gameState.villagers.length;
    document.getElementById('max-pop-val').innerText = gameState.maxPopulation;

    document.getElementById('panel-pop-badge').innerText = gameState.villagers.length;

    // Season and Weather
    document.getElementById('season-val').innerText = gameState.season;
    document.getElementById('weather-val').innerText = gameState.weather;
    
    // Weather Icon
    const wIcons = { 'Sunny': '☀️', 'Rainy': '🌧️', 'Foggy': '🌫️', 'Snowy': '❄️' };
    document.getElementById('weather-icon').innerText = wIcons[gameState.weather] || '☀️';

    // Danger Bar
    const dangerFill = document.getElementById('danger-bar-fill');
    dangerFill.style.width = `${gameState.danger}%`;
    if (gameState.activeRaid) {
      dangerFill.classList.add('alert');
      dangerFill.style.animation = 'pulse 0.5s infinite alternate';
    } else {
      dangerFill.classList.remove('alert');
      dangerFill.style.animation = '';
    }
  }

  updateBuildButtonsState() {
    const buildBtns = document.querySelectorAll('.build-btn');
    buildBtns.forEach(btn => {
      const type = btn.dataset.building;
      const meta = BUILDING_TYPES[type];
      
      // Highlight if active placement mode
      if (this.engine.buildPlacementMode === type) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }

      // Disable if not enough wood/stone or pop limit hit (for Huts if we wanted to block, but huts can always be built)
      const hasWood = gameState.wood >= meta.costWood;
      const hasStone = gameState.stone >= meta.costStone;
      
      btn.disabled = !(hasWood && hasStone);
    });
  }

  // Render left list of villagers
  renderVillagersList() {
    const list = document.getElementById('villagers-list');
    
    // Sort so children are at bottom, then by job
    const sorted = [...gameState.villagers].sort((a, b) => {
      if (a.isChild && !b.isChild) return 1;
      if (!a.isChild && b.isChild) return -1;
      return a.job.localeCompare(b.job);
    });

    // Check if we need to regenerate HTML (minimize churn)
    let html = '';
    sorted.forEach(v => {
      const isSelected = this.engine.selectedEntity === v;
      let hpClass = v.health < 40 ? 'low' : '';
      let sickText = v.isSick ? ' <span class="sick-tag">🤒 Sick</span>' : '';
      let jobText = v.isChild ? 'CHILD' : v.job;
      let avatar = v.gender === 'Female' ? '👧' : '👦';
      if (v.isChild) avatar = '👶';
      if (v.state === 'sleeping') avatar = '💤';

      html += `
        <div class="villager-card ${isSelected ? 'selected' : ''}" data-id="${v.id}">
          <div class="card-header">
            <span class="card-name">${avatar} ${v.name}</span>
            <span class="card-job">${jobText}</span>
          </div>
          <div class="card-stats">
            <div class="card-stat-item ${hpClass}">❤️ ${Math.round(v.health)}%</div>
            <div class="card-stat-item">⚡ ${Math.round(v.energy)}%</div>
            <div class="card-stat-item">🍖 ${Math.round(v.hunger)}%</div>
            ${sickText}
          </div>
        </div>
      `;
    });

    list.innerHTML = html;

    // Attach click listeners to cards
    const cards = list.querySelectorAll('.villager-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const id = parseFloat(card.dataset.id);
        const villager = gameState.villagers.find(v => v.id === id);
        if (villager) {
          this.engine.selectedEntity = villager;
          this.openVillagerModal(villager);
        }
      });
    });
  }

  // Render quick jobs allocation screen
  renderGlobalJobAllocations() {
    const container = document.getElementById('global-jobs');
    const jobs = ['idle', 'woodcutter', 'miner', 'gatherer', 'cook', 'builder', 'warrior', 'shaman'];
    
    // Count current allocations
    const counts = {};
    jobs.forEach(j => counts[j] = 0);
    
    gameState.villagers.forEach(v => {
      if (!v.isChild && counts[v.job] !== undefined) {
        counts[v.job]++;
      }
    });

    const activeAdults = gameState.villagers.filter(v => !v.isChild).length;
    const idleCount = counts['idle'];

    let html = '';
    jobs.forEach(job => {
      const count = counts[job];
      const jobLabels = {
        idle: '🛋️ Idle (Resting)',
        woodcutter: '🪵 Woodcutter',
        miner: '🪨 Stone Miner',
        gatherer: '🍒 Gatherer',
        cook: '🔥 Cook',
        builder: '🔨 Builder',
        warrior: '⚔️ Warrior',
        shaman: '🧪 Shaman'
      };

      // Rules:
      // Plus button enabled if: there are idle villagers AND this is not the idle job
      // Minus button enabled if: this job has count > 0 AND this is not the idle job
      const canPlus = (idleCount > 0 && job !== 'idle');
      const canMinus = (count > 0 && job !== 'idle');

      html += `
        <div class="job-row">
          <div class="job-info">
            <span>${jobLabels[job]}</span>
          </div>
          <div class="job-count-wrapper">
            <button class="job-btn minus" data-job="${job}" ${canMinus ? '' : 'disabled'}>-</button>
            <span class="job-count">${count}</span>
            <button class="job-btn plus" data-job="${job}" ${canPlus ? '' : 'disabled'}>+</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Attach button listeners
    container.querySelectorAll('.job-btn.plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const job = btn.dataset.job;
        // Find an idle villager and assign them
        const idleVillager = gameState.villagers.find(v => !v.isChild && v.job === 'idle');
        if (idleVillager) {
          idleVillager.setJob(job);
          gameAudio.playClick();
          this.renderGlobalJobAllocations();
          this.renderVillagersList();
        }
      });
    });

    container.querySelectorAll('.job-btn.minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const job = btn.dataset.job;
        // Find a villager with this job and make them idle
        const workingVillager = gameState.villagers.find(v => !v.isChild && v.job === job);
        if (workingVillager) {
          workingVillager.setJob('idle');
          gameAudio.playClick();
          this.renderGlobalJobAllocations();
          this.renderVillagersList();
        }
      });
    });
  }

  // Open single villager details modal
  openVillagerModal(villager) {
    this.selectedVillager = villager;
    
    // Fill text
    document.getElementById('modal-name').innerText = villager.name;
    document.getElementById('modal-gender-age').innerText = `${villager.gender}, Age ${villager.isChild ? 'Child' : villager.age}`;
    
    let avatar = villager.gender === 'Female' ? '👧' : '👦';
    if (villager.isChild) avatar = '👶';
    if (villager.state === 'sleeping') avatar = '💤';
    document.getElementById('modal-avatar').innerText = avatar;

    // Show strength
    document.getElementById('modal-combat-val').innerText = `${villager.getDamage()} (${villager.weapon === 'none' ? 'Fists' : villager.weapon})`;

    // Fill job dropdown
    const select = document.getElementById('modal-job-select');
    select.value = villager.job;
    
    // Disable dropdown for children
    select.disabled = villager.isChild;

    this.updateModalStats();

    // Show modal
    document.getElementById('villager-modal').style.display = 'flex';
  }

  updateModalStats() {
    if (!this.selectedVillager || document.getElementById('villager-modal').style.display !== 'flex') return;
    
    const v = this.selectedVillager;

    document.getElementById('modal-health-fill').style.width = `${v.health}%`;
    document.getElementById('modal-health-val').innerText = `${Math.round(v.health)}/100`;

    document.getElementById('modal-energy-fill').style.width = `${v.energy}%`;
    document.getElementById('modal-energy-val').innerText = `${Math.round(v.energy)}/100`;

    document.getElementById('modal-hunger-fill').style.width = `${v.hunger}%`;
    
    let hungerText = 'Sated';
    if (v.hunger > 35) hungerText = 'Peckish';
    if (v.hunger > 70) hungerText = 'Hungry';
    if (v.hunger > 85) hungerText = 'Starving';
    document.getElementById('modal-hunger-val').innerText = `${Math.round(v.hunger)}% (${hungerText})`;

    document.getElementById('modal-mood-fill').style.width = `${v.mood}%`;
    let moodText = 'Happy';
    if (v.mood > 85) moodText = 'Ecstatic';
    if (v.mood < 40) moodText = 'Grumbling';
    if (v.mood < 20) moodText = 'Miserable';
    document.getElementById('modal-mood-val').innerText = moodText;
  }

  appendLogMessage(log) {
    const consoleLog = document.getElementById('log-console');
    const msg = document.createElement('div');
    msg.className = `log-msg ${log.type}`;
    msg.innerText = log.text;
    consoleLog.appendChild(msg);

    // Scroll to bottom
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }

  // Adjust style weather overlays based on season/weather
  updateWeatherVisuals() {
    const overlay = document.getElementById('weather-overlay');
    const weather = gameState.weather;

    if (weather === 'Rainy') {
      overlay.style.backgroundColor = 'rgba(28, 61, 82, 0.12)';
      overlay.style.boxShadow = 'inset 0 0 100px rgba(0, 0, 50, 0.4)';
    } else if (weather === 'Snowy') {
      overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
      overlay.style.boxShadow = 'inset 0 0 80px rgba(255, 255, 255, 0.3)';
    } else if (weather === 'Foggy') {
      overlay.style.backgroundColor = 'rgba(150, 150, 150, 0.18)';
      overlay.style.backdropFilter = 'blur(1px)';
    } else {
      // Sunny
      overlay.style.backgroundColor = 'transparent';
      overlay.style.boxShadow = 'none';
      overlay.style.backdropFilter = 'none';
    }
  }

  showGameOverScreen() {
    document.getElementById('summary-days').innerText = gameState.daysSurvived;
    document.getElementById('summary-pop').innerText = gameState.stats.maxPopReached;
    document.getElementById('summary-wood').innerText = Math.round(gameState.stats.woodGathered);
    document.getElementById('summary-stone').innerText = Math.round(gameState.stats.stoneGathered);
    
    document.getElementById('gameover-reason').innerText = gameState.gameOverReason;
    document.getElementById('gameover-dialog').classList.add('show');
  }
}
export default GameUI;
