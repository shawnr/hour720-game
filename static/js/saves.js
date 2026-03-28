/**
 * Hour 720 — Save/Load System
 * Manages localStorage persistence for game sessions.
 */

const SaveSystem = {

  STORAGE_KEY: 'h720_saves',
  MAX_SAVES: 10,

  /**
   * Get all saved games.
   * Returns array of { id, name, day, time, date, character }
   */
  listSaves() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      const saves = JSON.parse(raw);
      return saves.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch {
      return [];
    }
  },

  /**
   * Save current game state.
   */
  save(gameState) {
    const saves = this.listSaves();
    const id = gameState.saveId || `save_${Date.now()}`;

    const saveData = {
      id,
      name: gameState.character.fullName,
      day: gameState.day,
      time: gameState.timeOfDay,
      date: new Date().toISOString(),
      character: gameState.character,
      playerPos: gameState.playerPos,
      mapSeed: gameState.mapSeed,
      map: gameState.map,
      buildings: gameState.buildings,
      npcs: gameState.npcs,
      radio: gameState.radio,
      eventLog: gameState.eventLog.slice(-50), // Keep last 50 events
      gameTime: gameState.gameTime,
      bridgeOpen: gameState.bridgeOpen,
      stats: gameState.stats,
    };

    // Replace existing save or add new
    const existingIdx = saves.findIndex(s => s.id === id);
    if (existingIdx >= 0) {
      saves[existingIdx] = saveData;
    } else {
      saves.unshift(saveData);
    }

    // Trim to max saves
    while (saves.length > this.MAX_SAVES) saves.pop();

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(saves));
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  },

  /**
   * Load a specific save by ID.
   */
  load(saveId) {
    const saves = this.listSaves();
    return saves.find(s => s.id === saveId) || null;
  },

  /**
   * Delete a save by ID.
   */
  deleteSave(saveId) {
    const saves = this.listSaves().filter(s => s.id !== saveId);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(saves));
  },

  /**
   * Auto-save (overwrites the current session's save).
   */
  autoSave(gameState) {
    return this.save(gameState);
  },
};
