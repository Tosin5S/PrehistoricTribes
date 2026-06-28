import { gameState } from './state.js';
import { gameAudio } from './audio.js';

// Random Name Generator
const FIRST_NAMES = ['Ugg', 'Oona', 'Thag', 'Grog', 'Bula', 'Krag', 'Lana', 'Zog', 'Yara', 'Daka', 'Torg', 'Sana', 'Moko', 'Zula', 'Boro', 'Gena'];
const LAST_NAMES = ['Stonehand', 'Clubwielder', 'Spearsharp', 'Firemaker', 'Beastslayer', 'Fastfoot', 'Mammothhunter', 'Cavecarver'];

export function generateName() {
  const f = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const l = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${f} ${l}`;
}

export class Villager {
  constructor(id, x, y, gender = null) {
    this.id = id;
    this.name = generateName();
    this.gender = gender || (Math.random() < 0.5 ? 'Male' : 'Female');
    this.age = Math.floor(Math.random() * 15) + 18; // Start at age 18-32
    
    // Core Needs
    this.health = 100;
    this.energy = 100;
    this.hunger = 0; // 0 is sated, 100 is starving
    this.mood = 80; // 0 to 100
    
    // Attributes
    this.isSick = false;
    this.isChild = false;
    this.childAgeProgress = 0; // grows into adult
    this.combatPower = 10; // permanent bonus from gym training
    this.weapon = 'none'; // 'none', 'axe', 'spear', 'bow'
    
    // Job & AI
    this.job = 'idle'; // 'idle', 'woodcutter', 'miner', 'gatherer', 'cook', 'builder', 'warrior', 'shaman'
    this.state = 'idle'; // 'idle', 'moving', 'gathering', 'cooking', 'sleeping', 'eating', 'training', 'fighting', 'healing', 'mating'
    
    // Grid Positions
    this.gridX = x;
    this.gridY = y;
    this.visualX = x;
    this.visualY = y;
    this.speed = 1.6; // cells per second
    
    // Inventory
    this.inventory = { type: null, amount: 0, max: 15 };
    
    // AI Target tracking
    this.target = null;
    this.path = [];
    this.actionTimer = 0;

    // Visual animation offset
    this.animFrame = 0;
    this.facing = 'down';
  }

  // Get current damage output
  getDamage() {
    let weaponBonus = 0;
    if (this.weapon === 'axe') weaponBonus = 8;
    else if (this.weapon === 'spear') weaponBonus = 15;
    else if (this.weapon === 'bow') weaponBonus = 12; // ranged
    return this.combatPower + weaponBonus;
  }

  // Assign job
  setJob(newJob) {
    if (this.isChild) return; // Children cannot work
    this.job = newJob;
    this.state = 'idle';
    this.target = null;
    this.path = [];
    this.actionTimer = 0;
  }

  // Core update loop for each villager
  update(deltaTime, gameMap) {
    // Process animations
    this.animFrame += deltaTime * 5;
    
    // Process child aging
    if (this.isChild) {
      this.childAgeProgress += deltaTime;
      if (this.childAgeProgress >= 150) { // 2.5 minutes to grow up
        this.isChild = false;
        this.job = 'idle';
        gameState.addLog(`${this.name} has grown up and can now work!`, 'good');
      }
    }

    // Adjust Needs over time
    this.hunger = Math.min(100, this.hunger + deltaTime * 0.45); // hunger rises
    
    // Energy decreases unless sleeping
    if (this.state !== 'sleeping') {
      this.energy = Math.max(0, this.energy - deltaTime * 0.25);
    }

    // Health effects
    if (this.hunger >= 85) {
      this.health = Math.max(0, this.health - deltaTime * 1.5); // Starving reduces health
      this.mood = Math.max(0, this.mood - deltaTime * 3);
    }
    if (this.isSick) {
      this.health = Math.max(0, this.health - deltaTime * 1.0); // Sickness reduces health
      this.mood = Math.max(0, this.mood - deltaTime * 2);
    }
    
    // Health recovery when well fed and energetic
    if (this.hunger < 30 && this.energy > 40 && !this.isSick && this.health < 100) {
      this.health = Math.min(100, this.health + deltaTime * 1.0);
    }

    // Mood calculator
    let targetMood = 80;
    if (this.hunger > 50) targetMood -= 30;
    if (this.energy < 30) targetMood -= 25;
    if (this.isSick) targetMood -= 30;
    if (gameState.season === 'Winter') targetMood -= 15;
    this.mood = this.mood * 0.95 + targetMood * 0.05; // smooth interpolation

    // Check death condition
    if (this.health <= 0) {
      this.die(gameMap);
      return;
    }

    // Check emergency needs: Eating and Sleeping overrides normal jobs
    if (this.state !== 'eating' && this.hunger > 80) {
      this.seekFood(gameMap);
      this.moveAlongPath(deltaTime);
      return;
    }
    
    if (this.state !== 'sleeping' && this.energy < 15) {
      this.seekSleep(gameMap);
      this.moveAlongPath(deltaTime);
      return;
    }

    // Execute state logic
    switch (this.state) {
      case 'idle':
        this.executeIdleBehavior(deltaTime, gameMap);
        break;
      case 'moving':
        this.moveAlongPath(deltaTime);
        break;
      case 'gathering':
        this.executeGathering(deltaTime, gameMap);
        break;
      case 'delivering':
        this.executeDelivering(deltaTime, gameMap);
        break;
      case 'cooking':
        this.executeCooking(deltaTime, gameMap);
        break;
      case 'building':
        this.executeBuilding(deltaTime, gameMap);
        break;
      case 'training':
        this.executeTraining(deltaTime, gameMap);
        break;
      case 'sleeping':
        this.executeSleeping(deltaTime, gameMap);
        break;
      case 'eating':
        this.executeEating(deltaTime, gameMap);
        break;
      case 'healing':
        this.executeHealing(deltaTime, gameMap);
        break;
      case 'mating':
        this.executeMating(deltaTime, gameMap);
        break;
      case 'fighting':
        this.executeFighting(deltaTime, gameMap);
        break;
    }
  }

  moveAlongPath(deltaTime) {
    if (this.path.length === 0) {
      this.state = 'idle';
      return;
    }

    const nextTile = this.path[0];
    const dx = nextTile.x - this.visualX;
    const dy = nextTile.y - this.visualY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Set direction facing
    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = dx > 0 ? 'right' : 'left';
    } else {
      this.facing = dy > 0 ? 'down' : 'up';
    }

    const step = this.speed * deltaTime;

    if (dist <= step) {
      // Reached next tile
      this.visualX = nextTile.x;
      this.visualY = nextTile.y;
      this.gridX = nextTile.x;
      this.gridY = nextTile.y;
      this.path.shift(); // remove step
      
      if (this.path.length === 0) {
        // Reached destination, trigger action transition
        this.arriveAtDestination();
      }
    } else {
      // Move closer
      this.visualX += (dx / dist) * step;
      this.visualY += (dy / dist) * step;
    }
  }

  arriveAtDestination() {
    if (this.job === 'woodcutter' && this.inventory.amount < this.inventory.max) {
      this.state = 'gathering';
      this.actionTimer = 2.0; // takes 2 seconds per chop
    } else if (this.job === 'miner' && this.inventory.amount < this.inventory.max) {
      this.state = 'gathering';
      this.actionTimer = 2.0;
    } else if (this.job === 'gatherer' && this.inventory.amount < this.inventory.max) {
      this.state = 'gathering';
      this.actionTimer = 2.0;
    } else if (this.inventory.amount > 0) {
      this.state = 'delivering';
      this.actionTimer = 0.5;
    } else if (this.job === 'cook' && this.state === 'moving') {
      // Reached kitchen/storehouse
      if (this.target && this.target.type === 'kitchen') {
        this.state = 'cooking';
        this.actionTimer = 3.0; // cook cycle
      } else {
        // Got to warehouse to fetch raw food
        this.state = 'gathering';
        this.actionTimer = 0.5;
      }
    } else if (this.job === 'builder' && this.target && !this.target.isBuilt) {
      this.state = 'building';
      this.actionTimer = 1.0;
    } else if (this.job === 'warrior' && this.target && this.target.type === 'gym') {
      this.state = 'training';
      this.actionTimer = 5.0;
    } else if (this.state === 'moving' && this.target && this.target.action === 'eat') {
      this.state = 'eating';
      this.actionTimer = 2.5;
    } else if (this.state === 'moving' && this.target && this.target.action === 'sleep') {
      this.state = 'sleeping';
      this.actionTimer = 8.0; // sleep duration
    } else if (this.job === 'shaman' && this.target && this.target.isSick) {
      this.state = 'healing';
      this.actionTimer = 2.0;
    } else {
      this.state = 'idle';
    }
  }

  // Seek food logic
  seekFood(gameMap) {
    // Find closest food source
    // Primary: Kitchen (if built), Secondary: Storehouse
    let foodSrc = null;
    let minDist = 999;

    gameState.buildings.forEach(b => {
      if (!b.isBuilt) return;
      if (b.type === 'kitchen' || b.type === 'storage') {
        const d = this.distTo(b.x, b.y);
        if (d < minDist) {
          minDist = d;
          foodSrc = b;
        }
      }
    });

    // If we have food in gameState, walk to the building
    if (gameState.cookedFood > 0 || gameState.rawFood > 0) {
      this.target = { type: foodSrc ? foodSrc.type : 'warehouse', action: 'eat', x: foodSrc ? foodSrc.x : 16, y: foodSrc ? foodSrc.y : 16 };
      this.path = gameMap.findPath(this.gridX, this.gridY, this.target.x, this.target.y);
      this.state = 'moving';
    } else {
      this.state = 'idle'; // Nowhere to get food, wait
    }
  }

  // Seek sleep logic
  seekSleep(gameMap) {
    // Search for a Hut with space, otherwise sleep where we stand or walk towards home
    let home = null;
    let minDist = 999;

    gameState.buildings.forEach(b => {
      if (b.type === 'hut' && b.isBuilt) {
        const d = this.distTo(b.x, b.y);
        if (d < minDist) {
          minDist = d;
          home = b;
        }
      }
    });

    if (home) {
      this.target = { type: 'hut', action: 'sleep', x: home.x, y: home.y, buildingRef: home };
      this.path = gameMap.findPath(this.gridX, this.gridY, home.x, home.y);
      this.state = 'moving';
    } else {
      // Sleep on the ground
      this.state = 'sleeping';
      this.actionTimer = 10.0;
      this.target = { type: 'ground', action: 'sleep' };
      
      // 30% chance to catch disease when sleeping on ground
      if (Math.random() < 0.3) {
        this.isSick = true;
        gameState.addLog(`${this.name} caught a disease from sleeping on the damp ground!`, 'warn');
      }
    }
  }

  // Job allocation behaviors
  executeIdleBehavior(deltaTime, gameMap) {
    if (this.isChild) {
      // Children wander around randomly
      this.wander(gameMap);
      return;
    }

    // Auto-equip weapons if available and none equipped
    if (this.weapon === 'none' && gameState.weapons > 0) {
      gameState.weapons--;
      this.weapon = Math.random() < 0.6 ? 'axe' : 'spear';
      gameState.addLog(`${this.name} equipped a new ${this.weapon}!`, 'good');
    }

    // Idle villagers try to procreate
    if (this.mood > 60 && this.hunger < 40 && this.energy > 50 && gameState.villagers.length < gameState.maxPopulation) {
      // Find another happy idle villager of opposite gender (simple mating)
      const mate = gameState.villagers.find(v => 
        v.id !== this.id && 
        v.job === 'idle' && 
        v.state === 'idle' && 
        v.gender !== this.gender && 
        v.mood > 60 && 
        !v.isChild
      );
      
      if (mate) {
        this.state = 'mating';
        mate.state = 'mating';
        this.target = mate;
        mate.target = this;
        
        // Walk towards each other
        const midX = Math.floor((this.gridX + mate.gridX) / 2);
        const midY = Math.floor((this.gridY + mate.gridY) / 2);
        this.path = gameMap.findPath(this.gridX, this.gridY, midX, midY);
        mate.path = gameMap.findPath(mate.gridX, mate.gridY, midX, midY);
        
        this.state = 'moving';
        mate.state = 'moving';
        return;
      }
    }

    // Check jobs
    if (this.job === 'woodcutter') {
      const tree = this.findClosestResource('tree', gameMap);
      if (tree) {
        this.target = tree;
        this.path = gameMap.findPath(this.gridX, this.gridY, tree.x, tree.y);
        this.state = 'moving';
      } else {
        this.wander(gameMap);
      }
    } else if (this.job === 'miner') {
      const rock = this.findClosestResource('rock', gameMap);
      if (rock) {
        this.target = rock;
        this.path = gameMap.findPath(this.gridX, this.gridY, rock.x, rock.y);
        this.state = 'moving';
      } else {
        this.wander(gameMap);
      }
    } else if (this.job === 'gatherer') {
      // Find bush or fish
      const source = this.findClosestResource(Math.random() < 0.6 ? 'bush' : 'fish', gameMap) || this.findClosestResource('bush', gameMap) || this.findClosestResource('fish', gameMap);
      if (source) {
        this.target = source;
        this.path = gameMap.findPath(this.gridX, this.gridY, source.x, source.y);
        this.state = 'moving';
      } else {
        this.wander(gameMap);
      }
    } else if (this.job === 'cook') {
      // Cook needs raw food from storehouse
      if (this.inventory.type !== 'rawFood' && gameState.rawFood > 0) {
        const storehouse = this.findClosestBuilding('storage');
        this.target = storehouse || { x: 16, y: 16 };
        this.path = gameMap.findPath(this.gridX, this.gridY, this.target.x, this.target.y);
        this.state = 'moving';
      } else if (this.inventory.amount > 0) {
        // Go to kitchen to cook
        const kitchen = this.findClosestBuilding('kitchen');
        if (kitchen) {
          this.target = kitchen;
          this.path = gameMap.findPath(this.gridX, this.gridY, kitchen.x, kitchen.y);
          this.state = 'moving';
        } else {
          this.wander(gameMap);
        }
      } else {
        this.wander(gameMap);
      }
    } else if (this.job === 'builder') {
      const site = gameState.buildings.find(b => !b.isBuilt);
      if (site) {
        this.target = site;
        this.path = gameMap.findPath(this.gridX, this.gridY, site.x, site.y);
        this.state = 'moving';
      } else {
        this.wander(gameMap);
      }
    } else if (this.job === 'warrior') {
      // Warriors scan for enemies first
      const threat = this.findClosestEnemy();
      if (threat) {
        this.target = threat;
        this.state = 'fighting';
        this.actionTimer = 0.5;
      } else {
        // Train in gym
        const gym = this.findClosestBuilding('gym');
        if (gym) {
          this.target = gym;
          this.path = gameMap.findPath(this.gridX, this.gridY, gym.x, gym.y);
          this.state = 'moving';
        } else {
          // Patrol center
          this.patrolCenter(gameMap);
        }
      }
    } else if (this.job === 'shaman') {
      const sickPerson = gameState.villagers.find(v => v.isSick && v.id !== this.id);
      if (sickPerson) {
        this.target = sickPerson;
        this.path = gameMap.findPath(this.gridX, this.gridY, sickPerson.gridX, sickPerson.gridY);
        this.state = 'moving';
      } else {
        // Wander or sit near shaman tent
        const tent = this.findClosestBuilding('shaman');
        if (tent && this.distTo(tent.x, tent.y) > 4) {
          this.path = gameMap.findPath(this.gridX, this.gridY, tent.x, tent.y);
          this.state = 'moving';
        } else {
          this.wander(gameMap);
        }
      }
    } else {
      // Standard wandering
      this.wander(gameMap);
    }
  }

  executeGathering(deltaTime, gameMap) {
    this.actionTimer -= deltaTime;
    
    // Periodically play gathering sounds
    if (this.actionTimer <= 0) {
      if (this.job === 'woodcutter') {
        gameAudio.playChop();
        this.inventory.type = 'wood';
        this.inventory.amount = Math.min(this.inventory.max, this.inventory.amount + 5);
        this.spawnParticle('🪵');
        gameState.increaseDanger(0.5); // Chopping trees increases danger
      } else if (this.job === 'miner') {
        gameAudio.playMine();
        this.inventory.type = 'stone';
        this.inventory.amount = Math.min(this.inventory.max, this.inventory.amount + 5);
        this.spawnParticle('🪨');
        gameState.increaseDanger(0.6);
      } else if (this.job === 'gatherer') {
        gameAudio.playCook(); // rustle
        this.inventory.type = 'rawFood';
        this.inventory.amount = Math.min(this.inventory.max, this.inventory.amount + 4);
        this.spawnParticle('🍒');
      } else if (this.job === 'cook') {
        // Cook gathers raw food from warehouse
        const taken = Math.min(this.inventory.max, gameState.rawFood);
        gameState.rawFood -= taken;
        this.inventory.type = 'rawFood';
        this.inventory.amount = taken;
        
        // Go straight to cooking at kitchen
        this.state = 'idle';
        return;
      }
      
      this.energy = Math.max(0, this.energy - 4);

      // Check if inventory full
      if (this.inventory.amount >= this.inventory.max) {
        // Locate closest storage or warehouse
        const store = this.findClosestBuilding('storage') || { x: 16, y: 16 };
        this.target = store;
        this.path = gameMap.findPath(this.gridX, this.gridY, store.x, store.y);
        this.state = 'moving';
      } else {
        // Keep gathering
        this.actionTimer = 2.0;
        
        // Verify resource still exists
        if (this.target && this.target.id !== undefined) {
          const res = gameMap.resources.find(r => r.id === this.target.id);
          if (!res) {
            this.state = 'idle'; // resource is dry
          }
        }
      }
    }
  }

  executeDelivering(deltaTime, gameMap) {
    this.actionTimer -= deltaTime;
    if (this.actionTimer <= 0) {
      // Deposit in gameState
      const amt = this.inventory.amount;
      if (this.inventory.type === 'wood') {
        const added = gameState.addWood(amt);
        if (added < amt) this.inventory.amount -= added;
        else this.resetInventory();
      } else if (this.inventory.type === 'stone') {
        const added = gameState.addStone(amt);
        if (added < amt) this.inventory.amount -= added;
        else this.resetInventory();
      } else if (this.inventory.type === 'rawFood') {
        const added = gameState.addRawFood(amt);
        if (added < amt) this.inventory.amount -= added;
        else this.resetInventory();
      } else if (this.inventory.type === 'cookedFood') {
        const added = gameState.addCookedFood(amt);
        if (added < amt) this.inventory.amount -= added;
        else this.resetInventory();
      }
      
      this.state = 'idle';
    }
  }

  executeCooking(deltaTime, gameMap) {
    this.actionTimer -= deltaTime;
    if (this.actionTimer <= 0) {
      if (this.inventory.amount > 0) {
        this.inventory.amount = Math.max(0, this.inventory.amount - 3);
        
        // Output cooked food directly to stats
        gameState.addCookedFood(3);
        gameAudio.playCook();
        this.spawnParticle('🔥');

        // Check if finished cooking inventory
        if (this.inventory.amount <= 0) {
          this.resetInventory();
          this.state = 'idle';
        } else {
          this.actionTimer = 3.0; // cook next batch
        }
      } else {
        this.state = 'idle';
      }
    }
  }

  executeBuilding(deltaTime, gameMap) {
    this.actionTimer -= deltaTime;
    if (this.actionTimer <= 0) {
      if (this.target && !this.target.isBuilt) {
        this.target.build(10); // add build progress
        gameAudio.playChop(); // build thud
        this.spawnParticle('🔨');
        this.energy = Math.max(0, this.energy - 3);

        if (this.target.isBuilt) {
          this.state = 'idle';
        } else {
          this.actionTimer = 1.0;
        }
      } else {
        this.state = 'idle';
      }
    }
  }

  executeTraining(deltaTime, gameMap) {
    this.actionTimer -= deltaTime;
    if (this.actionTimer <= 0) {
      this.combatPower += 5;
      gameState.addLog(`${this.name} finished physical training. Strength raised to ${this.getDamage()}!`, 'system');
      this.spawnParticle('💪');
      this.energy = Math.max(0, this.energy - 15);
      this.state = 'idle';
    }
  }

  executeSleeping(deltaTime, gameMap) {
    // Slowly gain energy
    const multiplier = (this.target && this.target.type === 'hut') ? 12 : 6;
    this.energy = Math.min(100, this.energy + deltaTime * multiplier);
    
    // Show Zzz particle occasionally
    if (Math.random() < 0.08) {
      this.spawnParticle('💤');
    }

    if (this.energy >= 95) {
      this.state = 'idle';
    }
  }

  executeEating(deltaTime, gameMap) {
    this.actionTimer -= deltaTime;
    if (this.actionTimer <= 0) {
      // Try to eat Cooked Food first (best nutrition)
      if (gameState.cookedFood > 0) {
        gameState.cookedFood = Math.max(0, gameState.cookedFood - 1);
        this.hunger = Math.max(0, this.hunger - 45);
        this.health = Math.min(100, this.health + 10);
        this.spawnParticle('😋');
      } else if (gameState.rawFood > 0) {
        // Eat raw food as fallback
        gameState.rawFood = Math.max(0, gameState.rawFood - 1);
        this.hunger = Math.max(0, this.hunger - 20); // less satisfying
        this.spawnParticle('🤢');
        
        // 10% chance to get sick from eating raw food
        if (Math.random() < 0.1) {
          this.isSick = true;
          gameState.addLog(`${this.name} got sick from eating raw food!`, 'warn');
        }
      }
      this.state = 'idle';
    }
  }

  executeHealing(deltaTime, gameMap) {
    this.actionTimer -= deltaTime;
    if (this.actionTimer <= 0) {
      if (this.target && this.target.isSick) {
        this.target.isSick = false;
        this.target.health = Math.min(100, this.target.health + 20);
        gameState.addLog(`${this.name} cured ${this.target.name}'s disease!`, 'good');
        gameAudio.playShamanHeal();
        this.target.spawnParticle('✨');
      }
      this.state = 'idle';
    }
  }

  executeMating(deltaTime, gameMap) {
    // Two villagers met at mid-point. Trigger procreation!
    gameAudio.playBirth();
    gameState.stats.babiesBorn++;

    // Create a new child villager at current location
    const babyId = Date.now() + Math.random();
    const baby = new Villager(babyId, this.gridX, this.gridY);
    baby.isChild = true;
    baby.age = 0;
    baby.name = `${generateName().split(' ')[0]} Child`;
    gameState.villagers.push(baby);

    gameState.addLog(`A new child has been born to the tribe!`, 'good');

    // Mating partners are exhausted but happy
    this.energy = Math.max(10, this.energy - 30);
    this.target.energy = Math.max(10, this.target.energy - 30);
    this.mood = 90;
    this.target.mood = 90;

    // Spawn hearts
    this.spawnParticle('❤️');
    this.target.spawnParticle('❤️');

    this.state = 'idle';
    this.target.state = 'idle';
    this.target = null;
  }

  executeFighting(deltaTime, gameMap) {
    const target = this.target;
    const isEnemy = gameState.enemies.includes(target);
    const isAnimal = gameState.animals.includes(target);
    if (!target || target.health <= 0 || (!isEnemy && !isAnimal)) {
      this.target = null;
      this.path = [];
      
      if (this.job === 'warrior') {
        const nextThreat = this.findClosestEnemy();
        if (nextThreat) {
          this.target = nextThreat;
          this.actionTimer = 0.5;
          return;
        }
      }
      this.state = 'idle';
      return;
    }

    const tx = target.visualX;
    const ty = target.visualY;
    const dist = this.distTo(tx, ty);

    if (dist <= 1.25) {
      this.path = [];
      const dx = tx - this.visualX;
      const dy = ty - this.visualY;
      this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');

      this.actionTimer -= deltaTime;
      if (this.actionTimer <= 0) {
        target.takeDamage(this.getDamage(), this);
        gameAudio.playCombatHit();
        this.actionTimer = 1.2;
        this.spawnParticle('⚔️');
      }
    } else {
      if (this.path.length === 0 || Math.random() < 0.08) {
        this.path = gameMap.findPath(this.gridX, this.gridY, Math.floor(tx), Math.floor(ty));
      }
      this.moveAlongPath(deltaTime);
    }
  }

  // Combat engagement
  takeDamage(amount, attacker) {
    this.health = Math.max(0, this.health - amount);
    this.mood = Math.max(0, this.mood - amount * 0.5);
    this.spawnParticle('💢');

    if (!this.isChild && this.state !== 'fighting' && attacker && attacker.health > 0) {
      this.target = attacker;
      this.state = 'fighting';
      this.actionTimer = 0.5;
    }
  }

  die(gameMap) {
    gameState.addLog(`${this.name} has died.`, 'danger');
    gameAudio.playDeath();

    // Drop inventory
    if (this.inventory.amount > 0) {
      // Simply lose it, or dump on ground
    }

    // Remove from villagers list
    const idx = gameState.villagers.findIndex(v => v.id === this.id);
    if (idx !== -1) gameState.villagers.splice(idx, 1);

    // If mating, release partner
    if (this.state === 'mating' && this.target) {
      this.target.state = 'idle';
      this.target.target = null;
    }

    gameState.checkGameOver();
  }

  // Helper behaviors
  wander(gameMap) {
    if (Math.random() < 0.25) { // 25% chance to wander each cycle
      const rx = this.gridX + Math.floor((Math.random() - 0.5) * 4);
      const ry = this.gridY + Math.floor((Math.random() - 0.5) * 4);
      if (rx >= 0 && rx < gameMap.width && ry >= 0 && ry < gameMap.height && !gameMap.collisionGrid[ry][rx]) {
        this.path = gameMap.findPath(this.gridX, this.gridY, rx, ry);
        this.state = 'moving';
        this.target = null;
      }
    }
  }

  patrolCenter(gameMap) {
    const cx = Math.floor(gameMap.width / 2);
    const cy = Math.floor(gameMap.height / 2);
    const rx = cx + Math.floor((Math.random() - 0.5) * 6);
    const ry = cy + Math.floor((Math.random() - 0.5) * 6);
    if (rx >= 0 && rx < gameMap.width && ry >= 0 && ry < gameMap.height && !gameMap.collisionGrid[ry][rx]) {
      this.path = gameMap.findPath(this.gridX, this.gridY, rx, ry);
      this.state = 'moving';
    }
  }

  distTo(x, y) {
    return Math.sqrt((this.gridX - x) ** 2 + (this.gridY - y) ** 2);
  }

  findClosestResource(type, gameMap) {
    let closest = null;
    let minDist = 999;
    
    gameMap.resources.forEach(r => {
      if (r.type !== type) return;
      const d = this.distTo(r.x, r.y);
      if (d < minDist) {
        minDist = d;
        closest = r;
      }
    });

    return closest;
  }

  findClosestBuilding(type) {
    let closest = null;
    let minDist = 999;

    gameState.buildings.forEach(b => {
      if (b.type !== type || !b.isBuilt) return;
      const d = this.distTo(b.x, b.y);
      if (d < minDist) {
        minDist = d;
        closest = b;
      }
    });

    return closest;
  }

  findClosestEnemy() {
    let closest = null;
    let minDist = 999;

    gameState.enemies.forEach(e => {
      if (e.health <= 0) return;
      const d = this.distTo(Math.floor(e.visualX), Math.floor(e.visualY));
      if (d < minDist) {
        minDist = d;
        closest = e;
      }
    });

    return closest;
  }

  resetInventory() {
    this.inventory.type = null;
    this.inventory.amount = 0;
  }

  spawnParticle(symbol) {
    gameState.particles.push({
      symbol,
      x: this.visualX,
      y: this.visualY - 0.5,
      life: 1.0, // 1 second
      vx: (Math.random() - 0.5) * 0.5,
      vy: -1.0 - Math.random() * 0.5
    });
  }
}

// Enemy Raider (Cannibal) Class
export class Enemy {
  constructor(id, x, y) {
    this.id = id;
    this.health = 80;
    this.maxHealth = 80;
    this.damage = 12;
    this.speed = 1.3;

    this.gridX = x;
    this.gridY = y;
    this.visualX = x;
    this.visualY = y;

    this.facing = 'down';
    this.animFrame = 0;

    this.target = null; // Villager target
    this.path = [];
    this.attackTimer = 0;
  }

  update(deltaTime, gameMap) {
    this.animFrame += deltaTime * 5;

    if (this.health <= 0) {
      this.die();
      return;
    }

    this.attackTimer = Math.max(0, this.attackTimer - deltaTime);

    // AI logic: Find closest villager, pathfind to them, and attack
    let target = null;
    let minDist = 999;

    gameState.villagers.forEach(v => {
      const d = Math.sqrt((v.visualX - this.visualX) ** 2 + (v.visualY - this.visualY) ** 2);
      if (d < minDist) {
        minDist = d;
        target = v;
      }
    });

    if (target) {
      this.target = target;
      
      // If adjacent, attack
      if (minDist <= 1.2) {
        this.path = []; // stop moving
        if (this.attackTimer <= 0) {
          this.attackTimer = 1.5; // seconds
          target.takeDamage(this.damage, this);
          gameAudio.playCombatHit();
        }
      } else {
        // Move towards target
        // Pathfind periodically (say, once a second)
        if (this.path.length === 0 || Math.random() < 0.05) {
          this.path = gameMap.findPath(
            Math.floor(this.visualX), 
            Math.floor(this.visualY), 
            target.gridX, 
            target.gridY
          );
        }
        
        this.moveAlongPath(deltaTime);
      }
    } else {
      // Walk towards center to loot/burn Huts
      if (this.path.length === 0) {
        this.path = gameMap.findPath(
          Math.floor(this.visualX), 
          Math.floor(this.visualY), 
          16, 
          16
        );
      }
      this.moveAlongPath(deltaTime);
    }
  }

  moveAlongPath(deltaTime) {
    if (this.path.length === 0) return;

    const nextTile = this.path[0];
    const dx = nextTile.x - this.visualX;
    const dy = nextTile.y - this.visualY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');

    const step = this.speed * deltaTime;

    if (dist <= step) {
      this.visualX = nextTile.x;
      this.visualY = nextTile.y;
      this.gridX = nextTile.x;
      this.gridY = nextTile.y;
      this.path.shift();
    } else {
      this.visualX += (dx / dist) * step;
      this.visualY += (dy / dist) * step;
    }
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.spawnParticle('💥');
  }

  die() {
    gameState.addLog(`A cannibal raider was defeated!`, 'good');
    gameState.stats.raidsDefeated++;
    
    // Remove from active list
    const idx = gameState.enemies.findIndex(e => e.id === this.id);
    if (idx !== -1) gameState.enemies.splice(idx, 1);
    
    // Check if raid is completely over
    if (gameState.enemies.length === 0 && gameState.activeRaid) {
      gameState.activeRaid = false;
      gameState.danger = 0;
      gameState.addLog(`The cannibal raid has been successfully repelled!`, 'good');
    }
  }

  spawnParticle(symbol) {
    gameState.particles.push({
      symbol,
      x: this.visualX,
      y: this.visualY - 0.5,
      life: 0.8,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.8
    });
  }
}

// Wildlife Animal Class
export class Animal {
  constructor(id, type, x, y) {
    this.id = id;
    this.type = type; // 'rabbit', 'boar', 'mammoth'
    
    // Balanced parameters based on type
    if (type === 'rabbit') {
      this.health = 20;
      this.maxHealth = 20;
      this.speed = 2.0;
      this.foodYield = 30;
      this.isHostile = false;
      this.damage = 0;
    } else if (type === 'boar') {
      this.health = 70;
      this.maxHealth = 70;
      this.speed = 1.4;
      this.foodYield = 100;
      this.isHostile = false; // only attacks when hit
      this.damage = 10;
    } else if (type === 'mammoth') {
      this.health = 250;
      this.maxHealth = 250;
      this.speed = 0.8;
      this.foodYield = 350;
      this.isHostile = false;
      this.damage = 25;
    }

    this.gridX = x;
    this.gridY = y;
    this.visualX = x;
    this.visualY = y;
    
    this.facing = 'down';
    this.animFrame = 0;
    this.path = [];
    this.wanderTimer = Math.random() * 3;
    
    this.combatTarget = null;
    this.attackTimer = 0;
  }

  update(deltaTime, gameMap) {
    this.animFrame += deltaTime * 3;

    if (this.health <= 0) {
      this.die();
      return;
    }

    // Hostile counter-attack logic
    if (this.isHostile && this.combatTarget) {
      if (this.combatTarget.health <= 0) {
        this.isHostile = false;
        this.combatTarget = null;
      } else {
        const dist = Math.sqrt((this.combatTarget.visualX - this.visualX) ** 2 + (this.combatTarget.visualY - this.visualY) ** 2);
        
        if (dist <= 1.2) {
          this.path = []; // stop moving
          this.attackTimer -= deltaTime;
          if (this.attackTimer <= 0) {
            this.attackTimer = 1.8;
            this.combatTarget.takeDamage(this.damage, this);
            gameAudio.playCombatHit();
          }
        } else {
          // Track target
          if (this.path.length === 0 || Math.random() < 0.1) {
            this.path = gameMap.findPath(Math.floor(this.visualX), Math.floor(this.visualY), this.combatTarget.gridX, this.combatTarget.gridY);
          }
          this.moveAlongPath(deltaTime);
        }
        return;
      }
    }

    // Regular peaceful wandering
    this.wanderTimer -= deltaTime;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = Math.random() * 4 + 2;
      const rx = this.gridX + Math.floor((Math.random() - 0.5) * 5);
      const ry = this.gridY + Math.floor((Math.random() - 0.5) * 5);
      if (rx >= 0 && rx < gameMap.width && ry >= 0 && ry < gameMap.height && !gameMap.collisionGrid[ry][rx]) {
        this.path = gameMap.findPath(this.gridX, this.gridY, rx, ry);
      }
    }

    this.moveAlongPath(deltaTime);
  }

  moveAlongPath(deltaTime) {
    if (this.path.length === 0) return;

    const nextTile = this.path[0];
    const dx = nextTile.x - this.visualX;
    const dy = nextTile.y - this.visualY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');

    const step = this.speed * deltaTime;

    if (dist <= step) {
      this.visualX = nextTile.x;
      this.visualY = nextTile.y;
      this.gridX = nextTile.x;
      this.gridY = nextTile.y;
      this.path.shift();
    } else {
      this.visualX += (dx / dist) * step;
      this.visualY += (dy / dist) * step;
    }
  }

  takeDamage(amount, attacker) {
    this.health = Math.max(0, this.health - amount);
    this.spawnParticle('💥');
    
    // Retaliate if not a rabbit
    if (this.type !== 'rabbit') {
      this.isHostile = true;
      this.combatTarget = attacker;
      this.speed = this.speed * 1.3; // run faster when angry
    }
  }

  die() {
    gameState.addLog(`A wild ${this.type} was hunted, yielding +${this.foodYield} raw food!`, 'good');
    
    // Add raw food to inventory
    gameState.addRawFood(this.foodYield);
    
    // Remove from active list
    const idx = gameState.animals.findIndex(a => a.id === this.id);
    if (idx !== -1) gameState.animals.splice(idx, 1);
  }

  spawnParticle(symbol) {
    gameState.particles.push({
      symbol,
      x: this.visualX,
      y: this.visualY - 0.5,
      life: 0.8,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.8
    });
  }
}
