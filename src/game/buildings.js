import { gameState } from './state.js';
import { gameAudio } from './audio.js';

export const BUILDING_TYPES = {
  hut: {
    type: 'hut',
    name: 'Hut',
    costWood: 50,
    costStone: 0,
    width: 2,
    height: 2,
    maxProgress: 100,
    icon: '🛖',
    description: 'Increases max tribe size by +3. Resting spot.'
  },
  storage: {
    type: 'storage',
    name: 'Storage',
    costWood: 80,
    costStone: 30,
    width: 2,
    height: 2,
    maxProgress: 120,
    icon: '📦',
    description: 'Increases resource storage cap by +250.'
  },
  kitchen: {
    type: 'kitchen',
    name: 'Kitchen',
    costWood: 60,
    costStone: 40,
    width: 2,
    height: 2,
    maxProgress: 100,
    icon: '🔥',
    description: 'Lets Cooks process raw food into delicious cooked meals.'
  },
  armoury: {
    type: 'armoury',
    name: 'Armoury',
    costWood: 100,
    costStone: 70,
    width: 2,
    height: 2,
    maxProgress: 140,
    icon: '🔨',
    description: 'Unlocks weapon crafting. Automatically converts Wood & Stone to Weapons.'
  },
  gym: {
    type: 'gym',
    name: 'Gym',
    costWood: 90,
    costStone: 90,
    width: 2,
    height: 2,
    maxProgress: 150,
    icon: '💪',
    description: 'Enables Warriors to train and raise their combat strength.'
  },
  shaman: {
    type: 'shaman',
    name: 'Shaman',
    costWood: 120,
    costStone: 80,
    width: 2,
    height: 2,
    maxProgress: 160,
    icon: '🧪',
    description: 'Enables Shamans to cure sick villagers and control disease.'
  },
  tower: {
    type: 'tower',
    name: 'Tower',
    costWood: 70,
    costStone: 50,
    width: 1,
    height: 1,
    maxProgress: 80,
    icon: '🏹',
    description: 'Watchtower that automatically shoots arrows at rival raiders.'
  }
};

export class Building {
  constructor(id, type, x, y) {
    const meta = BUILDING_TYPES[type];
    this.id = id;
    this.type = type;
    this.name = meta.name;
    this.x = x;
    this.y = y;
    this.width = meta.width;
    this.height = meta.height;
    this.icon = meta.icon;
    
    this.progress = 0; // 0 to maxProgress during building
    this.maxProgress = meta.maxProgress;
    this.isBuilt = false;

    // Watchtower properties
    if (type === 'tower') {
      this.range = 5; // grid cells
      this.cooldown = 1.8; // seconds between shots
      this.shootTimer = 0;
      this.damage = 18;
    }

    // Armoury properties
    if (type === 'armoury') {
      this.craftTimer = 0;
      this.craftCooldown = 15; // seconds to craft a weapon
    }
  }

  // Add building progress
  build(amount) {
    if (this.isBuilt) return;
    
    this.progress = Math.min(this.maxProgress, this.progress + amount);
    
    if (this.progress >= this.maxProgress) {
      this.isBuilt = true;
      gameState.addLog(`${this.name} construction completed!`, 'good');
      
      // Update global states depending on building type
      if (this.type === 'hut') {
        gameState.maxPopulation += 3;
      } else if (this.type === 'storage') {
        gameState.storageLimit += 250;
      }
      
      gameAudio.playBirth(); // completion chime
    }
  }

  // Update building logic per frame
  update(deltaTime, gameMap) {
    if (!this.isBuilt) return;

    // Watchtower shoots nearby enemies
    if (this.type === 'tower') {
      this.updateWatchtower(deltaTime);
    }

    // Armoury crafts weapons
    if (this.type === 'armoury') {
      this.updateArmoury(deltaTime);
    }
  }

  updateWatchtower(deltaTime) {
    this.shootTimer = Math.max(0, this.shootTimer - deltaTime);
    if (this.shootTimer > 0) return;

    // Check for nearby enemies
    let target = null;
    let minDist = this.range;

    gameState.enemies.forEach(enemy => {
      if (enemy.health <= 0) return;
      const dist = Math.sqrt((enemy.x - (this.x + 0.5)) ** 2 + (enemy.y - (this.y + 0.5)) ** 2);
      if (dist < minDist) {
        minDist = dist;
        target = enemy;
      }
    });

    // If no cannibal, shoot hostile beasts (mammoths/boars if they are angry/attacking)
    if (!target) {
      gameState.animals.forEach(animal => {
        if (animal.health <= 0 || !animal.isHostile) return;
        const dist = Math.sqrt((animal.x - (this.x + 0.5)) ** 2 + (animal.y - (this.y + 0.5)) ** 2);
        if (dist < minDist) {
          minDist = dist;
          target = animal;
        }
      });
    }

    if (target) {
      // Fire arrow!
      this.shootTimer = this.cooldown;
      
      const arrow = {
        id: Date.now() + Math.random(),
        startX: this.x + 0.5,
        startY: this.y + 0.5,
        x: this.x + 0.5,
        y: this.y + 0.5,
        target: target,
        speed: 8, // cells per second
        damage: this.damage,
        t: 0
      };
      
      gameState.projectiles.push(arrow);
      gameAudio.playShoot();
    }
  }

  updateArmoury(deltaTime) {
    // Requires wood >= 15 and stone >= 10 to automatically forge
    if (gameState.wood >= 15 && gameState.stone >= 10) {
      this.craftTimer += deltaTime;
      if (this.craftTimer >= this.craftCooldown) {
        this.craftTimer = 0;
        gameState.wood -= 15;
        gameState.stone -= 10;
        gameState.addWeapons(1);
        gameState.addLog(`Armoury forged a new stone-axe weapon!`, 'good');
        gameAudio.playMine(); // ringing ring sound
      }
    } else {
      // Pause crafting if materials are insufficient
      this.craftTimer = Math.max(0, this.craftTimer - deltaTime * 0.2);
    }
  }
}
export default Building;
