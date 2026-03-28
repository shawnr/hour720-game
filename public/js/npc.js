/**
 * Hour 720 — NPC System
 * Fellow survivors with needs the player can help with.
 * Named after the original playtesters.
 */

const NPCSystem = {

  npcs: [],
  cpcs: [],   // Computer Player Characters — simulate other players

  // Conditions that NPCs can have, with item requirements
  CONDITIONS: [
    {
      id: 'diabetes',
      name: 'Diabetes',
      desc: 'needs insulin to manage blood sugar',
      requiredItem: 'insulin',  // We'll add this to items
      statDecay: { hp: 0.5, mh: 0.25 },    // extra decay per tick without item
      statDecayWithItem: { hp: 0, mh: 0 },   // normal decay with item
      helpMessage: 'You provide insulin. Their color improves noticeably.',
    },
    {
      id: 'broken_leg',
      name: 'Broken Leg',
      desc: 'has a broken leg and can barely walk',
      requiredItem: 'splint',
      statDecay: { hp: 0.25, mh: 0.5 },
      statDecayWithItem: { hp: 0, mh: 0 },
      helpMessage: 'You splint their leg. They can move again, slowly.',
    },
    {
      id: 'bleeding',
      name: 'Bleeding',
      desc: 'is bleeding badly from a wound',
      requiredItem: 'bandage',
      statDecay: { hp: 1, mh: 0.25 },
      statDecayWithItem: { hp: 0, mh: 0 },
      helpMessage: 'You bandage the wound. The bleeding stops.',
    },
    {
      id: 'shock',
      name: 'Shock',
      desc: 'is in psychological shock',
      requiredItem: null,  // Requires First Aid skill, not an item
      requiredSkill: 'First Aid',
      statDecay: { hp: 0, mh: 1 },
      statDecayWithItem: { hp: 0, mh: 0 },
      helpMessage: 'Your first aid training helps calm them down.',
    },
    {
      id: 'asthma',
      name: 'Asthma',
      desc: 'is having trouble breathing without their inhaler',
      requiredItem: 'inhaler',
      statDecay: { hp: 0.5, mh: 0.5 },
      statDecayWithItem: { hp: 0, mh: 0 },
      helpMessage: 'You hand over the inhaler. They breathe easier immediately.',
    },
    {
      id: 'concussion',
      name: 'Concussion',
      desc: 'has a concussion and is disoriented',
      requiredItem: null,
      requiredSkill: 'First Aid',
      statDecay: { hp: 0.25, mh: 0.75 },
      statDecayWithItem: { hp: 0, mh: 0 },
      helpMessage: 'You help stabilize them and keep them conscious.',
    },
    {
      id: 'dehydration',
      name: 'Dehydration',
      desc: 'is severely dehydrated',
      requiredItem: 'water',
      statDecay: { hp: 0.75, mh: 0.25 },
      statDecayWithItem: { hp: 0, mh: 0 },
      helpMessage: 'You share your water. They drink gratefully.',
    },
  ],

  // NPC roles: some are key to escape routes
  ROLES: {
    mechanic: {
      label: 'Mechanic',
      escapeRoute: 'dock',
      escapeMessage: 'can fix the boat engine at the ferry terminal',
    },
    pilot: {
      label: 'Pilot',
      escapeRoute: 'airstrip',
      escapeMessage: 'can fly one of the planes at the airfield',
    },
    survivor: {
      label: 'Survivor',
      escapeRoute: null,
      escapeMessage: null,
    },
  },

  // Medical/aid items to inject into the item pool
  MEDICAL_ITEMS: [
    { id: 100, name: 'insulin', desc: 'A vial of insulin.', melee: 0, missile: 0, health: 0, craft: 0, cat: 'medical' },
    { id: 101, name: 'splint', desc: 'Materials for a makeshift splint.', melee: 0, missile: 0, health: 2, craft: 2, cat: 'medical' },
    { id: 102, name: 'bandage', desc: 'Clean bandages.', melee: 0, missile: 0, health: 3, craft: 0, cat: 'medical' },
    { id: 103, name: 'inhaler', desc: 'A rescue inhaler.', melee: 0, missile: 0, health: 0, craft: 0, cat: 'medical' },
    { id: 104, name: 'water', desc: 'A bottle of clean water.', melee: 0, missile: 0, health: 2, craft: 0, cat: 'supply' },
  ],

  /**
   * Initialize NPCs for a new game.
   * Uses original playtester names from the database.
   */
  init(gameMap) {
    this.npcs = [];

    // Get NPC names from original users
    const npcNames = H720Data.users
      .filter(u => u.u_name !== 'shawn') // Player is Shawn's creation, NPCs are others
      .map(u => ({
        firstName: u.u_firstName || u.u_name,
        lastName: u.u_lastName || '',
      }));

    // Ensure we have the key roles
    const roles = ['mechanic', 'pilot', 'survivor', 'survivor', 'survivor'];

    // Generate NPCs
    for (let i = 0; i < Math.min(npcNames.length, roles.length + 2); i++) {
      const nameData = npcNames[i] || H720Data.getRandomName(Math.random() < 0.5 ? 'm' : 'f');
      const role = roles[i] || 'survivor';

      // Generate character using CharGen
      const charData = CharGen.generate(`${nameData.firstName} ${nameData.lastName}`);

      // Assign condition (70% chance for survivors, 100% for key NPCs)
      let condition = null;
      if (role !== 'survivor' || Math.random() < 0.7) {
        condition = this.CONDITIONS[Math.floor(Math.random() * this.CONDITIONS.length)];
      }

      // Place on map — key NPCs near their escape route, others random
      let pos;
      if (role === 'mechanic') {
        // Near dock but not on it
        pos = this._nearPosition(gameMap, GameMap.KEY_LOCATIONS.dock, 2);
      } else if (role === 'pilot') {
        // Near airstrip but not on it
        pos = this._nearPosition(gameMap, GameMap.KEY_LOCATIONS.airstrip, 2);
      } else {
        pos = this._randomPosition(gameMap);
      }

      const npc = {
        id: `npc_${i}`,
        firstName: nameData.firstName,
        lastName: nameData.lastName,
        fullName: `${nameData.firstName} ${nameData.lastName}`.trim(),
        role: role,
        roleData: this.ROLES[role],
        character: charData,
        condition: condition,
        conditionHelped: false,
        alive: true,
        following: false,    // Following the player
        x: pos.x,
        y: pos.y,
        met: false,         // Has player encountered them
        turnsAlone: 0,      // Ticks without player nearby
      };

      this.npcs.push(npc);
    }

    // Inject medical items into map rooms so player can find them
    this._placeMedicalItems(gameMap);

    // Generate CPCs (Computer Player Characters) — simulate other players
    this._initCPCs(gameMap);
  },

  _initCPCs(gameMap) {
    this.cpcs = [];
    const numCPCs = 3 + Math.floor(Math.random() * 3); // 3-5

    // Use original user names, shuffled, starting after NPC names
    const usedNames = new Set(this.npcs.map(n => n.fullName));
    const availableNames = H720Data.users
      .filter(u => u.u_name !== 'shawn')
      .map(u => ({
        firstName: u.u_firstName || u.u_name,
        lastName: u.u_lastName || '',
      }))
      .filter(n => !usedNames.has(`${n.firstName} ${n.lastName}`.trim()))
      .sort(() => Math.random() - 0.5);

    for (let i = 0; i < numCPCs; i++) {
      const nameData = availableNames[i] || H720Data.getRandomName(Math.random() < 0.5 ? 'm' : 'f');
      const charData = CharGen.generate(`${nameData.firstName} ${nameData.lastName}`);
      const pos = this._randomPosition(gameMap);

      this.cpcs.push({
        id: `cpc_${i}`,
        firstName: nameData.firstName,
        lastName: nameData.lastName,
        fullName: `${nameData.firstName} ${nameData.lastName}`.trim(),
        character: charData,
        alive: true,
        following: false,
        x: pos.x,
        y: pos.y,
        met: false,
        inventory: [],
      });
    }
  },

  _nearPosition(gameMap, target, radius) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = target.x + Math.floor(Math.random() * (radius * 2 + 1)) - radius;
      const y = target.y + Math.floor(Math.random() * (radius * 2 + 1)) - radius;
      if (x >= 0 && x < GameMap.WIDTH && y >= 0 && y < GameMap.HEIGHT) {
        return { x, y };
      }
    }
    return { x: target.x, y: target.y };
  },

  _randomPosition(gameMap) {
    return {
      x: 1 + Math.floor(Math.random() * (GameMap.WIDTH - 2)),
      y: 1 + Math.floor(Math.random() * (GameMap.HEIGHT - 2)),
    };
  },

  _placeMedicalItems(gameMap) {
    // For each NPC condition, ensure the required item exists somewhere on the map
    this.npcs.forEach(npc => {
      if (!npc.condition || !npc.condition.requiredItem) return;
      const medItem = this.MEDICAL_ITEMS.find(i => i.name === npc.condition.requiredItem);
      if (!medItem) return;

      // Place 1-2 copies in random buildings
      const copies = 1 + Math.floor(Math.random() * 2);
      for (let c = 0; c < copies; c++) {
        const rx = Math.floor(Math.random() * GameMap.WIDTH);
        const ry = Math.floor(Math.random() * GameMap.HEIGHT);
        const bldgs = GameMap.getBuildings(rx, ry);
        if (bldgs.length > 0) {
          const bldg = bldgs[Math.floor(Math.random() * bldgs.length)];
          if (bldg.rooms.length > 0) {
            const room = bldg.rooms[Math.floor(Math.random() * bldg.rooms.length)];
            room.items.push({
              id: medItem.id,
              name: medItem.name,
              desc: medItem.desc,
              melee: medItem.melee,
              missile: medItem.missile,
              health: medItem.health,
              craft: medItem.craft,
            });
          }
        }
      }
    });
  },

  /**
   * Tick NPC behavior: movement, stat decay, death checks.
   */
  tick(playerX, playerY, gameDay) {
    const events = [];

    this.npcs.forEach(npc => {
      if (!npc.alive) return;

      // Stat decay for unhelped conditions
      if (npc.condition && !npc.conditionHelped) {
        const decay = npc.condition.statDecay;
        npc.character.hp = Math.max(0, npc.character.hp - decay.hp);
        npc.character.mh = Math.max(0, npc.character.mh - decay.mh);

        // Death check
        if (npc.character.hp <= 0) {
          npc.alive = false;
          // Only notify player about NPCs they've actually met
          if (npc.met) {
            events.push({
              type: 'npc_death',
              npc: npc,
              message: `${npc.fullName} has died from ${npc.condition.name.toLowerCase()}.`,
            });
          }
          return;
        }
      }

      // Simple movement: NPCs wander if not following player
      if (!npc.following && Math.random() < 0.3) {
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        const dir = dirs[Math.floor(Math.random() * dirs.length)];
        const nx = npc.x + dir[0];
        const ny = npc.y + dir[1];
        if (nx >= 0 && nx < GameMap.SIZE && ny >= 0 && ny < GameMap.SIZE) {
          npc.x = nx;
          npc.y = ny;
        }
      }

      // Following: move to player position
      if (npc.following) {
        npc.x = playerX;
        npc.y = playerY;
      }

      // Check if at same position as player
      if (npc.x === playerX && npc.y === playerY && !npc.met) {
        npc.met = true;
        const profLabel = CharGen.getProfessionLabel(npc.character.profession);
        let encounterMsg = `You encounter ${npc.fullName}, ${CharGen.articleFor(profLabel)} ${profLabel}.`;
        if (npc.condition) {
          encounterMsg += ` They ${npc.condition.desc}.`;
        }
        if (npc.roleData.escapeMessage) {
          encounterMsg += ` They say they ${npc.roleData.escapeMessage}.`;
        }
        events.push({ type: 'npc_encounter', npc, message: encounterMsg });
      }
    });

    // CPC tick
    this.cpcs.forEach(cpc => {
      if (!cpc.alive) return;

      if (cpc.following) {
        // Follow the player
        cpc.x = playerX;
        cpc.y = playerY;

        // CPCs pick up items when in rooms with the player
        if (cpc.inventory.length < 5 && Math.random() < 0.1) {
          const item = Engine._randomScavengeItem?.();
          if (item) {
            cpc.inventory.push(item);
          }
        }
      } else {
        // Wander randomly
        if (Math.random() < 0.4) {
          const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
          const dir = dirs[Math.floor(Math.random() * dirs.length)];
          const nx = cpc.x + dir[0];
          const ny = cpc.y + dir[1];
          if (nx >= 0 && nx < GameMap.WIDTH && ny >= 0 && ny < GameMap.HEIGHT) {
            cpc.x = nx;
            cpc.y = ny;
          }
        }
      }

      // Encounter: if CPC is on the same cell as player and not yet met, auto-follow
      if (cpc.x === playerX && cpc.y === playerY && !cpc.met) {
        cpc.met = true;
        cpc.following = true;
        const profLabel = CharGen.getProfessionLabel(cpc.character.profession);
        const skills = cpc.character.skills.map(s => s.name).join(', ');
        let msg = `${cpc.fullName}, ${CharGen.articleFor(profLabel)} ${profLabel}, joins your group.`;
        if (skills) msg += ` Skills: ${skills}.`;
        events.push({ type: 'npc_encounter', npc: cpc, message: msg });
      }
    });

    return events;
  },

  /**
   * Try to help an NPC with an item or skill.
   */
  helpNPC(npc, player) {
    if (!npc.condition || npc.conditionHelped) {
      return { success: false, message: `${npc.fullName} doesn't need help right now.` };
    }

    // Check for required item in player inventory
    if (npc.condition.requiredItem) {
      const itemIdx = player.inventory.findIndex(
        i => i.name === npc.condition.requiredItem
      );
      if (itemIdx === -1) {
        return {
          success: false,
          message: `${npc.fullName} needs ${npc.condition.requiredItem}. You don't have any.`,
        };
      }
      // Consume item
      player.inventory.splice(itemIdx, 1);
    }

    // Check for required skill
    if (npc.condition.requiredSkill) {
      const hasSkill = player.skills.some(
        s => s.name === npc.condition.requiredSkill
      );
      if (!hasSkill) {
        return {
          success: false,
          message: `Helping ${npc.fullName} requires the ${npc.condition.requiredSkill} skill.`,
        };
      }
    }

    npc.conditionHelped = true;
    npc.following = true;

    return {
      success: true,
      message: npc.condition.helpMessage + ` ${npc.fullName} will follow you now.`,
    };
  },

  /** Get NPCs and CPCs at a specific location */
  getNPCsAt(x, y) {
    const npcs = this.npcs.filter(n => n.alive && n.x === x && n.y === y);
    const cpcs = this.cpcs.filter(c => c.alive && c.x === x && c.y === y);
    return [...npcs, ...cpcs];
  },

  /** Get NPC by id */
  getById(id) {
    return this.npcs.find(n => n.id === id) || null;
  },

  /** Check if player has the required NPC or CPC for an escape route */
  hasEscapeNPC(escapeRoute) {
    // Check role-based NPCs
    if (this.npcs.some(n => n.alive && n.following && n.roleData.escapeRoute === escapeRoute)) {
      return true;
    }
    // Check CPCs with relevant skills
    return this.cpcs.some(cpc => {
      if (!cpc.alive || !cpc.following) return false;
      const skills = cpc.character.skills.map(s => s.name.toLowerCase());
      if (escapeRoute === 'airstrip') return skills.some(s => s.includes('pilot'));
      if (escapeRoute === 'dock') return skills.some(s => s.includes('mechanic') || s.includes('engineering'));
      return false;
    });
  },
};
