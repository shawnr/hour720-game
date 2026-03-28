/**
 * Hour 720 — Combat & Event System
 * Ported from eventParser.php and the game design docs.
 */

const Combat = {

  // Mental health states from Mental_Health_for_H720.doc
  MENTAL_STATES: [
    { name: 'Confident',  min: 17, max: 20, skillMod: 3,  mtLossOnFail: -1 },
    { name: 'Solid',      min: 13, max: 16, skillMod: 2,  mtLossOnFail: -1 },
    { name: 'Stable',     min: 9,  max: 12, skillMod: 0,  mtLossOnFail: -1 },
    { name: 'Unstable',   min: 5,  max: 8,  skillMod: -1, mtLossOnFail: -2 },
    { name: 'Scared',     min: 2,  max: 4,  skillMod: -2, mtLossOnFail: -2 },
    { name: 'Panicked',   min: 0,  max: 1,  skillMod: -3, mtLossOnFail: -3 },
    { name: 'Insane',     min: -99, max: -1, skillMod: -3, mtLossOnFail: -3 },
  ],

  // Professions immune to initial horror save
  HORROR_IMMUNE: ['EMT', 'Medical', 'Firefighter', 'Law Enforcement', 'Military', 'Clergy'],

  /**
   * Get mental state for a given MT value.
   */
  getMentalState(mt) {
    for (const state of this.MENTAL_STATES) {
      if (mt >= state.min && mt <= state.max) return state;
    }
    return this.MENTAL_STATES[this.MENTAL_STATES.length - 1];
  },

  /**
   * Horror save when encountering zombies.
   * Returns { passed, mtChange, newMt, message }
   */
  horrorSave(character, zombieCount) {
    const state = this.getMentalState(character.mt);
    const isImmune = this.HORROR_IMMUNE.includes(character.profession);

    // First encounter: immune professions auto-pass
    if (isImmune && zombieCount <= 2) {
      return { passed: true, mtChange: 0, newMt: character.mt,
        message: `Your ${character.profession.toLowerCase()} training steadies your nerves.` };
    }

    // Save: roll d20, must beat (10 + zombieCount - mt_modifier)
    const target = 10 + Math.min(zombieCount, 5) - Math.floor(character.mt / 4);
    const roll = Math.floor(Math.random() * 20) + 1;
    const passed = roll >= target;

    let mtChange = 0;
    if (!passed) {
      mtChange = state.mtLossOnFail;
    }

    const newMt = Math.max(-5, character.mt + mtChange);
    const message = passed
      ? 'You steel yourself against the horror.'
      : `The sight shakes you. (MT ${mtChange})`;

    return { passed, mtChange, newMt, message };
  },

  /**
   * Resolve an attack.
   * attacker/defender: { str, dex, hp, mh, mt, pt, weapon? }
   * Returns { hit, damage, message, defenderHp }
   */
  resolveAttack(attacker, defender, options = {}) {
    const weapon = attacker.weapon || { melee: 1, missile: 0 };
    const isMelee = !options.ranged;
    const timeOfDay = options.timeOfDay || 'day';
    const cover = options.cover || 0;

    // Attack rating = DEX + HP (current, not max)
    const attackRating = attacker.dex + Math.min(attacker.hp, 20);
    // Defense rating = DEX + MH (current)
    const defenseRating = defender.dex + Math.min(defender.mh, 20);

    // Modifier
    let modifier = attackRating - defenseRating;

    // Cover adjustments (missile only)
    if (!isMelee) {
      if (cover >= 15) modifier -= 6;       // heavy
      else if (cover >= 10) modifier -= 3;  // medium
      else if (cover >= 5) modifier -= 1;   // light
      else modifier += 1;                   // none
    }

    // Time of day
    if (timeOfDay === 'night') modifier -= 3;
    else if (timeOfDay === 'dusk' || timeOfDay === 'dawn') modifier -= 1;

    // Zombie multiplier: zombies are easier to hit (slow, predictable)
    if (defender.zombie) modifier += 4;

    // Zombie attackers are relentless — they don't feint, they lunge
    if (attacker.zombie) modifier += 6;

    // Roll d20 — must roll UNDER (10 + modifier)
    const roll = Math.floor(Math.random() * 20) + 1;
    const target = 10 + modifier;
    const hit = roll < target;

    let damage = 0;
    let message = '';

    if (hit) {
      // Damage: weapon value + str bonus
      const weaponDmg = isMelee ? weapon.melee : weapon.missile;
      const strBonus = Math.floor(attacker.str / 5);
      damage = Math.max(1, weaponDmg + strBonus);

      // Zombie damage is reduced by defender PT
      const reduction = Math.floor(defender.pt / 6);
      damage = Math.max(1, damage - reduction);

      const defenderHp = Math.max(0, defender.hp - damage);
      message = `Hit for ${damage} damage!`;
      return { hit: true, damage, message, defenderHp };
    } else {
      message = 'The attack misses.';
      return { hit: false, damage: 0, message, defenderHp: defender.hp };
    }
  },

  /**
   * Generate a random event based on location noise rating.
   * Returns null or an event object.
   */
  checkRandomEvent(noiseRating) {
    const roll = Math.floor(Math.random() * 100);
    if (roll >= noiseRating) return null;

    // 25% zombie encounter from random events — pre-placed zombies are the main threat
    const typeRoll = Math.random();
    if (typeRoll < 0.25) {
      return { type: 'zombie', message: 'You hear shambling footsteps approaching...' };
    }

    // Red herrings
    const herrings = [
      'A noise echoes from somewhere nearby. Just the building settling.',
      'You catch movement in your peripheral vision. Nothing there.',
      'Glass breaks somewhere in the distance.',
      'A low groaning sound. The wind, maybe.',
      'Footsteps above you. They stop.',
      'A shadow moves past a window. Could be anything.',
      'Something scrapes against the wall outside.',
      'A door slams shut on its own.',
      'You hear dripping. Just a broken pipe.',
      'A car alarm goes off several blocks away, then falls silent.',
    ];
    return {
      type: 'herring',
      message: herrings[Math.floor(Math.random() * herrings.length)]
    };
  },

  /**
   * Generate zombie encounter for a location.
   * Returns array of zombies or empty.
   */
  spawnZombies(cell, gameDay, isNight) {
    // Base chance increases with day and at night — tuned for 30-day game
    let chance = 20 + (gameDay * 2) + (isNight ? 25 : 0);

    // Security reduces zombie spawns
    chance -= (cell.security || 0) * 5;

    // Urban areas get more zombies
    if (cell.type === 'urban') chance += 15;
    if (cell.type === 'suburban') chance += 5;

    chance = Math.max(10, Math.min(85, chance));

    if (Math.random() * 100 > chance) return [];

    const count = 1 + Math.floor(Math.random() * Math.min(gameDay, 4));
    const zombies = [];

    for (let i = 0; i < count; i++) {
      const gender = Math.random() < 0.5 ? 'm' : 'f';
      const name = H720Data.getRandomName(gender);
      // Zombies get stronger as days pass — fresher dead are tougher
      const dayBonus = Math.min(gameDay, 5);
      zombies.push({
        id: `z_${Date.now()}_${i}`,
        name: `${name.first} ${name.last}`,
        str: 6 + Math.floor(Math.random() * 6) + dayBonus,
        dex: 5 + Math.floor(Math.random() * 5),
        mt: 1,
        pt: 4 + Math.floor(Math.random() * 5),
        hp: 10 + Math.floor(Math.random() * 12) + dayBonus,
        mh: 0,
        zombie: true,
        weapon: { melee: 5 + dayBonus, missile: 0 },
      });
    }

    return zombies;
  },
};
