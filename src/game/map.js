import { gameState } from './state.js';

export class GameMap {
  constructor(width = 32, height = 32) {
    this.width = width;
    this.height = height;
    this.tileSize = 64; // Visual rendering size of a tile

    this.grid = []; // 2D array of tile types: 'grass', 'water', 'sand'
    this.collisionGrid = []; // 2D array of booleans: true = blocked
    this.heightGrid = []; // 2D array of integers: 0 = water, 1 = plains, 2 = hill
    this.resources = []; // List of resource instances: Trees, Rocks, etc.
    this.resourceIdCounter = 0;

    this.generateTerrain();
    this.spawnInitialResources();
  }

  // Create a natural prehistoric landscape
  generateTerrain() {
    this.grid = [];
    this.collisionGrid = [];

    // Initialize map with grass
    for (let y = 0; y < this.height; y++) {
      const row = [];
      const colRow = [];
      for (let x = 0; x < this.width; x++) {
        row.push('grass');
        colRow.push(false);
      }
      this.grid.push(row);
      this.collisionGrid.push(colRow);
    }

    // Generate a beautiful diagonal river flowing from top-left to bottom-right
    // River equation: y = x + offset + noise
    const riverOffset = -2;
    for (let x = 0; x < this.width; x++) {
      // Create a meandering river center
      const center = x + riverOffset + Math.sin(x * 0.4) * 2;
      const yCenter = Math.floor(center);
      
      // Make it 2-3 tiles wide
      for (let y = yCenter - 1; y <= yCenter + 1; y++) {
        if (y >= 0 && y < this.height) {
          this.grid[y][x] = 'water';
          this.collisionGrid[y][x] = true; // Water is impassable
          
          // Add sand buffer around water
          this.addSandBuffer(x, y - 2);
          this.addSandBuffer(x, y + 2);
          this.addSandBuffer(x - 1, y);
          this.addSandBuffer(x + 1, y);
        }
      }
    }

    // Spawn a small lake at the bottom left
    const lakeCX = 6;
    const lakeCY = 24;
    const lakeRadius = 4;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const dist = Math.sqrt((x - lakeCX) ** 2 + (y - lakeCY) ** 2);
        if (dist < lakeRadius) {
          this.grid[y][x] = 'water';
          this.collisionGrid[y][x] = true;
        } else if (dist < lakeRadius + 1.2 && this.grid[y][x] !== 'water') {
          this.grid[y][x] = 'sand';
        }
      }
    }

    // Generate bridges over water at x = 8 and x = 24
    [8, 24].forEach(bx => {
      for (let y = 0; y < this.height; y++) {
        if (this.grid[y][bx] === 'water') {
          this.grid[y][bx] = 'bridge';
          this.collisionGrid[y][bx] = false; // walkable
        }
      }
    });

    // Generate crossroads dirt paths in the center
    const cx = Math.floor(this.width / 2);
    const cy = Math.floor(this.height / 2);
    for (let i = -6; i <= 6; i++) {
      for (let dy = -1; dy <= 0; dy++) {
        const hx = cx + i;
        const hy = cy + dy;
        if (hx >= 0 && hx < this.width && hy >= 0 && hy < this.height) {
          if (this.grid[hy][hx] === 'grass' || this.grid[hy][hx] === 'sand') {
            this.grid[hy][hx] = 'dirt';
          }
        }
      }
      for (let dx = -1; dx <= 0; dx++) {
        const hx = cx + dx;
        const hy = cy + i;
        if (hx >= 0 && hx < this.width && hy >= 0 && hy < this.height) {
          if (this.grid[hy][hx] === 'grass' || this.grid[hy][hx] === 'sand') {
            this.grid[hy][hx] = 'dirt';
          }
        }
      }
    }

    // Generate height grid
    this.heightGrid = [];
    for (let y = 0; y < this.height; y++) {
      const hRow = [];
      for (let x = 0; x < this.width; x++) {
        hRow.push(1); // default plains height
      }
      this.heightGrid.push(hRow);
    }

    // Circular hills/plateaus overlay
    const hills = [
      { cx: 28, cy: 5, r: 6, maxH: 2 },
      { cx: 4, cy: 28, r: 5, maxH: 2 },
      { cx: 27, cy: 26, r: 6, maxH: 2 }
    ];

    hills.forEach(hill => {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const dist = Math.sqrt((x - hill.cx) ** 2 + (y - hill.cy) ** 2);
          if (dist < hill.r) {
            const h = dist < hill.r * 0.55 ? hill.maxH : hill.maxH - 1;
            this.heightGrid[y][x] = Math.max(this.heightGrid[y][x], h);
          }
        }
      }
    });

    // Make sure water is at height 0
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x] === 'water') {
          this.heightGrid[y][x] = 0;
        }
      }
    }
  }

  addSandBuffer(x, y) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      if (this.grid[y][x] === 'grass') {
        this.grid[y][x] = 'sand';
      }
    }
  }

  spawnInitialResources() {
    this.resources = [];
    
    // Spawn forest clusters (wood)
    this.spawnResourceCluster(5, 5, 8, 'tree', 150);
    this.spawnResourceCluster(24, 6, 9, 'tree', 150);
    this.spawnResourceCluster(25, 25, 7, 'tree', 150);

    // Spawn stone clusters (mountains/rocks)
    this.spawnResourceCluster(18, 4, 4, 'rock', 200);
    this.spawnResourceCluster(5, 15, 4, 'rock', 200);
    this.spawnResourceCluster(26, 18, 5, 'rock', 200);

    // Spawn berry bushes (food) near the center
    this.spawnResourceCluster(12, 16, 5, 'bush', 80);
    this.spawnResourceCluster(19, 14, 4, 'bush', 80);

    // Spawn fishing holes in the river / lake
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x] === 'water' && Math.random() < 0.04) {
          this.addResource(x, y, 'fish', 120);
        }
      }
    }
  }

  spawnResourceCluster(cx, cy, count, type, amount) {
    let spawned = 0;
    let attempts = 0;
    
    while (spawned < count && attempts < 100) {
      attempts++;
      // Distribute randomly around center with Gaussian bias
      const rx = Math.round(cx + (Math.random() - 0.5) * 5);
      const ry = Math.round(cy + (Math.random() - 0.5) * 5);

      if (this.isValidForResource(rx, ry)) {
        this.addResource(rx, ry, type, amount);
        spawned++;
      }
    }
  }

  isValidForResource(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    
    // Water is only for fish; Grass & Sand are for wood/stone/bush
    const tile = this.grid[y][x];
    if (tile === 'water') return false;

    // Check collision grid (must not be blocked by another resource or building)
    if (this.collisionGrid[y][x]) return false;

    // Check distance to center (keep starting area relatively clear)
    const centerX = Math.floor(this.width / 2);
    const centerY = Math.floor(this.height / 2);
    const distToCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
    if (distToCenter < 4) return false;

    return true;
  }

  addResource(x, y, type, amount) {
    const res = {
      id: this.resourceIdCounter++,
      x,
      y,
      type, // 'tree', 'rock', 'bush', 'fish'
      amount,
      maxAmount: amount,
    };
    this.resources.push(res);
    
    // Update collision grid if it's not fish (fish are in water, which is already blocked)
    if (type !== 'fish') {
      this.collisionGrid[y][x] = true;
    }
  }

  // Called periodically to regrow trees, fish, and bushes
  updateRegrowth(deltaTime) {
    // 0.2% chance per tick to spawn a sapling or bush
    if (Math.random() < 0.005) {
      const type = Math.random() < 0.7 ? 'tree' : 'bush';
      const rx = Math.floor(Math.random() * this.width);
      const ry = Math.floor(Math.random() * this.height);
      if (this.isValidForResource(rx, ry)) {
        this.addResource(rx, ry, type, type === 'tree' ? 100 : 60);
      }
    }

    // Regrow fish in water
    if (Math.random() < 0.002) {
      const rx = Math.floor(Math.random() * this.width);
      const ry = Math.floor(Math.random() * this.height);
      if (this.grid[ry]?.[rx] === 'water') {
        // Make sure no fish already exists there
        const existing = this.resources.find(r => r.x === rx && r.y === ry);
        if (!existing) {
          this.addResource(rx, ry, 'fish', 100);
        }
      }
    }
  }

  harvestResource(id, amount) {
    const resIdx = this.resources.findIndex(r => r.id === id);
    if (resIdx === -1) return 0;

    const res = this.resources[resIdx];
    const harvested = Math.min(amount, res.amount);
    res.amount -= harvested;

    if (res.amount <= 0) {
      // Remove resource collision if not fish
      if (res.type !== 'fish') {
        this.collisionGrid[res.y][res.x] = false;
      }
      this.resources.splice(resIdx, 1);
    }

    return harvested;
  }

  // Verify if a building can be built at grid (x, y) with width and height
  canPlaceBuilding(x, y, w, h) {
    // Buildings must be inside the map
    if (x < 0 || x + w > this.width || y < 0 || y + h > this.height) return false;

    // Check grid cell by cell
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        // Can't build on water
        if (this.grid[cy][cx] === 'water') return false;
        // Can't build on occupied tiles
        if (this.collisionGrid[cy][cx]) return false;
      }
    }
    return true;
  }

  // Set collision block for placed buildings
  placeBuildingCollision(x, y, w, h, block = true) {
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        if (cx >= 0 && cx < this.width && cy >= 0 && cy < this.height) {
          this.collisionGrid[cy][cx] = block;
        }
      }
    }
  }

  // A* Pathfinding implementation (4-directional)
  findPath(startX, startY, endX, endY) {
    // If start and end are same
    if (startX === endX && startY === endY) return [];

    // Ensure coordinates are within bounds
    if (startX < 0 || startX >= this.width || startY < 0 || startY >= this.height ||
        endX < 0 || endX >= this.width || endY < 0 || endY >= this.height) {
      return [];
    }

    // Node structure
    class PathNode {
      constructor(x, y, parent = null, g = 0, h = 0) {
        this.x = x;
        this.y = y;
        this.parent = parent;
        this.g = g; // cost from start
        this.h = h; // heuristic cost to end
        this.f = g + h; // total cost
      }
    }

    // Manhattan distance heuristic
    const heuristic = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

    const openList = [];
    const closedSet = new Set();
    const key = (x, y) => `${x},${y}`;

    // Add starting node
    const startNode = new PathNode(startX, startY, null, 0, heuristic(startX, startY, endX, endY));
    openList.push(startNode);

    // Safety counter to prevent infinite loops
    let iterations = 0;
    const maxIterations = 1500;

    while (openList.length > 0 && iterations < maxIterations) {
      iterations++;

      // Sort openList to get lowest f score node
      openList.sort((a, b) => a.f - b.f);
      const current = openList.shift();

      // Add to closed set
      closedSet.add(key(current.x, current.y));

      // Reached destination
      if (current.x === endX && current.y === endY) {
        const path = [];
        let curr = current;
        while (curr.parent !== null) {
          path.push({ x: curr.x, y: curr.y });
          curr = curr.parent;
        }
        return path.reverse(); // returns path starting from first step
      }

      // Check 4 neighbors
      const neighbors = [
        { x: current.x, y: current.y - 1 }, // Up
        { x: current.x, y: current.y + 1 }, // Down
        { x: current.x - 1, y: current.y }, // Left
        { x: current.x + 1, y: current.y }  // Right
      ];

      for (const neighbor of neighbors) {
        const nx = neighbor.x;
        const ny = neighbor.y;

        // Verify bounds
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;

        // Skip if closed
        if (closedSet.has(key(nx, ny))) continue;

        // Skip if blocked, UNLESS it is the target destination (gathering from resources, targeting building)
        const isTarget = (nx === endX && ny === endY);
        if (this.collisionGrid[ny][nx] && !isTarget) continue;

        const gScore = current.g + 1;
        const hScore = heuristic(nx, ny, endX, endY);
        const neighborNode = new PathNode(nx, ny, current, gScore, hScore);

        // Check if neighbor is already in open list with a lower g score
        const existingNodeIdx = openList.findIndex(n => n.x === nx && n.y === ny);
        if (existingNodeIdx !== -1) {
          if (openList[existingNodeIdx].g > gScore) {
            openList[existingNodeIdx] = neighborNode; // Update with shorter path
          }
        } else {
          openList.push(neighborNode);
        }
      }
    }

    // Return empty if no path found
    return [];
  }
}
export default GameMap;
