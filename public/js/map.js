/**
 * Hour 720 — Map System
 * Generates and manages a 9x9 block grid with buildings and rooms.
 * Terrain clustering follows the original gameGenClass.php algorithm.
 */

const GameMap = {

  SIZE: 9,
  grid: [],        // 2D array of map cells
  buildings: {},   // keyed by "x,y" -> array of building objects
  rooms: {},       // keyed by building id -> array of room objects

  // Terrain types and their adjacency influence weights
  TERRAIN_TYPES: ['urban', 'suburban', 'rural', 'shore'],

  // Name template token pools for resolving DB name templates
  NAME_TOKENS: {
    firstName: null,   // Filled from H720Data at generate time
    lastName: null,
    tree: ['Oak', 'Maple', 'Elm', 'Cedar', 'Pine', 'Birch', 'Willow', 'Spruce', 'Aspen', 'Hickory'],
    location: ['Hampton', 'Bayside', 'Eastview', 'Westgate', 'Northridge', 'Southport', 'Lakeview', 'Hillcrest', 'Riverside', 'Bayview'],
    famous_places: ['Yellowstone', 'Yosemite', 'Glacier', 'Sequoia', 'Acadia', 'Olympic', 'Denali', 'Rainier', 'Zion', 'Bryce'],
    street_suffix: ['Street', 'Avenue', 'Boulevard', 'Drive', 'Road', 'Lane', 'Way', 'Place', 'Court', 'Circle'],
    hotel_suffix: ['Hotel', 'Inn', 'Lodge', 'Suites', 'Plaza'],
    animal: ['Bear', 'Eagle', 'Fox', 'Hawk', 'Wolf', 'Elk', 'Otter', 'Falcon'],
    any: ['Park', 'Lake', 'Ridge', 'Valley', 'River', 'Hill', 'Meadow', 'Creek', 'Harbor', 'Spring'],
    initial: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'W'],
  },

  /**
   * Resolve template tokens like [lastName] or [tree] in a name string.
   */
  _resolveName(template) {
    return template.replace(/\[([^\]]+)\]/g, (match, token) => {
      const key = token.replace(/\s+/g, '_').toLowerCase();
      // firstName and lastName come from the name database
      if (key === 'firstname') {
        const names = H720Data.names.maleFirst.concat(H720Data.names.femaleFirst);
        return names[Math.floor(Math.random() * names.length)];
      }
      if (key === 'lastname') {
        return H720Data.names.last[Math.floor(Math.random() * H720Data.names.last.length)];
      }
      const pool = this.NAME_TOKENS[key] || this.NAME_TOKENS.any;
      return pool[Math.floor(Math.random() * pool.length)];
    });
  },

  // Adjacency weights: how likely a neighbor's type propagates
  ADJACENCY_WEIGHT: { urban: 0.6, suburban: 0.5, rural: 0.4, shore: 0.3 },

  // Key locations for escape routes (placed deterministically)
  KEY_LOCATIONS: {
    bridge:  { x: 0, y: 4 },   // West edge — Day 1 only
    dock:    { x: 8, y: 7 },   // Southeast shore
    airstrip: { x: 7, y: 1 },  // Northeast rural
  },

  /**
   * Generate a new 9x9 map with terrain clustering.
   */
  generate() {
    this.grid = [];
    this.buildings = {};
    this.rooms = {};

    // Step 1: Initialize grid with base terrain
    for (let y = 0; y < this.SIZE; y++) {
      this.grid[y] = [];
      for (let x = 0; x < this.SIZE; x++) {
        this.grid[y][x] = {
          x, y,
          type: this._initialTerrain(x, y),
          name: '',
          desc: '',
          security: 0,
          light: 15,
          cover: 10,
          zombies: [],
          npcs: [],
          items: [],
          explored: false,
        };
      }
    }

    // Step 2: Refine with neighbor influence (2 passes)
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 1; y < this.SIZE - 1; y++) {
        for (let x = 1; x < this.SIZE - 1; x++) {
          this._refineCell(x, y);
        }
      }
    }

    // Step 3: Place key locations
    this._placeKeyLocations();

    // Step 4: Name all blocks
    this._nameBlocks();

    // Step 5: Generate buildings for each block
    for (let y = 0; y < this.SIZE; y++) {
      for (let x = 0; x < this.SIZE; x++) {
        this._generateBuildings(x, y);
      }
    }

    return this.grid;
  },

  _initialTerrain(x, y) {
    // Shore on edges
    if (x === 0 || y === 0 || x === this.SIZE - 1 || y === this.SIZE - 1) {
      return Math.random() < 0.6 ? 'shore' : 'rural';
    }
    // Urban center
    const cx = Math.floor(this.SIZE / 2);
    const cy = Math.floor(this.SIZE / 2);
    const dist = Math.abs(x - cx) + Math.abs(y - cy);
    if (dist <= 1) return 'urban';
    if (dist <= 3) return Math.random() < 0.6 ? 'suburban' : (Math.random() < 0.5 ? 'urban' : 'rural');
    return Math.random() < 0.5 ? 'rural' : 'suburban';
  },

  _refineCell(x, y) {
    const neighbors = [
      this.grid[y-1]?.[x], this.grid[y+1]?.[x],
      this.grid[y]?.[x-1], this.grid[y]?.[x+1],
    ].filter(Boolean);

    const typeCounts = {};
    neighbors.forEach(n => {
      const w = this.ADJACENCY_WEIGHT[n.type] || 0.4;
      typeCounts[n.type] = (typeCounts[n.type] || 0) + w;
    });

    // If neighbors strongly favor a type, adopt it
    const strongest = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])[0];
    if (strongest && strongest[1] > 1.2 && Math.random() < 0.7) {
      this.grid[y][x].type = strongest[0];
    }
  },

  _placeKeyLocations() {
    const bridge = this.KEY_LOCATIONS.bridge;
    this.grid[bridge.y][bridge.x].type = 'shore';
    this.grid[bridge.y][bridge.x].keyLocation = 'bridge';
    this.grid[bridge.y][bridge.x].name = 'Mainland Bridge';
    this.grid[bridge.y][bridge.x].desc = 'The main bridge connecting New Hampton to the mainland. Rubble and abandoned cars litter the approach.';

    const dock = this.KEY_LOCATIONS.dock;
    this.grid[dock.y][dock.x].type = 'shore';
    this.grid[dock.y][dock.x].keyLocation = 'dock';
    this.grid[dock.y][dock.x].name = 'Harbor Ferry Terminal';
    this.grid[dock.y][dock.x].desc = 'The ferry terminal sits at the water\'s edge. A few boats are moored at the docks, rocking gently.';

    const airstrip = this.KEY_LOCATIONS.airstrip;
    this.grid[airstrip.y][airstrip.x].type = 'rural';
    this.grid[airstrip.y][airstrip.x].keyLocation = 'airstrip';
    this.grid[airstrip.y][airstrip.x].name = 'New Hampton Municipal Airfield';
    this.grid[airstrip.y][airstrip.x].desc = 'A small regional airstrip with a single runway. A few light aircraft sit on the tarmac.';
  },

  _nameBlocks() {
    const urbanNames = [
      'Downtown', 'Main Street', 'Market District', 'City Center',
      'Old Town', 'Commerce Row', 'Civic Plaza', 'Financial District',
    ];
    const suburbanNames = [
      'Oak Park', 'Maple Heights', 'Riverside', 'Greenfield',
      'Elmwood', 'Cedar Grove', 'Hillcrest', 'Lakewood',
      'Pinecrest', 'Brookside', 'Fairview', 'Westgate',
    ];
    const ruralNames = [
      'Farmlands', 'Pine Woods', 'Open Fields', 'Old Mill Road',
      'Orchard Valley', 'Dusty Acres', 'Ridgeline', 'Meadow Creek',
    ];
    const shoreNames = [
      'North Beach', 'South Beach', 'East Shore', 'West Shore',
      'Rocky Point', 'Sandy Cove', 'Driftwood Beach', 'Seaside',
      'Lighthouse Point', 'Pier Row',
    ];

    const used = new Set();
    const pickName = (list) => {
      const available = list.filter(n => !used.has(n));
      if (available.length === 0) return list[Math.floor(Math.random() * list.length)];
      const name = available[Math.floor(Math.random() * available.length)];
      used.add(name);
      return name;
    };

    for (let y = 0; y < this.SIZE; y++) {
      for (let x = 0; x < this.SIZE; x++) {
        const cell = this.grid[y][x];
        if (cell.name) continue; // Already named (key location)
        const nameList = { urban: urbanNames, suburban: suburbanNames, rural: ruralNames, shore: shoreNames }[cell.type];
        cell.name = pickName(nameList);
        if (!cell.desc) {
          cell.desc = this._generateBlockDesc(cell);
        }
      }
    }
  },

  _generateBlockDesc(cell) {
    const descs = {
      urban: [
        'Tall buildings line the streets, many with shattered windows.',
        'A dense urban block. Cars sit abandoned at odd angles.',
        'Storefronts and offices. Some doors hang open.',
        'The smell of smoke lingers between concrete buildings.',
      ],
      suburban: [
        'Quiet residential streets. A few houses have boarded windows.',
        'Lawns are overgrown. A dog barks somewhere in the distance.',
        'A typical suburban neighborhood, eerily silent.',
        'Houses and small shops. Some lights still flicker inside.',
      ],
      rural: [
        'Open ground with scattered trees. Good visibility.',
        'Fields stretch in every direction. A barn sits in the distance.',
        'The road turns to gravel here. Not much cover.',
        'Tall grass and wildflowers. Peaceful, if you ignore the circumstances.',
      ],
      shore: [
        'Waves lap at the shore. The salt air is thick.',
        'Sandy ground meets water. Seagulls circle overhead.',
        'The coastline stretches in both directions. Nowhere to hide.',
        'Rocky shore with tidepools. The water looks cold.',
      ],
    };
    const list = descs[cell.type] || descs.rural;
    return list[Math.floor(Math.random() * list.length)];
  },

  _generateBuildings(x, y) {
    const cell = this.grid[y][x];
    const key = `${x},${y}`;
    this.buildings[key] = [];

    // Number of buildings based on terrain type
    const counts = { urban: [3, 6], suburban: [2, 4], rural: [0, 2], shore: [0, 1] };
    const [min, max] = counts[cell.type] || [0, 2];
    const numBuildings = min + Math.floor(Math.random() * (max - min + 1));

    // Filter applicable buildings from data
    const applicable = H720Data.buildings.filter(b => {
      if (cell.type === 'urban') return true;
      if (cell.type === 'suburban') return b.bldg_cat !== 'industrial';
      if (cell.type === 'rural') return ['park', 'farm', 'residence'].includes(b.bldg_cat);
      return b.bldg_cat === 'park' || b.bldg_cat === 'dock';
    });

    for (let i = 0; i < numBuildings; i++) {
      if (applicable.length === 0) break;
      const template = applicable[Math.floor(Math.random() * applicable.length)];
      const bldg = {
        id: `bldg_${x}_${y}_${i}`,
        name: this._resolveName(template.bldg_name),
        desc: this._resolveName(template.bldg_desc),
        light: template.bldg_light,
        cover: template.bldg_cover,
        security: template.bldg_sec,
        rooms: [],
        zombies: [],
        npcs: [],
      };

      // Generate rooms for this building
      const numRooms = Math.max(1, Math.min(template.bldg_numRoom, template.bldg_max || 5));
      const roomTemplates = H720Data.rooms.filter(r => {
        // Loosely match room category to building category
        return true; // Simplified — all rooms available
      });

      for (let j = 0; j < numRooms; j++) {
        const rt = roomTemplates[Math.floor(Math.random() * roomTemplates.length)];
        const room = {
          id: `${bldg.id}_room_${j}`,
          name: rt.room_name,
          desc: rt.room_desc,
          light: rt.room_light,
          cover: rt.room_cover,
          security: rt.room_sec,
          items: this._generateRoomItems(rt),
          zombies: [],
          searched: false,
        };
        bldg.rooms.push(room);
      }

      this.buildings[key].push(bldg);
    }
  },

  _generateRoomItems(roomTemplate) {
    const items = [];
    const numItems = Math.floor(Math.random() * (roomTemplate.room_numItem || 2)) + 1;

    // Weight items by inverse scarcity
    const weighted = [];
    H720Data.items.forEach(item => {
      const weight = Math.max(1, 10 - item.item_scarcity);
      for (let i = 0; i < weight; i++) weighted.push(item);
    });

    for (let i = 0; i < numItems; i++) {
      if (Math.random() < 0.4) continue; // 60% chance per slot to actually have an item
      const template = weighted[Math.floor(Math.random() * weighted.length)];
      items.push({
        id: template.item_id,
        name: template.item_name,
        desc: template.item_desc,
        melee: template.item_melee,
        missile: template.item_missle,
        health: template.item_health,
        craft: template.item_craft,
      });
    }
    return items;
  },

  /** Get cell at coordinates */
  getCell(x, y) {
    if (x < 0 || x >= this.SIZE || y < 0 || y >= this.SIZE) return null;
    return this.grid[y]?.[x] || null;
  },

  /** Get buildings at coordinates */
  getBuildings(x, y) {
    return this.buildings[`${x},${y}`] || [];
  },

  /** Get navigable directions from a position */
  getDirections(x, y) {
    return {
      n: y > 0,
      s: y < this.SIZE - 1,
      e: x < this.SIZE - 1,
      w: x > 0,
    };
  },
};
