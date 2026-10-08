/*
  Miners Game - Main Game Controller
  Code by Mert Dalbudak
  Originally created ~2014
  Modernized 2026
*/

class MinersGame {
  constructor(canvasId, gemsElementId) {
    this.canvas = document.getElementById(canvasId);
    this.gemsElement = document.getElementById(gemsElementId);
    this.ctx = this.canvas.getContext('2d');

    if (!this.ctx) {
      alert('Your browser does not support canvas');
      return;
    }

    this.assets = new AssetLoader();
    this.renderer = new Renderer(this.canvas, this.ctx, this.assets);
    this.levelGen = new LevelGenerator();

    this.display = 'loading';
    this.player = null;
    this.monsters = [];
    this.gems = 0;
    this.blockSize = 0;
    this.visibleRows = GameConfig.VISIBLE_ROWS;
    this.cameraRow = 0;
    this.score = 0;
    this.maxDepth = 0;
    this.deathReason = null;

    this.gameLoopId = null;
    this.lastFrameTime = 0;

    // Reveal state
    this.isRevealing = false;
    this.revealTimer = null;

    // Scroll transition
    this.isScrolling = false;
    this.scrollStartRow = 0;
    this.scrollTargetRow = 0;
    this.scrollProgress = 0;

    // Death animation
    this.isDying = false;
    this.deathScrollStart = 0;
    this.deathProgress = 0;
    this.displayScore = 0;
    this.displayDepth = 0;

    // Pause state
    this.isPaused = false;

    // Gravity/falling state
    this.isFalling = false;
    this.fallTimer = 0;
    this.fallInterval = 150; // ms between fall steps

    // Ore collection tracking (including individual emerald variants)
    this.oresCollected = {
      coal: 0,
      iron: 0,
      gold: 0,
      diamond: 0,
      emerald_green: 0,
      emerald_blue: 0,
      emerald_red: 0,
      emerald_purple: 0,
      emerald_yellow: 0
    };
    this.displayOres = {
      coal: 0,
      iron: 0,
      gold: 0,
      diamond: 0,
      emerald_green: 0,
      emerald_blue: 0,
      emerald_red: 0,
      emerald_purple: 0,
      emerald_yellow: 0
    };

    // Menu and scoreboard
    this.scoreboard = this.loadScoreboard();
    this.pendingScore = null;
    this.playerName = '';
    this.isEnteringName = false;

    // Floating text animations (for move bonus display)
    this.floatingTexts = [];

    // Settings
    this.settings = this.loadSettings();
    this.selectedSetting = 0; // For keyboard navigation in settings
    this.settingsReturnTo = null; // Track where to return from settings

    // Mobile / Touch support
    this.isMobile = this.detectMobile();
    this.touchControlsElement = document.getElementById('touch-controls');
    this.pauseButtonElement = document.getElementById('btn-pause');
    this.nameInputElement = document.getElementById('name-input');
    this.swipeStartX = 0;
    this.swipeStartY = 0;
    this.swipeThreshold = 30; // Minimum distance for swipe detection
    this.isSwiping = false;

    this.init();
  }

  detectMobile() {
    // Check for touch capability and common mobile indicators
    const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isSmallScreen = window.innerWidth <= 768;
    return hasTouchScreen && (isMobileUserAgent || isSmallScreen);
  }

  loadSettings() {
    try {
      const data = localStorage.getItem('miners_settings');
      const settings = data ? JSON.parse(data) : {};
      return {
        fxVolume: settings.fxVolume ?? 0.5,
        musicVolume: settings.musicVolume ?? 0.3,
        musicEnabled: settings.musicEnabled ?? true,
        touchControlsEnabled: settings.touchControlsEnabled ?? null // null = auto-detect
      };
    } catch (e) {
      return { fxVolume: 0.5, musicVolume: 0.3, musicEnabled: true, touchControlsEnabled: null };
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('miners_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  applySettings() {
    this.assets.setFxVolume(this.settings.fxVolume);
    this.assets.setMusicVolume(this.settings.musicVolume);
    this.updateTouchControlsVisibility();
  }

  updateTouchControlsVisibility() {
    // If setting is null (auto), use mobile detection; otherwise use the setting
    const settingEnabled = this.settings.touchControlsEnabled === null
      ? this.isMobile
      : this.settings.touchControlsEnabled;

    // Only show during active gameplay (not paused, not in menus)
    const inActiveGame = this.display === 'game' && !this.isPaused;
    const shouldShowControls = settingEnabled && inActiveGame;

    // Show movement controls only during active gameplay
    if (this.touchControlsElement) {
      if (shouldShowControls) {
        this.touchControlsElement.classList.add('visible');
      } else {
        this.touchControlsElement.classList.remove('visible');
      }
    }

    // Show pause button during active gameplay only (hide when paused)
    // Only if touch controls are enabled
    const shouldShowPause = settingEnabled && this.display === 'game' && !this.isPaused;
    if (this.pauseButtonElement) {
      if (shouldShowPause) {
        this.pauseButtonElement.classList.add('visible');
      } else {
        this.pauseButtonElement.classList.remove('visible');
      }
    }
  }

  async init() {
    await this.assets.loadAll();
    this.applySettings();
    this.setupViewport();
    this.bindEvents();
    this.showHome();

    // Hide loading screen with fade out
    this.hideLoadingScreen();

    // Start background music if enabled
    if (this.settings.musicEnabled) {
      this.assets.startBackgroundMusic();
    }
  }

  hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('fade-out');
      // Remove from DOM after fade completes
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
      }, 500);
    }
  }

  setupViewport() {
    const updateSize = () => {
      // Check if running as standalone PWA
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          window.matchMedia('(display-mode: fullscreen)').matches ||
                          window.navigator.standalone === true;

      // For standalone PWA, use innerWidth/Height which gives full screen
      // For browser, use visualViewport if available
      let viewportWidth, viewportHeight;
      if (isStandalone) {
        viewportWidth = window.innerWidth;
        viewportHeight = window.innerHeight;
      } else {
        const viewport = window.visualViewport || { width: window.innerWidth, height: window.innerHeight };
        viewportWidth = viewport.width;
        viewportHeight = viewport.height;
      }

      // On mobile/PWA, fill the screen by calculating dynamic visible rows
      if (this.isMobile || isStandalone || viewportWidth <= 768) {
        // Calculate block size to fit width exactly
        this.blockSize = Math.floor(viewportWidth / GameConfig.GRID_COLUMNS);
        const exactWidth = this.blockSize * GameConfig.GRID_COLUMNS;

        // Calculate how many total rows fit in the viewport height
        const totalRowsThatFit = Math.floor(viewportHeight / this.blockSize);

        // Dynamic visible rows (minimum of config value, but can be more on taller screens)
        this.visibleRows = Math.max(
          GameConfig.VISIBLE_ROWS,
          totalRowsThatFit - GameConfig.SURFACE_ROWS
        );

        // For PWA: use full viewport height to eliminate bottom margin
        const exactHeight = isStandalone ? viewportHeight : this.blockSize * (this.visibleRows + GameConfig.SURFACE_ROWS);

        this.canvas.width = exactWidth;
        this.canvas.height = exactHeight;
      } else {
        // Desktop: use fixed aspect ratio
        const totalRows = GameConfig.VISIBLE_ROWS + GameConfig.SURFACE_ROWS;
        const aspectRatio = GameConfig.GRID_COLUMNS / totalRows;

        let width, height;
        if (viewportWidth / viewportHeight > aspectRatio) {
          height = viewportHeight;
          width = height * aspectRatio;
        } else {
          width = viewportWidth;
          height = width / aspectRatio;
        }

        this.blockSize = Math.floor(width / GameConfig.GRID_COLUMNS);
        this.visibleRows = GameConfig.VISIBLE_ROWS;

        const exactWidth = this.blockSize * GameConfig.GRID_COLUMNS;
        const exactHeight = this.blockSize * (this.visibleRows + GameConfig.SURFACE_ROWS);

        this.canvas.width = exactWidth;
        this.canvas.height = exactHeight;
      }

      const container = this.canvas.parentElement;
      container.style.width = `${this.canvas.width}px`;
      container.style.height = `${this.canvas.height}px`;

      this.renderer.setBlockSize(this.blockSize);
      this.renderer.setVisibleRows(this.visibleRows);
      this.renderer.setStandaloneMode(isStandalone);

      if (this.display !== 'loading') {
        this.redraw();
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    // Also listen to visualViewport resize for mobile keyboard, etc.
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateSize);
    }
  }

  bindEvents() {
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    document.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Touch events for swipe gestures on canvas
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

    // Touch control buttons
    this.bindTouchControls();

    // Name input for mobile keyboard support
    this.bindNameInput();
  }

  bindNameInput() {
    if (!this.nameInputElement) return;

    // Sync input value with playerName
    this.nameInputElement.addEventListener('input', (e) => {
      if (!this.isEnteringName) return;
      // Filter to alphanumeric only and uppercase
      const filtered = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
      this.nameInputElement.value = filtered;
      this.playerName = filtered;
      this.redraw();
    });

    // Handle enter key on mobile
    this.nameInputElement.addEventListener('keydown', (e) => {
      if (!this.isEnteringName) return;
      if (e.key === 'Enter' && this.playerName.length > 0) {
        e.preventDefault();
        this.submitName();
      }
    });

    // Keep focus while entering name (re-focus if tapped elsewhere)
    this.nameInputElement.addEventListener('blur', () => {
      if (this.isEnteringName && this.isMobile) {
        // Small delay to allow for intentional taps on buttons
        setTimeout(() => {
          if (this.isEnteringName) {
            this.nameInputElement.focus();
          }
        }, 100);
      }
    });
  }

  startNameEntry() {
    this.isEnteringName = true;
    this.playerName = '';
    if (this.nameInputElement) {
      this.nameInputElement.value = '';
      // Focus to trigger mobile keyboard
      this.nameInputElement.focus();
    }
    this.redraw();
  }

  submitName() {
    if (this.playerName.length > 0) {
      this.addScore(this.playerName, this.score, this.maxDepth);
      this.isEnteringName = false;
      this.pendingScore = null;
      if (this.nameInputElement) {
        this.nameInputElement.blur();
      }
      this.redraw();
    }
  }

  cancelNameEntry() {
    this.isEnteringName = false;
    if (this.nameInputElement) {
      this.nameInputElement.blur();
    }
    this.redraw();
  }

  bindTouchControls() {
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnDown = document.getElementById('btn-down');
    const btnPause = document.getElementById('btn-pause');

    if (btnLeft) {
      btnLeft.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleTouchButton('left');
      }, { passive: false });
      btnLeft.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleTouchButton('left');
      });
    }

    if (btnRight) {
      btnRight.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleTouchButton('right');
      }, { passive: false });
      btnRight.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleTouchButton('right');
      });
    }

    if (btnDown) {
      btnDown.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleTouchButton('down');
      }, { passive: false });
      btnDown.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleTouchButton('down');
      });
    }

    if (btnPause) {
      btnPause.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.togglePause();
      }, { passive: false });
      btnPause.addEventListener('click', (e) => {
        e.preventDefault();
        this.togglePause();
      });
    }
  }

  togglePause() {
    if (this.display !== 'game') return;

    this.isPaused = !this.isPaused;
    // Restart game loop if it was stopped (e.g., after visiting settings)
    if (!this.isPaused && !this.gameLoopId) {
      this.startGameLoop();
    }
    this.redraw();
  }

  handleTouchButton(direction) {
    if (this.display !== 'game' || this.isPaused) return;

    switch (direction) {
      case 'left':
        this.movePlayer(-1, 0);
        break;
      case 'right':
        this.movePlayer(1, 0);
        break;
      case 'down':
        this.movePlayer(0, 1);
        break;
    }
  }

  handleTouchStart(e) {
    // Always allow the touch to start tracking for swipe
    const touch = e.touches[0];
    this.swipeStartX = touch.clientX;
    this.swipeStartY = touch.clientY;
    this.isSwiping = true;

    // For non-game screens, also handle as click for menu interaction
    if (this.display !== 'game' || this.isPaused) {
      // Don't prevent default here to allow the touch to potentially become a tap
    }
  }

  handleTouchMove(e) {
    if (!this.isSwiping) return;
    e.preventDefault(); // Prevent scrolling while swiping
  }

  handleTouchEnd(e) {
    if (!this.isSwiping) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - this.swipeStartX;
    const deltaY = touch.clientY - this.swipeStartY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    this.isSwiping = false;

    // Check if it was a tap (small movement) for menu interaction
    if (absDeltaX < 10 && absDeltaY < 10) {
      // Prevent the subsequent click event from firing
      e.preventDefault();
      // Treat as a tap/click
      this.handleClick({
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      return;
    }

    // Only process swipes during gameplay
    if (this.display !== 'game' || this.isPaused) return;

    // Check if swipe distance meets threshold
    if (absDeltaX < this.swipeThreshold && absDeltaY < this.swipeThreshold) return;

    // Determine swipe direction (horizontal takes precedence if similar)
    if (absDeltaX > absDeltaY) {
      // Horizontal swipe
      if (deltaX > 0) {
        this.movePlayer(1, 0); // Swipe right
      } else {
        this.movePlayer(-1, 0); // Swipe left
      }
    } else {
      // Vertical swipe - only allow down
      if (deltaY > 0) {
        this.movePlayer(0, 1); // Swipe down
      }
      // Swipe up is ignored (no upward movement)
    }
  }

  getCanvasCoordinates(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  handleClick(event) {
    const { x, y } = this.getCanvasCoordinates(event);

    if (this.display === 'home') {
      if (this.isButtonClicked(x, y, this.canvas.width / 2, this.canvas.height / 2 + this.blockSize * 2.5)) {
        this.startGame();
      }
    } else if (this.display === 'menu') {
      // Play button
      const playButtonY = this.canvas.height / 2;
      if (this.isButtonClicked(x, y, this.canvas.width / 2, playButtonY)) {
        this.startGame();
      }
      // Scoreboard button
      const scoreboardButtonY = this.canvas.height / 2 + this.blockSize * 1.0;
      if (this.isButtonClicked(x, y, this.canvas.width / 2, scoreboardButtonY)) {
        this.showScoreboard();
      }
      // Settings button
      const settingsButtonY = this.canvas.height / 2 + this.blockSize * 2.0;
      if (this.isButtonClicked(x, y, this.canvas.width / 2, settingsButtonY)) {
        this.showSettings();
      }
      // About button
      const aboutButtonY = this.canvas.height / 2 + this.blockSize * 3.0;
      if (this.isButtonClicked(x, y, this.canvas.width / 2, aboutButtonY)) {
        this.showAbout();
      }
    } else if (this.display === 'settings') {
      this.handleSettingsClick(x, y);
    } else if (this.display === 'scoreboard') {
      // Back button
      const backButtonY = this.canvas.height - this.blockSize * 1.5;
      if (this.isButtonClicked(x, y, this.canvas.width / 2, backButtonY)) {
        this.display = 'menu';
        this.redraw();
      }
    } else if (this.display === 'about') {
      // Back button
      const backButtonY = this.canvas.height - this.blockSize * 1.5;
      if (this.isButtonClicked(x, y, this.canvas.width / 2, backButtonY)) {
        this.display = 'menu';
        this.redraw();
      }
    } else if (this.display === 'game' && this.isPaused) {
      this.handlePauseClick(x, y);
    } else if (this.display === 'gameover' && !this.isDying) {
      // Handle name entry buttons first (if entering name)
      if (this.isEnteringName) {
        // Calculate button positions (must match renderer)
        const dialogHeight = this.blockSize * 7;
        const dialogY = (this.canvas.height - dialogHeight) / 2 - this.blockSize * 0.5;
        const inputY = dialogY + dialogHeight - this.blockSize * 1.8;
        const inputHeight = this.blockSize * 0.5;
        const inputWidth = this.blockSize * 4;
        const inputX = (this.canvas.width - inputWidth) / 2;
        const nameButtonY = inputY + inputHeight + this.blockSize * 0.4;
        const submitX = this.canvas.width / 2 - this.blockSize * 0.8;
        const cancelX = this.canvas.width / 2 + this.blockSize * 0.8;

        if (this.isButtonClicked(x, y, submitX, nameButtonY) && this.playerName.length > 0) {
          this.submitName();
          return;
        }
        if (this.isButtonClicked(x, y, cancelX, nameButtonY)) {
          this.cancelNameEntry();
          return;
        }

        // Tap on input box to refocus (for mobile keyboard)
        if (x >= inputX && x <= inputX + inputWidth &&
            y >= inputY && y <= inputY + inputHeight) {
          if (this.nameInputElement) {
            this.nameInputElement.focus();
          }
          return;
        }

        return; // Don't process other buttons while entering name
      }

      // Menu button (left)
      const menuButtonX = this.canvas.width / 2 - this.blockSize * 1.2;
      const buttonsY = this.canvas.height - this.blockSize;
      if (this.isButtonClicked(x, y, menuButtonX, buttonsY)) {
        this.showHome();
        return;
      }
      // Retry button (right)
      const retryButtonX = this.canvas.width / 2 + this.blockSize * 1.2;
      if (this.isButtonClicked(x, y, retryButtonX, buttonsY)) {
        this.startGame();
        return;
      }
      // Save score button (if pending score)
      if (this.pendingScore !== null) {
        const saveButtonY = this.canvas.height - this.blockSize * 2.5;
        if (this.isButtonClicked(x, y, this.canvas.width / 2, saveButtonY)) {
          this.startNameEntry();
        }
      }
    }
  }

  isButtonClicked(x, y, buttonX, buttonY) {
    const buttonWidth = this.blockSize * 1.5;
    const buttonHeight = this.blockSize * 0.5;
    return x >= buttonX - buttonWidth / 2 &&
           x <= buttonX + buttonWidth / 2 &&
           y >= buttonY &&
           y <= buttonY + buttonHeight;
  }

  handleKeydown(event) {
    // Handle name entry on gameover screen (desktop keyboard)
    if (this.display === 'gameover' && this.isEnteringName) {
      event.preventDefault();
      if (event.key === 'Enter' && this.playerName.length > 0) {
        this.submitName();
      } else if (event.key === 'Backspace') {
        this.playerName = this.playerName.slice(0, -1);
        // Sync with hidden input
        if (this.nameInputElement) {
          this.nameInputElement.value = this.playerName;
        }
        this.redraw();
      } else if (event.key === 'Escape') {
        this.cancelNameEntry();
      } else if (event.key.length === 1 && this.playerName.length < 10) {
        // Only allow alphanumeric characters
        if (/^[a-zA-Z0-9]$/.test(event.key)) {
          this.playerName += event.key.toUpperCase();
          // Sync with hidden input
          if (this.nameInputElement) {
            this.nameInputElement.value = this.playerName;
          }
          this.redraw();
        }
      }
      return;
    }

    if (this.display !== 'game') return;

    // Handle ESC for pause menu
    if (event.key === 'Escape') {
      event.preventDefault();
      this.togglePause();
      return;
    }

    // Don't process movement when paused or in transition
    if (this.isPaused || this.isRevealing || this.isScrolling || this.isDying || this.isFalling) return;

    switch (event.key) {
      case 'ArrowDown':
      case 's':
      case 'S':
        event.preventDefault();
        this.movePlayer(0, 1);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        event.preventDefault();
        this.movePlayer(1, 0);
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        event.preventDefault();
        this.movePlayer(-1, 0);
        break;
      // No upward movement - gravity only allows down/left/right
    }
  }

  showHome() {
    this.display = 'menu';
    this.gemsElement.style.display = 'none';
    this.stopGameLoop();
    this.isEnteringName = false;
    this.pendingScore = null;
    if (this.nameInputElement) this.nameInputElement.blur();
    // Restart music if enabled
    if (this.settings.musicEnabled && !this.assets.musicPlaying) {
      this.assets.startBackgroundMusic();
    }
    this.redraw();
  }

  showScoreboard() {
    this.display = 'scoreboard';
    this.redraw();
  }

  showAbout() {
    this.display = 'about';
    this.redraw();
  }

  showSettings() {
    // Track where to return when leaving settings
    this.settingsReturnTo = this.display === 'game' ? 'pause' : 'menu';
    this.display = 'settings';
    this.selectedSetting = 0;
    this.redraw();
  }

  handleSettingsClick(x, y) {
    const centerX = this.canvas.width / 2;
    const sliderWidth = this.blockSize * 4;
    const sliderX = centerX - sliderWidth / 2;
    const sliderRight = centerX + sliderWidth / 2;

    // FX Volume slider (row 1)
    const fxSliderY = this.canvas.height / 2 - this.blockSize * 0.5;
    if (y >= fxSliderY && y <= fxSliderY + this.blockSize * 0.4 &&
        x >= sliderX && x <= sliderRight) {
      this.settings.fxVolume = Math.max(0, Math.min(1, (x - sliderX) / sliderWidth));
      this.applySettings();
      this.saveSettings();
      this.assets.playSound('gold_hit'); // Preview sound
      this.redraw();
      return;
    }

    // Music Volume slider (row 2)
    const musicSliderY = this.canvas.height / 2 + this.blockSize * 0.5;
    if (y >= musicSliderY && y <= musicSliderY + this.blockSize * 0.4 &&
        x >= sliderX && x <= sliderRight) {
      this.settings.musicVolume = Math.max(0, Math.min(1, (x - sliderX) / sliderWidth));
      this.applySettings();
      this.saveSettings();
      this.redraw();
      return;
    }

    // Music toggle button (row 3)
    const toggleY = this.canvas.height / 2 + this.blockSize * 1.5;
    if (this.isButtonClicked(x, y, centerX, toggleY)) {
      this.settings.musicEnabled = !this.settings.musicEnabled;
      if (this.settings.musicEnabled) {
        this.assets.startBackgroundMusic();
      } else {
        this.assets.stopBackgroundMusic();
      }
      this.saveSettings();
      this.redraw();
      return;
    }

    // Touch Controls toggle button (row 4)
    const touchToggleY = this.canvas.height / 2 + this.blockSize * 2.3;
    if (this.isButtonClicked(x, y, centerX, touchToggleY)) {
      // Cycle through: null (auto) -> true (on) -> false (off) -> null (auto)
      if (this.settings.touchControlsEnabled === null) {
        this.settings.touchControlsEnabled = true;
      } else if (this.settings.touchControlsEnabled === true) {
        this.settings.touchControlsEnabled = false;
      } else {
        this.settings.touchControlsEnabled = null;
      }
      this.applySettings();
      this.saveSettings();
      this.redraw();
      return;
    }

    // Back button
    const backButtonY = this.canvas.height - this.blockSize * 1.5;
    if (this.isButtonClicked(x, y, centerX, backButtonY)) {
      if (this.settingsReturnTo === 'pause') {
        this.display = 'game';
        this.isPaused = true;
        // Restart game loop since it stopped when we went to settings
        this.startGameLoop();
      } else {
        this.display = 'menu';
      }
      this.settingsReturnTo = null;
      this.redraw();
    }
  }

  handlePauseClick(x, y) {
    const centerX = this.canvas.width / 2;
    const baseY = this.canvas.height / 2 - this.blockSize * 0.5;

    // Continue button
    if (this.isButtonClicked(x, y, centerX, baseY)) {
      this.isPaused = false;
      // Restart game loop if it was stopped (e.g., after visiting settings)
      if (!this.gameLoopId) {
        this.startGameLoop();
      }
      this.redraw();
      return;
    }

    // Settings button
    if (this.isButtonClicked(x, y, centerX, baseY + this.blockSize * 0.8)) {
      this.isPaused = false;
      this.showSettings();
      return;
    }

    // Menu button
    if (this.isButtonClicked(x, y, centerX, baseY + this.blockSize * 1.6)) {
      this.isPaused = false;
      this.showHome();
      return;
    }
  }

  loadScoreboard() {
    try {
      const data = localStorage.getItem('miners_scoreboard');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveScoreboard() {
    try {
      localStorage.setItem('miners_scoreboard', JSON.stringify(this.scoreboard));
    } catch (e) {
      console.error('Failed to save scoreboard:', e);
    }
  }

  addScore(name, score, depth) {
    this.scoreboard.push({
      name: name.substring(0, 10),
      score: score,
      depth: depth,
      date: new Date().toLocaleDateString()
    });
    // Sort by score descending
    this.scoreboard.sort((a, b) => b.score - a.score);
    // Keep top 10
    this.scoreboard = this.scoreboard.slice(0, 10);
    this.saveScoreboard();
  }

  startGame() {
    this.display = 'game';
    this.gems = GameConfig.INITIAL_MOVES;
    this.score = 0;
    this.maxDepth = 0;
    this.monsters = [];
    this.cameraRow = 0;
    this.deathReason = null;
    this.isRevealing = false;
    this.isScrolling = false;
    this.isDying = false;
    this.isPaused = false;
    this.isFalling = false;
    this.fallTimer = 0;

    // Restart music if enabled
    if (this.settings.musicEnabled && !this.assets.musicPlaying) {
      this.assets.startBackgroundMusic();
    }

    // Reset ore collection
    this.oresCollected = {
      coal: 0, iron: 0, gold: 0, diamond: 0,
      emerald_green: 0, emerald_blue: 0, emerald_red: 0, emerald_purple: 0, emerald_yellow: 0
    };
    this.displayOres = {
      coal: 0, iron: 0, gold: 0, diamond: 0,
      emerald_green: 0, emerald_blue: 0, emerald_red: 0, emerald_purple: 0, emerald_yellow: 0
    };

    // Reset floating texts
    this.floatingTexts = [];

    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }

    this.updateGemsDisplay();
    this.gemsElement.style.display = 'block';

    const startRow = GameConfig.SURFACE_ROWS;
    this.levelGen.generateInitialLevel(startRow);

    this.player = new Player(
      Math.floor(GameConfig.GRID_COLUMNS / 2),
      startRow - 1
    );

    this.startGameLoop();
    this.redraw();
  }

  startGameLoop() {
    this.lastFrameTime = performance.now();

    const loop = (timestamp) => {
      const deltaTime = timestamp - this.lastFrameTime;
      this.lastFrameTime = timestamp;

      this.update(deltaTime);
      this.redraw();

      if (this.display === 'game' || this.isDying) {
        this.gameLoopId = requestAnimationFrame(loop);
      }
    };

    this.gameLoopId = requestAnimationFrame(loop);
  }

  stopGameLoop() {
    if (this.gameLoopId) {
      cancelAnimationFrame(this.gameLoopId);
      this.gameLoopId = null;
    }
  }

  update(deltaTime) {
    if (this.isPaused) return;

    if (this.isDying) {
      this.updateDeathAnimation(deltaTime);
      return;
    }

    if (this.isScrolling) {
      this.scrollProgress += deltaTime / GameConfig.SCROLL_DURATION;
      if (this.scrollProgress >= 1) {
        this.scrollProgress = 1;
        this.isScrolling = false;
        this.cameraRow = this.scrollTargetRow;
      } else {
        const t = 1 - Math.pow(1 - this.scrollProgress, 3);
        this.cameraRow = this.scrollStartRow + (this.scrollTargetRow - this.scrollStartRow) * t;
      }
      return;
    }

    const blocks = this.levelGen.getBlocks();
    const depth = this.player.row - GameConfig.SURFACE_ROWS;

    // Handle gravity - check if there's void below player
    if (this.isFalling) {
      this.fallTimer += deltaTime;
      if (this.fallTimer >= this.fallInterval) {
        this.fallTimer = 0;
        this.processFall();
      }
      return;
    } else {
      // Check if player should start falling
      this.checkGravity();
    }

    // Update monsters
    for (const monster of this.monsters) {
      monster.update(blocks, this.player, this.monsters, depth);

      if (monster.isTouchingPlayer(this.player)) {
        this.gameOver('monster');
        return;
      }
    }

    // Spawn monsters based on depth
    this.trySpawnMonster();

    // Update floating text animations
    this.updateFloatingTexts(deltaTime);
  }

  updateDeathAnimation(deltaTime) {
    const duration = GameConfig.DEATH_ANIMATION_DURATION;
    this.deathProgress += deltaTime / duration;

    if (this.deathProgress >= 1) {
      this.deathProgress = 1;
      this.isDying = false;
      this.cameraRow = 0;
      this.displayScore = this.score;
      this.displayDepth = this.maxDepth;
      this.stopGameLoop();
    } else {
      const t = this.deathProgress < 0.5
        ? 2 * this.deathProgress * this.deathProgress
        : 1 - Math.pow(-2 * this.deathProgress + 2, 2) / 2;

      this.cameraRow = this.deathScrollStart * (1 - t);
      this.displayScore = Math.floor(this.score * this.deathProgress);
      this.displayDepth = Math.floor(this.maxDepth * this.deathProgress);
    }
  }

  trySpawnMonster() {
    const depth = this.player.row - GameConfig.SURFACE_ROWS;

    // No monsters before depth 30
    if (depth < GameConfig.MONSTER_MIN_DEPTH) return;

    // Get pending monster spawns (decided at tunnel generation time)
    const pendingSpawns = this.levelGen.getPendingMonsterSpawns();
    if (pendingSpawns.length === 0) return;

    // Calculate max monsters based on depth
    const depthBonus = Math.floor((depth - GameConfig.MONSTER_MIN_DEPTH) / 15);
    const maxMonsters = Math.min(2 + depthBonus, GameConfig.MONSTER_MAX_ON_SCREEN);

    for (const spawn of pendingSpawns) {
      if (this.monsters.length >= maxMonsters) break;

      // Check no monster already at this position
      const monsterThere = this.monsters.find(m => m.col === spawn.col && m.row === spawn.row);
      if (monsterThere) continue;

      this.monsters.push(new Monster(spawn.col, spawn.row));
    }
  }

  movePlayer(dc, dr) {
    if (this.isRevealing || this.isScrolling || this.isDying || this.isFalling) return;

    // Cannot move up - gravity only allows down/left/right
    if (dr < 0) return;

    const newCol = this.player.col + dc;
    const newRow = this.player.row + dr;

    if (newCol < 0 || newCol >= GameConfig.GRID_COLUMNS) return;
    if (newRow < GameConfig.SURFACE_ROWS - 1) return;

    if (dc < 0) this.player.facingLeft = true;
    if (dc > 0) this.player.facingLeft = false;

    const blocks = this.levelGen.getBlocks();
    const block = blocks.find(b => b.col === newCol && b.row === newRow && b.visible);

    if (block) {
      switch (block.type) {
        case BlockType.DIRT:
          this.gems--;
          if (this.gems < 0) {
            this.gameOver('moves');
            return;
          }
          block.visible = false;
          this.assets.playSound('dirt_hit');
          this.score += 10;
          break;

        case BlockType.GOLD:
          block.visible = false;
          this.gems += GameConfig.GOLD_MOVE_BONUS;
          this.assets.playSound('gold_hit');
          this.score += 50;
          this.oresCollected.gold++;
          this.spawnFloatingText(`+${GameConfig.GOLD_MOVE_BONUS}`, newCol, newRow);
          break;

        case BlockType.DIAMOND:
          block.visible = false;
          this.gems += GameConfig.DIAMOND_MOVE_BONUS;
          this.assets.playSound('gold_hit');
          this.score += 200;
          this.oresCollected.diamond++;
          this.spawnFloatingText(`+${GameConfig.DIAMOND_MOVE_BONUS}`, newCol, newRow);
          break;

        case BlockType.PICKAXE:
          block.visible = false;
          this.player.pickaxeUses += GameConfig.PICKAXE_USES;
          this.assets.playSound('pickaxe_pickup');
          this.score += 25;
          break;

        case BlockType.TNT:
          this.assets.playSound('tnt_hit');
          this.gameOver('tnt');
          return;

        case BlockType.COAL:
          block.visible = false;
          this.gems += GameConfig.COAL_MOVE_BONUS;
          this.assets.playSound('dirt_hit');
          this.score += 25;
          this.oresCollected.coal++;
          this.spawnFloatingText(`+${GameConfig.COAL_MOVE_BONUS}`, newCol, newRow);
          break;

        case BlockType.IRON:
          block.visible = false;
          this.gems += GameConfig.IRON_MOVE_BONUS;
          this.assets.playSound('gold_hit');
          this.score += 75;
          this.oresCollected.iron++;
          this.spawnFloatingText(`+${GameConfig.IRON_MOVE_BONUS}`, newCol, newRow);
          break;

        case BlockType.EMERALD:
          block.visible = false;
          const emeraldVariant = block.emeraldVariant || 'GREEN';
          const emeraldData = EmeraldVariant[emeraldVariant] || EmeraldVariant.GREEN;
          this.score += emeraldData.points;
          this.gems += 10;
          this.assets.playSound('gold_hit');
          // Track specific emerald color
          const emeraldKey = 'emerald_' + emeraldVariant.toLowerCase();
          if (this.oresCollected[emeraldKey] !== undefined) {
            this.oresCollected[emeraldKey]++;
          }
          this.spawnFloatingText('+10', newCol, newRow);
          break;

        case BlockType.STONE:
          // Can break stone with pickaxe
          if (this.player.pickaxeUses > 0) {
            this.player.pickaxeUses--;
            block.visible = false;
            this.assets.playSound('stone_break');
            this.score += 30;
          } else {
            this.assets.playSound('stone_hit');
            return;
          }
          break;

        case BlockType.REINFORCED_STONE:
          // Requires 2 pickaxe hits
          if (this.player.pickaxeUses > 0) {
            this.player.pickaxeUses--;
            block.hitsRemaining--;
            this.assets.playSound('stone_break');
            if (block.hitsRemaining <= 0) {
              block.visible = false;
              this.score += 50;
            } else {
              return; // Don't move into the block yet
            }
          } else {
            this.assets.playSound('stone_hit');
            return;
          }
          break;

        case BlockType.OBSIDIAN:
          // Requires 3 pickaxe hits
          if (this.player.pickaxeUses > 0) {
            this.player.pickaxeUses--;
            block.hitsRemaining--;
            this.assets.playSound('stone_break');
            if (block.hitsRemaining <= 0) {
              block.visible = false;
              this.score += 100;
            } else {
              return; // Don't move into the block yet
            }
          } else {
            this.assets.playSound('stone_hit');
            return;
          }
          break;

        case BlockType.TORCH:
          block.visible = false;
          this.assets.playSound('torch_pickup');
          this.score += 100;
          this.gems += 5;
          this.spawnFloatingText('+5', newCol, newRow);

          this.player.col = newCol;
          this.player.row = newRow;

          const depthTorch = this.player.row - GameConfig.SURFACE_ROWS;
          if (depthTorch > this.maxDepth) {
            this.maxDepth = depthTorch;
          }

          this.scrollDown(true);
          this.updateGemsDisplay();
          return;
      }
    } else {
      // Moving into empty space (horizontal or falling down)
      // No cost for moving into void
    }

    this.player.col = newCol;
    this.player.row = newRow;

    const depth = this.player.row - GameConfig.SURFACE_ROWS;
    if (depth > this.maxDepth) {
      this.maxDepth = depth;
    }

    if (this.player.row >= this.levelGen.torchRow) {
      this.scrollDown(false);
      this.updateGemsDisplay();
      return;
    }

    for (const monster of this.monsters) {
      if (monster.isTouchingPlayer(this.player)) {
        this.gameOver('monster');
        return;
      }
    }

    // Check if player is stuck
    if (this.isPlayerStuck()) {
      this.gameOver('stuck');
      return;
    }

    this.updateGemsDisplay();
  }

  isPlayerStuck() {
    // Player can't be stuck if they have pickaxe uses
    if (this.player.pickaxeUses > 0) return false;

    const blocks = this.levelGen.getBlocks();
    // Only check down/left/right (no up - player cannot climb)
    const directions = [
      { dc: 0, dr: 1 },   // down
      { dc: -1, dr: 0 },  // left
      { dc: 1, dr: 0 }    // right
    ];

    for (const dir of directions) {
      const checkCol = this.player.col + dir.dc;
      const checkRow = this.player.row + dir.dr;

      // Out of horizontal bounds
      if (checkCol < 0 || checkCol >= GameConfig.GRID_COLUMNS) continue;

      const block = blocks.find(b => b.col === checkCol && b.row === checkRow && b.visible);

      // Empty space - not stuck
      if (!block) return false;

      // Check if block is passable without pickaxe
      const passableTypes = [
        BlockType.DIRT,
        BlockType.COAL,
        BlockType.IRON,
        BlockType.GOLD,
        BlockType.DIAMOND,
        BlockType.EMERALD,
        BlockType.PICKAXE,
        BlockType.TORCH
      ];

      if (passableTypes.includes(block.type)) {
        return false;
      }
    }

    // All directions blocked by stone/TNT - player is stuck
    return true;
  }

  checkGravity() {
    const blocks = this.levelGen.getBlocks();
    const belowRow = this.player.row + 1;
    const block = blocks.find(b => b.col === this.player.col && b.row === belowRow && b.visible);

    // If no visible block below, start falling
    if (!block) {
      this.isFalling = true;
      this.fallTimer = 0;
      this.assets.playSound('fall');
    }
  }

  processFall() {
    const blocks = this.levelGen.getBlocks();
    const belowRow = this.player.row + 1;
    const block = blocks.find(b => b.col === this.player.col && b.row === belowRow && b.visible);

    if (!block) {
      // Continue falling
      this.player.row = belowRow;

      // Update max depth
      const depth = this.player.row - GameConfig.SURFACE_ROWS;
      if (depth > this.maxDepth) {
        this.maxDepth = depth;
      }

      // Check for monster collision while falling
      for (const monster of this.monsters) {
        if (monster.isTouchingPlayer(this.player)) {
          this.isFalling = false;
          this.gameOver('monster');
          return;
        }
      }

      // Check if we need to scroll
      if (this.player.row >= this.levelGen.torchRow) {
        this.isFalling = false;
        this.scrollDown(false);
        this.updateGemsDisplay();
        return;
      }

      // Check if still falling (another void below)
      const nextBlock = blocks.find(b => b.col === this.player.col && b.row === belowRow + 1 && b.visible);
      if (nextBlock) {
        // Landed on something
        this.isFalling = false;

        // Check if player is stuck after landing
        if (this.isPlayerStuck()) {
          this.gameOver('stuck');
          return;
        }
      }
    } else {
      // Landed
      this.isFalling = false;

      // Check if player is stuck after landing
      if (this.isPlayerStuck()) {
        this.gameOver('stuck');
        return;
      }
    }
  }

  scrollDown(withReveal) {
    const targetCameraRow = this.player.row - 2;

    this.scrollStartRow = this.cameraRow;
    this.scrollTargetRow = targetCameraRow;
    this.scrollProgress = 0;
    this.isScrolling = true;

    const blocks = this.levelGen.getBlocks();
    const currentMaxRow = Math.max(...blocks.map(b => b.row));
    this.levelGen.extendLevel(currentMaxRow, this.player.row);

    this.levelGen.placeNextTorch(targetCameraRow + this.visibleRows - 2);

    // Remove monsters that are too far above
    this.monsters = this.monsters.filter(m => m.row >= Math.floor(targetCameraRow) - 5);

    if (withReveal) {
      setTimeout(() => {
        this.isRevealing = true;
        this.revealTimer = setTimeout(() => {
          this.isRevealing = false;
          this.revealTimer = null;
        }, GameConfig.TORCH_REVEAL_DURATION);
      }, GameConfig.SCROLL_DURATION);
    }
  }

  updateGemsDisplay() {
    let displayText = this.gems.toString();
    if (this.player && this.player.pickaxeUses > 0) {
      displayText += ` ⛏${this.player.pickaxeUses}`;
    }
    this.gemsElement.textContent = displayText;
    this.gemsElement.style.color = this.gems < 6 ? '#FF0000' : GameConfig.TEXT_COLOR;
  }

  spawnFloatingText(text, col, row) {
    this.floatingTexts.push({
      text: text,
      col: col,
      row: row,
      offsetY: 0,
      alpha: 1,
      startTime: performance.now(),
      duration: 1000 // 1 second animation
    });
  }

  updateFloatingTexts(deltaTime) {
    const now = performance.now();
    this.floatingTexts = this.floatingTexts.filter(ft => {
      const elapsed = now - ft.startTime;
      const progress = elapsed / ft.duration;

      if (progress >= 1) {
        return false; // Remove completed animations
      }

      // Update position (rise up) and alpha (fade out)
      ft.offsetY = -this.blockSize * 0.8 * progress; // Rise up
      ft.alpha = 1 - progress; // Fade out

      return true;
    });
  }

  gameOver(reason) {
    this.display = 'gameover';
    this.deathReason = reason;
    this.isRevealing = false;
    this.isScrolling = false;

    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }

    // Stop background music
    this.assets.stopBackgroundMusic();

    // Play game over sound (except for TNT - it has its own explosion sound)
    if (reason !== 'tnt') {
      this.assets.playSound('game_over');
    }

    this.isDying = true;
    this.deathScrollStart = this.cameraRow;
    this.deathProgress = 0;
    this.displayScore = 0;
    this.displayDepth = 0;

    // Set pending score for potential save
    this.pendingScore = this.score;
    this.isEnteringName = false;
    this.playerName = '';
    if (this.nameInputElement) this.nameInputElement.blur();
  }

  redraw() {
    this.renderer.clear();
    this.updateTouchControlsVisibility();

    switch (this.display) {
      case 'home':
        this.renderer.drawHome();
        break;

      case 'menu':
        this.renderer.drawMenu();
        break;

      case 'scoreboard':
        this.renderer.drawScoreboard(this.scoreboard);
        break;

      case 'settings':
        this.renderer.drawSettings(this.settings);
        break;

      case 'about':
        this.renderer.drawAbout();
        break;

      case 'game':
        this.drawGameScreen();
        break;

      case 'gameover':
        this.drawDeathScreen();
        break;
    }
  }

  drawGameScreen() {
    const isUnderground = this.player.row >= GameConfig.SURFACE_ROWS;
    const blocks = this.levelGen.getBlocks();

    this.renderer.drawBackground(this.cameraRow);

    if (isUnderground && !this.isRevealing) {
      this.renderer.drawVisibleArea(this.player, blocks, this.monsters, this.cameraRow);
    } else {
      for (const block of blocks) {
        if (block.visible) {
          this.renderer.drawBlock(block, this.cameraRow);
        }
      }

      for (const monster of this.monsters) {
        this.renderer.drawMonster(monster, this.cameraRow);
      }

      this.renderer.drawPlayer(this.player, this.cameraRow);

      if (this.isRevealing) {
        this.renderer.drawRevealMessage();
      }
    }

    this.renderer.drawHUD(this.maxDepth, this.score);

    // Draw floating texts
    for (const ft of this.floatingTexts) {
      this.renderer.drawFloatingText(ft, this.cameraRow);
    }

    // Draw pause overlay
    if (this.isPaused) {
      this.renderer.drawPauseMenu();
    }
  }

  drawDeathScreen() {
    const blocks = this.levelGen.getBlocks();

    this.renderer.drawBackground(this.cameraRow);

    // Draw ALL blocks including previously hidden ones
    for (const block of blocks) {
      if (block.visible) {
        this.renderer.drawBlock(block, this.cameraRow);
      }
    }

    for (const monster of this.monsters) {
      this.renderer.drawMonster(monster, this.cameraRow);
    }

    this.renderer.drawPlayer(this.player, this.cameraRow);

    // Calculate display ores (animated counting)
    if (this.isDying) {
      const oreKeys = ['coal', 'iron', 'gold', 'diamond', 'emerald_green', 'emerald_blue', 'emerald_red', 'emerald_purple', 'emerald_yellow'];
      for (const ore of oreKeys) {
        this.displayOres[ore] = Math.floor(this.oresCollected[ore] * this.deathProgress);
      }
    } else {
      this.displayOres = { ...this.oresCollected };
    }

    const minScoreToSave = 5000;
    const canSave = this.pendingScore !== null && this.pendingScore >= minScoreToSave;
    const showMinScoreMessage = this.pendingScore !== null && this.pendingScore < minScoreToSave;

    this.renderer.drawDeathOverlay(
      this.displayScore,
      this.displayDepth,
      this.deathReason,
      this.isDying,
      this.deathProgress,
      this.displayOres,
      this.isEnteringName,
      this.playerName,
      canSave,
      showMinScoreMessage,
      minScoreToSave
    );
  }
}

function game() {
  new MinersGame('canvas', 'gems');
}
