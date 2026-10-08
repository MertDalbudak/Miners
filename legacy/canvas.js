/*
  Legacy redirect - game has been split into modules
  See js/ folder for source files:
  - js/config.js    - Game configuration and constants
  - js/assets.js    - Asset loading (images, sounds)
  - js/entities.js  - Block, Player, Monster classes
  - js/levelgen.js  - Level generation and pathfinding
  - js/renderer.js  - All rendering/drawing functions
  - js/game.js      - Main game controller

  Use canvas.html to run the game.
*/

console.warn('canvas.js is deprecated. The game has been split into modules in the js/ folder.');
console.warn('Make sure to load the modules from canvas.html or include them manually.');
