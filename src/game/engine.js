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
    
    // Load original Tzar terrain spritesheets
    this.terrainImages = {
      grass: new Image(),
      dirt: new Image(),
      water: new Image(),
      loaded: { grass: false, dirt: false, water: false }
    };

    this.terrainImages.grass.onload = () => { this.terrainImages.loaded.grass = true; };
    this.terrainImages.dirt.onload = () => { this.terrainImages.loaded.dirt = true; };
    this.terrainImages.water.onload = () => { this.terrainImages.loaded.water = true; };

    this.terrainImages.grass.src = '/Tzar/IMAGES/TERRAIN/GRASS/22.BMP';
    this.terrainImages.dirt.src = '/Tzar/IMAGES/TERRAIN/GRASS/11.BMP';
    this.terrainImages.water.src = '/Tzar/IMAGES/TERRAIN/GRASS/00.BMP';
    
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
    this.weatherParticles = [];
    this.fireParticles = [];
    this.randomEventTimer = 0;
    this.randomEventCooldown = 90 + Math.random() * 90;
    this._starField = null;
    this.initInput();
    this.spawnInitialTribe();
    this.spawnInitialAnimals();
  }

  spawnInitialTribe() {
    gameState.villagers = [];
    const center = 16;
    const genders = ['Male', 'Female', 'Female', 'Male'];
    let count = 0;
    
    // Find 4 grass/sand tiles close to the center
    for (let r = 0; r < 5 && count < 4; r++) { // search radius layers
      for (let dy = -r; dy <= r && count < 4; dy++) {
        for (let dx = -r; dx <= r && count < 4; dx++) {
          if (Math.abs(dx) === r || Math.abs(dy) === r) {
            const x = center + dx;
            const y = center + dy;
            if (x >= 0 && x < this.map.width && y >= 0 && y < this.map.height) {
              if (this.map.grid[y][x] !== 'water' && !this.map.collisionGrid[y][x]) {
                const v = new Villager(Date.now() + count, x, y, genders[count]);
                gameState.villagers.push(v);
                count++;
              }
            }
          }
        }
      }
    }
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

    // Contextmenu handler for right-click manual commands
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.handleRightClick(e);
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

  handleRightClick(e) {
    if (gameState.gameOver || !gameState.gameStarted) return;
    if (!this.selectedEntity || !(this.selectedEntity instanceof Villager)) return;

    const villager = this.selectedEntity;
    if (villager.isChild) return;

    // Translate click to world coordinates
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = mouseX / this.camera.zoom + this.camera.x;
    const worldY = mouseY / this.camera.zoom + this.camera.y;
    
    const gridX = Math.floor(worldX / this.map.tileSize);
    const gridY = Math.floor(worldY / this.map.tileSize);

    // Ensure coordinates are within bounds
    if (gridX < 0 || gridX >= this.map.width || gridY < 0 || gridY >= this.map.height) return;

    // Determine what is at the clicked tile:
    // 1. Is there an enemy at this coordinate?
    let clickedEnemy = null;
    gameState.enemies.forEach(enemy => {
      if (enemy.health > 0 && Math.floor(enemy.visualX) === gridX && Math.floor(enemy.visualY) === gridY) {
        clickedEnemy = enemy;
      }
    });

    if (clickedEnemy) {
      villager.target = clickedEnemy;
      villager.state = 'fighting';
      villager.actionTimer = 0.5;
      gameState.addLog(`Ordered ${villager.name} to attack cannibal raider!`, 'warn');
      gameAudio.playClick();
      return;
    }

    // 2. Is there an animal at this coordinate?
    let clickedAnimal = null;
    gameState.animals.forEach(animal => {
      if (animal.health > 0 && Math.floor(animal.visualX) === gridX && Math.floor(animal.visualY) === gridY) {
        clickedAnimal = animal;
      }
    });

    if (clickedAnimal) {
      villager.target = clickedAnimal;
      villager.state = 'fighting';
      villager.actionTimer = 0.5;
      gameState.addLog(`Ordered ${villager.name} to hunt the wild ${clickedAnimal.type}!`, 'system');
      gameAudio.playClick();
      return;
    }

    // 3. Is there a resource at this coordinate?
    const clickedResource = this.map.resources.find(res => res.x === gridX && res.y === gridY);
    if (clickedResource) {
      if (clickedResource.type === 'tree') {
        villager.setJob('woodcutter');
        villager.target = clickedResource;
        villager.path = this.map.findPath(villager.gridX, villager.gridY, gridX, gridY);
        villager.state = 'moving';
        gameState.addLog(`Ordered ${villager.name} to chop tree.`, 'system');
      } else if (clickedResource.type === 'rock') {
        villager.setJob('miner');
        villager.target = clickedResource;
        villager.path = this.map.findPath(villager.gridX, villager.gridY, gridX, gridY);
        villager.state = 'moving';
        gameState.addLog(`Ordered ${villager.name} to mine stone.`, 'system');
      } else if (clickedResource.type === 'bush' || clickedResource.type === 'fish') {
        villager.setJob('gatherer');
        villager.target = clickedResource;
        villager.path = this.map.findPath(villager.gridX, villager.gridY, gridX, gridY);
        villager.state = 'moving';
        gameState.addLog(`Ordered ${villager.name} to gather food.`, 'system');
      }
      gameAudio.playClick();
      return;
    }

    // 4. Is there a building at this coordinate?
    let clickedBuilding = null;
    gameState.buildings.forEach(b => {
      if (gridX >= b.x && gridX < b.x + b.width && gridY >= b.y && gridY < b.y + b.height) {
        clickedBuilding = b;
      }
    });

    if (clickedBuilding) {
      if (!clickedBuilding.isBuilt) {
        // Construct building
        villager.setJob('builder');
        villager.target = clickedBuilding;
        villager.path = this.map.findPath(villager.gridX, villager.gridY, clickedBuilding.x, clickedBuilding.y);
        villager.state = 'moving';
        gameState.addLog(`Ordered ${villager.name} to construct ${clickedBuilding.name}.`, 'system');
      } else {
        // Finished building actions
        if (clickedBuilding.type === 'hut') {
          villager.target = { type: 'hut', action: 'sleep', x: clickedBuilding.x, y: clickedBuilding.y, buildingRef: clickedBuilding };
          villager.path = this.map.findPath(villager.gridX, villager.gridY, clickedBuilding.x, clickedBuilding.y);
          villager.state = 'moving';
          gameState.addLog(`Ordered ${villager.name} to rest in Hut.`, 'system');
        } else if (clickedBuilding.type === 'kitchen') {
          villager.setJob('cook');
          villager.target = clickedBuilding;
          villager.path = this.map.findPath(villager.gridX, villager.gridY, clickedBuilding.x, clickedBuilding.y);
          villager.state = 'moving';
          gameState.addLog(`Ordered ${villager.name} to cook in Kitchen.`, 'system');
        } else if (clickedBuilding.type === 'gym') {
          villager.setJob('warrior');
          villager.target = clickedBuilding;
          villager.path = this.map.findPath(villager.gridX, villager.gridY, clickedBuilding.x, clickedBuilding.y);
          villager.state = 'moving';
          gameState.addLog(`Ordered ${villager.name} to train in Gym.`, 'system');
        } else if (clickedBuilding.type === 'shaman') {
          villager.setJob('shaman');
          villager.target = clickedBuilding;
          villager.path = this.map.findPath(villager.gridX, villager.gridY, clickedBuilding.x, clickedBuilding.y);
          villager.state = 'moving';
          gameState.addLog(`Ordered ${villager.name} to go to Shaman's Tent.`, 'system');
        } else {
          // Default move to building
          villager.setJob('idle');
          villager.target = { x: clickedBuilding.x, y: clickedBuilding.y, action: 'walk' };
          villager.path = this.map.findPath(villager.gridX, villager.gridY, clickedBuilding.x, clickedBuilding.y);
          villager.state = 'moving';
          gameState.addLog(`Ordered ${villager.name} to move to ${clickedBuilding.name}.`, 'system');
        }
      }
      gameAudio.playClick();
      return;
    }

    // 5. Empty terrain click - move to tile
    if (!this.map.collisionGrid[gridY][gridX]) {
      const path = this.map.findPath(villager.gridX, villager.gridY, gridX, gridY);
      if (path.length > 0) {
        villager.setJob('idle'); // Stop current job loop
        villager.target = { x: gridX, y: gridY, action: 'walk' };
        villager.path = path;
        villager.state = 'moving';
        gameState.addLog(`Commanded ${villager.name} to move.`, 'system');
        gameAudio.playClick();
      } else {
        gameState.addLog(`No path found for ${villager.name}!`, 'warn');
      }
    } else {
      gameState.addLog("Target tile is obstructed!", "warn");
    }
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

    // 10. Update weather particles (screen-space)
    this.updateWeatherParticles(deltaTime);

    // 11. Update fire/ember particles (world-space)
    this.updateFireParticles(deltaTime);

    // 12. Random world events
    this.updateRandomEvents(deltaTime);
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

    // 7. Soft ground shadows beneath all entities
    this.renderShadows();

    // 8. Draw Animals
    this.renderAnimals();

    // 9. Draw Enemies
    this.renderEnemies();

    // 10. Draw Villagers
    this.renderVillagers();

    // 11. Fire & ember particles on lit buildings (world-space)
    this.renderFireParticles();

    // 12. Draw Floating Particles
    this.renderParticles();

    this.ctx.restore();

    // === SCREEN-SPACE OVERLAYS (not camera-transformed) ===

    // 13. Atmospheric Day/Night lighting
    this.renderDayNightOverlay();

    // 14. Weather effects (rain / snow / fog)
    this.renderWeather();

    // 15. Mini-map
    this.renderMiniMap();
  }

  renderTerrain() {
    const size = this.map.tileSize;
    const now = Date.now();
    const mapW = this.map.width * size;
    const mapH = this.map.height * size;

    this.ctx.save();
    
    // Disable image smoothing to get that clean retro pixel-art scaling
    this.ctx.imageSmoothingEnabled = false;

    // PASS 1: Draw base terrain tiles (Grass, Sand, Dirt, Water) from Tzar spritesheets
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const type = this.map.grid[y][x];
        const px = x * size;
        const py = y * size;

        if (type === 'water' || type === 'bridge') {
          // Render animated water from 00.BMP (16 cols x 80 rows of 32x32 tiles)
          if (this.terrainImages.loaded.water) {
            const frame = Math.floor(now / 160) % 10;
            const localRow = (x * 3 + y * 7) % 8;
            const col = (x * 5 + y * 3) % 16;
            const tileY = frame * 8 + localRow;
            this.ctx.drawImage(
              this.terrainImages.water,
              col * 32, tileY * 32, 32, 32,
              px, py, size, size
            );
          } else {
            const shimmer = Math.sin(now / 700 + x * 0.8 + y * 0.6) * 6;
            this.ctx.fillStyle = `rgb(28, ${Math.floor(130 + shimmer)}, 195)`;
            this.ctx.fillRect(px, py, size, size);
          }
        } else if (type === 'sand') {
          this.ctx.fillStyle = '#d4b060';
          this.ctx.fillRect(px, py, size, size);
        } else if (type === 'dirt') {
          // Render dirt path from 11.BMP (32 cols x 32 rows of 32x32 tiles)
          if (this.terrainImages.loaded.dirt) {
            const tileIndex = (x * 3 + y * 5) % 64;
            const srcX = (tileIndex % 32) * 32;
            const srcY = Math.floor(tileIndex / 32) * 32;
            this.ctx.drawImage(
              this.terrainImages.dirt,
              srcX, srcY, 32, 32,
              px, py, size, size
            );
          } else {
            this.ctx.fillStyle = '#8a6c4c';
            this.ctx.fillRect(px, py, size, size);
          }
        } else {
          // Render Grass from 22.BMP (32 cols x 32 rows of 32x32 tiles)
          if (this.terrainImages.loaded.grass) {
            const tileIndex = (x * 7 + y * 13) % 64;
            const srcX = (tileIndex % 32) * 32;
            const srcY = Math.floor(tileIndex / 32) * 32;
            this.ctx.drawImage(
              this.terrainImages.grass,
              srcX, srcY, 32, 32,
              px, py, size, size
            );
          } else {
            const grassGrad = this.ctx.createLinearGradient(0, 0, mapW, mapH);
            grassGrad.addColorStop(0, '#52a028');
            grassGrad.addColorStop(0.5, '#5bb030');
            grassGrad.addColorStop(1, '#4e9824');
            this.ctx.fillStyle = grassGrad;
            this.ctx.fillRect(px, py, size, size);
          }
        }
      }
    }

    // Restore smoothing for details
    this.ctx.imageSmoothingEnabled = true;

    // PASS 2: Natural scattered clutter details on grass
    for (let y = 0; y < this.map.height; y += 2) {
      for (let x = 0; x < this.map.width; x += 2) {
        if (this.map.grid[y]?.[x] === 'grass') {
          const px = x * size + ((x * 37 + y * 13) % 24) + 12;
          const py = y * size + ((x * 19 + y * 47) % 24) + 12;

          const seed = (x * 17 + y * 23) % 10;
          if (seed === 0) {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(px + 8, py - 4, 1.8, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#d8a02c';
            this.ctx.beginPath();
            this.ctx.arc(px + 8, py - 4, 0.7, 0, Math.PI * 2);
            this.ctx.fill();
          } else if (seed === 1) {
            this.ctx.fillStyle = '#e63946';
            this.ctx.beginPath();
            this.ctx.arc(px - 6, py + 8, 2.0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#222';
            this.ctx.beginPath();
            this.ctx.arc(px - 6, py + 8, 0.7, 0, Math.PI * 2);
            this.ctx.fill();
          } else if (seed === 2) {
            this.ctx.fillStyle = '#8b5a2b';
            this.ctx.beginPath();
            this.ctx.arc(px + 4, py + 4, 2.8, Math.PI, 0);
            this.ctx.fill();
            this.ctx.fillStyle = '#eceae6';
            this.ctx.fillRect(px + 3, py + 4, 2, 3);
          } else if (seed === 3) {
            this.ctx.fillStyle = '#5c3a21';
            this.ctx.fillRect(px - 8, py - 2, 16, 4);
            this.ctx.fillStyle = '#3a2010';
            this.ctx.beginPath();
            this.ctx.arc(px - 8, py, 1.8, 0, Math.PI * 2);
            this.ctx.arc(px + 8, py, 1.8, 0, Math.PI * 2);
            this.ctx.fill();
          } else if (seed >= 4 && seed <= 6) {
            this.ctx.strokeStyle = 'rgba(30, 80, 15, 0.35)';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(px, py);
            this.ctx.lineTo(px - 4, py - 9);
            this.ctx.moveTo(px, py);
            this.ctx.lineTo(px + 4, py - 8);
            this.ctx.stroke();
          }
        }
      }
    }

    // PASS 3: Sand textures & beach details
    for (let x = 0; x <= this.map.width; x += 2) {
      const ry = (x - 2 + Math.sin(x * 0.4) * 2) * size + size / 2;
      const rx = x * size + size / 2;
      
      const seed = (x * 37) % 5;
      if (seed === 0) {
        this.ctx.fillStyle = '#9c9c9c';
        this.ctx.beginPath();
        this.ctx.ellipse(rx + 16, ry - size * 1.4, 2.8, 1.8, 0.5, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (seed === 1) {
        this.ctx.fillStyle = '#7a5435';
        this.ctx.beginPath();
        this.ctx.ellipse(rx - 20, ry + size * 1.38, 2.4, 1.6, -0.4, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (seed === 2) {
        this.ctx.fillStyle = '#f3eae1';
        this.ctx.beginPath();
        this.ctx.arc(rx + 12, ry + size * 1.3, 1.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // Lake sand pebbles
    const lakeX = 6.2 * size;
    const lakeY = 24.2 * size;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.35) {
      const radius = 4.3 * size + (Math.sin(angle * 4) * 8);
      const px = lakeX + Math.cos(angle) * radius;
      const py = lakeY + Math.sin(angle) * radius;
      
      const seed = Math.floor(angle * 10) % 4;
      if (seed === 0) {
        this.ctx.fillStyle = '#8c8c8c';
        this.ctx.beginPath();
        this.ctx.ellipse(px, py, 3.0, 1.8, angle, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (seed === 1) {
        this.ctx.fillStyle = '#eae6df';
        this.ctx.beginPath();
        this.ctx.arc(px, py, 1.4, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // PASS 4: Animated Shoreline Foam
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    this.ctx.lineWidth = 2.0;

    // Upper shore foam
    this.ctx.beginPath();
    for (let x = 0; x <= this.map.width; x++) {
      const rx = x * size + size / 2;
      const ry = (x - 2 + Math.sin(x * 0.4) * 2) * size + size / 2 - size * 1.25 + Math.sin(now / 350 + x * 0.6) * 3.5;
      if (x === 0) this.ctx.moveTo(rx, ry);
      else this.ctx.lineTo(rx, ry);
    }
    this.ctx.stroke();

    // Lower shore foam
    this.ctx.beginPath();
    for (let x = 0; x <= this.map.width; x++) {
      const rx = x * size + size / 2;
      const ry = (x - 2 + Math.sin(x * 0.4) * 2) * size + size / 2 + size * 1.25 + Math.sin(now / 350 + x * 0.6 + Math.PI) * 3.5;
      if (x === 0) this.ctx.moveTo(rx, ry);
      else this.ctx.lineTo(rx, ry);
    }
    this.ctx.stroke();

    // Lake shore foam
    const lakeWaveRadius = 4.0 * size + Math.sin(now / 350) * 3.0;
    this.ctx.beginPath();
    this.ctx.arc(lakeX, lakeY, lakeWaveRadius, 0, Math.PI * 2);
    this.ctx.stroke();

    // PASS 5: Crossroads dirt road blending path
    this.ctx.strokeStyle = 'rgba(138, 108, 76, 0.2)';
    this.ctx.lineWidth = size * 2.3;
    const cx = Math.floor(this.map.width / 2) * size + size / 2;
    const cy = Math.floor(this.map.height / 2) * size + size / 2;
    this.ctx.beginPath();
    this.ctx.moveTo(cx - 7 * size, cy); this.ctx.lineTo(cx + 7 * size, cy);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy - 7 * size); this.ctx.lineTo(cx, cy + 7 * size);
    this.ctx.stroke();

    // PASS 6: 3D Height elevations / plateaus
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const hCurrent = this.map.heightGrid[y]?.[x] || 0;
        if (hCurrent > 0) {
          const px = x * size;
          const py = y * size;

          const hTop = y > 0 ? this.map.heightGrid[y - 1]?.[x] : hCurrent;
          if (hTop < hCurrent) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.fillRect(px, py, size, 5);
          }

          const hLeft = x > 0 ? this.map.heightGrid[y]?.[x - 1] : hCurrent;
          if (hLeft < hCurrent) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.fillRect(px, py, 5, size);
          }

          const hBottom = y < this.map.height - 1 ? this.map.heightGrid[y + 1]?.[x] : hCurrent;
          if (hBottom < hCurrent) {
            this.ctx.fillStyle = '#7a5435';
            this.ctx.fillRect(px, py + size - 8, size, 8);
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            this.ctx.fillRect(px, py + size, size, 8);
          }

          const hRight = x < this.map.width - 1 ? this.map.heightGrid[y]?.[x + 1] : hCurrent;
          if (hRight < hCurrent) {
            this.ctx.fillStyle = '#7a5435';
            this.ctx.fillRect(px + size - 8, py, 8, size);
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            this.ctx.fillRect(px + size, py, 8, size);
          }
        }
      }
    }

    // PASS 7: Bridges wood plank structures
    [8, 24].forEach(bx => {
      const bX = bx * size;
      const bYStart = (bx - 2 + Math.sin(bx * 0.4) * 2) * size + size / 2 - size * 1.5;
      const bYEnd = (bx - 2 + Math.sin(bx * 0.4) * 2) * size + size / 2 + size * 1.5;

      // Underlay water
      if (this.terrainImages.loaded.water) {
        this.ctx.save();
        this.ctx.imageSmoothingEnabled = false;
        const frame = Math.floor(now / 160) % 10;
        for (let y = Math.floor(bYStart / size); y <= Math.ceil(bYEnd / size); y++) {
          const localRow = (bx * 3 + y * 7) % 8;
          const col = (bx * 5 + y * 3) % 16;
          const tileY = frame * 8 + localRow;
          this.ctx.drawImage(
            this.terrainImages.water,
            col * 32, tileY * 32, 32, 32,
            bX, y * size, size, size
          );
        }
        this.ctx.restore();
      }

      // Pillar posts
      this.ctx.fillStyle = '#4a2f18';
      this.ctx.fillRect(bX + 3, bYStart - 6, 6, 8);
      this.ctx.fillRect(bX + size - 9, bYStart - 6, 6, 8);
      this.ctx.fillRect(bX + 3, bYEnd - 2, 6, 8);
      this.ctx.fillRect(bX + size - 9, bYEnd - 2, 6, 8);

      // Deck planks
      this.ctx.fillStyle = '#855938';
      this.ctx.fillRect(bX, bYStart, size, bYEnd - bYStart);

      // Planks seams
      this.ctx.strokeStyle = '#5a3d24';
      this.ctx.lineWidth = 1.8;
      for (let y = bYStart + 4; y < bYEnd; y += 8) {
        this.ctx.beginPath();
        this.ctx.moveTo(bX, y);
        this.ctx.lineTo(bX + size, y);
        this.ctx.stroke();
      }

      // Handrails
      this.ctx.fillStyle = '#d4b07c';
      this.ctx.fillRect(bX, bYStart, 4, bYEnd - bYStart);
      this.ctx.fillRect(bX + size - 4, bYStart, 4, bYEnd - bYStart);
    });

    this.ctx.restore();
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
        // PALM TREE - authentic prehistoric jungle style
        const sway = Math.sin(Date.now() / 1300 + res.x * 0.7 + res.y * 0.5) * 1.8;

        // Trunk base (slightly curved/tapered)
        this.ctx.fillStyle = '#7a5230';
        this.ctx.beginPath();
        this.ctx.moveTo(-5, 26);
        this.ctx.quadraticCurveTo(-3 + sway * 0.3, 10, -2 + sway, -4);
        this.ctx.lineTo(2 + sway, -4);
        this.ctx.quadraticCurveTo(3 + sway * 0.3, 10, 5, 26);
        this.ctx.closePath();
        this.ctx.fill();

        // Trunk texture rings
        this.ctx.strokeStyle = '#5c3a20';
        this.ctx.lineWidth = 0.8;
        for (let i = 0; i < 5; i++) {
          this.ctx.beginPath();
          this.ctx.moveTo(-4 + sway * (i / 10), 18 - i * 5);
          this.ctx.lineTo(4 + sway * (i / 10), 20 - i * 5);
          this.ctx.stroke();
        }

        // Palm fronds (radiating from top)
        const frondColors = ['#3db526', '#45c52e', '#2ea818', '#38b820', '#4ace32'];
        const angles = [0, 0.7, 1.3, 2.0, 2.6, 3.4, 4.2, 5.0, 5.7];
        angles.forEach((angle, i) => {
          const fsway = Math.sin(Date.now() / 1300 + res.x * 0.7 + i * 0.5) * 0.06;
          this.ctx.save();
          this.ctx.translate(sway, -4);
          this.ctx.rotate(angle + fsway);
          this.ctx.fillStyle = frondColors[i % frondColors.length];
          this.ctx.beginPath();
          this.ctx.moveTo(0, 0);
          this.ctx.bezierCurveTo(10, -5, 22, -8, 28, -5);
          this.ctx.bezierCurveTo(22, -2, 10, 1, 0, 0);
          this.ctx.closePath();
          this.ctx.fill();
          // Frond midrib
          this.ctx.strokeStyle = 'rgba(30,100,10,0.5)';
          this.ctx.lineWidth = 0.7;
          this.ctx.beginPath();
          this.ctx.moveTo(0, 0); this.ctx.lineTo(26, -5);
          this.ctx.stroke();
          this.ctx.restore();
        });

        // Coconuts clustered at base of fronds
        this.ctx.fillStyle = '#7a4a1a';
        this.ctx.beginPath();
        this.ctx.arc(sway - 5, -6, 4.5, 0, Math.PI * 2);
        this.ctx.arc(sway + 4, -5, 4, 0, Math.PI * 2);
        this.ctx.arc(sway + 0, -9, 3.5, 0, Math.PI * 2);
        this.ctx.fill();
        // Coconut sheen
        this.ctx.fillStyle = 'rgba(180,120,60,0.4)';
        this.ctx.beginPath();
        this.ctx.arc(sway - 6.5, -7.5, 2, 0, Math.PI * 2);
        this.ctx.fill();

      } else if (res.type === 'rock') {
        // CARTOON BOULDER - round and chunky like original game
        // Main large boulder
        this.ctx.fillStyle = '#8e8474';
        this.ctx.beginPath();
        this.ctx.arc(-2, 4, 20, 0, Math.PI * 2);
        this.ctx.fill();

        // Smaller stacked boulder
        this.ctx.fillStyle = '#9e9484';
        this.ctx.beginPath();
        this.ctx.arc(12, 6, 14, 0, Math.PI * 2);
        this.ctx.fill();

        // Highlight (light from top-left)
        this.ctx.fillStyle = '#b0a898';
        this.ctx.beginPath();
        this.ctx.arc(-5, 0, 13, Math.PI * 0.9, Math.PI * 1.9);
        this.ctx.fill();
        this.ctx.fillStyle = 'rgba(180,170,155,0.5)';
        this.ctx.beginPath();
        this.ctx.arc(10, 2, 8, Math.PI * 0.9, Math.PI * 1.8);
        this.ctx.fill();

        // Crack detail
        this.ctx.strokeStyle = '#5c5044';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(-5, -8); this.ctx.lineTo(0, 4); this.ctx.lineTo(6, 10);
        this.ctx.stroke();

      } else if (res.type === 'bush') {
        // BERRY BUSH - bright and juicy
        // Leaves
        this.ctx.fillStyle = '#3aa018';
        this.ctx.beginPath();
        this.ctx.arc(-10, 6, 14, 0, Math.PI * 2);
        this.ctx.arc(8, 5, 14, 0, Math.PI * 2);
        this.ctx.arc(-1, -5, 17, 0, Math.PI * 2);
        this.ctx.fill();

        // Lighter leaf highlights
        this.ctx.fillStyle = '#4aba22';
        this.ctx.beginPath();
        this.ctx.arc(-8, 2, 8, 0, Math.PI * 2);
        this.ctx.arc(6, 0, 7, 0, Math.PI * 2);
        this.ctx.fill();

        // Red berries
        this.ctx.fillStyle = '#e83030';
        const berryPositions = [[-7, -2], [5, -3], [-12, 4], [10, 3], [-2, 6], [0, -8]];
        berryPositions.forEach(([bx, by]) => {
          this.ctx.beginPath();
          this.ctx.arc(bx, by, 3.2, 0, Math.PI * 2);
          this.ctx.fill();
        });
        // Berry shine
        this.ctx.fillStyle = 'rgba(255,180,160,0.6)';
        berryPositions.forEach(([bx, by]) => {
          this.ctx.beginPath();
          this.ctx.arc(bx - 0.8, by - 0.8, 1.2, 0, Math.PI * 2);
          this.ctx.fill();
        });

      } else if (res.type === 'fish') {
        // Fishing spot - animated ripple
        const pulse = (Date.now() / 700) % 1;
        this.ctx.strokeStyle = 'rgba(100, 180, 255, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, 10 + pulse * 16, 5 + pulse * 8, 0, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.strokeStyle = 'rgba(100, 180, 255, 0.25)';
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, 20 + pulse * 12, 10 + pulse * 6, 0, 0, Math.PI * 2);
        this.ctx.stroke();

        // Fish emoji at center
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('🐟', -7, 3);
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
        // ===================================================
        //  FULLY BUILT STRUCTURES - AUTHENTIC PREHISTORIC STYLE
        // ===================================================
        const ctx = this.ctx;

        if (b.type === 'hut') {
          // TEPEE / CONE TENT - exactly like the original game
          // Ground shadow
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath();
          ctx.ellipse(0, h/2 - 8, w/2 - 4, 7, 0, 0, Math.PI * 2);
          ctx.fill();

          // Tepee hide walls (warm tan animal hide)
          ctx.fillStyle = '#c8a050';
          ctx.beginPath();
          ctx.moveTo(0, -h/2 - 2);       // tip
          ctx.lineTo(-w/2 + 4, h/2 - 8); // left base
          ctx.lineTo(w/2 - 4, h/2 - 8);  // right base
          ctx.closePath();
          ctx.fill();

          // Hide seam lines (vertical strips)
          ctx.strokeStyle = 'rgba(140,80,30,0.45)';
          ctx.lineWidth = 1.2;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(0, -h/2);
            ctx.lineTo(i * (w/2 - 12), h/2 - 8);
            ctx.stroke();
          }

          // Decorative animal-spot patches on hide
          ctx.fillStyle = 'rgba(160,100,35,0.35)';
          ctx.beginPath();
          ctx.arc(-8, -2, 5.5, 0, Math.PI * 2);
          ctx.arc(7, 4, 6, 0, Math.PI * 2);
          ctx.arc(-4, 10, 4.5, 0, Math.PI * 2);
          ctx.fill();

          // Door flap at bottom center (dark arch)
          ctx.fillStyle = '#7a4e28';
          ctx.beginPath();
          ctx.ellipse(0, h/2 - 8, 9, 11, 0, Math.PI, Math.PI * 2);
          ctx.fill();

          // Wooden poles sticking out top
          ctx.strokeStyle = '#5a3818';
          ctx.lineWidth = 2.2;
          const poleOffsets = [[-5, -3], [-2, -1], [2, 1], [5, 3]];
          poleOffsets.forEach(([ox, lean]) => {
            ctx.beginPath();
            ctx.moveTo(ox * 0.4, -h/2 + 4);
            ctx.lineTo(ox + lean, -h/2 - 18);
            ctx.stroke();
          });

        } else if (b.type === 'storage') {
          // STORAGE PIT - log pile structure with thatched roof
          // Floor platform (stone base)
          ctx.fillStyle = '#a09070';
          ctx.beginPath();
          ctx.roundRect(-w/2 + 6, h/2 - 12, w - 12, 8, 2);
          ctx.fill();

          // Log pile walls
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(-w/2 + 8, -h/2 + 10, w - 16, h - 20);

          // Log texture (horizontal lines)
          ctx.strokeStyle = '#6a4020';
          ctx.lineWidth = 1.5;
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(-w/2 + 8, -h/2 + 16 + i * 8);
            ctx.lineTo(w/2 - 8, -h/2 + 16 + i * 8);
            ctx.stroke();
          }
          // Log end rings
          ctx.fillStyle = '#c5a059';
          ctx.beginPath();
          ctx.ellipse(w/2 - 8, -h/2 + 20, 4, 6, 0, 0, Math.PI * 2);
          ctx.ellipse(w/2 - 8, h/2 - 20, 4, 6, 0, 0, Math.PI * 2);
          ctx.fill();

          // Thatched roof
          ctx.fillStyle = '#c8a050';
          ctx.beginPath();
          ctx.moveTo(-w/2 + 4, -h/2 + 10);
          ctx.lineTo(0, -h/2 - 6);
          ctx.lineTo(w/2 - 4, -h/2 + 10);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#9a7830';
          ctx.lineWidth = 1;
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(-w/2 + 6 + i * 10, -h/2 + 10);
            ctx.lineTo(-w/4 + i * 6, -h/2 - 2);
            ctx.stroke();
          }

        } else if (b.type === 'kitchen') {
          // CAMPFIRE & COOKING PIT
          // Fire ring stones
          ctx.fillStyle = '#807060';
          ctx.beginPath();
          ctx.arc(0, 8, 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#5a5048';
          ctx.beginPath();
          ctx.arc(0, 8, 16, 0, Math.PI * 2);
          ctx.fill();

          // Glowing embers base
          ctx.fillStyle = '#cc4400';
          ctx.beginPath();
          ctx.arc(0, 8, 11, 0, Math.PI * 2);
          ctx.fill();

          // Animated fire flicker
          const t = Date.now() / 200;
          const flicker1 = Math.sin(t * 1.3) * 2;
          const flicker2 = Math.sin(t * 2.1 + 1) * 1.5;
          ctx.fillStyle = '#ff8c00';
          ctx.beginPath();
          ctx.arc(flicker1, 4 + flicker2, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffcc00';
          ctx.beginPath();
          ctx.arc(flicker2, 2 + flicker1, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff5c0';
          ctx.beginPath();
          ctx.arc(0, 1, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Tripod poles over fire
          ctx.strokeStyle = '#5a3818';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-18, 12); ctx.lineTo(0, -18);
          ctx.moveTo(18, 12); ctx.lineTo(0, -18);
          ctx.moveTo(0, 14); ctx.lineTo(0, -18);
          ctx.stroke();

          // Hanging cooking pot
          ctx.fillStyle = '#3a2e28';
          ctx.beginPath();
          ctx.arc(0, -12, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#6a5040';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-9, -12); ctx.lineTo(-12, -18);
          ctx.moveTo(9, -12); ctx.lineTo(12, -18);
          ctx.lineTo(-12, -18);
          ctx.stroke();
          // Steam wisps
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1.5;
          const steamPhase = Date.now() / 600;
          ctx.beginPath();
          ctx.moveTo(-3, -20);
          ctx.quadraticCurveTo(-5 + Math.sin(steamPhase) * 3, -26, -3, -32);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(3, -20);
          ctx.quadraticCurveTo(5 + Math.sin(steamPhase + 1) * 3, -26, 3, -32);
          ctx.stroke();

        } else if (b.type === 'armoury') {
          // FORGE HOLT - anvil and bellows
          ctx.fillStyle = '#5a4030';
          ctx.fillRect(-w/2 + 8, -h/2 + 14, w - 16, h - 22);
          // Thatched roof
          ctx.fillStyle = '#c8a050';
          ctx.beginPath();
          ctx.moveTo(-w/2 + 6, -h/2 + 14);
          ctx.lineTo(0, -h/2 - 4);
          ctx.lineTo(w/2 - 6, -h/2 + 14);
          ctx.closePath();
          ctx.fill();
          // Anvil
          ctx.fillStyle = '#555';
          ctx.fillRect(-10, -4, 20, 8);
          ctx.fillRect(-7, -10, 14, 6);
          // Glowing forge embers inside
          ctx.fillStyle = '#cc3300';
          ctx.beginPath();
          ctx.arc(0, 10, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ff8800';
          ctx.beginPath();
          ctx.arc(0, 10, 5, 0, Math.PI * 2);
          ctx.fill();
          // Hammer icon
          ctx.font = '14px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🔨', -14, 2);

        } else if (b.type === 'gym') {
          // TRAINING GROUNDS - stone lifting pit
          ctx.fillStyle = '#807060';
          ctx.fillRect(-w/2 + 10, -h/2 + 14, w - 20, h - 22);
          // Stone barbell
          ctx.fillStyle = '#4a4040';
          ctx.fillRect(-28, -4, 56, 5);
          ctx.fillStyle = '#6a6060';
          ctx.beginPath();
          ctx.arc(-28, -2, 9, 0, Math.PI * 2);
          ctx.arc(28, -2, 9, 0, Math.PI * 2);
          ctx.fill();
          // Shine
          ctx.fillStyle = 'rgba(200,180,160,0.4)';
          ctx.beginPath();
          ctx.arc(-31, -5, 4, 0, Math.PI * 2);
          ctx.arc(25, -5, 4, 0, Math.PI * 2);
          ctx.fill();
          // Ground dirt arena
          ctx.strokeStyle = '#6a5840';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 12, 22, 8, 0, 0, Math.PI * 2);
          ctx.stroke();

        } else if (b.type === 'shaman') {
          // SHAMAN TEPEE - decorated mystical tent
          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath();
          ctx.ellipse(0, h/2 - 8, w/2 - 4, 7, 0, 0, Math.PI * 2);
          ctx.fill();

          // Purple mystical hide
          ctx.fillStyle = '#6b2d8a';
          ctx.beginPath();
          ctx.moveTo(0, -h/2 - 2);
          ctx.lineTo(-w/2 + 4, h/2 - 8);
          ctx.lineTo(w/2 - 4, h/2 - 8);
          ctx.closePath();
          ctx.fill();

          // Mystical star/moon symbols
          ctx.fillStyle = '#f0d060';
          ctx.beginPath();
          ctx.arc(0, -4, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#6b2d8a';
          ctx.beginPath();
          ctx.arc(0, -4, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Crescent moon symbol
          ctx.strokeStyle = '#f0d060';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(-7, 4, 4, Math.PI * 1.2, Math.PI * 0.2);
          ctx.stroke();

          // Door flap
          ctx.fillStyle = '#4a1868';
          ctx.beginPath();
          ctx.ellipse(0, h/2 - 8, 9, 11, 0, Math.PI, Math.PI * 2);
          ctx.fill();

          // Poles with feathers
          ctx.strokeStyle = '#4a2e18';
          ctx.lineWidth = 2.2;
          [[-6, -4], [6, 4]].forEach(([ox, lean]) => {
            ctx.beginPath();
            ctx.moveTo(ox * 0.3, -h/2 + 4);
            ctx.lineTo(ox + lean, -h/2 - 16);
            ctx.stroke();
          });
          // Feather tips
          ctx.fillStyle = '#e04020';
          ctx.beginPath();
          ctx.ellipse(-10, -h/2 - 18, 4, 7, -0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#20a0e0';
          ctx.beginPath();
          ctx.ellipse(10, -h/2 - 18, 4, 7, 0.5, 0, Math.PI * 2);
          ctx.fill();

        } else if (b.type === 'tower') {
          // WATCHTOWER - wooden scaffold structure
          // Platform base
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(-10, 8, 20, 6);

          // Four corner posts
          const posts = [[-8, -30, 4], [8, -30, 4]];
          posts.forEach(([px, topY, pw]) => {
            ctx.fillStyle = '#5a3818';
            ctx.fillRect(px - pw/2, topY, pw, 40);
          });

          // Cross-braces (X pattern)
          ctx.strokeStyle = '#7a5030';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-8, -26); ctx.lineTo(8, -8);
          ctx.moveTo(8, -26); ctx.lineTo(-8, -8);
          ctx.stroke();

          // Lookout platform at top
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(-14, -32, 28, 5);
          // Railing
          ctx.strokeStyle = '#6a4020';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-14, -42, 28, 10);
          ctx.beginPath();
          ctx.moveTo(-7, -42); ctx.lineTo(-7, -32);
          ctx.moveTo(0, -42); ctx.lineTo(0, -32);
          ctx.moveTo(7, -42); ctx.lineTo(7, -32);
          ctx.stroke();

          // Arrow on top
          ctx.font = '12px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🏹', 0, -46);
        } else if (b.type === 'farm') {
          // Ground dirt plot
          ctx.fillStyle = '#83624c';
          ctx.fillRect(-w/2 + 4, -h/2 + 4, w - 8, h - 8);
          // Crop rows (horizontal green lines)
          ctx.strokeStyle = '#558022';
          ctx.lineWidth = 3.5;
          for (let i = -h/2 + 10; i < h/2 - 4; i += 12) {
            ctx.beginPath();
            ctx.moveTo(-w/2 + 8, i);
            ctx.lineTo(w/2 - 8, i);
            ctx.stroke();
          }
          // Fence
          ctx.strokeStyle = '#5c3a20';
          ctx.lineWidth = 2.2;
          ctx.strokeRect(-w/2 + 4, -h/2 + 4, w - 8, h - 8);
          
          // Crop symbol
          ctx.font = '16px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🌾', 0, 0);

          // Food bar indicator
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(-w/3, h/2 - 12, (w/3)*2, 4);
          ctx.fillStyle = '#4aba22';
          ctx.fillRect(-w/3, h/2 - 12, ((w/3)*2) * (b.foodAmount / 200), 4);
        } else if (b.type === 'wall') {
          // Log wall post
          ctx.fillStyle = '#7a4f30';
          ctx.fillRect(-w/2, -h/2, w, h);
          ctx.strokeStyle = '#4a2f18';
          ctx.lineWidth = 2;
          ctx.strokeRect(-w/2, -h/2, w, h);
          ctx.beginPath();
          ctx.moveTo(0, -h/2);
          ctx.lineTo(0, h/2);
          ctx.stroke();
        } else if (b.type === 'gate') {
          if (b.icon === '🔓') {
            // Open Gate - side posts
            ctx.fillStyle = '#7a4f30';
            ctx.fillRect(-w/2, -h/2, 6, h);
            ctx.fillRect(w/2 - 6, -h/2, 6, h);
            ctx.strokeStyle = '#4a2f18';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-w/2, -h/2, 6, h);
            ctx.strokeRect(w/2 - 6, -h/2, 6, h);
          } else {
            // Closed Gate - solid blockade
            ctx.fillStyle = '#5c3a20';
            ctx.fillRect(-w/2, -h/2, w, h);
            ctx.strokeStyle = '#a02010';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-w/2 + 3, -h/2 + 3); ctx.lineTo(w/2 - 3, h/2 - 3);
            ctx.moveTo(w/2 - 3, -h/2 + 3); ctx.lineTo(-w/2 + 3, h/2 - 3);
            ctx.stroke();
            ctx.strokeStyle = '#4a2f18';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-w/2, -h/2, w, h);
          }
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

  // Helper to draw taper-shaded volumetric body parts with linear highlights/shadows
  drawLimb(x1, y1, x2, y2, w1, w2, fillStyle) {
    const ctx = this.ctx;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const nx = -dy / len;
    const ny = dx / len;

    ctx.save();
    
    // Draw the base rounded body segment
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.arc(x1, y1, w1, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
    ctx.arc(x2, y2, w2, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
    ctx.closePath();
    ctx.fill();

    // Overlay shading gradient (Left-to-Right ambient shading across cylinder segment)
    const maxW = Math.max(w1, w2);
    const shadeGrad = ctx.createLinearGradient(
      x1 + nx * maxW, y1 + ny * maxW,
      x1 - nx * maxW, y1 - ny * maxW
    );
    shadeGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.45)');   // Ambient occlusion shadow
    shadeGrad.addColorStop(0.3, 'rgba(0, 0, 0, 0.0)');
    shadeGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.35)'); // Sunlight reflection
    shadeGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.2)');    // Rim light shadow

    ctx.fillStyle = shadeGrad;
    ctx.fill();

    ctx.restore();
  }

  drawVectorHuman(entity, isEnemy = false) {
    const ctx = this.ctx;
    ctx.save();

    // Scale child down
    if (entity.isChild) {
      ctx.scale(0.6, 0.6);
    }

    // Handle sleeping (rotate body)
    const isSleeping = entity.state === 'sleeping';
    if (isSleeping) {
      ctx.rotate(Math.PI / 2);
      ctx.translate(6, -6);
    }

    const facing = entity.facing || 'down';
    const animFrame = entity.animFrame || 0;
    const isMoving = entity.state === 'moving';
    
    // Breathing cycle (slow rise-fall of chest)
    const breathe = Math.sin(performance.now() / 350) * 0.4 + 0.4;
    
    // AUTHENTIC PREHISTORIC TRIBES COLOR PALETTE (matching original J2ME sprites)
    // Warm tan caveman skin
    let skinColor = isEnemy ? '#b07848' : '#d48a50';
    if (entity.isSick) skinColor = '#a8c0a0'; // pale sick green
    if (!isEnemy && entity.gender === 'Female') skinColor = '#de9860';

    // Hair - females have red/auburn, males have dark brown, raiders jet black
    let hairColor = '#241810';
    if (!isEnemy && entity.gender === 'Female') hairColor = '#a83010'; // red-haired females
    if (isEnemy) hairColor = '#0a0808';

    // FUR CLOTHING - Tiger stripes for males, yellow spots for females
    let clothBase, clothStripe;
    if (isEnemy) {
      clothBase = '#3a2010'; clothStripe = '#8b1818'; // dark raider
    } else if (entity.gender === 'Female') {
      clothBase = '#c89820'; clothStripe = '#7a5800'; // yellow spotted fur dress
    } else if (entity.job === 'warrior') {
      clothBase = '#8b1818'; clothStripe = '#501010'; // red warrior
    } else if (entity.job === 'shaman') {
      clothBase = '#4a1878'; clothStripe = '#8030b0'; // purple shaman
    } else {
      clothBase = '#8b4c28'; clothStripe = '#d46e18'; // tiger-stripe brown (default)
    }

    // --- 1. LEG RIGGING (Forward Kinematics) ---
    const thighLength = 6.0;
    const calfLength = 5.5;

    // Left leg angles
    const lThighAngle = isSleeping ? 0.75 : (isMoving ? Math.sin(animFrame) * 0.45 : 0.05);
    const lKneeAngle = isSleeping ? 0.9 : (isMoving ? (lThighAngle < 0 ? -lThighAngle * 1.5 : 0) : 0);

    const lHipX = -3.2;
    const lHipY = 4.0;
    const lKneeX = lHipX + thighLength * Math.sin(lThighAngle);
    const lKneeY = lHipY + thighLength * Math.cos(lThighAngle);
    const lAnkleX = lKneeX + calfLength * Math.sin(lThighAngle + lKneeAngle);
    const lAnkleY = lKneeY + calfLength * Math.cos(lThighAngle + lKneeAngle);

    // Right leg angles
    const rThighAngle = isSleeping ? 0.45 : (isMoving ? -Math.sin(animFrame) * 0.45 : 0.05);
    const rKneeAngle = isSleeping ? 1.1 : (isMoving ? (rThighAngle < 0 ? -rThighAngle * 1.5 : 0) : 0);

    const rHipX = 3.2;
    const rHipY = 4.0;
    const rKneeX = rHipX + thighLength * Math.sin(rThighAngle);
    const rKneeY = rHipY + thighLength * Math.cos(rThighAngle);
    const rAnkleX = rKneeX + calfLength * Math.sin(rThighAngle + rKneeAngle);
    const rAnkleY = rKneeY + calfLength * Math.cos(rThighAngle + rKneeAngle);

    // Draw Left Leg
    this.drawLimb(lHipX, lHipY, lKneeX, lKneeY, 3.8, 3.2, skinColor);
    this.drawLimb(lKneeX, lKneeY, lAnkleX, lAnkleY, 3.2, 2.2, skinColor);
    // Draw Left Foot
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.ellipse(lAnkleX + (facing === 'left' ? -2 : 1), lAnkleY, 3.2, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw Right Leg
    this.drawLimb(rHipX, rHipY, rKneeX, rKneeY, 3.8, 3.2, skinColor);
    this.drawLimb(rKneeX, rKneeY, rAnkleX, rAnkleY, 3.2, 2.2, skinColor);
    // Draw Right Foot
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.ellipse(rAnkleX + (facing === 'left' ? -2 : 1), rAnkleY, 3.2, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- 2. TORSO & FUR CLOTHING (Authentic Prehistoric Tribes style) ---
    const chestWidth = 8.0 + (isSleeping ? breathe * 0.4 : 0);
    this.drawLimb(0, -6, 0, 5, chestWidth, 7.5, clothBase);

    // Tiger stripe OR spotted pattern on tunic
    if (entity.gender !== 'Female') {
      // Diagonal tiger stripes (like the male caveman in original game art)
      ctx.strokeStyle = clothStripe;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, -5); ctx.lineTo(-2, 1);
      ctx.moveTo(0, -6); ctx.lineTo(3, 0);
      ctx.moveTo(-7, 0); ctx.lineTo(-4, 5);
      ctx.stroke();
    } else {
      // Spots on female fur dress (yellow with dark spots)
      ctx.fillStyle = clothStripe;
      ctx.beginPath();
      ctx.arc(-5, -3, 2.5, 0, Math.PI * 2);
      ctx.arc(4, -4, 2.2, 0, Math.PI * 2);
      ctx.arc(-3, 3, 2.2, 0, Math.PI * 2);
      ctx.arc(6, 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fur shoulder/collar trim
    ctx.fillStyle = clothStripe;
    ctx.beginPath();
    ctx.arc(-8.5, -5, 3, 0, Math.PI * 2);
    ctx.arc(8.5, -5, 3, 0, Math.PI * 2);
    ctx.arc(0, -6.5, 3.5, Math.PI, Math.PI * 2);
    ctx.fill();

    // Raider war paint on body (X markings)
    if (isEnemy) {
      ctx.strokeStyle = '#c81010';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-6, -3); ctx.lineTo(4, 3);
      ctx.moveTo(4, -3); ctx.lineTo(-6, 3);
      ctx.stroke();
      // Bone necklace
      ctx.fillStyle = '#f0e8d0';
      for (let bi = -2; bi <= 2; bi++) {
        ctx.beginPath();
        ctx.arc(bi * 3.2, -6.5, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Thick fur belt
    if (!isSleeping) {
      ctx.fillStyle = '#4a2818';
      ctx.fillRect(-8, 3.5, 16, 2.5);
    }

    // Winter Fur Collar
    if (gameState.season === 'Winter' && !isEnemy) {
      ctx.fillStyle = '#eae6df';
      ctx.beginPath();
      ctx.arc(-4, -6, 3.2, 0, Math.PI*2);
      ctx.arc(0, -7, 3.8, 0, Math.PI*2);
      ctx.arc(4, -6, 3.2, 0, Math.PI*2);
      ctx.fill();
    }


    // --- 3. CARTOON HEAD (Bigger, rounder - authentic Flintstones style) ---
    const headY = -14.5 - (isSleeping ? 0.3 : breathe * 0.15);

    // Neck
    this.drawLimb(0, -6, 0, -10, 3.8, 3.2, skinColor);

    // BIGGER round cartoon head (8.5 radius vs old 6.2)
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, headY, 8.5, 0, Math.PI * 2);
    ctx.fill();

    // Head shading
    const headShade = ctx.createRadialGradient(-2.5, headY - 3, 1, 0, headY, 8.5);
    headShade.addColorStop(0, 'rgba(255,255,255,0.22)');
    headShade.addColorStop(0.7, 'rgba(0,0,0,0)');
    headShade.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = headShade;
    ctx.beginPath(); ctx.arc(0, headY, 8.5, 0, Math.PI * 2); ctx.fill();

    // Rosy cartoon cheeks
    if (!isEnemy && !entity.isSick) {
      ctx.fillStyle = 'rgba(220,90,50,0.28)';
      ctx.beginPath();
      ctx.arc(-5.5, headY + 2, 3.8, 0, Math.PI * 2);
      ctx.arc(5.5, headY + 2, 3.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Big round cartoon nose
    ctx.fillStyle = isEnemy ? '#804030' : '#c05838';
    ctx.beginPath();
    ctx.arc(0, headY + 2.5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // HAIR (Authentic styles from original game)
    ctx.fillStyle = hairColor;
    if (entity.gender === 'Female' && !entity.isChild) {
      // Red-haired bun (like the female in title screen)
      ctx.beginPath();
      ctx.arc(0, headY - 2, 9.2, Math.PI * 1.05, 0);
      ctx.fill();
      // Hair bun on top
      ctx.beginPath();
      ctx.arc(0, headY - 9.5, 5, 0, Math.PI * 2);
      ctx.fill();
      // Flowing side hair
      ctx.fillRect(-9.2, headY - 2, 3.5, 14);
      ctx.fillRect(5.7, headY - 2, 3.5, 13);
    } else if (isEnemy) {
      // Wild messy raider hair
      ctx.beginPath();
      ctx.arc(0, headY - 2, 9.5, Math.PI * 1.1, 0);
      ctx.fill();
      ctx.fillRect(-5, headY - 10, 3.5, 5);
      ctx.fillRect(2, headY - 11, 3, 5.5);
      ctx.fillRect(-10, headY - 5, 3.5, 4);
      // Bone in hair (raider decoration)
      ctx.fillStyle = '#f0e8d0';
      ctx.save();
      ctx.translate(4, headY - 9);
      ctx.rotate(0.4);
      ctx.fillRect(-5.5, -1.2, 11, 2.4);
      ctx.beginPath();
      ctx.arc(-5.5, 0, 1.8, 0, Math.PI * 2);
      ctx.arc(5.5, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = hairColor;
    } else {
      // Wild caveman hair (messy spikes, like original sprite)
      ctx.beginPath();
      ctx.arc(0, headY - 2, 9, Math.PI * 1.05, 0);
      ctx.fill();
      ctx.fillRect(-8, headY - 8, 3.5, 5);
      ctx.fillRect(-2, headY - 11, 3.5, 5.5);
      ctx.fillRect(5, headY - 8, 3.5, 5);
    }

    // Beard for adult males
    if (!entity.isChild && entity.gender === 'Male' && !isEnemy) {
      ctx.fillStyle = hairColor;
      ctx.beginPath();
      ctx.arc(0, headY + 6, 5.5, 0, Math.PI);
      ctx.fill();
    }

    // Cannibal face paint markings (war paint stripes)
    if (isEnemy) {
      ctx.fillStyle = '#c81010';
      ctx.fillRect(-9, headY - 1.5, 6, 1.8);
      ctx.fillRect(3, headY - 1.5, 6, 1.8);
      ctx.fillRect(-2.5, headY + 2, 5, 1.5);
    }


    // BIG CARTOON EYES with white sclera (like original Flintstones art)
    if (facing !== 'up') {
      const eyeY = headY - 1.5;

      if (facing === 'down') {
        // Two forward-facing eyes
        [[-3.8, eyeY], [3.8, eyeY]].forEach(([ex, ey]) => {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = isEnemy ? '#8b0000' : '#2a1808';
          ctx.beginPath(); ctx.arc(ex + 0.5, ey + 0.3, 1.4, 0, Math.PI * 2); ctx.fill();
          // Eye shine
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(ex + 0.9, ey - 0.6, 0.6, 0, Math.PI * 2); ctx.fill();
        });
      } else if (facing === 'left') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(-4.5, eyeY, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = isEnemy ? '#8b0000' : '#2a1808';
        ctx.beginPath(); ctx.arc(-5.2, eyeY + 0.3, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(-4.6, eyeY - 0.6, 0.6, 0, Math.PI * 2); ctx.fill();
      } else if (facing === 'right') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(4.5, eyeY, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = isEnemy ? '#8b0000' : '#2a1808';
        ctx.beginPath(); ctx.arc(5.2, eyeY + 0.3, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(4.6, eyeY - 0.6, 0.6, 0, Math.PI * 2); ctx.fill();
      }

      // Eyebrows
      ctx.strokeStyle = hairColor;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (isEnemy) {
        // Angry V-shape brows
        ctx.moveTo(-7.5, headY - 4.5); ctx.lineTo(-2.5, headY - 3);
        ctx.moveTo(7.5, headY - 4.5); ctx.lineTo(2.5, headY - 3);
      } else {
        ctx.moveTo(-6.5, headY - 4); ctx.lineTo(-1.5, headY - 4);
        ctx.moveTo(6.5, headY - 4); ctx.lineTo(1.5, headY - 4);
      }
      ctx.stroke();

      // Mouth
      ctx.strokeStyle = 'rgba(100,40,20,0.85)';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (entity.isSick || entity.mood < 40) {
        ctx.arc(0, headY + 5, 2.8, Math.PI * 1.15, Math.PI * 1.85);
      } else if (isEnemy) {
        ctx.arc(0, headY + 4.5, 2.5, 0.1 * Math.PI, 0.9 * Math.PI);
      } else {
        ctx.arc(0, headY + 4, 3.5, 0.1 * Math.PI, 0.9 * Math.PI);
      }
      ctx.stroke();

      // Happy teeth flash for high mood
      if (!entity.isSick && entity.mood > 65 && !isEnemy && facing === 'down') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-3, headY + 4.2, 6, 1.8);
      }
    }


    // --- 4. ARM RIGGING (2-Segment FK Joints) ---
    const armLength1 = 4.8;
    const armLength2 = 4.2;

    const isGathering = entity.state === 'gathering';
    const isCooking = entity.state === 'cooking';
    const isBuilding = entity.state === 'building';
    const isFighting = entity.state === 'fighting' || (isEnemy && entity.target);

    // Base joint angles
    let lShAngle = 0.2;
    let lElAngle = 0.35;
    
    let rShAngle = -0.2;
    let rElAngle = 0.35;

    // Sinusoidal movement cycles
    if (isSleeping) {
      lShAngle = 1.1; lElAngle = 1.2; // arms tucked
      rShAngle = 1.1; rElAngle = 1.2;
    } else if (entity.inventory.amount > 0) {
      // Holding cargo visually with both arms
      lShAngle = -0.55; lElAngle = -0.85;
      rShAngle = -0.55; rElAngle = -0.85;
    } else if (isMoving) {
      lShAngle = Math.sin(animFrame) * 0.42; lElAngle = 0.2;
      rShAngle = -lShAngle; rElAngle = 0.2;
    } else if (isGathering || isBuilding || isCooking || isFighting) {
      // Swing motion
      const swingSpeed = isFighting ? 10 : 7;
      const strikeArc = Math.sin(animFrame * swingSpeed) * 0.7 - 0.3;
      
      rShAngle = -0.7 + strikeArc;
      rElAngle = -0.6 + Math.abs(strikeArc) * 0.5;

      lShAngle = 0.4; lElAngle = 0.7; // left arm supports balance
    }

    // Joint world-coordinate mappings
    const lShX = -5.8;
    const lShY = -3.8;
    const lElX = lShX + armLength1 * Math.sin(lShAngle);
    const lElY = lShY + armLength1 * Math.cos(lShAngle);
    const lHandX = lElX + armLength2 * Math.sin(lShAngle + lElAngle);
    const lHandY = lElY + armLength2 * Math.cos(lShAngle + lElAngle);

    const rShX = 5.8;
    const rShY = -3.8;
    const rElX = rShX + armLength1 * Math.sin(rShAngle);
    const rElY = rShY + armLength1 * Math.cos(rShAngle);
    const rHandX = rElX + armLength2 * Math.sin(rShAngle + rElAngle);
    const rHandY = rElY + armLength2 * Math.cos(rShAngle + rElAngle);

    // Draw Left Arm (Shoulder -> Elbow -> Hand)
    this.drawLimb(lShX, lShY, lElX, lElY, 2.6, 2.2, skinColor);
    this.drawLimb(lElX, lElY, lHandX, lHandY, 2.2, 1.6, skinColor);

    // Draw Right Arm
    this.drawLimb(rShX, rShY, rElX, rElY, 2.6, 2.2, skinColor);
    this.drawLimb(rElX, rElY, rHandX, rHandY, 2.2, 1.6, skinColor);

    // --- 5. RENDER WEAPON OR CARGO IN HANDS ---
    if (entity.inventory.amount > 0 && !isSleeping) {
      // Render logs, stone block, or berries between the hands
      ctx.save();
      ctx.translate((lHandX + rHandX) / 2, (lHandY + rHandY) / 2 + 1);
      
      if (entity.inventory.type === 'wood') {
        // Realistic log cylinder with bark texture
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(-5, -2, 10, 4);
        ctx.fillStyle = '#c5a059'; // inner ring rings
        ctx.beginPath(); ctx.ellipse(-5, 0, 1, 2, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(5, 0, 1, 2, 0, 0, Math.PI*2); ctx.fill();
      } else if (entity.inventory.type === 'stone') {
        // Jagged stone slab
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.moveTo(-4, 3); ctx.lineTo(-5, -2); ctx.lineTo(1, -4); ctx.lineTo(5, -1); ctx.lineTo(4, 3);
        ctx.closePath(); ctx.fill();
      } else if (entity.inventory.type === 'rawFood') {
        // Basket of berries
        ctx.fillStyle = '#bf913b'; // straw basket
        ctx.beginPath(); ctx.arc(0, 2, 4, 0, Math.PI); ctx.fill();
        // Berries inside
        ctx.fillStyle = '#d62828';
        ctx.beginPath(); ctx.arc(-2, -1, 1.8, 0, Math.PI*2); ctx.arc(2, -1, 1.8, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    } else if ((isGathering || isBuilding || isCooking || isFighting) && !isSleeping) {
      // Draw holding tool/weapon in the right hand aligned to forearm angle
      const toolDx = rHandX - rElX;
      const toolDy = rHandY - rElY;
      const toolLen = Math.sqrt(toolDx*toolDx + toolDy*toolDy);
      const tnx = toolDx / toolLen;
      const tny = toolDy / toolLen;

      ctx.save();
      ctx.translate(rHandX, rHandY);
      
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#5c4033'; // wooden handle shaft

      if (entity.job === 'woodcutter') {
        // Woodcutting Stone Axe
        ctx.beginPath();
        ctx.moveTo(-tnx * 1, -tny * 1);
        ctx.lineTo(tnx * 10, tny * 10);
        ctx.stroke();
        
        ctx.fillStyle = '#666'; // stone wedge head bound with fiber
        ctx.save();
        ctx.translate(tnx * 10, tny * 10);
        ctx.rotate(Math.atan2(tny, tnx));
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-3, -4); ctx.lineTo(-1, -6); ctx.lineTo(3, -1); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (entity.job === 'miner') {
        // Pickaxe
        ctx.beginPath();
        ctx.moveTo(-tnx * 1, -tny * 1);
        ctx.lineTo(tnx * 9, tny * 9);
        ctx.stroke();

        ctx.fillStyle = '#555';
        ctx.save();
        ctx.translate(tnx * 9, tny * 9);
        ctx.rotate(Math.atan2(tny, tnx));
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, Math.PI/2, Math.PI*1.5);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#555';
        ctx.stroke();
        ctx.restore();
      } else if (entity.job === 'builder') {
        // Mallet
        ctx.beginPath();
        ctx.moveTo(-tnx * 1, -tny * 1);
        ctx.lineTo(tnx * 8, tny * 8);
        ctx.stroke();

        ctx.fillStyle = '#261a10'; // stone mallet head
        ctx.save();
        ctx.translate(tnx * 8, tny * 8);
        ctx.rotate(Math.atan2(tny, tnx));
        ctx.fillRect(-2, -4, 4, 8);
        ctx.restore();
      } else if (entity.job === 'warrior' || isEnemy) {
        if (entity.weapon === 'axe') {
          // Battle Axe
          ctx.beginPath(); ctx.moveTo(-tnx * 1, -tny * 1); ctx.lineTo(tnx * 10, tny * 10); ctx.stroke();
          ctx.fillStyle = '#aaa';
          ctx.save();
          ctx.translate(tnx * 10, tny * 10);
          ctx.rotate(Math.atan2(tny, tnx));
          ctx.fillRect(-1, -5, 3.5, 10);
          ctx.restore();
        } else if (entity.weapon === 'spear') {
          // Long hunting spear
          ctx.beginPath(); ctx.moveTo(-tnx * 4, -tny * 4); ctx.lineTo(tnx * 16, tny * 16); ctx.stroke();
          ctx.fillStyle = '#d9d9d9'; // flint tip
          ctx.save();
          ctx.translate(tnx * 16, tny * 16);
          ctx.rotate(Math.atan2(tny, tnx));
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(-4, -2.5); ctx.lineTo(-4, 2.5); ctx.closePath(); ctx.fill();
          ctx.restore();
        } else if (isEnemy) {
          // Heavy spiked club
          ctx.beginPath(); ctx.moveTo(-tnx * 1, -tny * 1); ctx.lineTo(tnx * 9, tny * 9); ctx.lineWidth = 3.2; ctx.stroke();
          ctx.fillStyle = '#e8e5e1'; // bone spikes
          ctx.save();
          ctx.translate(tnx * 9, tny * 9);
          ctx.rotate(Math.atan2(tny, tnx));
          ctx.fillRect(-1, -4, 1.5, 1.5);
          ctx.fillRect(-4, 3, 1.5, 1.5);
          ctx.restore();
        }
      }
      ctx.restore();
    } else {
      // Idle hand weapons show visually on hip/back
      if (entity.weapon && entity.weapon !== 'none' && !isSleeping) {
        ctx.save();
        ctx.translate(5.8, 1);
        ctx.rotate(0.35);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#5c4033';
        if (entity.weapon === 'axe') {
          ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -6); ctx.stroke();
          ctx.fillStyle = '#888'; ctx.fillRect(-3, -6, 4, 2.5);
        } else if (entity.weapon === 'spear') {
          ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -14); ctx.stroke();
          ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(-2.5, -14); ctx.lineTo(2.5, -14); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }

    ctx.restore();
  }

  drawVectorAnimal(a) {
    const ctx = this.ctx;
    const scale = a.type === 'mammoth' ? 1.5 : (a.type === 'boar' ? 1.05 : 0.65);
    
    ctx.save();
    
    // Rabbit hop animation vertical offsets
    if (a.type === 'rabbit') {
      const hop = Math.abs(Math.sin(a.animFrame * 2.5)) * -7.5;
      ctx.translate(0, hop);
    }

    ctx.scale(scale, scale);

    if (a.facing === 'left') {
      ctx.scale(-1, 1);
    }

    const walkSwing = Math.sin(a.animFrame) * 6;

    if (a.type === 'mammoth') {
      // 1. Mammoth Legs (Rigged Cylinders)
      ctx.lineWidth = 5.5;
      ctx.strokeStyle = '#3d3732'; // dark leg backing
      ctx.lineCap = 'round';
      
      this.drawLimb(-10, 4, -10 - walkSwing, 15, 5, 4.5, '#4a4440');
      this.drawLimb(-4, 4, -4 + walkSwing, 15, 5, 4.5, '#4a4440');
      this.drawLimb(4, 4, 4 - walkSwing, 15, 5, 4.5, '#4a4440');
      this.drawLimb(10, 4, 10 + walkSwing, 15, 5, 4.5, '#4a4440');

      // 2. Large Volumetric Furry Torso
      ctx.fillStyle = '#5c524a';
      ctx.beginPath();
      ctx.ellipse(0, -2, 20, 15, 0, 0, Math.PI * 2);
      ctx.fill();

      // Shading overlay on mammoth body
      const mShade = ctx.createLinearGradient(0, -17, 0, 13);
      mShade.addColorStop(0.0, 'rgba(255,255,255,0.12)');
      mShade.addColorStop(0.5, 'rgba(0,0,0,0.0)');
      mShade.addColorStop(1.0, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = mShade;
      ctx.beginPath(); ctx.ellipse(0, -2, 20, 15, 0, 0, Math.PI * 2); ctx.fill();

      // Spine hump bristles
      ctx.strokeStyle = '#3a322b';
      ctx.lineWidth = 2;
      for (let i = -16; i <= 8; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, -15);
        ctx.lineTo(i - 1, -18);
        ctx.stroke();
      }

      // 3. Head & Floppy Ears
      ctx.fillStyle = '#5c524a';
      ctx.beginPath();
      ctx.arc(14, -6, 9, 0, Math.PI * 2);
      ctx.fill();

      // Inner Ear
      ctx.fillStyle = '#453d36';
      ctx.beginPath();
      ctx.ellipse(8, -6, 5.5, 8, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // 4. Curved Ivory Tusks
      ctx.strokeStyle = '#eae6df';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(18, -4);
      ctx.bezierCurveTo(26, -4, 28, -10, 26, -16);
      ctx.stroke();

      // 5. Waving Jointed Trunk
      const trunkWiggle = Math.sin(a.animFrame * 2) * 0.15;
      
      const t1x = 19; const t1y = -8;
      const t2x = t1x + 7 * Math.sin(0.4 + trunkWiggle);
      const t2y = t1y + 7 * Math.cos(0.4 + trunkWiggle);
      const t3x = t2x + 6 * Math.sin(0.8 + trunkWiggle * 2);
      const t3y = t2y + 6 * Math.cos(0.8 + trunkWiggle * 2);

      this.drawLimb(t1x, t1y, t2x, t2y, 4, 3, '#5c524a');
      this.drawLimb(t2x, t2y, t3x, t3y, 3, 2, '#5c524a');

      // Eye
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(14.5, -9, 0.8, 0, Math.PI*2); ctx.fill();

    } else if (a.type === 'boar') {
      // 1. Boar Legs
      this.drawLimb(-6, 4, -6 - walkSwing, 11, 3.2, 2.5, '#3a271d');
      this.drawLimb(-2, 4, -2 + walkSwing, 11, 3.2, 2.5, '#3a271d');
      this.drawLimb(2, 4, 2 - walkSwing, 11, 3.2, 2.5, '#3a271d');
      this.drawLimb(6, 4, 6 + walkSwing, 11, 3.2, 2.5, '#3a271d');

      // 2. Muscular Bristly Body
      ctx.fillStyle = '#4d3326';
      ctx.beginPath();
      ctx.roundRect(-10, -7, 20, 12, 4.5);
      ctx.fill();

      // Body volume shading
      const bShade = ctx.createLinearGradient(0, -7, 0, 5);
      bShade.addColorStop(0, 'rgba(255,255,255,0.1)');
      bShade.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = bShade;
      ctx.beginPath(); ctx.roundRect(-10, -7, 20, 12, 4.5); ctx.fill();

      // Snout
      ctx.fillStyle = '#4d3326';
      ctx.beginPath();
      ctx.moveTo(10, -3.5);
      ctx.lineTo(15.5, -1.2);
      ctx.lineTo(10, 3.2);
      ctx.closePath();
      ctx.fill();

      // Back spine bristles
      ctx.strokeStyle = '#2d1e17';
      ctx.lineWidth = 1.5;
      for (let i = -8; i <= 6; i += 3) {
        ctx.beginPath();
        ctx.moveTo(i, -7);
        ctx.lineTo(i - 1, -10.5);
        ctx.stroke();
      }

      // Small White Tusks
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(10.5, 0.2);
      ctx.lineTo(13.2, -2.8);
      ctx.stroke();

      // Eye
      ctx.fillStyle = a.isHostile ? '#e63946' : '#000';
      ctx.fillRect(9, -4, 1.5, 1.5);

    } else if (a.type === 'rabbit') {
      // Rabbit
      ctx.fillStyle = '#eceae6';
      
      // Main body
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.beginPath();
      ctx.arc(6, -4, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Long ears
      ctx.fillStyle = '#eceae6';
      ctx.fillRect(4.2, -13, 2, 6.2);
      ctx.fillRect(6.2, -12, 2, 5.2);
      
      ctx.fillStyle = '#ffb3c1'; // pink inner ear
      ctx.fillRect(4.7, -11.2, 1, 4.2);

      // Tail
      ctx.fillStyle = '#eceae6';
      ctx.beginPath();
      ctx.arc(-7.5, 2, 2.8, 0, Math.PI*2);
      ctx.fill();

      // Paw joints
      this.drawLimb(-3, 5.5, -3 - walkSwing*0.5, 8.2, 1.8, 1.5, '#eceae6');
      this.drawLimb(3, 5.5, 3 + walkSwing*0.5, 8.2, 1.8, 1.5, '#eceae6');

      // Eye
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.arc(6.5, -5, 0.9, 0, Math.PI*2);
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
        const angle = (Date.now() / 400) % (Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(224, 130, 38, 0.85)';
        this.ctx.lineWidth = 2.0;
        this.ctx.setLineDash([4, 4]);
        this.ctx.beginPath();
        this.ctx.arc(0, 8, 16, angle, angle + Math.PI * 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        this.ctx.strokeStyle = 'rgba(224, 130, 38, 0.25)';
        this.ctx.lineWidth = 4.0;
        this.ctx.beginPath();
        this.ctx.arc(0, 8, 16, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Draw the Vector Human
      this.drawVectorHuman(v, false);

      // Health bar above head (only if damaged or sick)
      if (v.health < 100 || v.isSick) {
        this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
        this.ctx.fillRect(-12, -32, 24, 3.5);
        this.ctx.fillStyle = v.isSick ? '#cf9fff' : '#c24634';
        this.ctx.fillRect(-12, -32, 24 * (v.health / 100), 3.5);
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
        const angle = (Date.now() / 400) % (Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(194, 70, 52, 0.85)';
        this.ctx.lineWidth = 2.0;
        this.ctx.setLineDash([4, 4]);
        this.ctx.beginPath();
        this.ctx.arc(0, 8, 16, -angle, -angle + Math.PI * 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        this.ctx.strokeStyle = 'rgba(194, 70, 52, 0.25)';
        this.ctx.lineWidth = 4.0;
        this.ctx.beginPath();
        this.ctx.arc(0, 8, 16, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Draw the Vector Human as an enemy cannibal
      this.drawVectorHuman(e, true);

      // Health bar
      const hpPct = e.health / e.maxHealth;
      this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
      this.ctx.fillRect(-12, -32, 24, 3);
      this.ctx.fillStyle = '#c24634';
      this.ctx.fillRect(-12, -32, 24 * hpPct, 3);

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
        const radius = a.type === 'mammoth' ? 28 : 16;
        const angle = (Date.now() / 400) % (Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(216, 160, 44, 0.85)';
        this.ctx.lineWidth = 2.0;
        this.ctx.setLineDash([4, 4]);
        this.ctx.beginPath();
        this.ctx.arc(0, a.type === 'mammoth' ? 8 : 4, radius, angle, angle + Math.PI * 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        this.ctx.strokeStyle = 'rgba(216, 160, 44, 0.25)';
        this.ctx.lineWidth = 4.0;
        this.ctx.beginPath();
        this.ctx.arc(0, a.type === 'mammoth' ? 8 : 4, radius, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Draw Vector Animal
      this.drawVectorAnimal(a);

      // Anger emoji if hostile
      if (a.isHostile) {
        this.ctx.fillStyle = '#d62828';
        this.ctx.font = '10px Arial';
        this.ctx.fillText('💢', 0, a.type === 'mammoth' ? -32 : -22);
      }

      // Draw hp bar if damaged
      if (a.health < a.maxHealth) {
        const hpPct = a.health / a.maxHealth;
        const width = a.type === 'mammoth' ? 36 : 24;
        this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
        this.ctx.fillRect(-width/2, a.type === 'mammoth' ? -38 : -26, width, 3);
        this.ctx.fillStyle = '#c24634';
        this.ctx.fillRect(-width/2, a.type === 'mammoth' ? -38 : -26, width * hpPct, 3);
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

  // ================================================================
  //  GROUND SHADOWS
  // ================================================================

  renderShadows() {
    const size = this.map.tileSize;

    // 1. Draw shadows for resources (trees and rocks)
    this.map.resources.forEach(r => {
      const rx = r.x * size + size / 2;
      const ry = r.y * size + size / 2;
      
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      this.ctx.beginPath();
      if (r.type === 'tree') {
        this.ctx.ellipse(rx + 8, ry + 16, 12, 6, 0.4, 0, Math.PI * 2);
      } else if (r.type === 'rock') {
        this.ctx.ellipse(rx + 6, ry + 10, 16, 8, 0.2, 0, Math.PI * 2);
      }
      this.ctx.fill();
      this.ctx.restore();
    });

    // 2. Draw shadows for buildings
    gameState.buildings.forEach(b => {
      const bx = b.x * size;
      const by = b.y * size;
      const bw = b.width * size;
      const bh = b.height * size;

      this.ctx.save();
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      this.ctx.fillRect(bx + 8, by + bh - 4, bw, 8);
      this.ctx.fillRect(bx + bw - 4, by + 8, 8, bh - 8);
      this.ctx.restore();
    });

    // 3. Draw shadows for units (villagers, enemies, animals)
    const allEntities = [...gameState.villagers, ...gameState.enemies, ...gameState.animals];
    allEntities.forEach(entity => {
      const ex = entity.visualX * size + size / 2;
      const ey = entity.visualY * size + size / 2;

      const isMammoth = entity.type === 'mammoth';
      const isBoar = entity.type === 'boar';
      const sw = isMammoth ? 26 : (isBoar ? 14 : 11);
      const sh = isMammoth ? 7 : (isBoar ? 4 : 3);
      const oy = isMammoth ? 18 : (isBoar ? 10 : 18);

      const sx = ex + 4;
      const sy = ey + oy + 2;

      const grad = this.ctx.createRadialGradient(sx, sy, 0, sx, sy, sw);
      grad.addColorStop(0, 'rgba(0,0,0,0.35)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      this.ctx.save();
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.ellipse(sx, sy, sw, sh, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    });
  }

  // ================================================================
  //  FIRE & EMBER PARTICLES (world-space)
  // ================================================================

  updateFireParticles(deltaTime) {
    const size = this.map.tileSize;
    const fireBuildings = ['kitchen', 'hut', 'armoury'];

    gameState.buildings.forEach(b => {
      if (!b.isBuilt) return;
      if (!fireBuildings.includes(b.type)) return;

      const bx = (b.x + b.width / 2) * size;
      const by = (b.y + b.height / 2) * size;

      // Spawn embers
      const spawnRate = b.type === 'kitchen' ? 0.5 : 0.25;
      if (Math.random() < spawnRate) {
        const isEmber = Math.random() < 0.25;
        this.fireParticles.push({
          x: bx + (Math.random() - 0.5) * 14,
          y: by - 8,
          vx: (Math.random() - 0.5) * 22,
          vy: -(28 + Math.random() * 36),
          life: 0.5 + Math.random() * 0.6,
          size: isEmber ? 1.2 + Math.random() * 1.5 : 2.5 + Math.random() * 3.5,
          isEmber,
          hue: isEmber ? '#ff6b35' : (Math.random() > 0.5 ? '#ff8c00' : '#ffc300')
        });
      }
    });

    // Update existing fire particles
    this.fireParticles = this.fireParticles.filter(p => {
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.vy += 10 * deltaTime; // slight gravity drag
      p.vx *= Math.pow(0.95, deltaTime * 60);
      p.life -= deltaTime * (p.isEmber ? 1.2 : 2.0);
      p.size = Math.max(0.1, p.size - deltaTime * 3);
      return p.life > 0;
    });

    if (this.fireParticles.length > 500) {
      this.fireParticles.splice(0, this.fireParticles.length - 500);
    }
  }

  renderFireParticles() {
    this.fireParticles.forEach(p => {
      this.ctx.save();
      this.ctx.globalAlpha = Math.min(1, p.life) * (p.isEmber ? 0.9 : 0.7);
      this.ctx.fillStyle = p.hue;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    });
  }

  // ================================================================
  //  DAY / NIGHT ATMOSPHERIC OVERLAY (screen-space)
  // ================================================================

  renderDayNightOverlay() {
    if (!gameState.gameStarted) return;
    const t = gameState.dayTime; // 0.0 = midnight/dawn, 0.5 = noon, 1.0 = next midnight
    const w = this.canvas.width;
    const h = this.canvas.height;

    let darkness = 0;
    let r = 0, g = 0, b = 0;

    if (t < 0.08) {
      // Deep Night -> Early Dawn
      const p = t / 0.08;
      darkness = 0.72 - p * 0.55;
      r = 20; g = 10; b = 60;
    } else if (t < 0.18) {
      // Dawn: warm orange flush
      const p = (t - 0.08) / 0.10;
      darkness = 0.17 - p * 0.16;
      r = 255; g = 140; b = 60;
    } else if (t < 0.3) {
      // Morning clearing
      const p = (t - 0.18) / 0.12;
      darkness = 0.01 - p * 0.01;
      r = 255; g = 200; b = 120;
    } else if (t < 0.68) {
      // Full daytime — no overlay
      darkness = 0;
    } else if (t < 0.80) {
      // Sunset: warm orange-red
      const p = (t - 0.68) / 0.12;
      darkness = p * 0.38;
      r = 255; g = 80; b = 20;
    } else if (t < 0.88) {
      // Dusk: purple-blue settling
      const p = (t - 0.80) / 0.08;
      darkness = 0.38 + p * 0.28;
      r = 40; g = 15; b = 80;
    } else {
      // Deep Night
      darkness = 0.66;
      r = 10; g = 10; b = 45;
    }

    if (darkness > 0.005) {
      this.ctx.fillStyle = `rgba(${r},${g},${b},${darkness.toFixed(3)})`;
      this.ctx.fillRect(0, 0, w, h);
    }

    // Stars visible at night
    if (t > 0.84 || t < 0.10) {
      this.renderStars(t);
    }
  }

  renderStars(t) {
    // Generate a persistent star field on first call
    if (!this._starField) {
      this._starField = [];
      for (let i = 0; i < 140; i++) {
        this._starField.push({
          x: Math.random(),  // stored as fractions
          y: Math.random() * 0.65,
          r: 0.4 + Math.random() * 1.4,
          phase: Math.random() * Math.PI * 2,
          speed: 0.8 + Math.random() * 1.5
        });
      }
    }

    // Compute star alpha based on time
    let starAlpha = 0;
    if (t > 0.88) starAlpha = Math.min(1, (t - 0.88) / 0.06);
    else if (t < 0.04) starAlpha = 1;
    else if (t < 0.10) starAlpha = Math.max(0, 1 - (t - 0.04) / 0.06);
    else if (t > 0.84) starAlpha = Math.min(0.5, (t - 0.84) / 0.04);

    const now = performance.now() / 1000;
    const W = this.canvas.width;
    const H = this.canvas.height;

    this._starField.forEach(star => {
      const twinkle = 0.55 + Math.sin(now * star.speed + star.phase) * 0.45;
      this.ctx.save();
      this.ctx.globalAlpha = starAlpha * twinkle;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(star.x * W, star.y * H, star.r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    });
  }

  // ================================================================
  //  WEATHER PARTICLES (screen-space)
  // ================================================================

  updateWeatherParticles(deltaTime) {
    if (!gameState.gameStarted) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const weather = gameState.weather;

    if (weather === 'Rainy') {
      const count = 10;
      for (let i = 0; i < count; i++) {
        this.weatherParticles.push({
          type: 'rain',
          x: Math.random() * (W + 60) - 30,
          y: -12,
          vx: 55,
          vy: 520 + Math.random() * 180,
          alpha: 0.35 + Math.random() * 0.25,
          len: 9 + Math.random() * 8
        });
      }
    } else if (weather === 'Snowy') {
      for (let i = 0; i < 3; i++) {
        this.weatherParticles.push({
          type: 'snow',
          x: Math.random() * W,
          y: -10,
          vx: (Math.random() - 0.5) * 25,
          vy: 35 + Math.random() * 45,
          alpha: 0.75 + Math.random() * 0.25,
          size: 1.8 + Math.random() * 2.8,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: 0.8 + Math.random() * 1.2
        });
      }
    }

    // Update all particles
    this.weatherParticles = this.weatherParticles.filter(p => {
      if (p.type === 'snow') {
        p.wobble += p.wobbleSpeed * deltaTime;
        p.x += Math.sin(p.wobble) * 18 * deltaTime + p.vx * deltaTime;
      } else {
        p.x += p.vx * deltaTime;
      }
      p.y += p.vy * deltaTime;
      // If weather changes mid-flight, age them faster
      if (weather !== p.type && weather !== 'Rainy' && weather !== 'Snowy') {
        p.alpha -= deltaTime * 2;
      }
      return p.y < H + 20 && p.alpha > 0;
    });

    // Hard cap to avoid slowdown
    if (this.weatherParticles.length > 700) {
      this.weatherParticles.splice(0, this.weatherParticles.length - 700);
    }

    // Clear if weather changed away from precipitating types
    if (weather !== 'Rainy' && weather !== 'Snowy') {
      if (this.weatherParticles.length > 200) {
        this.weatherParticles.splice(0, this.weatherParticles.length - 200);
      }
    }
  }

  renderWeather() {
    if (!gameState.gameStarted) return;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Fog: animated semi-transparent overlay with gradient
    if (gameState.weather === 'Foggy') {
      const now = performance.now() / 4000;
      const fogGrad = ctx.createLinearGradient(0, 0, W, H);
      fogGrad.addColorStop(0, `rgba(170,180,195,${0.10 + Math.sin(now) * 0.04})`);
      fogGrad.addColorStop(0.4, `rgba(170,180,195,${0.18 + Math.sin(now + 1.2) * 0.05})`);
      fogGrad.addColorStop(1, `rgba(170,180,195,${0.10 + Math.sin(now + 2.4) * 0.04})`);
      ctx.fillStyle = fogGrad;
      ctx.fillRect(0, 0, W, H);
      return;
    }

    this.weatherParticles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;

      if (p.type === 'rain') {
        ctx.strokeStyle = '#a8c8e0';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const scale = p.vy / 600;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 0.016 * p.len * scale, p.y + p.len);
        ctx.stroke();
      } else if (p.type === 'snow') {
        ctx.fillStyle = '#f0f4ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
  }

  // ================================================================
  //  MINI-MAP (screen-space)
  // ================================================================

  renderMiniMap() {
    if (!gameState.gameStarted) return;
    const ctx = this.ctx;
    const W = 162, H = 162;
    const pad = 14;
    const mx = this.canvas.width - W - pad;
    const my = this.canvas.height - H - pad;
    const tileW = W / this.map.width;
    const tileH = H / this.map.height;

    // Outer frame
    ctx.save();
    ctx.fillStyle = 'rgba(8, 6, 3, 0.88)';
    ctx.strokeStyle = 'rgba(196, 150, 60, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(mx - 1, my - 1, W + 2, H + 2);
    ctx.strokeRect(mx - 1, my - 1, W + 2, H + 2);

    // Clip to minimap area
    ctx.beginPath();
    ctx.rect(mx, my, W, H);
    ctx.clip();

    // Draw terrain
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const type = this.map.grid[y][x];
        if (type === 'grass') ctx.fillStyle = '#28401e';
        else if (type === 'water') ctx.fillStyle = '#1a3a50';
        else ctx.fillStyle = '#6a5a42';
        ctx.fillRect(mx + x * tileW, my + y * tileH, tileW + 0.5, tileH + 0.5);
      }
    }

    // Draw resources (small dots)
    this.map.resources.forEach(res => {
      if (res.type === 'tree') {
        ctx.fillStyle = 'rgba(60, 130, 50, 0.7)';
        ctx.fillRect(mx + res.x * tileW + 0.5, my + res.y * tileH + 0.5, tileW * 0.7, tileH * 0.7);
      } else if (res.type === 'rock') {
        ctx.fillStyle = 'rgba(130, 120, 110, 0.7)';
        ctx.fillRect(mx + res.x * tileW + 0.5, my + res.y * tileH + 0.5, tileW * 0.7, tileH * 0.7);
      }
    });

    // Draw buildings
    gameState.buildings.forEach(b => {
      ctx.fillStyle = b.isBuilt ? 'rgba(200, 160, 80, 0.85)' : 'rgba(120, 100, 60, 0.6)';
      ctx.fillRect(mx + b.x * tileW, my + b.y * tileH, b.width * tileW, b.height * tileH);
    });

    // Draw animals
    gameState.animals.forEach(a => {
      const px = mx + (a.visualX / this.map.width) * W;
      const py = my + (a.visualY / this.map.height) * H;
      ctx.fillStyle = a.isHostile ? '#d4a017' : '#a0734a';
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw enemies
    gameState.enemies.forEach(e => {
      const px = mx + (e.visualX / this.map.width) * W;
      const py = my + (e.visualY / this.map.height) * H;
      ctx.fillStyle = '#e53e3e';
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw villagers
    gameState.villagers.forEach(v => {
      const px = mx + (v.visualX / this.map.width) * W;
      const py = my + (v.visualY / this.map.height) * H;
      ctx.fillStyle = '#48d38a';
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw camera viewport rectangle
    const mapPixelW = this.map.width * this.map.tileSize;
    const mapPixelH = this.map.height * this.map.tileSize;
    const vpX = mx + (this.camera.x / mapPixelW) * W;
    const vpY = my + (this.camera.y / mapPixelH) * H;
    const vpW = (this.canvas.width / this.camera.zoom / mapPixelW) * W;
    const vpH = (this.canvas.height / this.camera.zoom / mapPixelH) * H;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpX, vpY, vpW, vpH);

    ctx.restore();

    // Label outside clip
    ctx.fillStyle = 'rgba(196, 150, 60, 0.9)';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('▲ MAP', mx + 4, my + 3);

    // Legend dots
    const lx = mx + 4;
    const ly = my + H - 22;
    ctx.font = '8px monospace';
    ctx.fillStyle = '#48d38a'; ctx.fillText('● V', lx, ly);
    ctx.fillStyle = '#e53e3e'; ctx.fillText('● R', lx + 26, ly);
    ctx.fillStyle = '#a0734a'; ctx.fillText('● A', lx + 52, ly);
  }

  // ================================================================
  //  RANDOM EVENTS
  // ================================================================

  updateRandomEvents(deltaTime) {
    if (!gameState.gameStarted || gameState.gameOver) return;

    this.randomEventTimer += deltaTime;
    if (this.randomEventTimer < this.randomEventCooldown) return;

    this.randomEventTimer = 0;
    this.randomEventCooldown = 80 + Math.random() * 130;

    // 55% chance the event actually fires each check
    if (Math.random() > 0.55) return;

    const events = [
      {
        id: 'plague',
        weight: 1,
        trigger: () => {
          const healthy = gameState.villagers.filter(v => !v.isSick && !v.isChild);
          if (healthy.length === 0) return false;
          const victim = healthy[Math.floor(Math.random() * healthy.length)];
          victim.isSick = true;
          gameState.addLog(`⚠️ ${victim.name} has fallen ill with a high fever! Send the Shaman.`, 'danger');
          return true;
        }
      },
      {
        id: 'meteor',
        weight: 1,
        trigger: () => {
          gameState.addLog('🌠 A meteor shower lights up the night sky! The tribe is filled with awe. (+8 Mood each)', 'good');
          gameState.villagers.forEach(v => { v.mood = Math.min(100, v.mood + 8); });
          return true;
        }
      },
      {
        id: 'wolfpack',
        weight: 1,
        trigger: () => {
          if (gameState.animals.length > 14) return false;
          for (let i = 0; i < 3; i++) this.spawnAnimalCount('boar', 1);
          gameState.addLog('🐗 A snorting pack of wild boars has wandered into the area!', 'warn');
          return true;
        }
      },
      {
        id: 'bounty',
        weight: 1,
        trigger: () => {
          const gained = 18 + Math.floor(Math.random() * 12);
          gameState.addRawFood(gained);
          gameState.addLog(`🌿 A bountiful berry thicket was discovered nearby! (+${gained} Raw Food)`, 'good');
          return true;
        }
      },
      {
        id: 'cold_snap',
        weight: gameState.season === 'Winter' ? 2 : 0.5,
        trigger: () => {
          const drain = 18 + Math.floor(Math.random() * 10);
          gameState.villagers.forEach(v => { v.energy = Math.max(0, v.energy - drain); });
          gameState.addLog(`🌨️ A brutal cold snap drains everyone's energy! (-${drain} Energy)`, 'danger');
          return true;
        }
      },
      {
        id: 'stampede',
        weight: 1,
        trigger: () => {
          const built = gameState.buildings.filter(b => b.isBuilt);
          if (built.length === 0) return false;
          const target = built[Math.floor(Math.random() * built.length)];
          if (target.health !== undefined) {
            target.health = Math.max(10, (target.health || 100) - 35);
          }
          gameState.addLog(`🦣 A mammoth stampede has damaged the ${target.name}! (-35 HP)`, 'danger');
          return true;
        }
      },
      {
        id: 'wood_windfall',
        weight: 1,
        trigger: () => {
          const gained = 20 + Math.floor(Math.random() * 15);
          gameState.addWood(gained);
          gameState.addLog(`🌳 A downed tree from last night\'s storm gifted extra timber! (+${gained} Wood)`, 'good');
          return true;
        }
      },
      {
        id: 'rival_spy',
        weight: gameState.daysSurvived > 3 ? 1 : 0,
        trigger: () => {
          gameState.increaseDanger(15);
          gameState.addLog('👁️ A rival tribe spy was spotted scouting your village! (+15 Danger)', 'danger');
          return true;
        }
      }
    ];

    // Weighted random selection
    const valid = events.filter(e => e.weight > 0);
    const total = valid.reduce((s, e) => s + e.weight, 0);
    let roll = Math.random() * total;
    for (const evt of valid) {
      roll -= evt.weight;
      if (roll <= 0) {
        evt.trigger();
        break;
      }
    }
  }
}
export default GameEngine;
