/**
 * Hour 720 — Game Engine
 * Core game loop, state machine, and time management.
 * 1 in-game day = ~7 minutes real time (420 seconds).
 * 7 in-game days total = ~49 minutes.
 */

const Engine = {

  // Time constants
  SECONDS_PER_DAY: 100,        // ~1.7 real minutes = 1 game day, 30 days = ~50 min
  HOURS_PER_DAY: 24,
  GAME_DAYS: 30,

  // Game state
  state: 'menu',  // menu | chargen | playing | paused | ended
  day: 1,
  gameTime: 0,         // Total seconds elapsed in-game
  tickInterval: null,
  tickRate: 1000,      // 1 real second per tick
  lastTick: 0,

  // Player state
  character: null,
  playerPos: { x: 6, y: 5 },  // Start in center of 13x11 grid
  playerLocation: null,        // Current building/room or null (outdoors)

  // Bridge is open only on Day 1
  bridgeOpen: true,

  // Noise tracking — higher = more zombie attention
  noise: 0,
  NOISE_DECAY: 2,      // Noise decays per tick cycle
  NOISE_MOVE: 8,
  NOISE_SEARCH: 5,
  NOISE_COMBAT: 15,
  NOISE_REST: -10,
  NOISE_SECURE: 3,

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
    this.playerPos = { x: 6, y: 5 };
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
    this.noise = saveData.noise || 0;

    // Restore map
    GameMap.grid = saveData.map;
    GameMap.buildings = saveData.buildings;

    // Restore NPCs
    NPCSystem.npcs = saveData.npcs;
    NPCSystem.cpcs = saveData.cpcs || [];

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

    // Periodic events every ~20 seconds — less spammy, pre-placed zombies do the work
    if (this.gameTime % 20 === 0) {
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

    // Escalating warnings
    if (newDay >= 25) {
      this.addEvent('system', 'The island is overrun. Time is almost out.');
    } else if (newDay >= 15) {
      this.addEvent('system', 'The streets feel more dangerous. Zombie activity is increasing.');
    } else {
      this.addEvent('system', 'Stay alert. Scavenge what you can.');
    }
  },

  _periodicTick() {
    // NPC tick
    const npcEvents = NPCSystem.tick(this.playerPos.x, this.playerPos.y, this.day);
    npcEvents.forEach(e => {
      this.addEvent(e.type === 'npc_death' ? 'combat' : 'npc', e.message);
      if (e.type === 'npc_death') this.stats.npcsDied++;
    });

    // Noise decays over time
    this._addNoise(-this.NOISE_DECAY);

    // Zombies drift into cleared cells across the map (not just player's cell)
    if (Math.random() < 0.3) {
      const rx = Math.floor(Math.random() * GameMap.WIDTH);
      const ry = Math.floor(Math.random() * GameMap.HEIGHT);
      const randomCell = GameMap.getCell(rx, ry);
      // Don't respawn on player's cell or in secured buildings
      if (randomCell && !(rx === this.playerPos.x && ry === this.playerPos.y)) {
        const maxForType = { urban: 8, suburban: 5, rural: 3, shore: 3 };
        const cap = maxForType[randomCell.type] || 3;
        if (randomCell.zombies.length < cap) {
          const gender = Math.random() < 0.5 ? 'm' : 'f';
          const name = H720Data.getRandomName(gender);
          const dayBonus = Math.min(this.day, 10);
          randomCell.zombies.push({
            id: `z_drift_${Date.now()}_${rx}_${ry}`,
            name: `${name.first} ${name.last}`,
            str: 6 + Math.floor(Math.random() * 6) + Math.floor(dayBonus / 2),
            dex: 5 + Math.floor(Math.random() * 5),
            mt: 1, pt: 4 + Math.floor(Math.random() * 5),
            hp: 10 + Math.floor(Math.random() * 12) + dayBonus,
            mh: 0, zombie: true,
            weapon: { melee: 5 + Math.floor(dayBonus / 2), missile: 0 },
          });
        }
      }
    }

    // Random event check at current location — driven by noise + day escalation
    const cell = GameMap.getCell(this.playerPos.x, this.playerPos.y);
    if (cell) {
      const locationMod = this.playerLocation ? -5 : 5; // Inside is quieter
      const effectiveNoise = Math.max(5, this.noise + (this.day * 3) + locationMod);
      const event = Combat.checkRandomEvent(effectiveNoise);
      // Fully secured buildings (level 4) block zombie spawns inside
      const inSecuredBuilding = this.playerLocation?.building?.security >= 4;
      if (event) {
        if (event.type === 'zombie' && !inSecuredBuilding) {
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
        } else if (event.type === 'zombie' && inSecuredBuilding) {
          this.addEvent('system', 'You hear scratching at the barricades, but they hold.');
        } else {
          this.addEvent('system', event.message);
        }
      }
    }

    // Zombies in the player's cell actively attack
    if (cell && cell.zombies.length > 0) {
      // Each zombie gets a chance to attack
      for (let i = 0; i < cell.zombies.length; i++) {
        const zombie = cell.zombies[i];
        const result = Combat.resolveAttack(
          zombie, this.character, { timeOfDay: this.timeOfDay }
        );
        if (result.hit) {
          this.character.hp = result.defenderHp;
          this.addEvent('combat', `A zombie attacks! ${result.message}`);
          // Infection chance
          if (Math.random() < 0.15 && !this.character.infected) {
            this.character.infected = true;
            this.addEvent('combat', 'You feel a burning at the wound site. You may be infected.');
          }
        }
        // Only 1 zombie attacks per tick to avoid instant death
        break;
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
    // If zombies are present, must roll to escape before moving
    const currentCell = GameMap.getCell(this.playerPos.x, this.playerPos.y);
    if (currentCell && currentCell.zombies.length > 0) {
      // Roll d20 — must beat: 12 + 3 per zombie - DEX/4
      // 1 zombie: target ~13 (35% fail), 3 zombies: target ~19 (90% fail)
      const escapeRoll = Math.floor(Math.random() * 20) + 1;
      const target = 12 + currentCell.zombies.length * 3 - Math.floor(this.character.dex / 4);
      if (escapeRoll < target) {
        // Failed to escape — zombie gets a free hit
        const zombie = currentCell.zombies[0];
        const result = Combat.resolveAttack(zombie, this.character, { timeOfDay: this.timeOfDay });
        if (result.hit) {
          this.character.hp = result.defenderHp;
          this.addEvent('combat', `You try to flee but a zombie blocks you! ${result.message}`);
        } else {
          this.addEvent('combat', 'You try to flee but the zombies block your path!');
        }
        return false;
      }
      this.addEvent('combat', 'You break free from the zombies!');
    }

    const dx = { n: 0, s: 0, e: 1, w: -1 }[direction] || 0;
    const dy = { n: -1, s: 1, e: 0, w: 0 }[direction] || 0;
    const nx = this.playerPos.x + dx;
    const ny = this.playerPos.y + dy;

    const cell = GameMap.getCell(nx, ny);
    if (!cell) {
      this.addEvent('system', 'You can\'t go that way.');
      return false;
    }

    // Outdoor movement costs HP (fatigue) — worse at night, worse when wounded
    const nightMod = this.timeOfDay === 'night' ? 2 : 1;
    const woundedMod = this.character.hp < this.character.maxHp / 2 ? 1.5 : 1;
    const hpCost = 1.5 * nightMod * woundedMod;
    const mhCost = 0.5 * nightMod;
    this.character.hp = Math.max(1, this.character.hp - hpCost);
    this.character.mh = Math.max(0, this.character.mh - mhCost);

    this.playerPos = { x: nx, y: ny };
    this.playerLocation = null; // Back outdoors
    cell.explored = true;
    this.stats.blocksExplored++;
    this._addNoise(this.NOISE_MOVE);

    this.addEvent('system', `You move to ${cell.name}. ${cell.desc}`);

    // Check for zombies already here
    if (cell.zombies.length > 0) {
      this.addEvent('combat',
        `There ${cell.zombies.length === 1 ? 'is' : 'are'} ${cell.zombies.length} zombie${cell.zombies.length > 1 ? 's' : ''} here!`
      );
    }

    // Small chance of zombie ambush when entering a clear area (increases with day)
    if (cell.zombies.length === 0 && Math.random() < 0.02 + (this.day * 0.005)) {
      const ambush = Combat.spawnZombies(cell, this.day, this.timeOfDay === 'night');
      if (ambush.length > 0) {
        cell.zombies = cell.zombies.concat(ambush);
        this.addEvent('combat', 'Zombies emerge from the shadows!');
        // Ambush attack — one zombie gets a free hit
        const result = Combat.resolveAttack(ambush[0], this.character, { timeOfDay: this.timeOfDay });
        if (result.hit) {
          this.character.hp = result.defenderHp;
          this.addEvent('combat', `Ambush! ${result.message}`);
        }
      }
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

    if (bldg.hasBoat) {
      this.addEvent('system',
        'There\'s a boat here — and it looks seaworthy! You could escape the island from here.'
      );
    }

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

    // Building lobby search — check hallways and common areas
    if (this.playerLocation?.building) {
      this.addEvent('system', 'You look around the main area...');
      // 25% chance to find something lying around in the lobby
      if (Math.random() < 0.25) {
        const item = this._randomScavengeItem();
        if (item) {
          this.addEvent('system', `Found: ${item.name} — ${item.desc}`);
          this.stats.itemsFound++;
          return [item];
        }
      }
      this.addEvent('system', 'Nothing here. Try searching individual rooms.');
      return [];
    }

    // Outdoor search — occasionally find something
    this._addNoise(this.NOISE_SEARCH);
    this.addEvent('system', 'You search the area...');
    const cell = GameMap.getCell(this.playerPos.x, this.playerPos.y);
    // Chance scales with terrain type — urban has more loot lying around
    const outdoorChance = { urban: 0.20, suburban: 0.15, rural: 0.10, shore: 0.08 };
    const chance = outdoorChance[cell?.type] || 0.10;
    if (Math.random() < chance) {
      const item = this._randomScavengeItem();
      if (item) {
        this.addEvent('system', `Found: ${item.name} — ${item.desc}`);
        this.stats.itemsFound++;
        return [item];
      }
    }
    this.addEvent('system', 'You don\'t find anything useful.');
    return [];
  },

  _randomScavengeItem() {
    if (!H720Data.items || H720Data.items.length === 0) return null;
    // Favor common items (low scarcity) for outdoor/lobby finds
    const common = H720Data.items.filter(i => i.item_scarcity <= 5);
    const pool = common.length > 0 ? common : H720Data.items;
    const template = pool[Math.floor(Math.random() * pool.length)];
    return {
      id: template.item_id,
      name: GameMap._resolveName(template.item_name),
      desc: GameMap._resolveName(template.item_desc),
      melee: template.item_melee,
      missile: template.item_missle,
      health: template.item_health,
      craft: template.item_craft,
    };
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
      const mhBoost = Math.ceil(item.health / 3);
      this.character.mh = Math.min(this.character.maxMh, this.character.mh + mhBoost);
      this.character.inventory.splice(itemIdx, 1);
      this.addEvent('system', `Used ${item.name}. (+${item.health} HP, +${mhBoost} MH)`);
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
    this._addNoise(this.NOISE_COMBAT);

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

    // Must be inside a building to secure
    if (!this.playerLocation?.building) {
      this.addEvent('system', 'You need to be inside a building to barricade.');
      return;
    }

    const bldg = this.playerLocation.building;

    // Max security is 4
    if ((bldg.security || 0) >= 4) {
      this.addEvent('system', `${bldg.name} is fully secured. No more can be done.`);
      return;
    }

    // Requires a barricade item (craft > 0)
    const barricadeIdx = this.character.inventory.findIndex(i => i.craft > 0);
    if (barricadeIdx === -1) {
      this.addEvent('system', 'You need materials to barricade — wood, metal, chain, rope, or similar.');
      return;
    }

    // Consume the item
    const item = this.character.inventory.splice(barricadeIdx, 1)[0];
    const craftBonus = item.craft || 1;

    // Security increases by item craft value (capped at 4)
    bldg.security = Math.min(4, (bldg.security || 0) + craftBonus);

    // Securing is LOUD — noise scales inversely with building size
    const roomCount = bldg.rooms.length || 1;
    const noiseAmount = Math.max(10, 30 - (roomCount * 2)); // Small building = more noise
    this._addNoise(noiseAmount);

    this.addEvent('system',
      `You use the ${item.name} to barricade ${bldg.name}. Security: ${bldg.security}/4.`
    );

    if (bldg.security >= 4) {
      this.addEvent('system', 'The building is fully secured. Zombies cannot get in.');
    } else {
      this.addEvent('system', 'The noise of construction carries...');
    }

    // Securing attracts zombies OUTSIDE the building
    if (Math.random() < 0.4 + (noiseAmount / 100)) {
      const zombies = Combat.spawnZombies(cell, this.day, this.timeOfDay === 'night');
      if (zombies.length > 0) {
        cell.zombies = cell.zombies.concat(zombies);
        this.addEvent('combat',
          `The noise attracts ${zombies.length} zombie${zombies.length > 1 ? 's' : ''} outside!`
        );
      }
    }
  },

  rest() {
    // Resting heals more inside buildings, especially secured ones
    this.gameTime += 30; // 30 seconds = ~7 game hours
    const inBuilding = !!this.playerLocation?.building;
    const security = this.playerLocation?.building?.security || 0;
    const hpGain = inBuilding ? 4 + security : 2;
    const mhGain = inBuilding ? 2 + Math.floor(security / 2) : 1;
    this.character.hp = Math.min(this.character.maxHp, this.character.hp + hpGain);
    this.character.mh = Math.min(this.character.maxMh, this.character.mh + mhGain);
    this.character.sleep = Math.max(0, this.character.sleep - 1);
    this._addNoise(this.NOISE_REST);
    if (inBuilding && security >= 3) {
      this.addEvent('system', `You rest safely inside the barricades. (+${hpGain} HP, +${mhGain} MH)`);
    } else if (inBuilding) {
      this.addEvent('system', `You rest inside. (+${hpGain} HP, +${mhGain} MH)`);
    } else {
      this.addEvent('system', 'You rest in the open. Not ideal. (+2 HP, +1 MH)');
    }
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
    // Boathouse escape — doesn't require a key location cell
    if (route === 'boat') {
      if (this.playerLocation?.building?.hasBoat) {
        this._endGame('escaped', 'boat');
        return true;
      }
      this.addEvent('system', 'There\'s no working boat here.');
      return false;
    }

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
      const playerCanFix = this.character.skills?.some(s =>
        s.name.toLowerCase().includes('mechanic') || s.name.toLowerCase().includes('engineering')
      );
      if (!playerCanFix && !NPCSystem.hasEscapeNPC('dock')) {
        this.addEvent('system',
          'The boat engine is dead. You need someone who can fix it.'
        );
        return false;
      }
      if (playerCanFix) {
        this.addEvent('system', 'You get the engine running with your mechanical skills.');
      }
      this._endGame('escaped', 'dock');
      return true;
    }

    if (route === 'airstrip') {
      const playerCanFly = this.character.skills?.some(s =>
        s.name.toLowerCase().includes('pilot')
      );
      if (!playerCanFly && !NPCSystem.hasEscapeNPC('airstrip')) {
        this.addEvent('system',
          'You don\'t know how to fly a plane. You need a pilot.'
        );
        return false;
      }
      if (playerCanFly) {
        this.addEvent('system', 'Your pilot training kicks in. You can fly this.');
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
      noise: this.noise,
      map: GameMap.grid,
      buildings: GameMap.buildings,
      npcs: NPCSystem.npcs,
      cpcs: NPCSystem.cpcs,
      radio: Radio.toJSON(),
      eventLog: this.eventLog,
      stats: this.stats,
      timeOfDay: this.timeOfDay,
    };
  },

  _autoSave() {
    SaveSystem.autoSave(this.getState());
  },

  _addNoise(amount) {
    this.noise = Math.max(0, Math.min(100, this.noise + amount));
  },

  /**
   * Get noise level label for UI display.
   */
  get noiseLevel() {
    if (this.noise >= 60) return { label: 'Loud', css: 'noise-high' };
    if (this.noise >= 35) return { label: 'Noisy', css: 'noise-med' };
    if (this.noise >= 15) return { label: 'Quiet', css: 'noise-low' };
    return { label: 'Silent', css: 'noise-silent' };
  },

  _articleFor(word) {
    return 'aeiou'.includes(word[0].toLowerCase()) ? 'an' : 'a';
  },
};
