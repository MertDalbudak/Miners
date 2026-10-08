/*
  Renderer - handles all drawing operations
*/

class Renderer {
  constructor(canvas, ctx, assets) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.assets = assets;
    this.patterns = {};
    this.blockSize = 0;
    this.visibleRows = GameConfig.VISIBLE_ROWS;
    this.isStandalone = false;
  }

  setBlockSize(size) {
    this.blockSize = size;
    this.createPatterns();
  }

  setVisibleRows(rows) {
    this.visibleRows = rows;
  }

  setStandaloneMode(isStandalone) {
    this.isStandalone = isStandalone;
  }

  createPatterns() {
    const dirtImg = this.assets.getImage('dirt');
    const goldImg = this.assets.getImage('gold');
    const stoneImg = this.assets.getImage('stone');
    const bgImg = this.assets.getImage('background');

    if (dirtImg) this.patterns.dirt = this.ctx.createPattern(dirtImg, 'repeat');
    if (goldImg) this.patterns.gold = this.ctx.createPattern(goldImg, 'repeat');
    if (stoneImg) this.patterns.stone = this.ctx.createPattern(stoneImg, 'repeat');
    if (bgImg) this.patterns.background = this.ctx.createPattern(bgImg, 'repeat');
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  fillBlack() {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawBackground(cameraRow) {
    this.ctx.fillStyle = '#030100';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const bgImg = this.assets.getImage('background');
    if (bgImg && this.patterns.background) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.06;
      const offsetY = -cameraRow * this.blockSize * 0.3;
      this.ctx.translate(0, offsetY % bgImg.height);
      this.ctx.fillStyle = this.patterns.background;
      this.ctx.fillRect(0, -bgImg.height, this.canvas.width, this.canvas.height + bgImg.height * 2);
      this.ctx.restore();
    }

    const surfaceY = (GameConfig.SURFACE_ROWS - cameraRow) * this.blockSize;
    if (surfaceY > 0) {
      const surface = this.assets.getImage('surface');
      if (surface) {
        this.ctx.drawImage(surface, 0, 0, this.canvas.width, Math.min(surfaceY, this.canvas.height));
      }

      if (surfaceY < this.canvas.height) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, surfaceY);
        this.ctx.strokeStyle = GameConfig.DIRT_STROKE;
        this.ctx.lineWidth = 2;
        this.ctx.lineTo(this.canvas.width, surfaceY);
        this.ctx.stroke();
        this.ctx.lineWidth = 1;
        this.ctx.closePath();
      }
    }
  }

  drawBlock(block, cameraRow) {
    const x = block.getPixelX(this.blockSize);
    const y = block.getPixelY(this.blockSize, cameraRow);

    if (y < -this.blockSize || y > this.canvas.height) return;

    switch (block.type) {
      case BlockType.DIRT:
        if (this.patterns.dirt) {
          this.ctx.fillStyle = this.patterns.dirt;
          this.ctx.fillRect(x, y, this.blockSize, this.blockSize);
          this.ctx.strokeStyle = GameConfig.DIRT_STROKE;
          this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
        }
        break;

      case BlockType.GOLD:
        this.drawGoldBlock(x, y);
        break;

      case BlockType.DIAMOND:
        this.drawDiamondBlock(x, y);
        break;

      case BlockType.PICKAXE:
        this.drawPickaxeBlock(x, y);
        break;

      case BlockType.TNT:
        const tntImg = this.assets.getImage('tnt');
        if (tntImg) {
          this.ctx.drawImage(tntImg, x, y, this.blockSize, this.blockSize);
        }
        break;

      case BlockType.STONE:
        if (this.patterns.stone) {
          this.ctx.fillStyle = this.patterns.stone;
          this.ctx.fillRect(x, y, this.blockSize, this.blockSize);
          this.ctx.strokeStyle = GameConfig.STONE_STROKE;
          this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
        }
        break;

      case BlockType.TORCH:
        this.drawTorchBlock(x, y);
        break;

      case BlockType.COAL:
        this.drawCoalBlock(x, y);
        break;

      case BlockType.IRON:
        this.drawIronBlock(x, y);
        break;

      case BlockType.REINFORCED_STONE:
        this.drawReinforcedStoneBlock(x, y, block.hitsRemaining);
        break;

      case BlockType.OBSIDIAN:
        this.drawObsidianBlock(x, y, block.hitsRemaining);
        break;

      case BlockType.EMERALD:
        this.drawEmeraldBlock(x, y, block.emeraldVariant);
        break;
    }
  }

  drawDiamondBlock(x, y) {
    const centerX = x + this.blockSize / 2;
    const centerY = y + this.blockSize / 2;
    const time = Date.now() / 1000;

    // Animated pulsing glow
    const pulseIntensity = 0.3 + Math.sin(time * 3) * 0.15;
    const glow = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, this.blockSize * 0.7);
    glow.addColorStop(0, `rgba(0, 255, 255, ${pulseIntensity + 0.2})`);
    glow.addColorStop(0.5, `rgba(0, 200, 255, ${pulseIntensity})`);
    glow.addColorStop(1, 'rgba(0, 100, 200, 0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(x - this.blockSize * 0.3, y - this.blockSize * 0.3,
      this.blockSize * 1.6, this.blockSize * 1.6);

    // Block
    this.ctx.fillStyle = '#1a3a4a';
    this.ctx.fillRect(x, y, this.blockSize, this.blockSize);

    // Diamond shape
    this.ctx.fillStyle = GameConfig.DIAMOND_COLOR;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, y + this.blockSize * 0.2);
    this.ctx.lineTo(x + this.blockSize * 0.8, centerY);
    this.ctx.lineTo(centerX, y + this.blockSize * 0.8);
    this.ctx.lineTo(x + this.blockSize * 0.2, centerY);
    this.ctx.closePath();
    this.ctx.fill();

    // Shine
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, y + this.blockSize * 0.25);
    this.ctx.lineTo(x + this.blockSize * 0.6, y + this.blockSize * 0.4);
    this.ctx.lineTo(centerX, y + this.blockSize * 0.5);
    this.ctx.lineTo(x + this.blockSize * 0.4, y + this.blockSize * 0.4);
    this.ctx.closePath();
    this.ctx.fill();

    // Animated sparkle particles
    this.drawRareBlockParticles(x, y, time, '#00FFFF', '#FFFFFF');

    this.ctx.strokeStyle = GameConfig.DIAMOND_COLOR;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
    this.ctx.lineWidth = 1;
  }

  drawRareBlockParticles(x, y, time, color1, color2) {
    // Animated floating particles around rare blocks
    const particles = [
      { offset: 0, speed: 1.5, radius: 0.03 },
      { offset: 2.1, speed: 1.2, radius: 0.025 },
      { offset: 4.2, speed: 1.8, radius: 0.02 },
      { offset: 1.0, speed: 1.4, radius: 0.035 }
    ];

    this.ctx.save();
    for (const p of particles) {
      const t = (time * p.speed + p.offset) % 3;
      const alpha = t < 1.5 ? t / 1.5 : (3 - t) / 1.5;
      const angle = (time * 0.5 + p.offset) * Math.PI;
      const dist = this.blockSize * (0.3 + t * 0.15);
      const px = x + this.blockSize / 2 + Math.cos(angle) * dist;
      const py = y + this.blockSize / 2 + Math.sin(angle) * dist - t * this.blockSize * 0.2;

      this.ctx.fillStyle = (p.offset % 2 < 1 ? color1 : color2);
      this.ctx.globalAlpha = alpha * 0.8;
      this.ctx.beginPath();
      this.ctx.arc(px, py, this.blockSize * p.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  drawMiniRareBlockParticles(x, y, size, time, color1, color2) {
    // Animated floating particles for mini ore blocks in HUD
    const particles = [
      { offset: 0, speed: 1.5, radius: 0.04 },
      { offset: 2.1, speed: 1.2, radius: 0.035 },
      { offset: 4.2, speed: 1.8, radius: 0.03 }
    ];

    this.ctx.save();
    for (const p of particles) {
      const t = (time * p.speed + p.offset) % 3;
      const alpha = t < 1.5 ? t / 1.5 : (3 - t) / 1.5;
      const angle = (time * 0.5 + p.offset) * Math.PI;
      const dist = size * (0.35 + t * 0.12);
      const px = x + size / 2 + Math.cos(angle) * dist;
      const py = y + size / 2 + Math.sin(angle) * dist - t * size * 0.15;

      this.ctx.fillStyle = (p.offset % 2 < 1 ? color1 : color2);
      this.ctx.globalAlpha = alpha * 0.9;
      this.ctx.beginPath();
      this.ctx.arc(px, py, size * p.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  drawPickaxeBlock(x, y) {
    const centerX = x + this.blockSize / 2;
    const centerY = y + this.blockSize / 2;

    // Block background
    this.ctx.fillStyle = '#2a2a2a';
    this.ctx.fillRect(x, y, this.blockSize, this.blockSize);

    // Pickaxe handle
    this.ctx.strokeStyle = '#8B4513';
    this.ctx.lineWidth = this.blockSize * 0.1;
    this.ctx.beginPath();
    this.ctx.moveTo(x + this.blockSize * 0.25, y + this.blockSize * 0.75);
    this.ctx.lineTo(x + this.blockSize * 0.75, y + this.blockSize * 0.25);
    this.ctx.stroke();

    // Pickaxe head
    this.ctx.fillStyle = GameConfig.PICKAXE_COLOR;
    this.ctx.beginPath();
    this.ctx.moveTo(x + this.blockSize * 0.5, y + this.blockSize * 0.15);
    this.ctx.lineTo(x + this.blockSize * 0.85, y + this.blockSize * 0.3);
    this.ctx.lineTo(x + this.blockSize * 0.7, y + this.blockSize * 0.45);
    this.ctx.lineTo(x + this.blockSize * 0.55, y + this.blockSize * 0.3);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = GameConfig.PICKAXE_COLOR;
    this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
  }

  drawTorchBlock(x, y) {
    const centerX = x + this.blockSize / 2;
    const centerY = y + this.blockSize / 2;

    const glowRadius = this.blockSize * 0.9;
    const glow = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
    glow.addColorStop(0, 'rgba(255, 200, 50, 0.5)');
    glow.addColorStop(0.4, 'rgba(255, 150, 30, 0.3)');
    glow.addColorStop(1, 'rgba(255, 100, 0, 0)');

    this.ctx.fillStyle = glow;
    this.ctx.fillRect(x - glowRadius / 2, y - glowRadius / 2,
      this.blockSize + glowRadius, this.blockSize + glowRadius);

    this.ctx.fillStyle = 'rgba(50, 35, 15, 0.95)';
    this.ctx.fillRect(x, y, this.blockSize, this.blockSize);

    this.ctx.strokeStyle = GameConfig.TORCH_COLOR;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
    this.ctx.lineWidth = 1;

    const torchImg = this.assets.getImage('torch');
    if (torchImg) {
      this.ctx.drawImage(torchImg, x + this.blockSize * 0.2, y + this.blockSize * 0.1,
        this.blockSize * 0.6, this.blockSize * 0.8);
    }
  }

  drawCoalBlock(x, y) {
    // Dark dirt background
    if (this.patterns.dirt) {
      this.ctx.fillStyle = this.patterns.dirt;
      this.ctx.fillRect(x, y, this.blockSize, this.blockSize);
    }

    // Darken the block
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    this.ctx.fillRect(x, y, this.blockSize, this.blockSize);

    // Coal chunks
    this.ctx.fillStyle = GameConfig.COAL_COLOR;
    const chunkSize = this.blockSize * 0.2;
    this.ctx.fillRect(x + this.blockSize * 0.2, y + this.blockSize * 0.3, chunkSize, chunkSize);
    this.ctx.fillRect(x + this.blockSize * 0.5, y + this.blockSize * 0.2, chunkSize * 1.2, chunkSize);
    this.ctx.fillRect(x + this.blockSize * 0.3, y + this.blockSize * 0.6, chunkSize * 1.5, chunkSize * 0.8);
    this.ctx.fillRect(x + this.blockSize * 0.7, y + this.blockSize * 0.5, chunkSize * 0.8, chunkSize * 1.2);

    this.ctx.strokeStyle = GameConfig.DIRT_STROKE;
    this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
  }

  drawGoldBlock(x, y) {
    // Dirt background
    if (this.patterns.dirt) {
      this.ctx.fillStyle = this.patterns.dirt;
      this.ctx.fillRect(x, y, this.blockSize, this.blockSize);
    }

    // Slightly warm tint
    this.ctx.fillStyle = 'rgba(50, 30, 0, 0.15)';
    this.ctx.fillRect(x, y, this.blockSize, this.blockSize);

    // Gold ore chunks (bright yellow/gold)
    this.ctx.fillStyle = '#FFD700';
    const chunkSize = this.blockSize * 0.18;
    this.ctx.fillRect(x + this.blockSize * 0.18, y + this.blockSize * 0.25, chunkSize * 1.2, chunkSize * 1.1);
    this.ctx.fillRect(x + this.blockSize * 0.5, y + this.blockSize * 0.18, chunkSize * 1.3, chunkSize);
    this.ctx.fillRect(x + this.blockSize * 0.28, y + this.blockSize * 0.58, chunkSize * 1.1, chunkSize * 1.2);
    this.ctx.fillRect(x + this.blockSize * 0.62, y + this.blockSize * 0.52, chunkSize * 1.2, chunkSize);

    // Shine highlights
    this.ctx.fillStyle = 'rgba(255, 255, 200, 0.7)';
    this.ctx.fillRect(x + this.blockSize * 0.2, y + this.blockSize * 0.27, chunkSize * 0.35, chunkSize * 0.35);
    this.ctx.fillRect(x + this.blockSize * 0.52, y + this.blockSize * 0.2, chunkSize * 0.35, chunkSize * 0.35);
    this.ctx.fillRect(x + this.blockSize * 0.3, y + this.blockSize * 0.6, chunkSize * 0.35, chunkSize * 0.35);

    this.ctx.strokeStyle = GameConfig.DIRT_STROKE;
    this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
  }

  drawIronBlock(x, y) {
    // Dirt background like coal
    if (this.patterns.dirt) {
      this.ctx.fillStyle = this.patterns.dirt;
      this.ctx.fillRect(x, y, this.blockSize, this.blockSize);
    }

    // Slightly darken the block
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    this.ctx.fillRect(x, y, this.blockSize, this.blockSize);

    // Iron ore chunks (beige/tan color)
    this.ctx.fillStyle = GameConfig.IRON_COLOR;
    const chunkSize = this.blockSize * 0.18;
    this.ctx.fillRect(x + this.blockSize * 0.15, y + this.blockSize * 0.2, chunkSize * 1.3, chunkSize);
    this.ctx.fillRect(x + this.blockSize * 0.55, y + this.blockSize * 0.15, chunkSize * 1.1, chunkSize * 1.2);
    this.ctx.fillRect(x + this.blockSize * 0.25, y + this.blockSize * 0.55, chunkSize * 1.4, chunkSize);
    this.ctx.fillRect(x + this.blockSize * 0.65, y + this.blockSize * 0.6, chunkSize, chunkSize * 1.3);

    // Highlight on ore
    this.ctx.fillStyle = 'rgba(255, 220, 180, 0.5)';
    this.ctx.fillRect(x + this.blockSize * 0.17, y + this.blockSize * 0.22, chunkSize * 0.4, chunkSize * 0.4);
    this.ctx.fillRect(x + this.blockSize * 0.57, y + this.blockSize * 0.17, chunkSize * 0.4, chunkSize * 0.4);

    this.ctx.strokeStyle = GameConfig.DIRT_STROKE;
    this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
  }

  drawReinforcedStoneBlock(x, y, hitsRemaining) {
    // Darker stone background
    if (this.patterns.stone) {
      this.ctx.fillStyle = this.patterns.stone;
      this.ctx.fillRect(x, y, this.blockSize, this.blockSize);
    }
    this.ctx.fillStyle = 'rgba(40, 40, 50, 0.5)';
    this.ctx.fillRect(x, y, this.blockSize, this.blockSize);

    // Metal reinforcement lines
    this.ctx.strokeStyle = GameConfig.REINFORCED_STONE_COLOR;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y + this.blockSize * 0.33);
    this.ctx.lineTo(x + this.blockSize, y + this.blockSize * 0.33);
    this.ctx.moveTo(x, y + this.blockSize * 0.66);
    this.ctx.lineTo(x + this.blockSize, y + this.blockSize * 0.66);
    this.ctx.moveTo(x + this.blockSize * 0.33, y);
    this.ctx.lineTo(x + this.blockSize * 0.33, y + this.blockSize);
    this.ctx.moveTo(x + this.blockSize * 0.66, y);
    this.ctx.lineTo(x + this.blockSize * 0.66, y + this.blockSize);
    this.ctx.stroke();
    this.ctx.lineWidth = 1;

    // Damage indicator
    if (hitsRemaining < GameConfig.REINFORCED_STONE_HITS) {
      this.drawCracks(x, y, GameConfig.REINFORCED_STONE_HITS - hitsRemaining);
    }

    this.ctx.strokeStyle = '#3A3A4A';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
    this.ctx.lineWidth = 1;
  }

  drawObsidianBlock(x, y, hitsRemaining) {
    // Deep purple-black base
    this.ctx.fillStyle = GameConfig.OBSIDIAN_COLOR;
    this.ctx.fillRect(x, y, this.blockSize, this.blockSize);

    // Glassy texture with purple highlights
    const gradient = this.ctx.createLinearGradient(x, y, x + this.blockSize, y + this.blockSize);
    gradient.addColorStop(0, 'rgba(75, 0, 130, 0.3)');
    gradient.addColorStop(0.5, 'rgba(30, 10, 50, 0.2)');
    gradient.addColorStop(1, 'rgba(75, 0, 130, 0.3)');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(x, y, this.blockSize, this.blockSize);

    // Shiny reflections
    this.ctx.fillStyle = 'rgba(200, 150, 255, 0.3)';
    this.ctx.beginPath();
    this.ctx.moveTo(x + this.blockSize * 0.1, y + this.blockSize * 0.1);
    this.ctx.lineTo(x + this.blockSize * 0.3, y + this.blockSize * 0.1);
    this.ctx.lineTo(x + this.blockSize * 0.1, y + this.blockSize * 0.3);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = 'rgba(150, 100, 200, 0.2)';
    this.ctx.beginPath();
    this.ctx.moveTo(x + this.blockSize * 0.7, y + this.blockSize * 0.6);
    this.ctx.lineTo(x + this.blockSize * 0.9, y + this.blockSize * 0.6);
    this.ctx.lineTo(x + this.blockSize * 0.9, y + this.blockSize * 0.8);
    this.ctx.closePath();
    this.ctx.fill();

    // Damage indicator
    if (hitsRemaining < GameConfig.OBSIDIAN_HITS) {
      this.drawCracks(x, y, GameConfig.OBSIDIAN_HITS - hitsRemaining);
    }

    this.ctx.strokeStyle = '#4B0082';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
    this.ctx.lineWidth = 1;
  }

  drawCracks(x, y, damageLevel) {
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    if (damageLevel >= 1) {
      // First crack
      this.ctx.moveTo(x + this.blockSize * 0.3, y);
      this.ctx.lineTo(x + this.blockSize * 0.4, y + this.blockSize * 0.3);
      this.ctx.lineTo(x + this.blockSize * 0.2, y + this.blockSize * 0.5);
    }

    if (damageLevel >= 2) {
      // Second crack
      this.ctx.moveTo(x + this.blockSize * 0.7, y + this.blockSize * 0.2);
      this.ctx.lineTo(x + this.blockSize * 0.5, y + this.blockSize * 0.5);
      this.ctx.lineTo(x + this.blockSize * 0.8, y + this.blockSize * 0.8);
    }

    this.ctx.stroke();
    this.ctx.lineWidth = 1;
  }

  drawEmeraldBlock(x, y, variant) {
    const centerX = x + this.blockSize / 2;
    const centerY = y + this.blockSize / 2;
    const emeraldData = EmeraldVariant[variant] || EmeraldVariant.GREEN;
    const time = Date.now() / 1000;

    // Animated intense glow
    const pulseIntensity = 0.5 + Math.sin(time * 2.5 + variant.length) * 0.2;
    const glow = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, this.blockSize * 0.9);
    glow.addColorStop(0, emeraldData.color + 'CC');
    glow.addColorStop(0.4, emeraldData.color + Math.floor(pulseIntensity * 99).toString(16).padStart(2, '0'));
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(x - this.blockSize * 0.4, y - this.blockSize * 0.4,
      this.blockSize * 1.8, this.blockSize * 1.8);

    // Dark background
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(x, y, this.blockSize, this.blockSize);

    // Hexagonal emerald shape
    this.ctx.fillStyle = emeraldData.color;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, y + this.blockSize * 0.15);
    this.ctx.lineTo(x + this.blockSize * 0.8, y + this.blockSize * 0.3);
    this.ctx.lineTo(x + this.blockSize * 0.8, y + this.blockSize * 0.7);
    this.ctx.lineTo(centerX, y + this.blockSize * 0.85);
    this.ctx.lineTo(x + this.blockSize * 0.2, y + this.blockSize * 0.7);
    this.ctx.lineTo(x + this.blockSize * 0.2, y + this.blockSize * 0.3);
    this.ctx.closePath();
    this.ctx.fill();

    // Inner facet
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, y + this.blockSize * 0.25);
    this.ctx.lineTo(x + this.blockSize * 0.65, y + this.blockSize * 0.4);
    this.ctx.lineTo(centerX, y + this.blockSize * 0.55);
    this.ctx.lineTo(x + this.blockSize * 0.35, y + this.blockSize * 0.4);
    this.ctx.closePath();
    this.ctx.fill();

    // Animated sparkle particles (more intense for emeralds)
    this.drawRareBlockParticles(x, y, time + variant.length, emeraldData.color, '#FFFFFF');

    // Static sparkles
    this.ctx.fillStyle = '#FFF';
    this.ctx.beginPath();
    this.ctx.arc(x + this.blockSize * 0.3, y + this.blockSize * 0.35, this.blockSize * 0.04, 0, Math.PI * 2);
    this.ctx.arc(x + this.blockSize * 0.7, y + this.blockSize * 0.5, this.blockSize * 0.03, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.strokeStyle = emeraldData.color;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
    this.ctx.lineWidth = 1;
  }

  drawDugDirtBackground(x, y) {
    // Darker dirt background for dug areas
    if (this.patterns.dirt) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.3;
      this.ctx.fillStyle = this.patterns.dirt;
      this.ctx.fillRect(x, y, this.blockSize, this.blockSize);
      this.ctx.restore();
    }
    // Darken it further
    this.ctx.fillStyle = 'rgba(20, 10, 0, 0.6)';
    this.ctx.fillRect(x, y, this.blockSize, this.blockSize);
  }

  drawPlayer(player, cameraRow) {
    const img = player.facingLeft
      ? this.assets.getImage('player_mirror')
      : this.assets.getImage('player');

    const x = player.getPixelX(this.blockSize);
    const y = player.getPixelY(this.blockSize, cameraRow);

    if (img) {
      this.ctx.drawImage(img, x, y, this.blockSize, this.blockSize);
    }

    // Draw pickaxe indicator if player has uses
    if (player.pickaxeUses > 0) {
      this.ctx.fillStyle = GameConfig.PICKAXE_COLOR;
      this.ctx.font = `bold ${this.blockSize * 0.25}px Arial`;
      this.ctx.textAlign = 'right';
      this.ctx.fillText(`⛏${player.pickaxeUses}`, x + this.blockSize - 2, y + this.blockSize * 0.25);
    }
  }

  drawMonster(monster, cameraRow) {
    const x = monster.getPixelX(this.blockSize);
    const y = monster.getPixelY(this.blockSize, cameraRow);

    if (y < -this.blockSize || y > this.canvas.height) return;

    // Menacing glow
    const glow = this.ctx.createRadialGradient(
      x + this.blockSize / 2, y + this.blockSize / 2, 0,
      x + this.blockSize / 2, y + this.blockSize / 2, this.blockSize * 0.6
    );
    glow.addColorStop(0, 'rgba(139, 0, 0, 0.3)');
    glow.addColorStop(1, 'rgba(139, 0, 0, 0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(x - this.blockSize * 0.2, y - this.blockSize * 0.2,
      this.blockSize * 1.4, this.blockSize * 1.4);

    // Body
    this.ctx.fillStyle = GameConfig.MONSTER_COLOR;
    this.ctx.beginPath();
    this.ctx.arc(x + this.blockSize / 2, y + this.blockSize / 2,
      this.blockSize * 0.4, 0, Math.PI * 2);
    this.ctx.fill();

    // Spikes
    this.ctx.fillStyle = '#5a0000';
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const sx = x + this.blockSize / 2 + Math.cos(angle) * this.blockSize * 0.35;
      const sy = y + this.blockSize / 2 + Math.sin(angle) * this.blockSize * 0.35;
      const ex = x + this.blockSize / 2 + Math.cos(angle) * this.blockSize * 0.5;
      const ey = y + this.blockSize / 2 + Math.sin(angle) * this.blockSize * 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(sx, sy);
      this.ctx.lineTo(ex, ey);
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = '#5a0000';
      this.ctx.stroke();
    }
    this.ctx.lineWidth = 1;

    // Teeth
    this.ctx.fillStyle = '#FFF';
    this.ctx.beginPath();
    this.ctx.arc(x + this.blockSize / 2, y + this.blockSize * 0.65, this.blockSize * 0.18, 0, Math.PI);
    this.ctx.fill();

    // Individual teeth
    this.ctx.fillStyle = GameConfig.MONSTER_COLOR;
    for (let i = 0; i < 3; i++) {
      this.ctx.fillRect(x + this.blockSize * 0.38 + i * this.blockSize * 0.1,
        y + this.blockSize * 0.65, this.blockSize * 0.04, this.blockSize * 0.1);
    }

    // Eyes
    this.ctx.fillStyle = '#FFF';
    this.ctx.beginPath();
    this.ctx.arc(x + this.blockSize * 0.35, y + this.blockSize * 0.4, this.blockSize * 0.12, 0, Math.PI * 2);
    this.ctx.arc(x + this.blockSize * 0.65, y + this.blockSize * 0.4, this.blockSize * 0.12, 0, Math.PI * 2);
    this.ctx.fill();

    // Angry pupils
    this.ctx.fillStyle = '#FF0000';
    this.ctx.beginPath();
    this.ctx.arc(x + this.blockSize * 0.38, y + this.blockSize * 0.42, this.blockSize * 0.06, 0, Math.PI * 2);
    this.ctx.arc(x + this.blockSize * 0.68, y + this.blockSize * 0.42, this.blockSize * 0.06, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawVisibleArea(player, blocks, monsters, cameraRow) {
    const playerX = player.getPixelX(this.blockSize) + this.blockSize / 2;
    const playerY = player.getPixelY(this.blockSize, cameraRow) + this.blockSize / 2;
    const visibleRadius = this.blockSize * 1.6;

    // Draw darker background image for the whole screen (instead of pure black)
    const bgImg = this.assets.getImage('background');
    if (bgImg && this.patterns.background) {
      // Draw a very dark base
      this.ctx.fillStyle = '#0a0805';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Overlay the background pattern with low opacity
      this.ctx.save();
      this.ctx.globalAlpha = 0.15;
      const offsetY = -cameraRow * this.blockSize * 0.3;
      this.ctx.translate(0, offsetY % bgImg.height);
      this.ctx.fillStyle = this.patterns.background;
      this.ctx.fillRect(0, -bgImg.height, this.canvas.width, this.canvas.height + bgImg.height * 2);
      this.ctx.restore();
    } else {
      this.ctx.fillStyle = '#0a0805';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Clip to visible area and draw blocks/monsters
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(playerX, playerY, visibleRadius, 0, Math.PI * 2);
    this.ctx.clip();

    // Draw slightly brighter background in visible area
    this.ctx.fillStyle = '#100c08';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (bgImg && this.patterns.background) {
      this.ctx.globalAlpha = 0.2;
      const offsetY = -cameraRow * this.blockSize * 0.3;
      this.ctx.translate(0, offsetY % bgImg.height);
      this.ctx.fillStyle = this.patterns.background;
      this.ctx.fillRect(0, -bgImg.height, this.canvas.width, this.canvas.height + bgImg.height * 2);
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.globalAlpha = 1;
    }

    for (const block of blocks) {
      const bx = block.getPixelX(this.blockSize) + this.blockSize / 2;
      const by = block.getPixelY(this.blockSize, cameraRow) + this.blockSize / 2;
      const dist = Math.sqrt((bx - playerX) ** 2 + (by - playerY) ** 2);

      if (dist <= visibleRadius + this.blockSize) {
        if (block.visible) {
          this.drawBlock(block, cameraRow);
        } else {
          // Draw darker dirt background for dug areas
          const x = block.getPixelX(this.blockSize);
          const y = block.getPixelY(this.blockSize, cameraRow);
          this.drawDugDirtBackground(x, y);
        }
      }
    }

    for (const monster of monsters) {
      const mx = monster.getPixelX(this.blockSize) + this.blockSize / 2;
      const my = monster.getPixelY(this.blockSize, cameraRow) + this.blockSize / 2;
      const dist = Math.sqrt((mx - playerX) ** 2 + (my - playerY) ** 2);

      if (dist <= visibleRadius + this.blockSize) {
        this.drawMonster(monster, cameraRow);
      }
    }

    this.drawPlayer(player, cameraRow);

    this.ctx.restore();

    // Add soft edge around visible area
    const gradient = this.ctx.createRadialGradient(
      playerX, playerY, visibleRadius * 0.7,
      playerX, playerY, visibleRadius
    );
    gradient.addColorStop(0, 'rgba(10, 8, 5, 0)');
    gradient.addColorStop(1, 'rgba(10, 8, 5, 0.95)');

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(playerX, playerY, visibleRadius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawHUD(depth, score) {
    const fontSize = Math.floor(this.blockSize * 0.3);
    // Add top padding for PWA mode (safe area for notch/status bar)
    const topPadding = this.isStandalone ? 35 : 0;

    this.ctx.font = `bold ${fontSize}px Arial`;
    this.ctx.fillStyle = GameConfig.TEXT_COLOR;
    this.ctx.textAlign = 'left';
    this.ctx.shadowColor = '#000';
    this.ctx.shadowBlur = 3;
    this.ctx.fillText(`Depth: ${depth}m`, 10, 25 + topPadding);
    this.ctx.fillText(`Score: ${score}`, 10, 50 + topPadding);
    this.ctx.shadowBlur = 0;
  }

  drawFloatingText(floatingText, cameraRow) {
    const x = floatingText.col * this.blockSize + this.blockSize / 2;
    const y = (floatingText.row - cameraRow) * this.blockSize + floatingText.offsetY;

    // Don't draw if off screen
    if (y < -this.blockSize || y > this.canvas.height) return;

    const fontSize = Math.floor(this.blockSize * 0.35);
    this.ctx.save();

    this.ctx.globalAlpha = floatingText.alpha;
    this.ctx.font = `300 ${fontSize}px Arial`; // Light font weight
    this.ctx.fillStyle = '#44FF44'; // Green color
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#000';
    this.ctx.shadowBlur = 2;
    this.ctx.fillText(floatingText.text, x, y);

    this.ctx.restore();
  }

  drawRevealMessage() {
    const fontSize = Math.floor(this.blockSize * 0.5);
    this.ctx.font = `bold ${fontSize}px Impact, Charcoal, sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = GameConfig.TORCH_COLOR;
    this.ctx.shadowBlur = 20;
    this.ctx.fillStyle = GameConfig.TORCH_COLOR;
    this.ctx.fillText('MEMORIZE!', this.canvas.width / 2, this.blockSize * 1.5);
    this.ctx.shadowBlur = 0;
  }

  drawButton(text, x, y) {
    const buttonWidth = this.blockSize * 1.5;
    const buttonHeight = this.blockSize * 0.5;

    this.ctx.fillStyle = GameConfig.BUTTON_COLOR;
    this.ctx.shadowColor = GameConfig.BUTTON_SHADOW;
    this.ctx.shadowBlur = 5;
    this.ctx.fillRect(x - buttonWidth / 2, y, buttonWidth, buttonHeight);

    const fontSize = Math.floor(this.blockSize * 0.25);
    this.ctx.font = `${fontSize}px Arial`;
    this.ctx.fillStyle = '#FFF';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(text, x, y + buttonHeight * 0.7);

    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = 'transparent';
  }

  drawHome() {
    const bgImg = this.assets.getImage('background');
    if (bgImg) {
      this.ctx.drawImage(bgImg, 0, 0, this.canvas.width, this.canvas.height);
    }

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const fontSize = Math.floor(this.blockSize * 0.8);
    this.ctx.font = `${fontSize}px Impact, Charcoal, sans-serif`;
    this.ctx.fillStyle = GameConfig.TEXT_COLOR;
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#000';
    this.ctx.shadowBlur = 10;
    this.ctx.fillText('MINERS', this.canvas.width / 2, this.blockSize * 3);
    this.ctx.shadowBlur = 0;

    const torchSize = this.blockSize * 0.6;
    const torch = this.assets.getImage('torch');
    if (torch) {
      this.ctx.drawImage(torch, this.blockSize * 1.2, this.blockSize * 2.5, torchSize, torchSize);
      this.ctx.drawImage(torch, this.canvas.width - this.blockSize * 1.8, this.blockSize * 2.5, torchSize, torchSize);
    }

    const treasure = this.assets.getImage('treasure');
    if (treasure) {
      const treasureSize = this.blockSize * 1.5;
      this.ctx.drawImage(treasure, this.canvas.width / 2 - treasureSize / 2,
        this.canvas.height / 2 - treasureSize / 2, treasureSize, treasureSize);
    }

    // Instructions
    const instrSize = Math.floor(this.blockSize * 0.2);
    this.ctx.font = `${instrSize}px Arial`;
    this.ctx.fillStyle = '#AAA';
    this.ctx.fillText('Arrow keys or WASD to move', this.canvas.width / 2, this.canvas.height / 2 + this.blockSize * 1.5);
    this.ctx.fillText('Collect torches to see ahead', this.canvas.width / 2, this.canvas.height / 2 + this.blockSize * 1.9);

    this.drawButton('Start', this.canvas.width / 2, this.canvas.height / 2 + this.blockSize * 2.5);
  }

  drawMenu() {
    const bgImg = this.assets.getImage('background');
    if (bgImg) {
      this.ctx.drawImage(bgImg, 0, 0, this.canvas.width, this.canvas.height);
    }

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const fontSize = Math.floor(this.blockSize * 0.8);
    this.ctx.font = `${fontSize}px Impact, Charcoal, sans-serif`;
    this.ctx.fillStyle = GameConfig.TEXT_COLOR;
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#000';
    this.ctx.shadowBlur = 10;
    this.ctx.fillText('MINERS', this.canvas.width / 2, this.blockSize * 3);
    this.ctx.shadowBlur = 0;

    const torchSize = this.blockSize * 0.6;
    const torch = this.assets.getImage('torch');
    if (torch) {
      this.ctx.drawImage(torch, this.blockSize * 1.2, this.blockSize * 2.5, torchSize, torchSize);
      this.ctx.drawImage(torch, this.canvas.width - this.blockSize * 1.8, this.blockSize * 2.5, torchSize, torchSize);
    }

    // Menu buttons
    this.drawButton('Play', this.canvas.width / 2, this.canvas.height / 2);
    this.drawButton('Scores', this.canvas.width / 2, this.canvas.height / 2 + this.blockSize * 1.0);
    this.drawButton('Settings', this.canvas.width / 2, this.canvas.height / 2 + this.blockSize * 2.0);
    this.drawButton('About', this.canvas.width / 2, this.canvas.height / 2 + this.blockSize * 3.0);
  }

  drawScoreboard(scores) {
    const bgImg = this.assets.getImage('background');
    if (bgImg) {
      this.ctx.drawImage(bgImg, 0, 0, this.canvas.width, this.canvas.height);
    }

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const titleSize = Math.floor(this.blockSize * 0.6);
    this.ctx.font = `${titleSize}px Impact, Charcoal, sans-serif`;
    this.ctx.fillStyle = GameConfig.TEXT_COLOR;
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#000';
    this.ctx.shadowBlur = 10;
    this.ctx.fillText('HIGH SCORES', this.canvas.width / 2, this.blockSize * 1.5);
    this.ctx.shadowBlur = 0;

    const entrySize = Math.floor(this.blockSize * 0.28);
    this.ctx.font = `${entrySize}px Arial`;

    if (scores.length === 0) {
      this.ctx.fillStyle = '#AAA';
      this.ctx.fillText('No scores yet!', this.canvas.width / 2, this.canvas.height / 2);
    } else {
      const startY = this.blockSize * 2.2;
      const lineHeight = this.blockSize * 0.5;

      for (let i = 0; i < Math.min(scores.length, 10); i++) {
        const entry = scores[i];
        const y = startY + i * lineHeight;

        // Rank
        this.ctx.fillStyle = i < 3 ? GameConfig.TEXT_COLOR : '#FFF';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${i + 1}.`, this.blockSize * 0.5, y);

        // Name
        this.ctx.textAlign = 'left';
        this.ctx.fillText(entry.name, this.blockSize * 1.2, y);

        // Depth
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#AAA';
        this.ctx.fillText(`${entry.depth || 0}m`, this.canvas.width / 2, y);

        // Score
        this.ctx.fillStyle = i < 3 ? GameConfig.TEXT_COLOR : '#FFF';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`${entry.score}`, this.canvas.width - this.blockSize * 0.5, y);
      }
    }

    this.drawButton('Back', this.canvas.width / 2, this.canvas.height - this.blockSize * 1.5);
  }

  drawSettings(settings) {
    const bgImg = this.assets.getImage('background');
    if (bgImg) {
      this.ctx.drawImage(bgImg, 0, 0, this.canvas.width, this.canvas.height);
    }

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Title
    const titleSize = Math.floor(this.blockSize * 0.6);
    this.ctx.font = `${titleSize}px Impact, Charcoal, sans-serif`;
    this.ctx.fillStyle = GameConfig.TEXT_COLOR;
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#000';
    this.ctx.shadowBlur = 10;
    this.ctx.fillText('SETTINGS', this.canvas.width / 2, this.blockSize * 1.5);
    this.ctx.shadowBlur = 0;

    const labelSize = Math.floor(this.blockSize * 0.28);
    const centerX = this.canvas.width / 2;
    const sliderWidth = this.blockSize * 4;
    const sliderHeight = this.blockSize * 0.3;
    const sliderX = centerX - sliderWidth / 2;

    // FX Volume
    const fxY = this.canvas.height / 2 - this.blockSize * 0.5;
    this.ctx.font = `${labelSize}px Arial`;
    this.ctx.fillStyle = '#FFF';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Sound Effects', centerX, fxY - this.blockSize * 0.15);
    this.drawSlider(sliderX, fxY, sliderWidth, sliderHeight, settings.fxVolume);
    this.ctx.fillStyle = '#AAA';
    this.ctx.fillText(`${Math.round(settings.fxVolume * 100)}%`, centerX + sliderWidth / 2 + this.blockSize * 0.5, fxY + sliderHeight * 0.8);

    // Music Volume
    const musicY = this.canvas.height / 2 + this.blockSize * 0.5;
    this.ctx.fillStyle = '#FFF';
    this.ctx.fillText('Music Volume', centerX, musicY - this.blockSize * 0.15);
    this.drawSlider(sliderX, musicY, sliderWidth, sliderHeight, settings.musicVolume);
    this.ctx.fillStyle = '#AAA';
    this.ctx.fillText(`${Math.round(settings.musicVolume * 100)}%`, centerX + sliderWidth / 2 + this.blockSize * 0.5, musicY + sliderHeight * 0.8);

    // Music Toggle
    const toggleY = this.canvas.height / 2 + this.blockSize * 1.5;
    const toggleText = settings.musicEnabled ? 'Music: ON' : 'Music: OFF';
    this.drawButton(toggleText, centerX, toggleY);

    // Touch Controls Toggle
    const touchToggleY = this.canvas.height / 2 + this.blockSize * 2.3;
    let touchText;
    if (settings.touchControlsEnabled === null) {
      touchText = 'Controls: Auto';
    } else if (settings.touchControlsEnabled) {
      touchText = 'Controls: ON';
    } else {
      touchText = 'Controls: OFF';
    }
    this.drawButton(touchText, centerX, touchToggleY);

    // Back button
    this.drawButton('Back', centerX, this.canvas.height - this.blockSize * 1.5);
  }

  drawAbout() {
    const bgImg = this.assets.getImage('background');
    if (bgImg) {
      this.ctx.drawImage(bgImg, 0, 0, this.canvas.width, this.canvas.height);
    }

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Title
    const titleSize = Math.floor(this.blockSize * 0.6);
    this.ctx.font = `${titleSize}px Impact, Charcoal, sans-serif`;
    this.ctx.fillStyle = GameConfig.TEXT_COLOR;
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#000';
    this.ctx.shadowBlur = 10;
    this.ctx.fillText('ABOUT', this.canvas.width / 2, this.blockSize * 1.5);
    this.ctx.shadowBlur = 0;

    const centerY = this.canvas.height / 2;
    const labelSize = Math.floor(this.blockSize * 0.28);
    const valueSize = Math.floor(this.blockSize * 0.32);

    // Game title
    this.ctx.font = `${valueSize}px Impact, Charcoal, sans-serif`;
    this.ctx.fillStyle = GameConfig.TEXT_COLOR;
    this.ctx.fillText('MINERS', this.canvas.width / 2, centerY - this.blockSize * 1.5);

    // Version
    this.ctx.font = `${labelSize}px Arial`;
    this.ctx.fillStyle = '#AAA';
    this.ctx.fillText(`Version ${GameInfo.VERSION}`, this.canvas.width / 2, centerY - this.blockSize * 1.0);

    // Developer
    this.ctx.font = `${labelSize}px Arial`;
    this.ctx.fillStyle = '#FFF';
    this.ctx.fillText('Developed by', this.canvas.width / 2, centerY - this.blockSize * 0.2);

    this.ctx.font = `bold ${valueSize}px Arial`;
    this.ctx.fillStyle = GameConfig.TEXT_COLOR;
    this.ctx.fillText(GameInfo.DEVELOPER, this.canvas.width / 2, centerY + this.blockSize * 0.3);

    // Years
    this.ctx.font = `${labelSize}px Arial`;
    this.ctx.fillStyle = '#AAA';
    this.ctx.fillText(`Originally created ${GameInfo.ORIGINAL_YEAR}`, this.canvas.width / 2, centerY + this.blockSize * 1.0);
    this.ctx.fillText(`Modernized ${GameInfo.MODERNIZED_YEAR}`, this.canvas.width / 2, centerY + this.blockSize * 1.4);

    // Back button
    this.drawButton('Back', this.canvas.width / 2, this.canvas.height - this.blockSize * 1.5);
  }

  drawPauseMenu() {
    // Dim overlay
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Title
    const titleSize = Math.floor(this.blockSize * 0.6);
    this.ctx.font = `${titleSize}px Impact, Charcoal, sans-serif`;
    this.ctx.fillStyle = GameConfig.TEXT_COLOR;
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#000';
    this.ctx.shadowBlur = 10;
    this.ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2 - this.blockSize * 1.2);
    this.ctx.shadowBlur = 0;

    // Buttons
    const baseY = this.canvas.height / 2 - this.blockSize * 0.5;
    this.drawButton('Continue', this.canvas.width / 2, baseY);
    this.drawButton('Settings', this.canvas.width / 2, baseY + this.blockSize * 0.8);
    this.drawButton('Menu', this.canvas.width / 2, baseY + this.blockSize * 1.6);

    // Hint
    const hintSize = Math.floor(this.blockSize * 0.18);
    this.ctx.font = `${hintSize}px Arial`;
    this.ctx.fillStyle = '#888';
    this.ctx.fillText('Press ESC to resume', this.canvas.width / 2, this.canvas.height / 2 + this.blockSize * 2);
  }

  drawSlider(x, y, width, height, value) {
    // Background track
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(x, y, width, height);

    // Filled portion
    this.ctx.fillStyle = GameConfig.TEXT_COLOR;
    this.ctx.fillRect(x, y, width * value, height);

    // Border
    this.ctx.strokeStyle = '#555';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, width, height);
    this.ctx.lineWidth = 1;

    // Handle
    const handleX = x + width * value;
    const handleWidth = this.blockSize * 0.15;
    this.ctx.fillStyle = '#FFF';
    this.ctx.fillRect(handleX - handleWidth / 2, y - height * 0.2, handleWidth, height * 1.4);
  }

  drawDeathOverlay(score, depth, reason, isAnimating, progress, ores = null, isEnteringName = false, playerName = '', canSave = false, showMinScoreMessage = false, minScore = 5000) {
    const overlayAlpha = isAnimating ? Math.min(progress * 1.5, 0.7) : 0.7;
    this.ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const dialogWidth = this.blockSize * 7;
    const dialogHeight = this.blockSize * 7; // Taller dialog for more space
    const dialogX = (this.canvas.width - dialogWidth) / 2;
    const dialogY = (this.canvas.height - dialogHeight) / 2 - this.blockSize * 0.5;

    const dialogAlpha = isAnimating ? Math.min(progress * 2, 1) : 1;
    this.ctx.globalAlpha = dialogAlpha;

    this.ctx.fillStyle = GameConfig.TEXT_COLOR;
    this.ctx.fillRect(dialogX, dialogY, dialogWidth, dialogHeight);

    this.ctx.strokeStyle = '#D69E29';
    this.ctx.lineWidth = this.blockSize * 0.15;
    this.ctx.strokeRect(dialogX, dialogY, dialogWidth, dialogHeight);
    this.ctx.lineWidth = 1;

    const titleSize = Math.floor(this.blockSize * 0.5);
    this.ctx.font = `${titleSize}px Impact, Charcoal, sans-serif`;
    this.ctx.fillStyle = '#FFF';
    this.ctx.textAlign = 'center';
    this.ctx.shadowColor = '#000';
    this.ctx.shadowBlur = 5;
    this.ctx.fillText('GAME OVER', this.canvas.width / 2, dialogY + this.blockSize * 0.6);
    this.ctx.shadowBlur = 0;

    const reasonSize = Math.floor(this.blockSize * 0.25);
    this.ctx.font = `${reasonSize}px Arial`;
    this.ctx.fillStyle = '#8B0000';

    let reasonText = '';
    switch (reason) {
      case 'monster': reasonText = 'Eaten by a monster!'; break;
      case 'tnt': reasonText = 'Blown up by TNT!'; break;
      case 'moves': reasonText = 'Out of gems!'; break;
      case 'stuck': reasonText = 'Trapped!'; break;
      default: reasonText = 'You died!';
    }
    this.ctx.fillText(reasonText, this.canvas.width / 2, dialogY + this.blockSize * 1);

    // Stats
    const statsSize = Math.floor(this.blockSize * 0.28);
    this.ctx.font = `bold ${statsSize}px Arial`;
    this.ctx.fillStyle = '#FFF';
    this.ctx.fillText(`Depth: ${depth}m    Score: ${score}`, this.canvas.width / 2, dialogY + this.blockSize * 1.5);

    // Ore collection display
    if (ores) {
      this.drawOreStats(dialogX, dialogY + this.blockSize * 2.2, dialogWidth, ores);
    }

    this.ctx.globalAlpha = 1;

    if (!isAnimating) {
      // Name entry UI
      if (isEnteringName) {
        this.drawNameEntry(dialogY + dialogHeight - this.blockSize * 1.8, playerName);
      } else if (canSave) {
        // Save score button
        this.drawButton('Save Score', this.canvas.width / 2, this.canvas.height - this.blockSize * 2.5);
      } else if (showMinScoreMessage) {
        // Minimum score message
        const msgY = this.canvas.height - this.blockSize * 2.5;
        const msgSize = Math.floor(this.blockSize * 0.18);
        this.ctx.font = `${msgSize}px Arial`;
        this.ctx.fillStyle = '#888';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`Min. ${minScore.toLocaleString()} points to save score`, this.canvas.width / 2, msgY + this.blockSize * 0.25);
      }

      // Menu and Retry buttons
      const menuButtonX = this.canvas.width / 2 - this.blockSize * 1.2;
      const retryButtonX = this.canvas.width / 2 + this.blockSize * 1.2;
      const buttonsY = this.canvas.height - this.blockSize;
      this.drawButton('Menu', menuButtonX, buttonsY);
      this.drawButton('Retry', retryButtonX, buttonsY);
    }
  }

  drawOreStats(x, y, width, ores) {
    // All possible ore types including individual emerald colors with border colors
    const allOreTypes = [
      { key: 'coal', type: 'coal', borderColor: '#333333' },
      { key: 'iron', type: 'iron', borderColor: '#A0A0A0' },
      { key: 'gold', type: 'gold', borderColor: '#FFD700' },
      { key: 'diamond', type: 'diamond', borderColor: '#00FFFF' },
      { key: 'emerald_green', type: 'emerald', color: '#50C878', borderColor: '#50C878' },
      { key: 'emerald_blue', type: 'emerald', color: '#0F52BA', borderColor: '#0F52BA' },
      { key: 'emerald_red', type: 'emerald', color: '#E0115F', borderColor: '#E0115F' },
      { key: 'emerald_purple', type: 'emerald', color: '#9966CC', borderColor: '#9966CC' },
      { key: 'emerald_yellow', type: 'emerald', color: '#FFD700', borderColor: '#FFD700' }
    ];

    // Filter to only show collected ores
    const collectedOres = allOreTypes.filter(ore => ores[ore.key] > 0);

    if (collectedOres.length === 0) return;

    const maxPerRow = 5;
    const iconSize = this.blockSize * 0.85; // Bigger icons
    const fontSize = Math.floor(this.blockSize * 0.24);
    const spacing = this.blockSize * 0.2;
    const rowHeight = iconSize + fontSize * 1.8;
    const padding = this.blockSize * 0.25; // Padding for background

    // Calculate total rows and background dimensions
    const numRows = Math.ceil(collectedOres.length / maxPerRow);
    const totalHeight = numRows * rowHeight + padding * 2;
    const bgX = x + this.blockSize * 0.3;
    const bgY = y - padding;
    const bgWidth = width - this.blockSize * 0.6;

    // Draw background panel using background image
    const bgImg = this.assets.getImage('background');
    if (bgImg) {
      this.ctx.save();
      // Clip to rounded rectangle
      this.ctx.beginPath();
      const radius = this.blockSize * 0.15;
      this.ctx.roundRect(bgX, bgY, bgWidth, totalHeight, radius);
      this.ctx.clip();
      // Draw background image
      this.ctx.drawImage(bgImg, bgX, bgY, bgWidth, totalHeight);
      // Add dark overlay for contrast
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.fillRect(bgX, bgY, bgWidth, totalHeight);
      this.ctx.restore();
      // Draw border
      this.ctx.strokeStyle = '#4a3520';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.roundRect(bgX, bgY, bgWidth, totalHeight, radius);
      this.ctx.stroke();
      this.ctx.lineWidth = 1;
    }

    // Draw ore icons
    for (let i = 0; i < collectedOres.length; i++) {
      const row = Math.floor(i / maxPerRow);
      const col = i % maxPerRow;
      const oresInThisRow = Math.min(maxPerRow, collectedOres.length - row * maxPerRow);
      const rowWidth = oresInThisRow * iconSize + (oresInThisRow - 1) * spacing;
      const rowStartX = x + (width - rowWidth) / 2;

      const ore = collectedOres[i];
      const iconX = rowStartX + col * (iconSize + spacing);
      const iconY = y + row * rowHeight;
      const centerX = iconX + iconSize / 2;

      // Draw mini ore block with colored border
      this.drawMiniOreBlock(iconX, iconY, iconSize, ore.type, ore.color, ore.borderColor);

      // Draw count
      this.ctx.font = `bold ${fontSize}px Arial`;
      this.ctx.fillStyle = '#FFF';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(ores[ore.key].toString(), centerX, iconY + iconSize + fontSize * 1.2);
    }
  }

  drawMiniOreBlock(x, y, size, oreType, emeraldColor = null, borderColor = null) {
    this.ctx.save();

    switch (oreType) {
      case 'coal':
        // Dirt background
        if (this.patterns.dirt) {
          this.ctx.fillStyle = this.patterns.dirt;
          this.ctx.fillRect(x, y, size, size);
        }
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        this.ctx.fillRect(x, y, size, size);
        // Coal chunks
        this.ctx.fillStyle = GameConfig.COAL_COLOR;
        const coalChunk = size * 0.2;
        this.ctx.fillRect(x + size * 0.2, y + size * 0.3, coalChunk, coalChunk);
        this.ctx.fillRect(x + size * 0.5, y + size * 0.2, coalChunk * 1.2, coalChunk);
        this.ctx.fillRect(x + size * 0.3, y + size * 0.6, coalChunk * 1.2, coalChunk * 0.8);
        // Colored border
        this.ctx.strokeStyle = borderColor || GameConfig.DIRT_STROKE;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, size, size);
        this.ctx.lineWidth = 1;
        break;

      case 'iron':
        if (this.patterns.dirt) {
          this.ctx.fillStyle = this.patterns.dirt;
          this.ctx.fillRect(x, y, size, size);
        }
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.fillRect(x, y, size, size);
        this.ctx.fillStyle = GameConfig.IRON_COLOR;
        const ironChunk = size * 0.18;
        this.ctx.fillRect(x + size * 0.15, y + size * 0.2, ironChunk * 1.3, ironChunk);
        this.ctx.fillRect(x + size * 0.55, y + size * 0.15, ironChunk * 1.1, ironChunk * 1.2);
        this.ctx.fillRect(x + size * 0.25, y + size * 0.55, ironChunk * 1.4, ironChunk);
        // Colored border
        this.ctx.strokeStyle = borderColor || GameConfig.DIRT_STROKE;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, size, size);
        this.ctx.lineWidth = 1;
        break;

      case 'gold':
        if (this.patterns.dirt) {
          this.ctx.fillStyle = this.patterns.dirt;
          this.ctx.fillRect(x, y, size, size);
        }
        this.ctx.fillStyle = 'rgba(50, 30, 0, 0.15)';
        this.ctx.fillRect(x, y, size, size);
        this.ctx.fillStyle = '#FFD700';
        const goldChunk = size * 0.18;
        this.ctx.fillRect(x + size * 0.18, y + size * 0.25, goldChunk * 1.2, goldChunk * 1.1);
        this.ctx.fillRect(x + size * 0.5, y + size * 0.18, goldChunk * 1.3, goldChunk);
        this.ctx.fillRect(x + size * 0.28, y + size * 0.58, goldChunk * 1.1, goldChunk * 1.2);
        // Shine
        this.ctx.fillStyle = 'rgba(255, 255, 200, 0.7)';
        this.ctx.fillRect(x + size * 0.2, y + size * 0.27, goldChunk * 0.35, goldChunk * 0.35);
        // Colored border
        this.ctx.strokeStyle = borderColor || '#FFD700';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, size, size);
        this.ctx.lineWidth = 1;
        break;

      case 'diamond':
        const centerX = x + size / 2;
        const centerY = y + size / 2;
        const time = Date.now() / 1000;
        // Animated pulsing glow
        const pulseIntensity = 0.3 + Math.sin(time * 3) * 0.15;
        const glow = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size * 0.7);
        glow.addColorStop(0, `rgba(0, 255, 255, ${pulseIntensity + 0.2})`);
        glow.addColorStop(0.5, `rgba(0, 200, 255, ${pulseIntensity})`);
        glow.addColorStop(1, 'rgba(0, 100, 200, 0)');
        this.ctx.fillStyle = glow;
        this.ctx.fillRect(x - size * 0.3, y - size * 0.3, size * 1.6, size * 1.6);
        // Block
        this.ctx.fillStyle = '#1a3a4a';
        this.ctx.fillRect(x, y, size, size);
        // Diamond shape
        this.ctx.fillStyle = GameConfig.DIAMOND_COLOR;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, y + size * 0.2);
        this.ctx.lineTo(x + size * 0.8, centerY);
        this.ctx.lineTo(centerX, y + size * 0.8);
        this.ctx.lineTo(x + size * 0.2, centerY);
        this.ctx.closePath();
        this.ctx.fill();
        // Shine
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, y + size * 0.25);
        this.ctx.lineTo(x + size * 0.6, y + size * 0.4);
        this.ctx.lineTo(centerX, y + size * 0.5);
        this.ctx.lineTo(x + size * 0.4, y + size * 0.4);
        this.ctx.closePath();
        this.ctx.fill();
        // Animated sparkle particles
        this.drawMiniRareBlockParticles(x, y, size, time, '#00FFFF', '#FFFFFF');
        // Colored border
        this.ctx.strokeStyle = borderColor || GameConfig.DIAMOND_COLOR;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, size, size);
        this.ctx.lineWidth = 1;
        break;

      case 'emerald':
        const emCenterX = x + size / 2;
        const emCenterY = y + size / 2;
        const gemColor = emeraldColor || '#50C878';
        const emTime = Date.now() / 1000;
        // Animated intense glow
        const emPulseIntensity = 0.5 + Math.sin(emTime * 2.5) * 0.2;
        const emGlow = this.ctx.createRadialGradient(emCenterX, emCenterY, 0, emCenterX, emCenterY, size * 0.9);
        emGlow.addColorStop(0, gemColor + 'CC');
        emGlow.addColorStop(0.4, gemColor + Math.floor(emPulseIntensity * 99).toString(16).padStart(2, '0'));
        emGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = emGlow;
        this.ctx.fillRect(x - size * 0.4, y - size * 0.4, size * 1.8, size * 1.8);
        // Dark background
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(x, y, size, size);
        // Hexagonal emerald
        this.ctx.fillStyle = gemColor;
        this.ctx.beginPath();
        this.ctx.moveTo(emCenterX, y + size * 0.15);
        this.ctx.lineTo(x + size * 0.8, y + size * 0.3);
        this.ctx.lineTo(x + size * 0.8, y + size * 0.7);
        this.ctx.lineTo(emCenterX, y + size * 0.85);
        this.ctx.lineTo(x + size * 0.2, y + size * 0.7);
        this.ctx.lineTo(x + size * 0.2, y + size * 0.3);
        this.ctx.closePath();
        this.ctx.fill();
        // Inner facet
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.beginPath();
        this.ctx.moveTo(emCenterX, y + size * 0.25);
        this.ctx.lineTo(x + size * 0.65, y + size * 0.4);
        this.ctx.lineTo(emCenterX, y + size * 0.55);
        this.ctx.lineTo(x + size * 0.35, y + size * 0.4);
        this.ctx.closePath();
        this.ctx.fill();
        // Animated sparkle particles
        this.drawMiniRareBlockParticles(x, y, size, emTime, gemColor, '#FFFFFF');
        // Colored border
        this.ctx.strokeStyle = borderColor || gemColor;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, size, size);
        this.ctx.lineWidth = 1;
        break;
    }

    this.ctx.restore();
  }

  drawNameEntry(y, name) {
    const inputWidth = this.blockSize * 4;
    const inputHeight = this.blockSize * 0.5;
    const inputX = (this.canvas.width - inputWidth) / 2;

    // Label
    const labelSize = Math.floor(this.blockSize * 0.22);
    this.ctx.font = `${labelSize}px Arial`;
    this.ctx.fillStyle = '#FFF';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Enter your name:', this.canvas.width / 2, y - this.blockSize * 0.2);

    // Input box
    this.ctx.fillStyle = '#FFF';
    this.ctx.fillRect(inputX, y, inputWidth, inputHeight);
    this.ctx.strokeStyle = '#D69E29';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(inputX, y, inputWidth, inputHeight);
    this.ctx.lineWidth = 1;

    // Name text
    const nameSize = Math.floor(this.blockSize * 0.3);
    this.ctx.font = `bold ${nameSize}px Arial`;
    this.ctx.fillStyle = '#000';
    this.ctx.textAlign = 'left';
    const displayName = name + (Date.now() % 1000 < 500 ? '_' : '');
    this.ctx.fillText(displayName, inputX + 10, y + inputHeight * 0.7);

    // Submit and Cancel buttons for mobile
    const buttonY = y + inputHeight + this.blockSize * 0.4;
    const submitX = this.canvas.width / 2 - this.blockSize * 0.8;
    const cancelX = this.canvas.width / 2 + this.blockSize * 0.8;
    this.drawButton('Submit', submitX, buttonY);
    this.drawButton('Cancel', cancelX, buttonY);
  }
}
