/**
 * Hour 720 — Data Loader
 * Loads all JSON game data and provides access to it.
 */

const H720Data = {
  items: [],
  skills: [],
  buildings: [],
  blocks: [],
  rooms: [],
  jobclasses: [],
  lifestyles: [],
  names: { maleFirst: [], femaleFirst: [], last: [] },
  radio: [],
  users: [],
  maps: [],
  _loaded: false,

  async load() {
    if (this._loaded) return;

    // Resolve data path relative to the script location
    const scriptEl = document.querySelector('script[src*="data.js"]');
    let basePath = 'data/';
    if (scriptEl) {
      const src = scriptEl.getAttribute('src');
      basePath = src.replace(/js\/data\.js.*$/, 'data/');
    }

    const files = [
      'items', 'skills', 'buildings', 'blocks', 'rooms',
      'jobclasses', 'lifestyles', 'names', 'radio', 'users', 'maps'
    ];

    const results = await Promise.all(
      files.map(f => fetch(basePath + f + '.json').then(r => r.json()))
    );

    [this.items, this.skills, this.buildings, this.blocks, this.rooms,
     this.jobclasses, this.lifestyles, this._rawNames, this.radio, this.users, this.maps] = results;

    // Index names by type and gender
    this.names.maleFirst = this._rawNames
      .filter(n => n.name_type === 'firstName' && n.name_gender === 'm')
      .map(n => n.name_text);
    this.names.femaleFirst = this._rawNames
      .filter(n => n.name_type === 'firstName' && n.name_gender === 'f')
      .map(n => n.name_text);
    this.names.last = this._rawNames
      .filter(n => n.name_type === 'lastName')
      .map(n => n.name_text);

    // Index skills by ID for quick lookup
    this.skillsById = {};
    this.skills.forEach(s => { this.skillsById[s.skill_id] = s; });

    // Index items by ID
    this.itemsById = {};
    this.items.forEach(i => { this.itemsById[i.item_id] = i; });

    // Build lifestyle probability table
    this.lifestyleTable = [];
    this.lifestyles.forEach(ls => {
      for (let i = 0; i < ls.lstyle_prob; i++) {
        this.lifestyleTable.push(ls);
      }
    });

    this._loaded = true;
  },

  getSkillName(id) {
    return this.skillsById[id]?.skill_name || 'Unknown';
  },

  getItemById(id) {
    return this.itemsById[id] || null;
  },

  getRandomName(gender) {
    const firsts = gender === 'm' ? this.names.maleFirst : this.names.femaleFirst;
    const first = firsts[Math.floor(Math.random() * firsts.length)];
    const last = this.names.last[Math.floor(Math.random() * this.names.last.length)];
    // Title case
    const tc = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return { first: tc(first), last: tc(last) };
  }
};
