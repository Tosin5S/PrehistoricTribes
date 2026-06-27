import { gameState } from './state.js';
import { GameMap } from './map.js';
import { Villager, Enemy, Animal } from './entities.js';
import { Building, BUILDING_TYPES } from './buildings.js';
import { gameAudio } from './audio.js';

export class GameEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    this.map = new GameMap(32, 32);
    
    // Viewport camera controls
    this.camera = {
      x: 16 * 64 - window.innerWidth / 2, // Center camera on middle of grid
      y: 16 * 64 - window.innerHeight / 2,
      zoom: 1.0,
      minZoom: 0.5,
      maxZoom: 2.0
    };

    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    
    this.selectedEntity = null; // Currently clicked villager/building
    this.buildPlacementMode = null; // 'hut', 'storage', etc., or null

    this.lastTime = 0;
    this.initInput();
    this.spawnInitialTribe();
    this.spawnInitialAnimals();
  }

  spawnInitialTribe() {
    gameState.villagers = [];
    const center = 16;
    
    // Spawn 4 starting villagers near the center
    const coordinates = [
      { x: center - 1, y: center - 1, gender: 'Male' },
      { x: center + 1, y: center - 1, gender: 'Female' },
      { x: center - 1, y: center + 1, gender: 'Female' },
      { x: center + 1, y: center + 1, gender: 'Male' }
    ];

    coordinates.forEach((coord, idx) => {
      const v = new Villager(Date.now() + idx, coord.x, coord.y, coord.gender);
      gameState.villagers.push(v);
    });
  }

  spawnInitialAnimals() {
    gameState.animals = [];
    // Spawn a couple of mammoths, boars, and rabbits
    this.spawnAnimalCount('mammoth', 2);
    this.spawnAnimalCount('boar', 4);
    this.spawnAnimalCount('rabbit', 6);
  }

  spawnAnimalCount(type, count) {
    let spawned = 0;
    while (spawned < count) {
      const rx = Math.floor(Math.random() * this.map.width);
      const ry = Math.floor(Math.random() * this.map.height);
      if (this.map.grid[ry]?.[rx] === 'grass' && !this.map.collisionGrid[ry][rx]) {
        const animal = new Animal(Date.now() + Math.random(), type, rx, ry);
        gameState.animals.push(animal);
        spawned++;
      }
    }
  }

  initInput() {
    // Resize listener
    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();

    // Mouse Drag/Pan
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStart.x = e.clientX;
      this.dragStart.y = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.camera.x -= dx / this.camera.zoom;
        this.camera.y -= dy / this.camera.zoom;
        this.dragStart.x = e.clientX;
        this.dragStart.y = e.clientY;
        this.canvas.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
      }
    });

    // Zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      let newZoom = this.camera.zoom;
      if (e.deltaY < 0) {
        newZoom = Math.min(this.camera.maxZoom, this.camera.zoom * zoomFactor);
      } else {
        newZoom = Math.max(this.camera.minZoom, this.camera.zoom / zoomFactor);
      }
      
      // Keep zoom centered on cursor
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      const worldX = mouseX / this.camera.zoom + this.camera.x;
      const worldY = mouseY / this.camera.zoom + this.camera.y;

      this.camera.zoom = newZoom;
      this.camera.x = worldX - mouseX / this.camera.zoom;
      this.camera.y = worldY - mouseY / this.camera.zoom;
    }, { passive: false });

    // Click handler for selection & building placement
    this.canvas.addEventListener('click', (e) => {
      if (this.isDragging) return; // ignore click if dragged

      // Translate click to world coordinates
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = mouseX / this.camera.zoom + this.camera.x;
      const worldY = mouseY / this.camera.zoom + this.camera.y;
      
      const gridX = Math.floor(worldX / this.map.tileSize);
      const gridY = Math.floor(worldY / this.map.tileSize);

      if (this.buildPlacementMode) {
        this.handlePlaceBuilding(gridX, gridY);
      } else {
        this.handleSelection(gridX, gridY, worldX, worldY);
      }
    });
  }

  resizeCanvas() {
    this.canvas.width = this.canvas.parentElement.clientWidth;
    this.canvas.height = this.canvas.parentElement.clientHeight;
  }

  // Handle building placement click
  handlePlaceBuilding(gridX, gridY) {
    const type = this.buildPlacementMode;
    const meta = BUILDING_TYPES[type];
    if (!meta) return;

    // Check cost
    if (gameState.wood < meta.costWood || gameState.stone < meta.costStone) {
      gameState.addLog("Insufficient resources for construction!", "warn");
      this.buildPlacementMode = null;
      window.dispatchEvent(new CustomEvent('build-mode-changed'));
      return;
    }

    if (this.map.canPlaceBuilding(gridX, gridY, meta.width, meta.height)) {
      // Deduct cost
      gameState.wood -= meta.costWood;
      gameState.stone -= meta.costStone;

      // Add building instance
      const id = Date.now() + Math.random();
      const building = new Building(id, type, gridX, gridY);
      gameState.buildings.push(building);
      
      // Block collisions
      this.map.placeBuildingCollision(gridX, gridY, meta.width, meta.height, true);
      
      gameState.addLog(`Placed ${meta.name} construction site. Assign builders to complete it.`, 'system');
      gameAudio.playClick();
      
      // Reset placement mode
      this.buildPlacementMode = null;
      window.dispatchEvent(new CustomEvent('build-mode-changed'));
    } else {
      gameState.addLog("Cannot place building here! Area obstructed.", "warn");
    }
  }

  // Selection detection
  handleSelection(gridX, gridY, worldX, worldY) {
    // 1. Check if clicked a villager
    let clickedVillager = null;
    gameState.villagers.forEach(v => {
      const vx = v.visualX * this.map.tileSize + this.map.tileSize/2;
      const vy = v.visualY * this.map.tileSize + this.map.tileSize/2;
      const dist = Math.sqrt((worldX - vx) ** 2 + (worldY - vy) ** 2);
      if (dist < 28) {
        clickedVillager = v;
      }
    });

    if (clickedVillager) {
      this.selectedEntity = clickedVillager;
      gameAudio.playClick();
      // Dispatch event to show villager detail modal
      window.dispatchEvent(new CustomEvent('villager-selected', { detail: clickedVillager }));
      return;
    }

    // 2. Check if clicked a building
    let clickedBuilding = null;
    gameState.buildings.forEach(b => {
      if (gridX >= b.x && gridX < b.x + b.width && gridY >= b.y && gridY < b.y + b.height) {
        clickedBuilding = b;
      }
    });

    if (clickedBuilding) {
      this.selectedEntity = clickedBuilding;
      gameAudio.playClick();
      gameState.addLog(`Selected ${clickedBuilding.name} (${clickedBuilding.isBuilt ? 'Built' : `Construction: ${Math.floor(clickedBuilding.progress / clickedBuilding.maxProgress * 100)}%`})`, 'system');
      return;
    }

    // 3. Clicked empty terrain
    this.selectedEntity = null;
    window.dispatchEvent(new CustomEvent('selection-cleared'));
  }

  // Start loop
  start() {
    gameState.gameStarted = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  loop(time) {
    if (gameState.gameOver) return;

    let deltaTime = (time - this.lastTime) / 1000;
    this.lastTime = time;

    // Clamp deltaTime to prevent huge jumps (e.g. tab in background)
    if (deltaTime > 0.1) deltaTime = 0.1;

    this.update(deltaTime);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(deltaTime) {
    // 1. Game State Clock
    gameState.advanceTime(deltaTime);

    // 2. Regrow resources
    this.map.updateRegrowth(deltaTime);

    // 3. Raid Spawner logic
    this.updateRaids(deltaTime);

    // 4. Update villagers
    gameState.villagers.forEach(v => v.update(deltaTime, this.map));

    // 5. Update cannibal enemies
    gameState.enemies.forEach(e => e.update(deltaTime, this.map));

    // 6. Update wild animals
    gameState.animals.forEach(a => a.update(deltaTime, this.map));
    
    // Spawn new wildlife occasionally if population gets low
    if (gameState.animals.length < 5 && Math.random() < 0.001) {
      const types = ['rabbit', 'boar', 'mammoth'];
      this.spawnAnimalCount(types[Math.floor(Math.random() * types.length)], 1);
    }

    // 7. Update buildings
    gameState.buildings.forEach(b => b.update(deltaTime, this.map));

    // 8. Update projectiles
    this.updateProjectiles(deltaTime);

    // 9. Update particles
    gameState.particles.forEach((p, idx) => {
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.life -= deltaTime;
      if (p.life <= 0) {
        gameState.particles.splice(idx, 1);
      }
    });
  }

  updateRaids(deltaTime) {
    // When danger bar fills to 100%, trigger raid!
    if (gameState.danger >= 100 && !gameState.activeRaid) {
      gameState.activeRaid = true;
      gameState.danger = 100;
      gameAudio.playHorn(); // Warning horn!
      gameState.addLog("🚨 DANGER! A gang of cannibal raiders are invading your village!", "danger");

      // Spawn enemies at a random map edge
      const raidSize = 3 + Math.floor(gameState.daysSurvived * 0.5); // size scales with days survived
      const edges = ['top', 'bottom', 'left', 'right'];
      const edge = edges[Math.floor(Math.random() * 4)];

      for (let i = 0; i < raidSize; i++) {
        let rx, ry;
        if (edge === 'top') { rx = Math.floor(Math.random() * 32); ry = 0; }
        else if (edge === 'bottom') { rx = Math.floor(Math.random() * 32); ry = 31; }
        else if (edge === 'left') { rx = 0; ry = Math.floor(Math.random() * 32); }
        else { rx = 31; ry = Math.floor(Math.random() * 32); }

        const enemy = new Enemy(Date.now() + i, rx, ry);
        gameState.enemies.push(enemy);
      }
    }
  }

  updateProjectiles(deltaTime) {
    gameState.projectiles.forEach((proj, idx) => {
      const target = proj.target;
      if (!target || target.health <= 0) {
        // Target lost or dead, remove projectile
        gameState.projectiles.splice(idx, 1);
        return;
      }

      const dx = target.visualX + 0.5 - proj.x;
      const dy = target.visualY + 0.5 - proj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const step = proj.speed * deltaTime;

      if (dist <= step) {
        // Collision hit!
        target.takeDamage(proj.damage, { gridX: Math.floor(proj.startX), gridY: Math.floor(proj.startY) });
        gameAudio.playCombatHit();
        gameState.projectiles.splice(idx, 1);
      } else {
        proj.x += (dx / dist) * step;
        proj.y += (dy / dist) * step;
      }
    });
  }

  // --- RENDER PIPELINE ---
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    // Camera translations & zoom
    this.ctx.scale(this.camera.zoom, this.camera.zoom);
    this.ctx.translate(-this.camera.x, -this.camera.y);

    // 1. Draw Terrain Map
    this.renderTerrain();

    // 2. Draw Watchtower radius overlay (if selection is watchtower)
    if (this.selectedEntity && this.selectedEntity.type === 'tower') {
      this.renderTowerRange(this.selectedEntity);
    }

    // 3. Draw Construction blueprint shadow (in build mode)
    if (this.buildPlacementMode) {
      this.renderBuildBlueprint();
    }

    // 4. Draw Harvestable Resources
    this.renderResources();

    // 5. Draw Buildings
    this.renderBuildings();

    // 6. Draw Projectiles
    this.renderProjectiles();

    // 7. Draw Animals
    this.renderAnimals();

    // 8. Draw Enemies
    this.renderEnemies();

    // 9. Draw Villagers
    this.renderVillagers();

    // 10. Draw Floating Particles
    this.renderParticles();

    this.ctx.restore();
  }

  renderTerrain() {
    const size = this.map.tileSize;
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const type = this.map.grid[y][x];
        
        // Colors
        if (type === 'grass') {
          // Soft moss green
          this.ctx.fillStyle = '#263b1e';
        } else if (type === 'water') {
          // Ocean deep blue
          this.ctx.fillStyle = '#1c3d52';
        } else if (type === 'sand') {
          // Warm desert yellow
          this.ctx.fillStyle = '#6e5e46';
        }

        this.ctx.fillRect(x * size, y * size, size, size);

        // Grid lines (subtle border)
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x * size, y * size, size, size);
      }
    }
  }

  renderTowerRange(tower) {
    const size = this.map.tileSize;
    const cx = (tower.x + 0.5) * size;
    const cy = (tower.y + 0.5) * size;
    
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, tower.range * size, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(224, 130, 38, 0.07)';
    this.ctx.strokeStyle = 'rgba(224, 130, 38, 0.4)';
    this.ctx.lineWidth = 2;
    this.ctx.fill();
    this.ctx.stroke();
  }

  renderBuildBlueprint() {
    // Get mouse world coords
    const canvasRect = this.canvas.getBoundingClientRect();
    // We need current client coordinates of mouse. As a fallback, we track it or hook mousemove
    // Here we can find mouse position by accessing the window current cursor.
    // For simplicity, we get client mouse coordinate during draw using simple cursor track in canvas
    // We will save last mouse position on canvas element
    const mx = this.canvas.lastMouseX || 0;
    const my = this.canvas.lastMouseY || 0;
    const worldX = mx / this.camera.zoom + this.camera.x;
    const worldY = my / this.camera.zoom + this.camera.y;
    
    const gridX = Math.floor(worldX / this.map.tileSize);
    const gridY = Math.floor(worldY / this.map.tileSize);

    const type = this.buildPlacementMode;
    const meta = BUILDING_TYPES[type];
    if (!meta) return;

    const size = this.map.tileSize;
    const valid = this.map.canPlaceBuilding(gridX, gridY, meta.width, meta.height);
    
    this.ctx.fillStyle = valid ? 'rgba(92, 143, 55, 0.4)' : 'rgba(194, 70, 52, 0.4)';
    this.ctx.strokeStyle = valid ? '#5c8f37' : '#c24634';
    this.ctx.lineWidth = 2;
    
    this.ctx.fillRect(gridX * size, gridY * size, meta.width * size, meta.height * size);
    this.ctx.strokeRect(gridX * size, gridY * size, meta.width * size, meta.height * size);
  }

  renderResources() {
    const size = this.map.tileSize;
    this.map.resources.forEach(res => {
      const rx = res.x * size + size / 2;
      const ry = res.y * size + size / 2;

      this.ctx.save();
      this.ctx.translate(rx, ry);

      // Procedural shape representation
      if (res.type === 'tree') {
        // Draw trunk
        this.ctx.fillStyle = '#5c4033';
        this.ctx.fillRect(-4, 4, 8, 20);
        
        // Draw leaves
        this.ctx.fillStyle = '#1e4d2b';
        this.ctx.beginPath();
        this.ctx.arc(0, -6, 20, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#2d6a4f';
        this.ctx.beginPath();
        this.ctx.arc(-8, -12, 14, 0, Math.PI * 2);
        this.ctx.arc(8, -12, 12, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (res.type === 'rock') {
        // Draw sharp stone polygons
        this.ctx.fillStyle = '#555555';
        this.ctx.beginPath();
        this.ctx.moveTo(-16, 16);
        this.ctx.lineTo(-20, -4);
        this.ctx.lineTo(-4, -18);
        this.ctx.lineTo(16, -10);
        this.ctx.lineTo(20, 16);
        this.ctx.closePath();
        this.ctx.fill();
        // Highlights
        this.ctx.fillStyle = '#777777';
        this.ctx.beginPath();
        this.ctx.moveTo(-4, -18);
        this.ctx.lineTo(16, -10);
        this.ctx.lineTo(0, 10);
        this.ctx.closePath();
        this.ctx.fill();
      } else if (res.type === 'bush') {
        // Berry bush
        this.ctx.fillStyle = '#3a5f0b';
        this.ctx.beginPath();
        this.ctx.arc(-8, 6, 12, 0, Math.PI * 2);
        this.ctx.arc(8, 6, 12, 0, Math.PI * 2);
        this.ctx.arc(0, -6, 15, 0, Math.PI * 2);
        this.ctx.fill();

        // Berry dots
        this.ctx.fillStyle = '#d62828';
        this.ctx.beginPath();
        this.ctx.arc(-6, -2, 3, 0, Math.PI * 2);
        this.ctx.arc(8, 0, 3, 0, Math.PI * 2);
        this.ctx.arc(1, 8, 3, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (res.type === 'fish') {
        // Fishing ripples
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        const pulse = (Date.now() / 800) % 1;
        this.ctx.arc(0, 0, 8 + pulse * 14, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.font = '14px Arial';
        this.ctx.fillText('🐟', -7, 5);
      }

      // Quantity health bar under the resource
      if (res.amount < res.maxAmount) {
        const pct = res.amount / res.maxAmount;
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(-16, 22, 32, 4);
        this.ctx.fillStyle = '#e08226';
        this.ctx.fillRect(-16, 22, 32 * pct, 4);
      }

      this.ctx.restore();
    }
    );

    // Save mouse position
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.lastMouseX = e.clientX - rect.left;
      this.canvas.lastMouseY = e.clientY - rect.top;
    });
  }

  renderBuildings() {
    const size = this.map.tileSize;
    gameState.buildings.forEach(b => {
      const bx = b.x * size;
      const by = b.y * size;
      const w = b.width * size;
      const h = b.height * size;

      // Draw footprint
      this.ctx.fillStyle = 'rgba(0,0,0,0.15)';
      this.ctx.fillRect(bx + 4, by + 4, w - 8, h - 8);

      // Selection indicator
      if (this.selectedEntity === b) {
        this.ctx.strokeStyle = '#d8a02c';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(bx - 2, by - 2, w + 4, h + 4);
      }

      // Render building body
      this.ctx.save();
      this.ctx.translate(bx + w / 2, by + h / 2);

      if (!b.isBuilt) {
        // Blueprint visual
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.lineWidth = 2.5;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(-w/2 + 6, -h/2 + 6, w - 12, h - 12);
        this.ctx.setLineDash([]);
        
        // Cost text / blueprint icon
        this.ctx.font = '24px serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('🔨', 0, -10);

        // Progress bar
        const progressPct = b.progress / b.maxProgress;
        this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
        this.ctx.fillRect(-w/3, 15, (w/3)*2, 6);
        this.ctx.fillStyle = '#5c8f37';
        this.ctx.fillRect(-w/3, 15, ((w/3)*2) * progressPct, 6);
      } else {
        // Draw stylized shapes for fully built structures
        this.ctx.fillStyle = '#8b5a2b'; // Clay Brown

        if (b.type === 'hut') {
          // Hut dome
          this.ctx.fillStyle = '#7a4e25';
          this.ctx.beginPath();
          this.ctx.arc(0, 10, w / 2 - 8, Math.PI, 0);
          this.ctx.fill();
          
          // Straw roof
          this.ctx.fillStyle = '#c5a059';
          this.ctx.beginPath();
          this.ctx.moveTo(-w/2 + 4, 10);
          this.ctx.lineTo(0, -22);
          this.ctx.lineTo(w/2 - 4, 10);
          this.ctx.closePath();
          this.ctx.fill();

          // Door
          this.ctx.fillStyle = '#1c1511';
          this.ctx.fillRect(-10, 10, 20, 20);
        } else if (b.type === 'storage') {
          // Warehouse crate/stone slab
          this.ctx.fillStyle = '#4e4c4a'; // Slate
          this.ctx.fillRect(-w/2 + 8, -h/2 + 12, w - 16, h - 16);
          this.ctx.strokeStyle = '#2c2b29';
          this.ctx.lineWidth = 4;
          this.ctx.strokeRect(-w/2 + 8, -h/2 + 12, w - 16, h - 16);

          // Roof canvas
          this.ctx.fillStyle = '#bd5d38'; // Terracotta
          this.ctx.beginPath();
          this.ctx.moveTo(-w/2 + 4, -h/2 + 12);
          this.ctx.lineTo(w/2 - 4, -h/2 + 12);
          this.ctx.lineTo(w/2 - 16, -h/2 - 4);
          this.ctx.lineTo(-w/2 + 16, -h/2 - 4);
          this.ctx.closePath();
          this.ctx.fill();
        } else if (b.type === 'kitchen') {
          // Fireplace brick circle
          this.ctx.fillStyle = '#555';
          this.ctx.beginPath();
          this.ctx.arc(0, 10, 20, 0, Math.PI*2);
          this.ctx.fill();

          // Animated fire fire
          this.ctx.fillStyle = Math.random() < 0.5 ? '#e76f51' : '#f4a261';
          this.ctx.beginPath();
          this.ctx.arc(0, 8, 12, 0, Math.PI*2);
          this.ctx.fill();
          
          // Spit pole
          this.ctx.strokeStyle = '#5c4033';
          this.ctx.lineWidth = 3;
          this.ctx.strokeRect(-24, 0, 48, 2);
        } else if (b.type === 'armoury') {
          // Weapon forge hut
          this.ctx.fillStyle = '#4e3b2b';
          this.ctx.fillRect(-w/2 + 8, -h/2 + 12, w - 16, h - 16);
          // Anvil inside
          this.ctx.fillStyle = '#111';
          this.ctx.fillRect(-12, 4, 24, 16);
          this.ctx.fillStyle = '#aaa';
          this.ctx.fillText('🔨', 0, -12);
        } else if (b.type === 'gym') {
          // Weightlifting arena
          this.ctx.fillStyle = '#654321';
          this.ctx.fillRect(-w/2 + 12, -h/2 + 12, w - 24, h - 24);
          this.ctx.fillStyle = '#222';
          this.ctx.fillRect(-30, -10, 60, 4); // Barbell
          this.ctx.beginPath();
          this.ctx.arc(-30, -10, 8, 0, Math.PI*2);
          this.ctx.arc(30, -10, 8, 0, Math.PI*2);
          this.ctx.fill();
          
          this.ctx.fillStyle = '#fff';
          this.ctx.font = '14px sans-serif';
          this.ctx.fillText('💪', 0, 18);
        } else if (b.type === 'shaman') {
          // Mystical purple tent
          this.ctx.fillStyle = '#4d2a6a';
          this.ctx.beginPath();
          this.ctx.moveTo(-w/2 + 10, 22);
          this.ctx.lineTo(0, -22);
          this.ctx.lineTo(w/2 - 10, 22);
          this.ctx.closePath();
          this.ctx.fill();

          this.ctx.fillStyle = '#cf9fff';
          this.ctx.font = '16px serif';
          this.ctx.fillText('🧪', 0, 8);
        } else if (b.type === 'tower') {
          // Lookout Tower
          this.ctx.fillStyle = '#5c4033'; // wood support
          this.ctx.fillRect(-8, -12, 16, 36);
          
          this.ctx.fillStyle = '#c5a059'; // roof
          this.ctx.beginPath();
          this.ctx.moveTo(-16, -12);
          this.ctx.lineTo(0, -32);
          this.ctx.lineTo(16, -12);
          this.ctx.closePath();
          this.ctx.fill();
        }
      }

      this.ctx.restore();
    });
  }

  renderProjectiles() {
    gameState.projectiles.forEach(p => {
      const size = this.map.tileSize;
      const px = p.x * size;
      const py = p.y * size;

      // Draw small arrow line
      this.ctx.strokeStyle = '#e08226';
      this.ctx.lineWidth = 2.5;
      
      const dx = p.target.visualX + 0.5 - p.x;
      const dy = p.target.visualY + 0.5 - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      this.ctx.beginPath();
      this.ctx.moveTo(px, py);
      this.ctx.lineTo(px - (dx / dist) * 12, py - (dy / dist) * 12);
      this.ctx.stroke();
    });
  }

  drawVectorHuman(entity, isEnemy = false) {
    const ctx = this.ctx;
    ctx.save();

    // Scale child down
    if (entity.isChild) {
      ctx.scale(0.65, 0.65);
    }

    // Handle sleeping (rotate body)
    const isSleeping = entity.state === 'sleeping';
    if (isSleeping) {
      ctx.rotate(Math.PI / 2);
      ctx.translate(5, -5);
    }

    const facing = entity.facing || 'down';
    const animFrame = entity.animFrame || 0;
    const isMoving = entity.state === 'moving';
    
    // Set colors
    // Skin Tone
    let skinColor = isEnemy ? '#8a6448' : '#e8be96';
    if (entity.isSick) skinColor = '#b8c7b4'; // pale sick green
    
    // Hair Color
    let hairColor = '#2c1e14'; // dark brown
    if (!isEnemy && entity.gender === 'Female') hairColor = '#4e342e'; // red-brown
    if (isEnemy) hairColor = '#000000'; // black hair
    
    // Clothes Color
    let clothColor = '#5c4033'; // brown loincloth
    if (!isEnemy) {
      if (entity.job === 'warrior') clothColor = '#800000'; // red tunic
      else if (entity.job === 'shaman') clothColor = '#4b0082'; // indigo robe
      else if (entity.job === 'cook') clothColor = '#bd5d38'; // orange tunic
      else if (entity.gender === 'Female') clothColor = '#2e5a44'; // green tunic
    } else {
      clothColor = '#3a322c'; // dark grey loincloth
    }

    // 1. Draw Legs (Left & Right)
    const legSwing = isMoving ? Math.sin(animFrame) * 8 : 0;
    
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = skinColor;
    ctx.lineCap = 'round';
    
    // Left Leg
    ctx.beginPath();
    ctx.moveTo(-3, 6);
    if (isSleeping) {
      ctx.lineTo(-6, 12);
      ctx.lineTo(-3, 16);
    } else {
      ctx.lineTo(-3 - legSwing, 18);
    }
    ctx.stroke();

    // Right Leg
    ctx.beginPath();
    ctx.moveTo(3, 6);
    if (isSleeping) {
      ctx.lineTo(0, 12);
      ctx.lineTo(3, 16);
    } else {
      ctx.lineTo(3 + legSwing, 18);
    }
    ctx.stroke();

    // 2. Draw Torso (Tunic/Loincloth)
    ctx.fillStyle = clothColor;
    ctx.beginPath();
    ctx.roundRect(-6, -6, 12, 12, 3);
    ctx.fill();

    // Belt
    if (!isSleeping) {
      ctx.strokeStyle = '#1c1511';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-6, 3);
      ctx.lineTo(6, 3);
      ctx.stroke();
    }

    // Cannibal war paint
    if (isEnemy) {
      ctx.strokeStyle = '#d62828';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-4, -2); ctx.lineTo(4, 2);
      ctx.moveTo(4, -2); ctx.lineTo(-4, 2);
      ctx.stroke();
    }

    // 3. Draw Head
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, -12, 6, 0, Math.PI * 2);
    ctx.fill();

    // Beard for non-child males
    if (!entity.isChild && entity.gender === 'Male' && !isEnemy) {
      ctx.fillStyle = hairColor;
      ctx.beginPath();
      ctx.arc(0, -9, 4, 0, Math.PI);
      ctx.fill();
    }

    // Hair
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    if (entity.gender === 'Female' && !entity.isChild) {
      // Long hair flowing down
      ctx.arc(0, -14, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-7, -14, 3, 12);
      ctx.fillRect(4, -14, 3, 12);
    } else {
      // Short hair
      ctx.arc(0, -14, 6.5, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-5, -16, 2, 2);
      ctx.fillRect(0, -17, 2, 3);
      ctx.fillRect(3, -16, 2, 2);
    }

    // Bone in hair for cannibals
    if (isEnemy) {
      ctx.fillStyle = '#ffffff';
      ctx.save();
      ctx.translate(0, -18);
      ctx.rotate(0.3);
      ctx.fillRect(-6, -1.5, 12, 3);
      ctx.beginPath();
      ctx.arc(-6, -1.5, 2, 0, Math.PI*2);
      ctx.arc(-6, 1.5, 2, 0, Math.PI*2);
      ctx.arc(6, -1.5, 2, 0, Math.PI*2);
      ctx.arc(6, 1.5, 2, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // Eyes
    ctx.fillStyle = '#000000';
    if (facing === 'down') {
      ctx.fillRect(-2.5, -13, 1.2, 1.2);
      ctx.fillRect(1.5, -13, 1.2, 1.2);
    } else if (facing === 'left') {
      ctx.fillRect(-4, -13, 1.2, 1.2);
    } else if (facing === 'right') {
      ctx.fillRect(2.8, -13, 1.2, 1.2);
    }

    // 4. Draw Arms & Handheld Objects
    const isGathering = entity.state === 'gathering';
    const isCooking = entity.state === 'cooking';
    const isBuilding = entity.state === 'building';
    const isFighting = entity.state === 'fighting' || (isEnemy && entity.target);

    // Left Arm
    ctx.lineWidth = 3;
    ctx.strokeStyle = skinColor;
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    if (isSleeping) {
      ctx.lineTo(-1, 0);
    } else if (entity.inventory.amount > 0) {
      ctx.lineTo(-2, 2);
    } else {
      ctx.lineTo(-9, 2);
    }
    ctx.stroke();

    // Right Arm (Dynamic Tool action hand)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(6, -4);

    const actionAngle = Math.sin(animFrame * 8) * 0.4;
    
    if (isSleeping) {
      ctx.lineTo(1, 0);
      ctx.stroke();
    } else if (entity.inventory.amount > 0) {
      // Holding cargo
      ctx.lineTo(2, 2);
      ctx.stroke();

      // Draw Cargo visually
      ctx.save();
      ctx.translate(0, 2);
      if (entity.inventory.type === 'wood') {
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(-4, -1.5, 8, 3);
      } else if (entity.inventory.type === 'stone') {
        ctx.fillStyle = '#666';
        ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI*2); ctx.fill();
      } else if (entity.inventory.type === 'rawFood') {
        ctx.fillStyle = '#d62828';
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    } else if (isGathering || isBuilding || isCooking || isFighting) {
      // Swing arm
      ctx.translate(6, -4);
      ctx.rotate(actionAngle + Math.PI/6);
      ctx.lineTo(0, 8);
      ctx.stroke();

      // Tool draw
      ctx.save();
      ctx.translate(0, 8);
      ctx.rotate(-Math.PI/4);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#5c4033'; // wooden haft

      if (entity.job === 'woodcutter') {
        ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -9); ctx.stroke();
        ctx.fillStyle = '#888'; ctx.fillRect(-3, -9, 4, 2.5); // axe head
      } else if (entity.job === 'miner') {
        ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -9); ctx.stroke();
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.arc(0, -9, 3.5, Math.PI, 0); ctx.fill(); // pick pick
      } else if (entity.job === 'builder') {
        ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -8); ctx.stroke();
        ctx.fillStyle = '#444'; ctx.fillRect(-2.5, -10, 5, 2.5); // hammer head
      } else if (entity.job === 'warrior' || isEnemy) {
        if (entity.weapon === 'axe') {
          ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, -10); ctx.stroke();
          ctx.fillStyle = '#aaa'; ctx.fillRect(-3.5, -10, 4.5, 3.5);
        } else if (entity.weapon === 'spear') {
          ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(0, -16); ctx.stroke();
          ctx.fillStyle = '#ddd';
          ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(-2.5, -16); ctx.lineTo(2.5, -16); ctx.closePath(); ctx.fill();
        } else if (isEnemy) {
          // Raider spiked Club
          ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, -8); ctx.lineWidth = 3.2; ctx.stroke();
          ctx.fillStyle = '#eee';
          ctx.fillRect(-2.5, -8, 1, 1);
          ctx.fillRect(2.5, -6, 1, 1);
        }
      }
      ctx.restore();
    } else {
      // Default hang arm
      ctx.lineTo(9, 2);
      ctx.stroke();

      // Show weapons on hip/back when idle
      if (entity.weapon && entity.weapon !== 'none') {
        ctx.save();
        ctx.translate(9, 2);
        ctx.rotate(0.2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#5c4033';
        if (entity.weapon === 'axe') {
          ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, -6); ctx.stroke();
          ctx.fillStyle = '#888'; ctx.fillRect(-2.5, -6, 3, 2);
        } else if (entity.weapon === 'spear') {
          ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(0, -11); ctx.stroke();
          ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(-2, -11); ctx.lineTo(2, -11); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }
    ctx.restore();

    ctx.restore();
  }

  drawVectorAnimal(a) {
    const ctx = this.ctx;
    const scale = a.type === 'mammoth' ? 1.45 : (a.type === 'boar' ? 1.0 : 0.65);
    
    ctx.save();
    
    // Jump animation for rabbits (hopping)
    if (a.type === 'rabbit') {
      const hop = Math.abs(Math.sin(a.animFrame * 2.5)) * -7;
      ctx.translate(0, hop);
    }

    ctx.scale(scale, scale);

    if (a.facing === 'left') {
      ctx.scale(-1, 1);
    }

    const walkSwing = Math.sin(a.animFrame) * 6;

    if (a.type === 'mammoth') {
      // 1. Mammoth Legs
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#4a4440';
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(-10 - walkSwing, 15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(-4 + walkSwing, 15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(4 - walkSwing, 15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, 4); ctx.lineTo(10 + walkSwing, 15); ctx.stroke();

      // 2. Giant Furry Body
      ctx.fillStyle = '#5c524a';
      ctx.beginPath();
      ctx.ellipse(0, -2, 19, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3. Head & Ears
      ctx.beginPath();
      ctx.arc(14, -6, 8.5, 0, Math.PI * 2);
      ctx.fill();

      // Ear
      ctx.fillStyle = '#4a4440';
      ctx.beginPath();
      ctx.ellipse(9, -6, 5.5, 7.5, 0.2, 0, Math.PI*2);
      ctx.fill();

      // 4. Curved Ivory Tusks
      ctx.strokeStyle = '#eae6df';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(18, -4);
      ctx.bezierCurveTo(25, -4, 27, -10, 25, -15);
      ctx.stroke();

      // 5. Trunk
      ctx.strokeStyle = '#5c524a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(20, -8);
      ctx.quadraticCurveTo(23, 2, 19, 9);
      ctx.stroke();

      // Eye
      ctx.fillStyle = '#000';
      ctx.fillRect(14.5, -9, 1.5, 1.5);

    } else if (a.type === 'boar') {
      // 1. Boar Legs
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#3a271d';
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(-6 - walkSwing, 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(-2 + walkSwing, 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, 4); ctx.lineTo(2 - walkSwing, 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 4); ctx.lineTo(6 + walkSwing, 11); ctx.stroke();

      // 2. Body
      ctx.fillStyle = '#4d3326';
      ctx.beginPath();
      ctx.roundRect(-10, -7, 20, 12, 4.5);
      ctx.fill();

      // Snout
      ctx.beginPath();
      ctx.moveTo(10, -3);
      ctx.lineTo(15, -1);
      ctx.lineTo(10, 3);
      ctx.closePath();
      ctx.fill();

      // Spine Bristles
      ctx.strokeStyle = '#2d1e17';
      ctx.lineWidth = 1.5;
      for (let i = -8; i <= 6; i += 3) {
        ctx.beginPath();
        ctx.moveTo(i, -7);
        ctx.lineTo(i - 1, -10);
        ctx.stroke();
      }

      // Small White Tusks
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(13, -3);
      ctx.stroke();

      // Angry Eye
      ctx.fillStyle = a.isHostile ? '#d62828' : '#000';
      ctx.fillRect(9, -4, 1.5, 1.5);

    } else if (a.type === 'rabbit') {
      // Fluffy White Rabbit
      ctx.fillStyle = '#eceae6';
      
      // Body
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.beginPath();
      ctx.arc(6, -4, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Long ears
      ctx.fillStyle = '#eceae6';
      ctx.fillRect(4, -13, 2, 6);
      ctx.fillRect(6, -12, 2, 5);
      
      ctx.fillStyle = '#ffb3c1'; // pink inner ear
      ctx.fillRect(4.5, -11, 1, 4);

      // Tail
      ctx.fillStyle = '#eceae6';
      ctx.beginPath();
      ctx.arc(-7.5, 2, 2.8, 0, Math.PI*2);
      ctx.fill();

      // Paws
      ctx.strokeStyle = '#eceae6';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-3 - walkSwing*0.5, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(3 + walkSwing*0.5, 8); ctx.stroke();

      // Pink eye
      ctx.fillStyle = '#d62828';
      ctx.beginPath();
      ctx.arc(6.5, -5, 1, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }

  renderVillagers() {
    const size = this.map.tileSize;
    gameState.villagers.forEach(v => {
      const vx = v.visualX * size + size / 2;
      const vy = v.visualY * size + size / 2;

      this.ctx.save();
      this.ctx.translate(vx, vy);

      // Selection outline
      if (this.selectedEntity === v) {
        this.ctx.strokeStyle = '#e08226';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 20, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Draw the Vector Human
      this.drawVectorHuman(v, false);

      // Health bar above head (only if damaged or sick)
      if (v.health < 100 || v.isSick) {
        this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
        this.ctx.fillRect(-12, -26, 24, 3.5);
        this.ctx.fillStyle = v.isSick ? '#cf9fff' : '#c24634';
        this.ctx.fillRect(-12, -26, 24 * (v.health / 100), 3.5);
      }

      this.ctx.restore();
    });
  }

  renderEnemies() {
    const size = this.map.tileSize;
    gameState.enemies.forEach(e => {
      const ex = e.visualX * size + size / 2;
      const ey = e.visualY * size + size / 2;

      this.ctx.save();
      this.ctx.translate(ex, ey);

      // Selection outline
      if (this.selectedEntity === e) {
        this.ctx.strokeStyle = '#c24634';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 20, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Draw the Vector Human as an enemy cannibal
      this.drawVectorHuman(e, true);

      // Health bar
      const hpPct = e.health / e.maxHealth;
      this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
      this.ctx.fillRect(-12, -26, 24, 3);
      this.ctx.fillStyle = '#c24634';
      this.ctx.fillRect(-12, -26, 24 * hpPct, 3);

      this.ctx.restore();
    });
  }

  renderAnimals() {
    const size = this.map.tileSize;
    gameState.animals.forEach(a => {
      const ax = a.visualX * size + size / 2;
      const ay = a.visualY * size + size / 2;

      this.ctx.save();
      this.ctx.translate(ax, ay);

      // Selection outline
      if (this.selectedEntity === a) {
        this.ctx.strokeStyle = '#d8a02c';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, a.type === 'mammoth' ? 30 : 20, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Draw Vector Animal
      this.drawVectorAnimal(a);

      // Anger emoji if hostile
      if (a.isHostile) {
        this.ctx.fillStyle = '#d62828';
        this.ctx.font = '10px Arial';
        this.ctx.fillText('💢', 0, a.type === 'mammoth' ? -26 : -18);
      }

      // Draw hp bar if damaged
      if (a.health < a.maxHealth) {
        const hpPct = a.health / a.maxHealth;
        const width = a.type === 'mammoth' ? 36 : 24;
        this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
        this.ctx.fillRect(-width/2, a.type === 'mammoth' ? -32 : -22, width, 3);
        this.ctx.fillStyle = '#c24634';
        this.ctx.fillRect(-width/2, a.type === 'mammoth' ? -32 : -22, width * hpPct, 3);
      }

      this.ctx.restore();
    });
  }

  renderParticles() {
    const size = this.map.tileSize;
    gameState.particles.forEach(p => {
      this.ctx.save();
      this.ctx.translate(p.x * size + size/2, p.y * size + size/2);
      
      this.ctx.font = '16px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      
      // Fade out
      this.ctx.globalAlpha = p.life;
      this.ctx.fillText(p.symbol, 0, 0);
      
      this.ctx.restore();
    });
  }
}
export default GameEngine;
