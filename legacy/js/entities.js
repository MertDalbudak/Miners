/*
  Game Entities - Block, Player, Monster
*/

class Block {
  constructor(col, row, type, hitsRemaining = 1, emeraldVariant = null) {
    this.col = col;
    this.row = row;
    this.type = type;
    this.visible = true;
    this.hitsRemaining = hitsRemaining;
    this.emeraldVariant = emeraldVariant;
    this.isVoidTunnel = false; // Pre-generated void tunnel (monster spawn area)
  }

  getPixelX(blockSize) {
    return this.col * blockSize;
  }

  getPixelY(blockSize, cameraRow) {
    return (this.row - cameraRow) * blockSize;
  }
}

class Player {
  constructor(col, row) {
    this.col = col;
    this.row = row;
    this.facingLeft = false;
    this.pickaxeUses = 0;
    this.hasShield = false;
  }

  getPixelX(blockSize) {
    return this.col * blockSize;
  }

  getPixelY(blockSize, cameraRow) {
    return (this.row - cameraRow) * blockSize;
  }
}

class Monster {
  constructor(col, row) {
    this.col = col;
    this.row = row;
    this.lastMoveTime = 0;
    this.targetCol = col;
    this.targetRow = row;
  }

  getPixelX(blockSize) {
    return this.col * blockSize;
  }

  getPixelY(blockSize, cameraRow) {
    return (this.row - cameraRow) * blockSize;
  }

  canMoveTo(col, row, blocks, player, monsters) {
    if (col < 0 || col >= GameConfig.GRID_COLUMNS) return false;

    // Check if block exists and is solid
    const block = blocks.find(b => b.col === col && b.row === row && b.visible);
    if (block) return false;

    // Check other monsters
    const otherMonster = monsters.find(m => m !== this && m.col === col && m.row === row);
    if (otherMonster) return false;

    return true;
  }

  update(blocks, player, monsters, depth) {
    const now = Date.now();

    // Faster movement at greater depths
    const speedBonus = Math.min(depth / 50, 0.5);
    const moveInterval = GameConfig.MONSTER_MOVE_INTERVAL * (1 - speedBonus);

    if (now - this.lastMoveTime < moveInterval) {
      return false;
    }

    this.lastMoveTime = now;

    // Calculate distance to player
    const distToPlayer = Math.abs(this.col - player.col) + Math.abs(this.row - player.row);

    // Always hunt if close enough
    const shouldHunt = distToPlayer < 8 || Math.random() < GameConfig.MONSTER_HUNT_CHANCE;

    if (shouldHunt) {
      return this.huntPlayer(blocks, player, monsters);
    } else {
      return this.moveRandom(blocks, player, monsters);
    }
  }

  huntPlayer(blocks, player, monsters) {
    // A* pathfinding simplified - prioritize moves that get closer to player
    const moves = this.getPossibleMoves(blocks, player, monsters);

    if (moves.length === 0) return false;

    // Sort by distance to player (closest first)
    moves.sort((a, b) => {
      const distA = Math.abs(a.col - player.col) + Math.abs(a.row - player.row);
      const distB = Math.abs(b.col - player.col) + Math.abs(b.row - player.row);
      return distA - distB;
    });

    // Take the best move (closest to player)
    const bestMove = moves[0];
    this.col = bestMove.col;
    this.row = bestMove.row;

    return true;
  }

  moveRandom(blocks, player, monsters) {
    const moves = this.getPossibleMoves(blocks, player, monsters);

    if (moves.length === 0) return false;

    const randomMove = moves[Math.floor(Math.random() * moves.length)];
    this.col = randomMove.col;
    this.row = randomMove.row;

    return true;
  }

  getPossibleMoves(blocks, player, monsters) {
    // Cardinal directions only - no diagonal movement or attacks
    const directions = [
      { dc: 0, dr: 1 },   // down
      { dc: 0, dr: -1 },  // up
      { dc: 1, dr: 0 },   // right
      { dc: -1, dr: 0 }   // left
    ];

    const moves = [];

    for (const dir of directions) {
      const newCol = this.col + dir.dc;
      const newRow = this.row + dir.dr;

      if (this.canMoveTo(newCol, newRow, blocks, player, monsters)) {
        moves.push({ col: newCol, row: newRow });
      }
    }

    return moves;
  }

  isTouchingPlayer(player) {
    // Monster eats player only when on same cell or cardinally adjacent (not diagonal)
    if (this.col === player.col && this.row === player.row) return true;

    // Check cardinal directions only (up, down, left, right)
    const dc = Math.abs(this.col - player.col);
    const dr = Math.abs(this.row - player.row);

    // Adjacent means exactly 1 step in one direction only (not diagonal)
    return (dc === 1 && dr === 0) || (dc === 0 && dr === 1);
  }

  isAdjacentToPlayer(player) {
    const dc = Math.abs(this.col - player.col);
    const dr = Math.abs(this.row - player.row);
    // Cardinal adjacency only
    return (dc === 1 && dr === 0) || (dc === 0 && dr === 1);
  }
}
