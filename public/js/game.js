/**
 * Hour 720 — Main Game Controller
 * Wires the engine to the DOM. Manages screen transitions and UI updates.
 */

const Game = {

  // Screen elements
  screens: {},
  currentScreen: null,

  // Current generated character (before starting)
  pendingCharacter: null,

  async init() {
    // Cache screen elements
    this.screens = {
      saves: document.getElementById('screen-saves'),
      chargen: document.getElementById('screen-chargen'),
      game: document.getElementById('screen-game'),
      end: document.getElementById('screen-end'),
    };

    // Load game data
    await H720Data.load();

    // Bind UI events
    this._bindEvents();

    // Check for existing saves
    const saves = SaveSystem.listSaves();
    if (saves.length > 0) {
      this._showScreen('saves');
      this._renderSaveList(saves);
    } else {
      this._showScreen('chargen');
      this._rollCharacter();
    }
  },

  // --- Screen management ---

  _showScreen(name) {
    Object.values(this.screens).forEach(s => s.classList.add('hidden'));
    if (this.screens[name]) {
      this.screens[name].classList.remove('hidden');
      this.currentScreen = name;
    }
  },

  // --- Save/Load screen ---

  _renderSaveList(saves) {
    const list = document.getElementById('save-list');
    list.innerHTML = '';
    saves.forEach(save => {
      const li = document.createElement('li');
      li.innerHTML = `
        <div>
          <div class="save-name">${this._esc(save.name)}</div>
          <div class="save-day">Day ${save.day}</div>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <div class="save-date">${new Date(save.date).toLocaleDateString()}</div>
          <button class="save-delete" title="Delete save">&times;</button>
        </div>
      `;
      // Click row to load (but not if clicking delete)
      li.addEventListener('click', (e) => {
        if (e.target.closest('.save-delete')) return;
        this._loadSave(save.id);
      });
      // Delete button
      li.querySelector('.save-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        SaveSystem.deleteSave(save.id);
        this._renderSaveList(SaveSystem.listSaves());
      });
      list.appendChild(li);
    });
  },

  async _loadSave(saveId) {
    const save = SaveSystem.load(saveId);
    if (!save) return;
    await Engine.restoreGame(save);
    this._showScreen('game');
    this._startGameUI();
    this._restoreEventLog();
  },

  // --- Character creation ---

  _rollCharacter() {
    this.pendingCharacter = CharGen.generate();
    this._renderCharSheet(this.pendingCharacter);
  },

  _renderCharSheet(char) {
    document.getElementById('char-name-input').value = char.fullName;
    document.getElementById('cd-profession').textContent = char.profession;
    document.getElementById('cd-age').textContent = `${char.age} (${char.ageGroup})`;
    document.getElementById('cd-gender').textContent = char.genderLabel;
    document.getElementById('cd-bodytype').textContent = char.bodyType;
    document.getElementById('cd-lifestyle').textContent = char.lifestyle;
    document.getElementById('cd-skills').textContent = char.skills.map(s => s.name).join(', ') || 'None';
    document.getElementById('cs-str').textContent = char.str;
    document.getElementById('cs-dex').textContent = char.dex;
    document.getElementById('cs-mt').textContent = char.mt;
    document.getElementById('cs-pt').textContent = char.pt;
    document.getElementById('cs-hp').textContent = char.hp;
    document.getElementById('cs-mh').textContent = char.mh;
  },

  // --- Main game UI ---

  _startGameUI() {
    this._renderMap();
    this._updateUI();
    Engine.startLoop(() => this._updateUI());
  },

  _updateUI() {
    // Clock
    document.getElementById('game-day').textContent = `Day ${Engine.day}`;
    document.getElementById('game-time').textContent = Engine.clockString;

    // Noise indicator
    const noiseInfo = Engine.noiseLevel;
    const noiseEl = document.getElementById('noise-indicator');
    noiseEl.textContent = noiseInfo.label;
    noiseEl.className = `noise-indicator ${noiseInfo.css}`;

    // Character stats
    const c = Engine.character;
    if (!c) return;

    document.getElementById('game-char-name').textContent = c.fullName;
    document.getElementById('game-char-prof').textContent = `${c.profession} | ${c.age} ${c.ageGroup}`;

    document.getElementById('game-hp').textContent = `${Math.round(c.hp)}/${c.maxHp}`;
    document.getElementById('game-mh').textContent = `${Math.round(c.mh)}/${c.maxMh}`;
    document.getElementById('game-str').textContent = c.str;
    document.getElementById('game-dex').textContent = c.dex;
    document.getElementById('game-mt').textContent = c.mt;
    document.getElementById('game-pt').textContent = c.pt;

    // Health bars
    const hpPct = Math.max(0, (c.hp / c.maxHp) * 100);
    const mhPct = Math.max(0, (c.mh / c.maxMh) * 100);
    const hpBar = document.getElementById('hp-bar');
    const mhBar = document.getElementById('mh-bar');
    hpBar.style.width = hpPct + '%';
    mhBar.style.width = mhPct + '%';
    hpBar.className = `fill hp${hpPct < 25 ? ' critical' : hpPct < 50 ? ' warning' : ''}`;
    mhBar.className = `fill mh${mhPct < 25 ? ' critical' : mhPct < 50 ? ' warning' : ''}`;

    // Character icon
    const iconContainer = document.getElementById('char-icon');
    const healthLevel = hpPct > 66 ? 3 : hpPct > 33 ? 2 : 1;
    const iconFile = `${c.iconSet}_h${healthLevel}${c.infected ? '_z' : ''}.png`;
    const imgBase = document.querySelector('script[src*="game.js"]')?.getAttribute('src')?.replace(/js\/game\.js.*$/, '') || '../';
    iconContainer.innerHTML = `<img src="${imgBase}img/healthIcons/${iconFile}" alt="${c.fullName}">`;

    // Mental state
    const mentalState = Combat.getMentalState(c.mt);
    document.getElementById('game-conditions').innerHTML = `
      <div>Mental: ${mentalState.name}</div>
      ${c.infected ? '<div class="text-red">INFECTED</div>' : ''}
      ${c.conditions.map(cond => `<div>${cond}</div>`).join('')}
    `;

    // Inventory
    this._renderInventory();

    // Location info
    const cell = GameMap.getCell(Engine.playerPos.x, Engine.playerPos.y);
    if (cell) {
      document.getElementById('loc-name').textContent = Engine.playerLocation?.building
        ? Engine.playerLocation.building.name
        : cell.name;
      document.getElementById('loc-type').textContent = Engine.playerLocation?.room
        ? Engine.playerLocation.room.name
        : Engine.playerLocation?.building
        ? 'Inside'
        : cell.type.charAt(0).toUpperCase() + cell.type.slice(1);
      document.getElementById('loc-desc').textContent = Engine.playerLocation?.room
        ? Engine.playerLocation.room.desc
        : Engine.playerLocation?.building
        ? Engine.playerLocation.building.desc
        : cell.desc;
    }

    // Nearby
    this._renderNearby();

    // Navigation
    this._updateNav();

    // Map highlight
    this._updateMapHighlight();

    // Action buttons context
    this._updateActionButtons();

    // Radio indicator
    if (Radio.hasUnheard(Engine.day)) {
      document.getElementById('btn-radio').style.color = 'var(--text-yellow)';
    } else {
      document.getElementById('btn-radio').style.color = '';
    }
  },

  /**
   * Build the sidebar map grid once. Called at game start.
   */
  _renderMap() {
    const grid = document.getElementById('map-grid');
    grid.style.gridTemplateColumns = `repeat(${GameMap.SIZE}, 1fr)`;
    grid.innerHTML = '';

    for (let y = 0; y < GameMap.SIZE; y++) {
      for (let x = 0; x < GameMap.SIZE; x++) {
        const cell = GameMap.grid[y][x];
        const div = document.createElement('div');
        div.className = `map-cell ${cell.type}`;
        div.dataset.x = x;
        div.dataset.y = y;

        // Key location markers — always visible
        const keyLetters = { bridge: 'B', dock: 'D', airstrip: 'A' };
        if (cell.keyLocation) {
          div.classList.add('key-location');
          div.innerHTML = `<span class="cell-icon">${keyLetters[cell.keyLocation]}</span>`;
        }

        div.addEventListener('click', () => {
          if (Engine.playerLocation) return;
          const dx = Math.abs(x - Engine.playerPos.x);
          const dy = Math.abs(y - Engine.playerPos.y);
          if (dx + dy === 1) {
            if (x > Engine.playerPos.x) Engine.move('e');
            else if (x < Engine.playerPos.x) Engine.move('w');
            else if (y > Engine.playerPos.y) Engine.move('s');
            else Engine.move('n');
          }
        });

        grid.appendChild(div);
      }
    }
  },

  _updateMapHighlight() {
    // Lightweight update — patch cells in place, don't rebuild DOM
    const grid = document.getElementById('map-grid');
    const cells = grid.children;
    const keyLetters = { bridge: 'B', dock: 'D', airstrip: 'A' };

    for (let i = 0; i < cells.length; i++) {
      const div = cells[i];
      const x = parseInt(div.dataset.x);
      const y = parseInt(div.dataset.y);
      const cell = GameMap.grid[y]?.[x];
      if (!cell) continue;

      // Update explored state
      div.style.opacity = cell.explored ? '1' : '0.3';
      div.title = cell.explored ? cell.name : '???';

      // Update current position marker
      const isCurrent = x === Engine.playerPos.x && y === Engine.playerPos.y;
      div.classList.toggle('current', isCurrent);

      if (isCurrent) {
        div.innerHTML = '<span class="cell-icon">@</span>';
      } else if (cell.keyLocation) {
        div.innerHTML = `<span class="cell-icon">${keyLetters[cell.keyLocation]}</span>`;
      } else {
        div.innerHTML = '';
      }
    }
  },

  _updateNav() {
    const dirs = GameMap.getDirections(Engine.playerPos.x, Engine.playerPos.y);
    document.getElementById('nav-n').disabled = !dirs.n || !!Engine.playerLocation;
    document.getElementById('nav-s').disabled = !dirs.s || !!Engine.playerLocation;
    document.getElementById('nav-e').disabled = !dirs.e || !!Engine.playerLocation;
    document.getElementById('nav-w').disabled = !dirs.w || !!Engine.playerLocation;
  },

  _renderInventory() {
    const list = document.getElementById('inventory-list');
    const inv = Engine.character?.inventory || [];
    if (inv.length === 0) {
      list.innerHTML = '<li class="text-muted">Empty</li>';
      return;
    }
    list.innerHTML = inv.map((item, i) => `
      <li>
        <span class="item-name" title="${this._esc(item.name)} — ${this._esc(item.desc)}">${this._esc(item.name)}</span>
        <span class="item-actions">
          <button onclick="Game._useItem(${i})" style="font-size:0.7rem;padding:0 4px;cursor:pointer;background:var(--accent-green);border:1px solid var(--accent-brown);color:var(--bg-darker);">Use</button>
          <button onclick="Game._dropItem(${i})" style="font-size:0.7rem;padding:0 4px;cursor:pointer;background:#665;border:1px solid var(--accent-brown);color:var(--text-light);">Drop</button>
        </span>
      </li>
    `).join('');
  },

  _renderNearby() {
    const el = document.getElementById('game-nearby');
    const parts = [];

    // Zombies
    const cell = GameMap.getCell(Engine.playerPos.x, Engine.playerPos.y);
    if (cell && cell.zombies.length > 0) {
      parts.push(`<div class="text-red">${cell.zombies.length} zombie${cell.zombies.length > 1 ? 's' : ''}</div>`);
    }

    // NPCs
    const npcs = NPCSystem.getNPCsAt(Engine.playerPos.x, Engine.playerPos.y);
    npcs.forEach(npc => {
      let npcText = `<div class="text-green">${this._esc(npc.fullName)}`;
      if (npc.condition && !npc.conditionHelped) {
        npcText += ` <button onclick="Game._helpNPC('${npc.id}')" style="font-size:0.65rem;padding:0 3px;cursor:pointer;background:var(--accent-green);border:1px solid var(--accent-brown);color:var(--bg-darker);">Help</button>`;
      }
      npcText += '</div>';
      parts.push(npcText);
    });

    // Buildings (if outdoors)
    if (!Engine.playerLocation) {
      const bldgs = GameMap.getBuildings(Engine.playerPos.x, Engine.playerPos.y);
      bldgs.forEach(b => {
        parts.push(`<div><a href="#" onclick="Game._enterBuilding('${b.id}');return false;" style="color:var(--text-yellow-pale);">${this._esc(b.name)}</a></div>`);
      });
    } else if (Engine.playerLocation.building && !Engine.playerLocation.room) {
      // Inside building — show rooms prominently
      const bldg = Engine.playerLocation.building;
      if (bldg.rooms.length > 0) {
        parts.push('<div class="text-muted" style="margin-bottom:0.25rem;font-size:0.7rem;">Rooms to explore:</div>');
        bldg.rooms.forEach(r => {
          const searched = r.searched ? ' <span class="text-muted">(searched)</span>' : '';
          parts.push(`<div style="padding:2px 0;"><a href="#" onclick="Game._enterRoom('${r.id}');return false;" class="room-link">${this._esc(r.name)}</a>${searched}</div>`);
        });
      } else {
        parts.push('<div class="text-muted">Nothing to explore here.</div>');
      }
      parts.push(`<div style="margin-top:0.5rem;"><a href="#" onclick="Game._leaveBuilding();return false;" style="color:var(--text-light);">[Leave building]</a></div>`);
    } else if (Engine.playerLocation.room) {
      // Inside a room — show items, other rooms, and leave
      const room = Engine.playerLocation.room;
      if (room.items.length > 0) {
        parts.push('<div class="text-muted" style="margin-bottom:0.25rem;font-size:0.7rem;">Items here:</div>');
        room.items.forEach(item => {
          parts.push(`<div style="padding:2px 0;"><a href="#" onclick="Game._takeItem('${this._esc(item.name).replace(/'/g, "\\'")}');return false;" style="color:var(--text-yellow-soft);">${this._esc(item.name)}</a></div>`);
        });
      } else if (room.searched) {
        parts.push('<div class="text-muted">Nothing left here.</div>');
      }
      // Other rooms in this building
      const otherRooms = Engine.playerLocation.building.rooms.filter(r => r.id !== room.id);
      if (otherRooms.length > 0) {
        parts.push('<div class="text-muted" style="margin-top:0.5rem;margin-bottom:0.25rem;font-size:0.7rem;">Other rooms:</div>');
        otherRooms.forEach(r => {
          const searched = r.searched ? ' <span class="text-muted">(searched)</span>' : '';
          parts.push(`<div style="padding:2px 0;"><a href="#" onclick="Game._enterRoom('${r.id}');return false;" class="room-link">${this._esc(r.name)}</a>${searched}</div>`);
        });
      }
      parts.push(`<div style="margin-top:0.5rem;"><a href="#" onclick="Game._leaveBuilding();return false;" style="color:var(--text-light);">[Leave building]</a></div>`);
    }

    el.innerHTML = parts.length > 0 ? parts.join('') : '<span class="text-muted">Nothing</span>';
  },

  _updateActionButtons() {
    const cell = GameMap.getCell(Engine.playerPos.x, Engine.playerPos.y);
    const inBuilding = !!Engine.playerLocation;
    const hasZombies = cell && cell.zombies.length > 0;
    const isKeyLoc = cell?.keyLocation;

    document.getElementById('act-search').disabled = false; // Search works everywhere now

    const enterBtn = document.getElementById('act-enter');
    if (Engine.playerLocation?.room) {
      enterBtn.textContent = 'Leave Room';
      enterBtn.disabled = false;
    } else if (inBuilding) {
      enterBtn.textContent = 'Leave';
      enterBtn.disabled = false;
    } else {
      enterBtn.textContent = 'Enter';
      const bldgs = GameMap.getBuildings(Engine.playerPos.x, Engine.playerPos.y);
      enterBtn.disabled = bldgs.length === 0;
    }

    document.getElementById('act-attack').disabled = !hasZombies;
    document.getElementById('act-secure').disabled = false;
    document.getElementById('act-rest').disabled = false;

    // Escape button — visible at key locations or boathouses with boats
    const useBtn = document.getElementById('act-use');
    const inBoatWithBoat = Engine.playerLocation?.building?.hasBoat;
    if (isKeyLoc || inBoatWithBoat) {
      useBtn.textContent = 'Escape!';
      useBtn.disabled = false;
      useBtn.style.display = '';
    } else {
      useBtn.style.display = 'none';
    }
  },

  _restoreEventLog() {
    const log = document.getElementById('event-log');
    log.innerHTML = '';
    Engine.eventLog.forEach(e => {
      this._appendEventToDOM(e);
    });
    log.scrollTop = log.scrollHeight;
  },

  _appendEventToDOM(event) {
    const log = document.getElementById('event-log');
    const div = document.createElement('div');
    div.className = `event-entry${event.type === 'combat' ? ' event-combat' : event.type === 'radio' ? ' event-radio' : event.type === 'npc' ? ' event-npc npc-needs' : ''}`;
    div.innerHTML = `
      <div class="event-time">Day ${event.day} ${event.time}</div>
      <div class="event-text">${this._esc(event.message)}</div>
    `;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  },

  // --- End screen ---

  _showEndScreen(detail) {
    this._showScreen('end');
    const { outcome, route, stats, character } = detail;

    const outcomeEl = document.getElementById('end-outcome');
    const reportEl = document.getElementById('end-report');

    if (outcome === 'escaped') {
      const routeNames = { bridge: 'the Mainland Bridge', dock: 'a boat from the harbor', airstrip: 'a plane from the airfield', boat: 'a boat found in a boathouse' };
      outcomeEl.className = 'outcome escaped';
      outcomeEl.textContent = `You escaped New Hampton via ${routeNames[route] || 'unknown means'}.`;
    } else if (outcome === 'nuked') {
      outcomeEl.className = 'outcome nuked';
      outcomeEl.textContent = 'The government made its decision. New Hampton was sterilized.';
    } else if (outcome === 'died') {
      outcomeEl.className = 'outcome nuked';
      outcomeEl.textContent = `${character.fullName} did not survive.`;
    } else if (outcome === 'insane') {
      outcomeEl.className = 'outcome nuked';
      outcomeEl.textContent = `${character.fullName} lost all grip on reality.`;
    }

    // Narrative report
    reportEl.innerHTML = this._generateReport(outcome, route, stats, character);
  },

  _generateReport(outcome, route, stats, character) {
    const mentalState = Combat.getMentalState(character.mt);
    const paragraphs = [];

    // Opening
    paragraphs.push(
      `<p><strong>Field Report: ${this._esc(character.fullName)}</strong></p>`
    );
    paragraphs.push(
      `<p>${this._esc(character.fullName)} was ${character.age} years old, ` +
      `${CharGen.articleFor(CharGen.getProfessionLabel(character.profession))} ${CharGen.getProfessionLabel(character.profession)} ` +
      `from New Hampton. ${character.genderLabel === 'Male' ? 'He' : 'She'} survived ${stats.daysSurvived} day${stats.daysSurvived !== 1 ? 's' : ''} ` +
      `after the outbreak began.</p>`
    );

    // What they did
    const actions = [];
    if (stats.blocksExplored > 0) actions.push(`explored ${stats.blocksExplored} area${stats.blocksExplored !== 1 ? 's' : ''} of the city`);
    if (stats.buildingsEntered > 0) actions.push(`entered ${stats.buildingsEntered} building${stats.buildingsEntered !== 1 ? 's' : ''}`);
    if (stats.itemsFound > 0) actions.push(`found ${stats.itemsFound} item${stats.itemsFound !== 1 ? 's' : ''}`);
    if (stats.zombiesKilled > 0) actions.push(`killed ${stats.zombiesKilled} zombie${stats.zombiesKilled !== 1 ? 's' : ''}`);
    if (actions.length > 0) {
      paragraphs.push(`<p>During that time, ${character.genderLabel === 'Male' ? 'he' : 'she'} ${actions.join(', ')}.</p>`);
    }

    // NPCs
    if (stats.npcsHelped > 0) {
      paragraphs.push(
        `<p>${character.genderLabel === 'Male' ? 'He' : 'She'} helped ${stats.npcsHelped} fellow survivor${stats.npcsHelped !== 1 ? 's' : ''}` +
        `${stats.npcsDied > 0 ? `, though ${stats.npcsDied} other${stats.npcsDied !== 1 ? 's' : ''} didn't make it` : ''}.</p>`
      );
    } else if (stats.npcsDied > 0) {
      paragraphs.push(`<p>${stats.npcsDied} survivor${stats.npcsDied !== 1 ? 's' : ''} died without receiving help.</p>`);
    }

    // Mental state
    paragraphs.push(
      `<p>At the end, ${character.genderLabel === 'Male' ? 'his' : 'her'} mental state was: <strong>${mentalState.name}</strong>.</p>`
    );

    // Outcome-specific
    if (outcome === 'escaped') {
      paragraphs.push(
        `<p>${character.genderLabel === 'Male' ? 'He' : 'She'} made it out. ` +
        `Not everyone was so fortunate. But ${character.genderLabel === 'Male' ? 'he' : 'she'} would carry New Hampton with ` +
        `${character.genderLabel === 'Male' ? 'him' : 'her'} for the rest of ${character.genderLabel === 'Male' ? 'his' : 'her'} life.</p>`
      );
    } else if (outcome === 'nuked') {
      paragraphs.push(
        `<p>At 0600 on Day 8, a single warhead detonated above New Hampton. ` +
        `The blast was visible from the mainland. There were no survivors on the island.</p>` +
        `<p>The government classified the incident. The island was declared a restricted zone. ` +
        `The people of New Hampton were not mentioned in the official report.</p>`
      );
    } else if (outcome === 'died') {
      paragraphs.push(
        `<p>${character.genderLabel === 'Male' ? 'His' : 'Her'} body was never recovered.</p>`
      );
    }

    paragraphs.push(
      `<p class="text-muted" style="margin-top:2rem; font-size:0.8rem;">` +
      `This has been a simulation of Hour 720, a game that was never fully played. ` +
      `The people of New Hampton were fictional. The experience was real.</p>`
    );

    return paragraphs.join('');
  },

  // --- Radio overlay ---

  _radioStation: 'KPTN',  // Currently tuned station

  _showRadio() {
    const overlay = document.getElementById('radio-overlay');
    const broadcasts = Radio.getAvailableBroadcasts(Engine.day);

    if (broadcasts.length === 0) {
      Engine.addEvent('system', 'Nothing but static on the radio.');
      return;
    }

    this._renderRadioBroadcast(broadcasts);
    overlay.classList.remove('hidden');
    Engine.state = 'paused';
  },

  _renderRadioBroadcast(broadcasts) {
    // Find latest broadcast for the current station
    const stationBroadcasts = broadcasts.filter(b => b.station === this._radioStation);
    // Pick most recent unheard, or just most recent
    let broadcast = stationBroadcasts.filter(b => !b.heard).pop();
    if (!broadcast) broadcast = stationBroadcasts[stationBroadcasts.length - 1];

    // Station toggle buttons
    const stationBar = document.getElementById('radio-station-bar');
    if (stationBar) {
      stationBar.innerHTML = ['KPTN', 'WHMP'].map(s => {
        const active = s === this._radioStation ? ' style="background:var(--text-yellow);color:var(--bg-darker);"' : '';
        const hasUnheard = broadcasts.some(b => b.station === s && !b.heard);
        const dot = hasUnheard ? ' *' : '';
        return `<button onclick="Game._tuneStation('${s}')"${active}>${s}${dot}</button>`;
      }).join('');
    }

    if (broadcast) {
      document.getElementById('radio-title').textContent = `Day ${broadcast.day} Broadcast`;
      document.getElementById('radio-station').textContent = broadcast.stationName;
      document.getElementById('radio-text').innerHTML = this._esc(broadcast.text).replace(/\r\n/g, '\n').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
      Radio.markHeard(broadcast.key);
    } else {
      document.getElementById('radio-title').textContent = 'No Signal';
      document.getElementById('radio-station').textContent = this._radioStation;
      document.getElementById('radio-text').textContent = 'Nothing but static on this frequency.';
    }
  },

  _tuneStation(station) {
    this._radioStation = station;
    const broadcasts = Radio.getAvailableBroadcasts(Engine.day);
    this._renderRadioBroadcast(broadcasts);
  },

  _hideRadio() {
    document.getElementById('radio-overlay').classList.add('hidden');
    Engine.state = 'playing';
  },

  // --- Map modal ---

  _showMapModal() {
    const overlay = document.getElementById('map-overlay');
    const grid = document.getElementById('map-modal-grid');
    grid.style.gridTemplateColumns = `repeat(${GameMap.SIZE}, 1fr)`;
    grid.innerHTML = '';

    for (let y = 0; y < GameMap.SIZE; y++) {
      for (let x = 0; x < GameMap.SIZE; x++) {
        const cell = GameMap.grid[y][x];
        const div = document.createElement('div');
        div.className = `map-cell ${cell.type}`;

        if (!cell.explored) {
          div.style.opacity = '0.3';
          div.title = '???';
        } else {
          div.title = cell.name;
        }

        // Key location markers — always visible as letters
        const keyLetters = { bridge: 'B', dock: 'D', airstrip: 'A' };
        if (cell.keyLocation) {
          div.classList.add('key-location');
          div.innerHTML = `<span class="cell-icon">${keyLetters[cell.keyLocation]}</span>`;
        }

        // Current position
        if (x === Engine.playerPos.x && y === Engine.playerPos.y) {
          div.classList.add('current');
          div.innerHTML = '<span class="cell-icon">@</span>';
        }

        // Click to move (adjacent only, not while in a building)
        div.addEventListener('click', () => {
          if (Engine.playerLocation) return;
          const dx = Math.abs(x - Engine.playerPos.x);
          const dy = Math.abs(y - Engine.playerPos.y);
          if (dx + dy === 1) {
            if (x > Engine.playerPos.x) Engine.move('e');
            else if (x < Engine.playerPos.x) Engine.move('w');
            else if (y > Engine.playerPos.y) Engine.move('s');
            else Engine.move('n');
            this._hideMapModal();
          }
        });

        grid.appendChild(div);
      }
    }

    overlay.classList.remove('hidden');
    Engine.state = 'paused';
  },

  _hideMapModal() {
    document.getElementById('map-overlay').classList.add('hidden');
    Engine.state = 'playing';
  },

  // --- Action handlers ---

  _useItem(idx) {
    Engine.useItem(idx);
  },

  _dropItem(idx) {
    Engine.dropItem(idx);
  },

  _helpNPC(npcId) {
    Engine.helpNPC(npcId);
  },

  _enterBuilding(bldgId) {
    Engine.enterBuilding(bldgId);
  },

  _enterRoom(roomId) {
    Engine.enterRoom(roomId);
  },

  _leaveBuilding() {
    Engine.leaveBuilding();
  },

  _leaveRoom() {
    if (Engine.playerLocation?.room) {
      const bldg = Engine.playerLocation.building;
      Engine.playerLocation.room = null;
      Engine.addEvent('system', `You step back into ${bldg.name}.`);
    }
  },

  _takeItem(itemName) {
    if (!Engine.playerLocation?.room) return;
    const room = Engine.playerLocation.room;
    const item = room.items.find(i => i.name === itemName);
    if (item) Engine.takeItem(item);
  },

  // --- Event binding ---

  _bindEvents() {
    // New game button
    document.getElementById('btn-new-game').addEventListener('click', () => {
      this._showScreen('chargen');
      this._rollCharacter();
    });

    // Re-roll buttons
    document.getElementById('btn-reroll-char').addEventListener('click', () => this._rollCharacter());
    document.getElementById('btn-reroll-name').addEventListener('click', () => {
      if (!this.pendingCharacter) return;
      const name = H720Data.getRandomName(this.pendingCharacter.gender);
      this.pendingCharacter.firstName = name.first;
      this.pendingCharacter.lastName = name.last;
      this.pendingCharacter.fullName = `${name.first} ${name.last}`;
      document.getElementById('char-name-input').value = this.pendingCharacter.fullName;
    });

    // Start game
    document.getElementById('btn-start-game').addEventListener('click', async () => {
      const nameInput = document.getElementById('char-name-input').value.trim();
      if (nameInput && nameInput !== this.pendingCharacter.fullName) {
        const parts = nameInput.split(' ');
        this.pendingCharacter.firstName = parts[0];
        this.pendingCharacter.lastName = parts.slice(1).join(' ') || this.pendingCharacter.lastName;
        this.pendingCharacter.fullName = nameInput;
      }
      await Engine.initNewGame(this.pendingCharacter);
      this._showScreen('game');
      this._startGameUI();
    });

    // Navigation
    document.getElementById('nav-n').addEventListener('click', () => Engine.move('n'));
    document.getElementById('nav-s').addEventListener('click', () => Engine.move('s'));
    document.getElementById('nav-e').addEventListener('click', () => Engine.move('e'));
    document.getElementById('nav-w').addEventListener('click', () => Engine.move('w'));

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (Engine.state !== 'playing') return;
      const keyMap = {
        'ArrowUp': 'n', 'ArrowDown': 's', 'ArrowLeft': 'w', 'ArrowRight': 'e',
        'w': 'n', 's': 's', 'a': 'w', 'd': 'e',
      };
      if (keyMap[e.key] && !Engine.playerLocation) {
        e.preventDefault();
        Engine.move(keyMap[e.key]);
      }
    });

    // Action buttons
    document.getElementById('act-search').addEventListener('click', () => {
      const found = Engine.search();
      found.forEach(item => Engine.takeItem(item));
    });

    document.getElementById('act-enter').addEventListener('click', () => {
      if (Engine.playerLocation) {
        if (Engine.playerLocation.room) {
          this._leaveRoom();
        } else {
          Engine.leaveBuilding();
        }
      } else {
        const bldgs = GameMap.getBuildings(Engine.playerPos.x, Engine.playerPos.y);
        if (bldgs.length === 1) {
          Engine.enterBuilding(bldgs[0].id);
        } else if (bldgs.length > 1) {
          // Enter the first one — user can pick from nearby list
          Engine.enterBuilding(bldgs[0].id);
        }
      }
    });

    document.getElementById('act-secure').addEventListener('click', () => Engine.secureLoc());
    document.getElementById('act-rest').addEventListener('click', () => Engine.rest());

    document.getElementById('act-attack').addEventListener('click', () => {
      const cell = GameMap.getCell(Engine.playerPos.x, Engine.playerPos.y);
      if (cell && cell.zombies.length > 0) {
        Engine.attackZombie(0); // Attack first zombie
      }
    });

    document.getElementById('act-use').addEventListener('click', () => {
      const cell = GameMap.getCell(Engine.playerPos.x, Engine.playerPos.y);
      if (cell?.keyLocation) {
        Engine.attemptEscape(cell.keyLocation);
      } else if (Engine.playerLocation?.building?.hasBoat) {
        Engine.attemptEscape('boat');
      }
    });

    // Radio
    document.getElementById('btn-radio').addEventListener('click', () => this._showRadio());
    document.getElementById('tool-radio').addEventListener('click', () => this._showRadio());
    document.getElementById('radio-close').addEventListener('click', () => this._hideRadio());

    // Save
    document.getElementById('btn-save').addEventListener('click', () => {
      const success = SaveSystem.save(Engine.getState());
      Engine.addEvent('system', success ? 'Game saved.' : 'Save failed.');
    });

    // Menu
    document.getElementById('btn-menu').addEventListener('click', () => {
      Engine.stopLoop();
      this._showScreen('saves');
      this._renderSaveList(SaveSystem.listSaves());
    });

    // Toolbox
    document.getElementById('tool-map').addEventListener('click', () => this._showMapModal());
    document.getElementById('map-modal-close').addEventListener('click', () => this._hideMapModal());
    document.getElementById('tool-pack').addEventListener('click', () => {
      const panel = document.querySelector('.inventory-panel');
      if (!panel) return;
      // Scroll into view on mobile, flash highlight on desktop
      panel.scrollIntoView({ behavior: 'smooth' });
      panel.style.outline = '2px solid var(--text-yellow)';
      setTimeout(() => { panel.style.outline = ''; }, 1500);
    });
    document.getElementById('tool-search').addEventListener('click', () => {
      const found = Engine.search();
      found.forEach(item => Engine.takeItem(item));
    });
    document.getElementById('tool-secure').addEventListener('click', () => Engine.secureLoc());

    // Game events
    document.addEventListener('gameEvent', (e) => {
      this._appendEventToDOM(e.detail);
      this._updateUI();
    });

    // Game end
    document.addEventListener('gameEnd', (e) => {
      this._showEndScreen(e.detail);
    });

    // Play again
    document.getElementById('btn-play-again').addEventListener('click', () => {
      this._showScreen('chargen');
      this._rollCharacter();
    });
  },

  _esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
};

// Boot
document.addEventListener('DOMContentLoaded', () => Game.init());
