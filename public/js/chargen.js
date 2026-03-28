/**
 * Hour 720 — Character Generation
 * Faithful port of characterClass.php with census-based ratios.
 */

const CharGen = {

  // Human-readable profession labels for use in prose
  PROFESSION_LABELS: {
    'Law Enforcement': 'law enforcement officer',
    'Delivery Service': 'delivery driver',
    'Felon': 'felon',
    'Military': 'military veteran',
    'Medical': 'medical professional',
    'Public Works': 'public works employee',
    'Office Worker': 'office worker',
    'EMT': 'EMT',
    'Laborer': 'laborer',
    'Restaurant Worker': 'restaurant worker',
    'Clergy': 'member of the clergy',
    'Homemaker': 'homemaker',
    'Education': 'educator',
    'Firefighter': 'firefighter',
    'Unemployed Youth': 'unemployed youth',
    'Unemployed Adult': 'unemployed adult',
    'Retiree': 'retiree',
    'Reporter': 'reporter',
  },

  /** Get a prose-friendly label for a profession */
  getProfessionLabel(profName) {
    return this.PROFESSION_LABELS[profName] || profName.toLowerCase();
  },

  /** Article helper: "a" or "an" */
  articleFor(word) {
    return 'aeiouAEIOU'.includes(word[0]) ? 'an' : 'a';
  },

  // --- Profession table: d100 roll ranges and demographics ---
  // Each entry: [name, rollMin, rollMax, genderRatio (women per 10), ageRatio [Y,T,YA,A,MA,O]]
  PROFESSIONS: [
    ['Law Enforcement',    1, 10,  [4,6],  [0,0,4,3,3,0]],
    ['Delivery Service',  11, 13,  [3,7],  [0,3,4,2,1,0]],
    ['Felon',             14, 23,  [2,8],  [0,2,3,4,1,0]],
    ['Military',          24, 33,  [4,6],  [0,0,7,2,1,0]],
    ['Medical',           34, 40,  [5,5],  [0,0,2,3,4,1]],
    ['Public Works',      41, 45,  [4,6],  [0,0,4,3,2,1]],
    ['Office Worker',     46, 48,  [5,5],  [0,0,3,4,3,0]],
    ['EMT',               49, 56,  [5,5],  [0,1,5,3,1,0]],
    ['Laborer',           57, 61,  [3,7],  [0,1,3,3,3,0]],
    ['Restaurant Worker', 62, 64,  [7,3],  [0,2,3,2,2,1]],
    ['Clergy',            65, 70,  [5,5],  [0,0,1,3,4,2]],
    ['Homemaker',         71, 75,  [8,2],  [0,0,1,3,3,3]],
    ['Education',         76, 80,  [7,3],  [0,1,2,2,3,2]],
    ['Firefighter',       81, 88,  [2,8],  [0,1,5,3,1,0]],
    ['Unemployed Youth',  89, 91,  [5,5],  [8,2,0,0,0,0]],
    ['Unemployed Adult',  92, 94,  [5,5],  [0,0,4,4,2,0]],
    ['Retiree',           95, 99,  [5,5],  [0,0,0,0,3,7]],
    ['Reporter',         100,100,  [6,4],  [0,0,1,4,4,1]],
  ],

  // Age ranges by category: [label, min, max]
  AGE_CATEGORIES: [
    ['Youth',        10, 12],  // Y
    ['Teen',         13, 17],  // T
    ['Young Adult',  18, 22],  // YA
    ['Adult',        23, 40],  // A
    ['Middle-Aged',  41, 59],  // MA
    ['Older',        60, 70],  // O
  ],

  // Gender attribute modifiers
  GENDER_MODS: {
    m: { str: 2, dex: -1, mt: 0, pt: 1 },
    f: { str: -1, dex: 1, mt: 2, pt: 0 },
  },

  // Age attribute modifiers: [Y, T, YA, A, MA, O]
  AGE_MODS: [
    { str: -1, dex: 0,  mt: -1, pt: 2 },   // Youth
    { str: 1,  dex: 1,  mt: -3, pt: 1 },   // Teen
    { str: 0,  dex: 0,  mt: 0,  pt: 0 },   // Young Adult
    { str: 1,  dex: -1, mt: 0,  pt: 0 },   // Adult
    { str: 0,  dex: -1, mt: 2,  pt: -1 },  // Middle-Aged
    { str: -2, dex: -2, mt: 5,  pt: -1 },  // Older
  ],

  // Body type modifiers
  BODY_TYPES: [
    { name: 'Ectomorph',  weight: 1, str: 1,  dex: 1,  mt: 0, pt: -2 },
    { name: 'Mesomorph',  weight: 3, str: 0,  dex: 0,  mt: 0, pt: 0 },
    { name: 'Endomorph',  weight: 1, str: 0,  dex: -2, mt: 0, pt: 2 },
  ],

  // Profession -> skill assignments
  // Format: { auto: [skillIds], choose: [[skillId, ...], count] }
  PROFESSION_SKILLS: {
    'Law Enforcement':   { auto: [1], choose: [[2,3,8,12,22,20,5,6,16,4,11], 2] },
    'Delivery Service':  { auto: [5], choose: [[16,20,23,14,27,9], 1] },
    'Felon':             { auto: [], choose: [[22,24,25,26,3,2,27,6,5,8], 3] },
    'Military':          { auto: [], choose: [[1,4,7], 1, [22,3,11], 1, [6,5,25], 1] },
    'Medical':           { auto: [38,11,37,36,35,13,12,15,27], choose: [] },
    'Public Works':      { auto: [14], choose: [[16,17,18,5,22,6], 2] },
    'Office Worker':     { auto: [19], choose: [[15,5,13,20,21,17,12], 1] },
    'EMT':               { auto: [11], choose: [[37,38,35,16], 2] },
    'Laborer':           { auto: [14], choose: [[6,22,17,18,16,5], 2] },
    'Restaurant Worker': { auto: [9], choose: [[28,18,22,11,8], 1] },
    'Clergy':            { auto: [29,30], choose: [[31,32,33,34], 1] },
    'Homemaker':         { auto: [9], choose: [[11,13,15,22,27], 1] },
    'Education':         { auto: [13], choose: [[39,40,41,42,15,14,17,9,10,38,22,12], 2] },
    'Firefighter':       { auto: [28,6,11,43,5,8], choose: [[22,3,14,12], 1] },
    'Unemployed Youth':  { auto: [], choose: [[22,6,5,25,15], 1] },
    'Unemployed Adult':  { auto: [], choose: [[22,6,5,15,9,16,19], 2] },
    'Retiree':           { auto: [], choose: [[9,15,27,13,22,5], 2] },
    'Reporter':          { auto: [15], choose: [[19,17,41,42], 1] },
  },

  // --- Core generation functions ---

  /** Bell curve base attribute (d22 distribution centered ~10) */
  generateBaseAttribute() {
    const roll = Math.floor(Math.random() * 22) + 1;
    if (roll <= 1) return 7;
    if (roll <= 3) return 8;
    if (roll <= 7) return 9;
    if (roll <= 15) return 10;
    if (roll <= 19) return 11;
    if (roll <= 21) return 12;
    return 7; // roll 22
  },

  /** Roll profession from d100 */
  rollProfession() {
    const roll = Math.floor(Math.random() * 100) + 1;
    for (const prof of this.PROFESSIONS) {
      if (roll >= prof[1] && roll <= prof[2]) return prof;
    }
    return this.PROFESSIONS[0]; // fallback
  },

  /** Determine gender from profession ratio */
  rollGender(genderRatio) {
    const roll = Math.floor(Math.random() * 10);
    return roll < genderRatio[0] ? 'f' : 'm';
  },

  /** Determine age category from profession age ratio, then specific age */
  rollAge(ageRatio) {
    // Build probability pool from ratio
    const pool = [];
    ageRatio.forEach((count, idx) => {
      for (let i = 0; i < count; i++) pool.push(idx);
    });
    const catIdx = pool[Math.floor(Math.random() * pool.length)];
    const cat = this.AGE_CATEGORIES[catIdx];

    // Random age within category range
    const age = cat[1] + Math.floor(Math.random() * (cat[2] - cat[1] + 1));
    return { age, categoryIndex: catIdx, categoryName: cat[0] };
  },

  /** Roll body type from weighted pool */
  rollBodyType() {
    const pool = [];
    this.BODY_TYPES.forEach(bt => {
      for (let i = 0; i < bt.weight; i++) pool.push(bt);
    });
    return pool[Math.floor(Math.random() * pool.length)];
  },

  /** Roll lifestyle from probability-weighted table */
  rollLifestyle() {
    if (!H720Data.lifestyleTable || H720Data.lifestyleTable.length === 0) return null;
    return H720Data.lifestyleTable[Math.floor(Math.random() * H720Data.lifestyleTable.length)];
  },

  /** Assign skills based on profession */
  assignSkills(profName) {
    const config = this.PROFESSION_SKILLS[profName];
    if (!config) return [];

    const skillIds = [...config.auto];

    if (config.choose && config.choose.length > 0) {
      // Handle multiple choice groups: [pool, count, pool2, count2, ...]
      for (let i = 0; i < config.choose.length; i += 2) {
        const pool = config.choose[i];
        const count = config.choose[i + 1] || 1;
        const available = pool.filter(id => !skillIds.includes(id));
        for (let j = 0; j < count && available.length > 0; j++) {
          const idx = Math.floor(Math.random() * available.length);
          skillIds.push(available.splice(idx, 1)[0]);
        }
      }
    }

    return skillIds;
  },

  /** Generate a complete character */
  generate(customName) {
    // 1. Base attributes
    let str = this.generateBaseAttribute();
    let dex = this.generateBaseAttribute();
    let mt = this.generateBaseAttribute();
    let pt = this.generateBaseAttribute();

    // 2. Profession
    const prof = this.rollProfession();
    const profName = prof[0];

    // 3. Gender
    const gender = this.rollGender(prof[3]);

    // 4. Apply gender modifiers
    const gMod = this.GENDER_MODS[gender];
    str += gMod.str;
    dex += gMod.dex;
    mt += gMod.mt;
    pt += gMod.pt;

    // 5. Age
    const ageResult = this.rollAge(prof[4]);

    // 6. Apply age modifiers
    const aMod = this.AGE_MODS[ageResult.categoryIndex];
    str += aMod.str;
    dex += aMod.dex;
    mt += aMod.mt;
    pt += aMod.pt;

    // 7. Body type
    const bodyType = this.rollBodyType();
    str += bodyType.str;
    dex += bodyType.dex;
    mt += bodyType.mt;
    pt += bodyType.pt;

    // 8. Clamp stats to minimum 1
    str = Math.max(1, str);
    dex = Math.max(1, dex);
    mt = Math.max(1, mt);
    pt = Math.max(1, pt);

    // 9. Lifestyle
    const lifestyle = this.rollLifestyle();
    if (lifestyle) {
      str += parseInt(lifestyle.lstyle_str) || 0;
      dex += parseInt(lifestyle.lstyle_dex) || 0;
      mt += parseInt(lifestyle.lstyle_mt) || 0;
      pt += parseInt(lifestyle.lstyle_pt) || 0;
    }

    // Re-clamp
    str = Math.max(1, str);
    dex = Math.max(1, dex);
    mt = Math.max(1, mt);
    pt = Math.max(1, pt);

    // 10. Health points
    const hp = str + pt + this.generateBaseAttribute();
    const mh = dex + mt + this.generateBaseAttribute();

    // 11. Skills
    const skillIds = this.assignSkills(profName);
    const skills = skillIds.map(id => ({
      id,
      name: H720Data.getSkillName(id)
    }));

    // 12. Name
    const name = customName
      ? { first: customName.split(' ')[0] || customName, last: customName.split(' ').slice(1).join(' ') || H720Data.getRandomName(gender).last }
      : H720Data.getRandomName(gender);

    // 13. Determine health icon set
    const iconSets = gender === 'm'
      ? ['boy', 'man1', 'man2', 'man3']
      : ['girl', 'wom1', 'wom2', 'wom3'];
    const iconSet = iconSets[Math.floor(Math.random() * iconSets.length)];

    return {
      firstName: name.first,
      lastName: name.last,
      fullName: `${name.first} ${name.last}`,
      gender,
      genderLabel: gender === 'm' ? 'Male' : 'Female',
      age: ageResult.age,
      ageGroup: ageResult.categoryName,
      profession: profName,
      bodyType: bodyType.name,
      lifestyle: lifestyle ? lifestyle.lstyle_name : 'None',
      str, dex, mt, pt,
      hp, maxHp: hp,
      mh, maxMh: mh,
      skills,
      iconSet,
      inventory: [],
      infected: false,
      zombie: false,
      sleep: 0,
      conditions: [],
    };
  },
};
