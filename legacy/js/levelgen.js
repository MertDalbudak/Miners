/*
  Level Generator - creates blocks and ensures reachable paths
*/

class LevelGenerator {
  constructor() {
    this.blocks = [];
    this.torchRow = 0;
    this.torchCol = 0;
    this.lastTorchRow = 0;
    this.maxGeneratedRow = 0;
    this.voidTunnels = new Set(); // Track void tunnel positions as "col,row" strings
    this.tunnelMap = new Map(); // Maps "col,row" to tunnel ID
    this.nextTunnelId = 0;
    this.lastTunnelRow = 0;
    this.pendingMonsterSpawns = []; // Monster spawn positions decided at tunnel generation
  }

  generateInitialLevel(startRow) {
    this.blocks = [];
    this.maxGeneratedRow = 0;
    this.lastTorchRow = 0;
    this.voidTunnels = new Set();
    this.tunnelMap = new Map();
    this.nextTunnelId = 0;
    this.lastTunnelRow = 0;
    this.pendingMonsterSpawns = [];

    // Generate enough rows for initial view plus buffer
    const endRow = startRow + GameConfig.VISIBLE_ROWS + 10;

    for (let row = startRow; row <= endRow; row++) {
      this.generateRow(row);
    }

    // Place first torch near bottom of visible area
    this.placeTorch(startRow + GameConfig.VISIBLE_ROWS - 2);

    // Ensure no TNT death lines in generated rows
    this.ensureNoDeathLines(startRow, endRow);

    return this.blocks;
  }

  generateRow(row) {
    if (row <= this.maxGeneratedRow && this.blocks.some(b => b.row === row)) {
      return; // Row already exists
    }

    for (let col = 0; col < GameConfig.GRID_COLUMNS; col++) {
      const blockData = this.getRandomBlockData(row);
      this.blocks.push(new Block(col, row, blockData.type, blockData.hits, blockData.emeraldVariant));
    }

    this.maxGeneratedRow = Math.max(this.maxGeneratedRow, row);

    // Ensure this row has at least one passable block (no full TNT row)
    this.ensureRowPassable(row);

    // Try to generate void tunnels after monster spawn depth
    const depth = row - GameConfig.SURFACE_ROWS;
    if (depth >= GameConfig.MONSTER_MIN_DEPTH) {
      this.tryGenerateVoidTunnel(row);
    }
  }

  tryGenerateVoidTunnel(row) {
    // Don't generate tunnels too close together (minimum 8 rows apart)
    if (row - this.lastTunnelRow < 8) return;

    // 15% chance to generate a tunnel on eligible rows
    if (Math.random() > 0.15) return;

    this.generateZTunnel(row);
    this.lastTunnelRow = row;
  }

  generateZTunnel(startRow) {
    // Generate a Z-shaped tunnel with 3-5 blocks
    const tunnelLength = 3 + Math.floor(Math.random() * 3); // 3-5 blocks
    const startCol = Math.floor(Math.random() * (GameConfig.GRID_COLUMNS - 2)) + 1;

    let col = startCol;
    let row = startRow;
    const tunnelPositions = [];
    const tunnelId = this.nextTunnelId++;

    for (let i = 0; i < tunnelLength; i++) {
      // Make sure we stay in bounds
      if (col < 0 || col >= GameConfig.GRID_COLUMNS) break;

      tunnelPositions.push({ col, row });

      // Z-shape pattern: go down, then horizontal, then down again
      if (i < tunnelLength - 1) {
        if (i % 2 === 0) {
          // Move horizontally (left or right)
          const direction = Math.random() > 0.5 ? 1 : -1;
          col = Math.max(0, Math.min(GameConfig.GRID_COLUMNS - 1, col + direction));
        } else {
          // Move down
          row++;
        }
      }
    }

    // Create the tunnel by making blocks invisible and tracking as void
    const validTunnelPositions = [];
    for (const pos of tunnelPositions) {
      const block = this.blocks.find(b => b.col === pos.col && b.row === pos.row);
      if (block) {
        // Don't create void over TNT or torch
        if (block.type === BlockType.TNT || block.type === BlockType.TORCH) {
          continue;
        }
        block.visible = false;
        block.isVoidTunnel = true; // Mark as pre-generated void
        const key = `${pos.col},${pos.row}`;
        this.voidTunnels.add(key);
        this.tunnelMap.set(key, tunnelId);
        validTunnelPositions.push(pos);
      }
    }

    // Decide monster spawn at tunnel generation time (one monster per tunnel max)
    if (validTunnelPositions.length > 0 && Math.random() < GameConfig.MONSTER_SPAWN_CHANCE) {
      // Pick a random position in the tunnel for the monster
      const spawnPos = validTunnelPositions[Math.floor(Math.random() * validTunnelPositions.length)];
      this.pendingMonsterSpawns.push({
        col: spawnPos.col,
        row: spawnPos.row,
        tunnelId: tunnelId
      });
    }
  }

  isVoidTunnel(col, row) {
    return this.voidTunnels.has(`${col},${row}`);
  }

  getTunnelId(col, row) {
    return this.tunnelMap.get(`${col},${row}`);
  }

  getVoidTunnelPositions() {
    const positions = [];
    for (const key of this.voidTunnels) {
      const [col, row] = key.split(',').map(Number);
      positions.push({ col, row });
    }
    return positions;
  }

  // Get pending monster spawns and clear the list
  getPendingMonsterSpawns() {
    const spawns = this.pendingMonsterSpawns;
    this.pendingMonsterSpawns = [];
    return spawns;
  }

  // Check if a position is adjacent to (or on) a void tunnel
  isAdjacentToVoidTunnel(col, row) {
    // Check the position itself and all 8 surrounding cells
    const directions = [
      { dc: 0, dr: 0 },   // self
      { dc: -1, dr: -1 }, { dc: 0, dr: -1 }, { dc: 1, dr: -1 },
      { dc: -1, dr: 0 },                      { dc: 1, dr: 0 },
      { dc: -1, dr: 1 },  { dc: 0, dr: 1 },  { dc: 1, dr: 1 }
    ];

    for (const dir of directions) {
      const checkCol = col + dir.dc;
      const checkRow = row + dir.dr;
      if (this.voidTunnels.has(`${checkCol},${checkRow}`)) {
        return true;
      }
    }
    return false;
  }

  ensureRowPassable(row) {
    const rowBlocks = this.blocks.filter(b => b.row === row);
    const tntBlocks = rowBlocks.filter(b => b.type === BlockType.TNT);

    // If all or all-but-one blocks are TNT, convert some to dirt
    if (tntBlocks.length >= GameConfig.GRID_COLUMNS - 1) {
      // Keep at least 2 non-TNT paths
      const toConvert = tntBlocks.slice(0, 2);
      for (const block of toConvert) {
        block.type = BlockType.DIRT;
      }
    }
  }

  ensureNoDeathLines(startRow, endRow) {
    for (let row = startRow; row <= endRow; row++) {
      this.ensureRowPassable(row);
    }
  }

  getRandomBlockData(row) {
    // First row is always dirt for easy entry
    if (row === GameConfig.SURFACE_ROWS) {
      return { type: BlockType.DIRT, hits: 1, emeraldVariant: null };
    }

    const depth = row - GameConfig.SURFACE_ROWS;
    const rand = Math.random() * 1000;

    // Difficulty scaling
    const tntBonus = depth * GameConfig.TNT_INCREASE_PER_DEPTH;
    const adjustedTntMax = Math.min(GameConfig.TNT_CHANCE_MAX + tntBonus, 300);

    let threshold = 0;

    // Ultra rare emerald (<0.1% = 1 out of 1000)
    threshold += GameConfig.EMERALD_CHANCE;
    if (rand < threshold && depth > 30) {
      const variantIndex = Math.floor(Math.random() * EmeraldVariants.length);
      return { type: BlockType.EMERALD, hits: 1, emeraldVariant: EmeraldVariants[variantIndex] };
    }

    // Extremely rare pickaxe
    threshold += GameConfig.PICKAXE_CHANCE;
    if (rand < threshold && depth > 5) {
      return { type: BlockType.PICKAXE, hits: 1, emeraldVariant: null };
    }

    // Diamond - only after 60m, fixed rare chance
    threshold += GameConfig.DIAMOND_CHANCE;
    if (rand < threshold && depth >= GameConfig.DIAMOND_MIN_DEPTH) {
      return { type: BlockType.DIAMOND, hits: 1, emeraldVariant: null };
    }

    // Gold - starts at 40m, gradually increases
    if (depth >= GameConfig.GOLD_MIN_DEPTH) {
      const goldProgress = Math.min((depth - GameConfig.GOLD_MIN_DEPTH) / 40, 1);
      const goldChance = GameConfig.GOLD_CHANCE_MAX * goldProgress;
      threshold += goldChance;
      if (rand < threshold) {
        return { type: BlockType.GOLD, hits: 1, emeraldVariant: null };
      }
    }

    // Iron - starts at 20m, gradually increases
    if (depth >= GameConfig.IRON_MIN_DEPTH) {
      const ironProgress = Math.min((depth - GameConfig.IRON_MIN_DEPTH) / 30, 1);
      const ironChance = GameConfig.IRON_CHANCE_MAX * ironProgress;
      threshold += ironChance;
      if (rand < threshold) {
        return { type: BlockType.IRON, hits: 1, emeraldVariant: null };
      }
    }

    // Coal - available from the start, the early game ore
    threshold += GameConfig.COAL_CHANCE;
    if (rand < threshold) {
      return { type: BlockType.COAL, hits: 1, emeraldVariant: null };
    }

    // TNT
    if (rand >= GameConfig.TNT_CHANCE_MIN + threshold && rand <= adjustedTntMax + threshold) {
      return { type: BlockType.TNT, hits: 1, emeraldVariant: null };
    }

    // Obsidian - hardest block, 3 hits, appears after 70m
    if (depth >= GameConfig.OBSIDIAN_MIN_DEPTH) {
      const obsidianProgress = Math.min((depth - GameConfig.OBSIDIAN_MIN_DEPTH) / 30, 1);
      const obsidianChance = GameConfig.OBSIDIAN_CHANCE_MAX * obsidianProgress;
      if (Math.random() * 1000 < obsidianChance) {
        return { type: BlockType.OBSIDIAN, hits: GameConfig.OBSIDIAN_HITS, emeraldVariant: null };
      }
    }

    // Reinforced stone - 2 hits, appears after 30m, increases with depth
    if (depth >= GameConfig.REINFORCED_STONE_MIN_DEPTH) {
      const reinforcedProgress = Math.min((depth - GameConfig.REINFORCED_STONE_MIN_DEPTH) / 20, 1);
      // Chance increases significantly with depth
      const reinforcedChance = GameConfig.REINFORCED_STONE_CHANCE_MAX * (0.5 + reinforcedProgress * 0.5);
      if (Math.random() * 1000 < reinforcedChance) {
        return { type: BlockType.REINFORCED_STONE, hits: GameConfig.REINFORCED_STONE_HITS, emeraldVariant: null };
      }
    }

    // Regular stone - only before 40m depth
    if (depth < GameConfig.BASIC_STONE_MAX_DEPTH) {
      if (Math.random() * 1000 < GameConfig.STONE_CHANCE_BASE) {
        return { type: BlockType.STONE, hits: 1, emeraldVariant: null };
      }
    }

    // Default to dirt
    return { type: BlockType.DIRT, hits: 1, emeraldVariant: null };
  }

  placeTorch(nearRow) {
    const variance = Math.floor(Math.random() *
      (GameConfig.TORCH_MAX_ROWS_FROM_BOTTOM - GameConfig.TORCH_MIN_ROWS_FROM_BOTTOM + 1));

    this.torchRow = nearRow - variance;
    this.torchCol = this.findSafeTorchColumn(this.torchRow);
    this.lastTorchRow = this.torchRow;

    const block = this.blocks.find(b => b.col === this.torchCol && b.row === this.torchRow);
    if (block) {
      block.type = BlockType.TORCH;
      this.removeTNTNearTorch();
      this.removeVoidTunnelsNearTorch();
      this.ensurePathToTorch();
    }
  }

  placeNextTorch(nearRow) {
    // Ensure minimum 6 rows spacing from last torch
    const minRow = this.lastTorchRow + GameConfig.TORCH_MIN_SPACING;
    const targetRow = Math.max(nearRow, minRow);

    const variance = Math.floor(Math.random() *
      (GameConfig.TORCH_MAX_ROWS_FROM_BOTTOM - GameConfig.TORCH_MIN_ROWS_FROM_BOTTOM + 1));

    this.torchRow = targetRow - variance;
    this.torchCol = this.findSafeTorchColumn(this.torchRow);
    this.lastTorchRow = this.torchRow;

    const block = this.blocks.find(b => b.col === this.torchCol && b.row === this.torchRow);
    if (block) {
      block.type = BlockType.TORCH;
      this.removeTNTNearTorch();
      this.removeVoidTunnelsNearTorch();
      this.ensurePathToTorch();
    }
  }

  // Find a column for torch that is not adjacent to void tunnels
  findSafeTorchColumn(row) {
    // Try random positions first
    const shuffledCols = [];
    for (let i = 0; i < GameConfig.GRID_COLUMNS; i++) {
      shuffledCols.push(i);
    }
    // Shuffle array
    for (let i = shuffledCols.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledCols[i], shuffledCols[j]] = [shuffledCols[j], shuffledCols[i]];
    }

    // Find first column not adjacent to void tunnel
    for (const col of shuffledCols) {
      if (!this.isAdjacentToVoidTunnel(col, row)) {
        return col;
      }
    }

    // If all columns are near void tunnels, return random (will be fixed by removeVoidTunnelsNearTorch)
    return Math.floor(Math.random() * GameConfig.GRID_COLUMNS);
  }

  // Remove void tunnels near the torch to prevent monster spawns
  removeVoidTunnelsNearTorch() {
    const directions = [
      { dc: 0, dr: 0 },   // self
      { dc: -1, dr: -1 }, { dc: 0, dr: -1 }, { dc: 1, dr: -1 },
      { dc: -1, dr: 0 },                      { dc: 1, dr: 0 },
      { dc: -1, dr: 1 },  { dc: 0, dr: 1 },  { dc: 1, dr: 1 }
    ];

    for (const dir of directions) {
      const adjCol = this.torchCol + dir.dc;
      const adjRow = this.torchRow + dir.dr;
      const key = `${adjCol},${adjRow}`;

      if (this.voidTunnels.has(key)) {
        // Remove from void tunnel tracking
        this.voidTunnels.delete(key);
        this.tunnelMap.delete(key);

        // Make the block visible again (fill with dirt)
        const block = this.blocks.find(b => b.col === adjCol && b.row === adjRow);
        if (block && !block.visible) {
          block.visible = true;
          block.isVoidTunnel = false;
          block.type = BlockType.DIRT;
          block.hitsRemaining = 1;
        }
      }
    }
  }

  removeTNTNearTorch() {
    // Remove TNT from all adjacent cells (8 directions + same cell neighbors)
    const directions = [
      { dc: -1, dr: -1 }, { dc: 0, dr: -1 }, { dc: 1, dr: -1 },
      { dc: -1, dr: 0 },                      { dc: 1, dr: 0 },
      { dc: -1, dr: 1 },  { dc: 0, dr: 1 },  { dc: 1, dr: 1 }
    ];

    for (const dir of directions) {
      const adjCol = this.torchCol + dir.dc;
      const adjRow = this.torchRow + dir.dr;

      if (adjCol < 0 || adjCol >= GameConfig.GRID_COLUMNS) continue;

      const adjBlock = this.blocks.find(b => b.col === adjCol && b.row === adjRow);
      if (adjBlock && adjBlock.type === BlockType.TNT) {
        adjBlock.type = BlockType.DIRT;
      }
    }
  }

  ensurePathToTorch() {
    const minRow = Math.min(...this.blocks.filter(b => b.visible !== false).map(b => b.row));
    let col = Math.floor(GameConfig.GRID_COLUMNS / 2);
    let row = minRow;

    if (this.hasPathToTorch(col, row)) {
      return;
    }

    this.carvePath(col, row);
  }

  hasPathToTorch(startCol, startRow) {
    const visited = new Set();
    const queue = [{ col: startCol, row: startRow }];

    while (queue.length > 0) {
      const current = queue.shift();
      const key = `${current.col},${current.row}`;

      if (visited.has(key)) continue;
      visited.add(key);

      if (current.col === this.torchCol && current.row === this.torchRow) {
        return true;
      }

      const neighbors = [
        { col: current.col, row: current.row + 1 },
        { col: current.col - 1, row: current.row },
        { col: current.col + 1, row: current.row }
      ];

      for (const next of neighbors) {
        if (next.col < 0 || next.col >= GameConfig.GRID_COLUMNS) continue;
        if (next.row > this.torchRow + 2) continue;

        const nextKey = `${next.col},${next.row}`;
        if (visited.has(nextKey)) continue;

        const block = this.blocks.find(b => b.col === next.col && b.row === next.row);
        if (!block) continue;

        // Can't path through stone blocks or TNT
        if (block.type !== BlockType.STONE &&
            block.type !== BlockType.REINFORCED_STONE &&
            block.type !== BlockType.OBSIDIAN &&
            block.type !== BlockType.TNT) {
          queue.push(next);
        }
      }
    }

    return false;
  }

  carvePath(startCol, startRow) {
    let col = startCol;
    let row = startRow;

    while (row < this.torchRow) {
      row++;

      if (col < this.torchCol && Math.random() > 0.3) {
        col++;
      } else if (col > this.torchCol && Math.random() > 0.3) {
        col--;
      }

      col = Math.max(0, Math.min(GameConfig.GRID_COLUMNS - 1, col));

      const block = this.blocks.find(b => b.col === col && b.row === row);
      if (block && (block.type === BlockType.STONE ||
                    block.type === BlockType.REINFORCED_STONE ||
                    block.type === BlockType.OBSIDIAN ||
                    block.type === BlockType.TNT)) {
        block.type = BlockType.DIRT;
        block.hitsRemaining = 1;
      }
    }
  }

  extendLevel(currentMaxRow, playerRow) {
    const targetRow = playerRow + GameConfig.VISIBLE_ROWS + 10;

    while (currentMaxRow < targetRow) {
      currentMaxRow++;
      this.generateRow(currentMaxRow);
    }

    return currentMaxRow;
  }

  getBlocks() {
    return this.blocks;
  }

  // Don't remove blocks - keep them all for death animation
  removeOldBlocks(minKeepRow) {
    // Intentionally empty - we keep all blocks now
  }
}
