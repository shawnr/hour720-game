/**
 * Hour 720 — Game Engine
 * Core game loop, state machine, and time management.
 * 1 in-game day = ~7 minutes real time (420 seconds).
 * 7 in-game days total = ~49 minutes.
 */

const Engine = {

  // Time constants
  SECONDS_PER_DAY: 420,        // 7 real minutes = 1 game day
  HOURS_PER_DAY: 24,
  GAME_DAYS: 7,

  // Game state
  state: 'menu',  // menu | chargen | playing | paused | ended
  day: 1,
  gameTime: 0,         // Total seconds elapsed in-game
  tickInterval: null,
  tickRate: 1000,      // 1 real second per tick
  lastTick: 0,

  // Player state
  character: null,
  playerPos: { x: 4, y: 4 },  // Start in center
  playerLocation: null,        // Current building/room or null (outdoors)

  // Bridge is open only on Day 1
  bridgeOpen: true,

  // Game stats for end report
  stats: {
    zombiesKilled: 0,
    npcsHelped: 0,
    npcsDied: 0,
    itemsFound: 0,
    blocksExplored: 0,
    buildingsEntered: 0,
    daysSurvived: 0,
    escapeRoute: null,
  },

  // Event log
  eventLog: [],

  // Save ID for current session
  saveId: null,

  /**
   * Get current in-game hour (0-23) from elapsed time.
   */
  get currentHour() {
    const dayProgress = (this.gameTime % this.SECONDS_PER_DAY) / this.SECONDS_PER_DAY;
    // Game starts at 6 AM
    return Math.floor((dayProgress * this.HOURS_PER_DAY + 6) % this.HOURS_PER_DAY);
  },

  /**
   * Get time-of-day label.
   */
  get timeOfDay() {
    const h = this.currentHour;
    if (h >= 6 && h < 8) return 'dawn';
    if (h >= 8 && h < 18) return 'day';
    if (h >= 18 && h < 20) return 'dusk';
    return 'night';
  },

  /**
   * Get formatted clock string.
   */
  get clockString() {
    const h = this.currentHour;
    const dayProgress = (this.gameTime % this.SECONDS_PER_DAY) / this.SECONDS_PER_DAY;
    const minuteProgress = (dayProgress * this.HOURS_PER_DAY * 60) % 60;
    const m = Math.floor(minuteProgress);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  /**
   * Initialize a new game.
   */
  async initNewGame(character) {
    this.character = character;
    this.day = 1;
    this.gameTime = 0;
    this.bridgeOpen = true;
    this.playerPos = { x: 4, y: 4 };
    this.playerLocation = null;
    this.eventLog = [];
    this.saveId = `save_${Date.now()}`;
    this.stats = {
      zombiesKilled: 0, npcsHelped: 0, npcsDied: 0,
      itemsFound: 0, blocksExplored: 0, buildingsEntered: 0,
      daysSurvived: 0, escapeRoute: null,
    };

    // Generate map
    GameMap.generate();

    // Initialize NPCs
    NPCSystem.init(GameMap);

    // Initialize radio
    Radio.init();

    // Mark starting cell as explored
    const startCell = GameMap.getCell(this.playerPos.x, this.playerPos.y);
    if (startCell) startCell.explored = true;

    // Opening event
    this.addEvent('system',
      `You wake to the sound of sirens. The radio is full of static and panic. ` +
      `Something has gone very wrong in New Hampton.`
    );
    this.addEvent('system',
      `You are ${character.fullName}, ${CharGen.articleFor(CharGen.getProfessionLabel(character.profession))} ${CharGen.getProfessionLabel(character.profession)}, ` +
      `age ${character.age}. You're in ${startCell?.name || 'the city center'}. ` +
      `You need to find a way off this island.`
    );

    // Hint about the bridge
    this.addEvent('radio',
      `[Radio crackle] "...bridge is still standing but traffic is insane... if you can get there today..."`
    );

    this.state = 'playing';
  },

  /**
   * Restore from a save.
   */
  async restoreGame(saveData) {
    this.character = saveData.character;
    this.day = saveData.day;
    this.gameTime = saveData.gameTime;
    this.bridgeOpen = saveData.bridgeOpen;
    this.playerPos = saveData.playerPos;
    this.playerLocation = null;
    this.eventLog = saveData.eventLog || [];
    this.saveId = saveData.id;
    this.stats = saveData.stats || this.stats;

    // Restore map
    GameMap.grid = saveData.map;
    GameMap.buildings = saveData.buildings;

    // Restore NPCs
    NPCSystem.npcs = saveData.npcs;

    // Restore radio
    Radio.init();
    if (saveData.radio) Radio.fromJSON(saveData.radio);

    this.state = 'playing';
  },

  /**
   * Start the game tick loop.
   */
  startLoop(onTick) {
    this.stopLoop();
    this.lastTick = Date.now();
    this.tickInterval = setInterval(() => {
      if (this.state !== 'playing') return;
      this._tick();
      if (onTick) onTick();
    }, this.tickRate);
  },

  /**
   * Stop the game loop.
   */
  stopLoop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  },

  /**
   * Core game tick — called every second.
   */
  _tick() {
    this.gameTime++;

    // Check day transition
    const newDay = Math.floor(this.gameTime / this.SECONDS_PER_DAY) + 1;
    if (newDay > this.day) {
      this._onNewDay(newDay);
    }

    // Periodic events (every ~15 seconds game time)
    if (this.gameTime % 15 === 0) {
      this._periodicTick();
    }

    // Auto-save every 60 seconds
    if (this.gameTime % 60 === 0) {
      this._autoSave();
    }
  },

  _onNewDay(newDay) {
    this.day = newDay;
    this.stats.daysSurvived = newDay - 1;

    // Bridge closes after Day 1
    if (newDay >= 2 && this.bridgeOpen) {
      this.bridgeOpen = false;
      this.addEvent('system',
        'A massive explosion echoes across the island. The Mainland Bridge has been destroyed.'
      );
    }

    // Game over on Day 8 (nuke)
    if (newDay > this.GAME_DAYS) {
      this._endGame('nuked');
      return;
    }

    this.addEvent('system', `Day ${newDay} dawns over New Hampton.`);

    // Radio notification
    if (Radio.hasUnheard(newDay)) {
      this.addEvent('radio', 'New radio broadcasts are available. Check your radio.');
    }

    // Night warning
    this.addEvent('system',
      newDay >= 5
        ? 'The streets feel more dangerous. Zombie activity is increasing.'
        : 'Stay alert. Scavenge what you can.'
    );
  },

  _periodicTick() {
    // NPC tick
    const npcEvents = NPCSystem.tick(this.playerPos.x, this.playerPos.y, this.day);
    npcEvents.forEach(e => {
      this.addEvent(e.type === 'npc_death' ? 'combat' : 'npc', e.message);
      if (e.type === 'npc_death') this.stats.npcsDied++;
    });

    // Random event check at current location
    const cell = GameMap.getCell(this.playerPos.x, this.playerPos.y);
    if (cell) {
      const baseNoise = this.playerLocation ? 15 : 25; // Inside is quieter
      const noise = baseNoise + (this.day * 3);
      const event = Combat.checkRandomEvent(noise);
      if (event) {
        if (event.type === 'zombie') {
          const zombies = Combat.spawnZombies(cell, this.day, this.timeOfDay === 'night');
          if (zombies.length > 0) {
            cell.zombies = cell.zombies.concat(zombies);
            this.addEvent('combat',
              `${zombies.length} zombie${zombies.length > 1 ? 's' : ''} ${zombies.length > 1 ? 'appear' : 'appears'}!`
            );
            // Horror save
            const save = Combat.horrorSave(this.character, zombies.length);
            this.character.mt = save.newMt;
            this.character.mh = Math.max(0, this.character.mh + (save.mtChange * 2));
            this.addEvent('system', save.message);
          }
        } else {
          this.addEvent('system', event.message);
        }
      }
    }

    // Mental health decay from conditions
    if (this.timeOfDay === 'night') {
      this.character.mh = Math.max(0, this.character.mh - 0.1);
    }

    // Player death check
    if (this.character.hp <= 0) {
      this._endGame('died');
    }
    if (this.character.mh <= -5) {
      this._endGame('insane');
    }
  },

  /**
   * Player actions
   */

  move(direction) {
    const dx = { n: 0, s: 0, e: 1, w: -1 }[direction] || 0;
    const dy = { n: -1, s: 1, e: 0, w: 0 }[direction] || 0;
    const nx = this.playerPos.x + dx;
    const ny = this.playerPos.y + dy;

    const cell = GameMap.getCell(nx, ny);
    if (!cell) {
      this.addEvent('system', 'You can\'t go that way.');
      return false;
    }

    this.playerPos = { x: nx, y: ny };
    this.playerLocation = null; // Back outdoors
    cell.explored = true;
    this.stats.blocksExplored++;

    this.addEvent('system', `You move to ${cell.name}. ${cell.desc}`);

    // Check for zombies already here
    if (cell.zombies.length > 0) {
      this.addEvent('combat',
        `There ${cell.zombies.length === 1 ? 'is' : 'are'} ${cell.zombies.length} zombie${cell.zombies.length > 1 ? 's' : ''} here!`
      );
    }

    // Check for NPCs
    const npcsHere = NPCSystem.getNPCsAt(nx, ny);
    npcsHere.forEach(npc => {
      if (npc.met) {
        this.addEvent('npc', `${npc.fullName} is here.`);
      }
    });

    // Check key locations
    if (cell.keyLocation === 'bridge') {
      if (this.bridgeOpen) {
        this.addEvent('system',
          'The Mainland Bridge! It\'s still standing. Cars are jammed bumper to bumper but you could cross on foot. This is your chance to escape!'
        );
      } else {
        this.addEvent('system',
          'The bridge is destroyed. Twisted metal and concrete hang over the water. There\'s no crossing here.'
        );
      }
    } else if (cell.keyLocation === 'dock') {
      this.addEvent('system',
        'The ferry terminal. A few boats bob at the dock. One looks seaworthy, but the engine is dead.'
      );
    } else if (cell.keyLocation === 'airstrip') {
      this.addEvent('system',
        'The municipal airfield. A small Cessna sits on the tarmac. It looks intact, but you\'d need a pilot.'
      );
    }

    return true;
  },

  enterBuilding(buildingId) {
    const bldgs = GameMap.getBuildings(this.playerPos.x, this.playerPos.y);
    const bldg = bldgs.find(b => b.id === buildingId);
    if (!bldg) return false;

    this.playerLocation = { type: 'building', building: bldg, room: null };
    this.stats.buildingsEntered++;
    this.addEvent('system', `You enter ${bldg.name}. ${bldg.desc}`);

    if (bldg.rooms.length > 0) {
      this.addEvent('system',
        `There ${bldg.rooms.length === 1 ? 'is' : 'are'} ${bldg.rooms.length} room${bldg.rooms.length > 1 ? 's' : ''} to explore.`
      );
    }
    return true;
  },

  enterRoom(roomId) {
    if (!this.playerLocation?.building) return false;
    const room = this.playerLocation.building.rooms.find(r => r.id === roomId);
    if (!room) return false;

    this.playerLocation.room = room;
    this.addEvent('system', `You enter the ${room.name}. ${room.desc}`);

    if (room.items.length > 0 && !room.searched) {
      this.addEvent('system', 'You see some items here.');
    }
    return true;
  },

  leaveBuilding() {
    if (!this.playerLocation) return;
    this.playerLocation = null;
    const cell = GameMap.getCell(this.playerPos.x, this.playerPos.y);
    this.addEvent('system', `You step back outside into ${cell?.name || 'the street'}.`);
  },

  search() {
    if (this.playerLocation?.room) {
      const room = this.playerLocation.room;
      if (room.searched) {
        this.addEvent('system', 'You\'ve already searched this room.');
        return [];
      }
      room.searched = true;
      if (room.items.length === 0) {
        this.addEvent('system', 'Nothing useful here.');
        return [];
      }
      const found = [...room.items];
      found.forEach(item => {
        this.addEvent('system', `Found: ${item.name} — ${item.desc}`);
        this.stats.itemsFound++;
      });
      return found;
    }

    // Outdoor search
    this.addEvent('system', 'You look around but find nothing in the open.');
    return [];
  },

  takeItem(item) {
    if (this.character.inventory.length >= 10) {
      this.addEvent('system', 'Your inventory is full. Drop something first.');
      return false;
    }
    this.character.inventory.push(item);

    // Remove from room
    if (this.playerLocation?.room) {
      const room = this.playerLocation.room;
      const idx = room.items.findIndex(i => i === item);
      if (idx >= 0) room.items.splice(idx, 1);
    }

    this.addEvent('system', `Picked up ${item.name}.`);
    return true;
  },

  dropItem(itemIdx) {
    if (itemIdx < 0 || itemIdx >= this.character.inventory.length) return false;
    const item = this.character.inventory.splice(itemIdx, 1)[0];
    this.addEvent('system', `Dropped ${item.name}.`);
    return true;
  },

  useItem(itemIdx) {
    const item = this.character.inventory[itemIdx];
    if (!item) return false;

    if (item.health > 0) {
      this.character.hp = Math.min(this.character.maxHp, this.character.hp + item.health);
      this.character.inventory.splice(itemIdx, 1);
      this.addEvent('system', `Used ${item.name}. (+${item.health} HP)`);
      return true;
    }

    this.addEvent('system', `You can't use ${item.name} right now.`);
    return false;
  },

  attackZombie(zombieIdx) {
    const cell = GameMap.getCell(this.playerPos.x, this.playerPos.y);
    if (!cell || !cell.zombies[zombieIdx]) {
      this.addEvent('system', 'Nothing to attack.');
      return;
    }

    const zombie = cell.zombies[zombieIdx];
    const weapon = this.character.inventory.find(i => i.melee > 0) || { melee: 1, missile: 0, name: 'fists' };

    // Player attacks
    const playerResult = Combat.resolveAttack(
      { ...this.character, weapon },
      zombie,
      { timeOfDay: this.timeOfDay, cover: cell.cover || 0 }
    );

    if (playerResult.hit) {
      zombie.hp = playerResult.defenderHp;
      this.addEvent('combat',
        `You attack the zombie with ${weapon.name}. ${playerResult.message}`
      );
      if (zombie.hp <= 0) {
        cell.zombies.splice(zombieIdx, 1);
        this.stats.zombiesKilled++;
        this.addEvent('combat', `The zombie (${zombie.name}) goes down.`);
        return;
      }
    } else {
      this.addEvent('combat', `You swing at the zombie. ${playerResult.message}`);
    }

    // Zombie counterattack
    const zombieResult = Combat.resolveAttack(
      zombie,
      this.character,
      { timeOfDay: this.timeOfDay }
    );

    if (zombieResult.hit) {
      this.character.hp = zombieResult.defenderHp;
      this.addEvent('combat', `The zombie strikes back! ${zombieResult.message}`);

      // Infection chance on hit (20%)
      if (Math.random() < 0.2 && !this.character.infected) {
        this.character.infected = true;
        this.addEvent('combat', 'You feel a burning at the wound site. You may be infected.');
      }
    } else {
      this.addEvent('combat', 'The zombie lunges at you but misses.');
    }

    // Player death check
    if (this.character.hp <= 0) {
      this._endGame('died');
    }
  },

  secureLoc() {
    const cell = GameMap.getCell(this.playerPos.x, this.playerPos.y);
    if (!cell) return;

    if (this.playerLocation?.building) {
      const bldg = this.playerLocation.building;
      bldg.security = Math.min(10, (bldg.security || 0) + 2);
      this.addEvent('system',
        `You barricade ${bldg.name}. Security improved.`
      );
    } else {
      cell.security = Math.min(5, (cell.security || 0) + 1);
      this.addEvent('system', 'You shore up some defenses in the area.');
    }
  },

  rest() {
    // Resting heals a bit but advances time
    this.gameTime += 30; // 30 seconds = ~1.7 game hours
    this.character.hp = Math.min(this.character.maxHp, this.character.hp + 2);
    this.character.mh = Math.min(this.character.maxMh, this.character.mh + 1);
    this.character.sleep = Math.max(0, this.character.sleep - 1);
    this.addEvent('system', 'You rest for a while. (+2 HP, +1 MH)');
  },

  helpNPC(npcId) {
    const npc = NPCSystem.getById(npcId);
    if (!npc) return;
    const result = NPCSystem.helpNPC(npc, this.character);
    this.addEvent(result.success ? 'npc' : 'system', result.message);
    if (result.success) this.stats.npcsHelped++;
  },

  /**
   * Attempt to escape via a route.
   */
  attemptEscape(route) {
    const cell = GameMap.getCell(this.playerPos.x, this.playerPos.y);
    if (!cell || cell.keyLocation !== route) {
      this.addEvent('system', 'You need to be at the escape point to attempt this.');
      return false;
    }

    if (route === 'bridge') {
      if (!this.bridgeOpen) {
        this.addEvent('system', 'The bridge is destroyed. There is no crossing.');
        return false;
      }
      this._endGame('escaped', 'bridge');
      return true;
    }

    if (route === 'dock') {
      if (!NPCSystem.hasEscapeNPC('dock')) {
        this.addEvent('system',
          'The boat engine is dead. You need someone who can fix it.'
        );
        return false;
      }
      this._endGame('escaped', 'dock');
      return true;
    }

    if (route === 'airstrip') {
      if (!NPCSystem.hasEscapeNPC('airstrip')) {
        this.addEvent('system',
          'You don\'t know how to fly a plane. You need a pilot.'
        );
        return false;
      }
      this._endGame('escaped', 'airstrip');
      return true;
    }

    return false;
  },

  /**
   * End the game.
   */
  _endGame(outcome, route) {
    this.state = 'ended';
    this.stopLoop();
    this.stats.daysSurvived = this.day;
    this.stats.escapeRoute = route || null;

    // Save final state
    this._autoSave();

    // Dispatch end event for UI to handle
    const event = new CustomEvent('gameEnd', {
      detail: { outcome, route, stats: this.stats, character: this.character }
    });
    document.dispatchEvent(event);
  },

  /**
   * Add an event to the log.
   */
  addEvent(type, message) {
    this.eventLog.push({
      type,
      message,
      time: this.clockString,
      day: this.day,
      timestamp: this.gameTime,
    });

    // Dispatch for UI
    const event = new CustomEvent('gameEvent', {
      detail: { type, message, time: this.clockString, day: this.day }
    });
    document.dispatchEvent(event);
  },

  /**
   * Get serializable game state for saving.
   */
  getState() {
    return {
      saveId: this.saveId,
      character: this.character,
      day: this.day,
      gameTime: this.gameTime,
      bridgeOpen: this.bridgeOpen,
      playerPos: this.playerPos,
      map: GameMap.grid,
      buildings: GameMap.buildings,
      npcs: NPCSystem.npcs,
      radio: Radio.toJSON(),
      eventLog: this.eventLog,
      stats: this.stats,
      timeOfDay: this.timeOfDay,
    };
  },

  _autoSave() {
    SaveSystem.autoSave(this.getState());
  },

  _articleFor(word) {
    return 'aeiou'.includes(word[0].toLowerCase()) ? 'an' : 'a';
  },
};
