/**
 * Hour 720 — Radio Broadcast System
 * Manages the two radio stations and their broadcast schedules.
 * Includes the 5 missing KPTN broadcasts (Days 3-7) written in
 * Grace Spivack's voice to match the original Day 1-2 content.
 */

const Radio = {

  broadcasts: {},   // keyed by "day_station"
  currentDay: 1,
  heard: new Set(), // Track which broadcasts the player has heard

  // Supplemental KPTN broadcasts for Days 3-7 (originals were never written)
  SUPPLEMENTAL_KPTN: {
    3: `This is Grace Spivack, KPTN 89.3 FM, New Hampton Public Radio. Day three.

The Mainland Bridge is confirmed destroyed. An explosion, cause still unknown, collapsed the central span sometime during the early hours of Day One. KPTN has received reports of several individuals who attempted to cross before the collapse and may have reached the mainland, but we have been unable to confirm this.

The federal response team has still not arrived. We have received word, via shortwave radio, that the situation on New Hampton is being assessed remotely and that a response is being coordinated. We were not given a timeline.

Dr. Whitcombe at New Hampton General reports that the zombie virus, as it is now being called, appears to take between twelve and twenty-four hours to fully take hold after infection through a bite. He stresses that any bite wound should be treated as a potential death sentence. Antibiotics do not appear to slow the progression.

On a more hopeful note, we have heard unconfirmed reports of small boats departing from the harbor on the east shore. If you can reach the ferry terminal and find a seaworthy vessel, that may represent a viable means of evacuation. Additionally, there are light aircraft at the New Hampton Municipal Airfield, though we do not know if any are fueled or if there are pilots among the survivors.

Stay indoors. Conserve your resources. And if you must move, move quietly.

This is Grace Spivack. We will continue broadcasting as long as we are able.`,

    4: `KPTN 89.3 FM. I'm Grace Spivack. This is Day Four.

I want to be honest with our listeners. The situation is deteriorating faster than we anticipated.

The zombie population appears to be growing exponentially. Dr. Whitcombe's last communication, received yesterday evening, indicated that the hospital had been breached and staff were retreating to the upper floors. We have not heard from him since.

Power remains out across most of New Hampton. Our generators here at Romero Towers continue to function, but fuel is a concern. We are rationing.

To those of you still out there: reports from shortwave indicate that the federal government is actively debating the scope of its response. The phrases "containment protocol" and "quarantine enforcement" have been used. I want to stress that we do not yet know what this means for those of us on the island.

What we do know is this: the ferry terminal on the east shore and the municipal airfield to the northeast appear to be the remaining viable evacuation points. The bridge is gone. If you have the means to reach either location, I would encourage you to do so sooner rather than later.

To the survivors who have written to us via the shortwave relay: we hear you. We are documenting everything.

This is Grace Spivack, KPTN 89.3 FM. Good night.`,

    5: `Grace Spivack, KPTN 89.3 FM. Day Five on New Hampton.

The shortwave relay has gone silent. We do not know if this is a technical failure or if the relay station on the mainland has been shut down. Either way, we are now broadcasting without confirmation that anyone beyond this island can hear us.

We will continue regardless.

The zombie presence in the downtown core has become severe. Anyone in the urban center should evacuate to the suburban or rural areas if possible. The creatures appear to congregate in areas of higher population density, which makes a grim kind of sense.

Our fuel situation here at the studio is critical. We estimate two more days of generator capacity. After that, KPTN will go dark.

I have a personal note, if you will indulge me. I have been a journalist for twenty-two years. I have covered floods, political scandals, and one very unpleasant school board election. Nothing prepared me for this. But I believe that the role of public radio is to keep the public informed, even when the information is difficult. Especially then.

If you can get to the harbor or the airfield, go. Do not wait for official rescue. The officials appear to have other plans.

This is Grace Spivack. KPTN 89.3 FM, New Hampton.`,

    6: `KPTN 89.3 FM. Grace Spivack. Day Six.

I will keep this brief. Our generator fuel is nearly exhausted.

Last night, military aircraft were spotted over New Hampton. They did not land. They did not drop supplies. They circled the island twice and departed north.

I have covered government long enough to know what reconnaissance flights preceding a quarantine look like. I urge all survivors: whatever means of escape you have been considering, the time for consideration is over.

The harbor. The airfield. A boat, a plane, anything that floats or flies. Get off this island.

The zombie population in the city center is now estimated in the hundreds. Suburban areas are following. Rural areas and the shoreline remain relatively sparse, but this will not last.

To WHMP 103.3: we have been monitoring your broadcasts. We heard about Justin. I am sorry.

To the people of New Hampton: it has been my privilege to serve as your voice these past six days. I hope this is not the last time you hear mine.

Grace Spivack, KPTN 89.3 FM.`,

    7: `This is KPTN 89.3 FM. Grace Spivack. Day Seven. Our final broadcast.

The generator died at 4 AM. I am recording this on a battery-powered device. It will broadcast once on a loop until the battery fails.

At approximately 2 AM, we intercepted a fragment of military communication on an open frequency. The words were: "Sterilization protocol approved. Estimated window: twenty-four hours."

I will not speculate on what sterilization means in this context. I think we all know.

If you are still on New Hampton, you have hours. Not days. Hours.

The harbor. The airfield. The shore. Find a way.

I am leaving Romero Towers now. I am going to try for the airfield.

To whoever finds this recording: the people of New Hampton did not deserve this. They were ordinary people in an extraordinary situation, and most of them tried to help each other. Remember that.

This is Grace Spivack, signing off. Good luck. Good night.`,
  },

  /**
   * Initialize radio system from game data.
   */
  init() {
    this.broadcasts = {};
    this.heard = new Set();

    // Load broadcasts from data
    H720Data.radio.forEach(r => {
      const key = `${r.radio_day}_${r.radio_station}`;
      // Skip placeholder "temp text" entries
      if (r.radio_text && r.radio_text.toLowerCase().trim() !== 'temp text') {
        this.broadcasts[key] = {
          day: r.radio_day,
          station: r.radio_station,
          text: r.radio_text,
        };
      }
    });

    // Inject supplemental KPTN broadcasts
    Object.entries(this.SUPPLEMENTAL_KPTN).forEach(([day, text]) => {
      const key = `${day}_KPTN`;
      if (!this.broadcasts[key]) {
        this.broadcasts[key] = {
          day: parseInt(day),
          station: 'KPTN',
          text: text,
        };
      }
    });
  },

  /**
   * Get available broadcasts for the current day.
   * Returns array of { station, text, day, heard }
   */
  getAvailableBroadcasts(day) {
    const available = [];

    ['KPTN', 'WHMP'].forEach(station => {
      // Can hear current day and any previous unheard
      for (let d = 1; d <= day; d++) {
        const key = `${d}_${station}`;
        const broadcast = this.broadcasts[key];
        if (broadcast) {
          available.push({
            ...broadcast,
            key,
            heard: this.heard.has(key),
            stationName: station === 'KPTN' ? 'KPTN 89.3 FM — New Hampton Public Radio' : 'WHMP 103.3 FM',
          });
        }
      }
    });

    return available;
  },

  /**
   * Get the latest broadcast for a station.
   */
  getLatest(station, day) {
    for (let d = day; d >= 1; d--) {
      const key = `${d}_${station}`;
      if (this.broadcasts[key]) {
        return { ...this.broadcasts[key], key };
      }
    }
    return null;
  },

  /**
   * Mark a broadcast as heard.
   */
  markHeard(key) {
    this.heard.add(key);
  },

  /**
   * Check if there are unheard broadcasts.
   */
  hasUnheard(day) {
    for (let d = 1; d <= day; d++) {
      for (const station of ['KPTN', 'WHMP']) {
        const key = `${d}_${station}`;
        if (this.broadcasts[key] && !this.heard.has(key)) return true;
      }
    }
    return false;
  },

  /** Serialize for save */
  toJSON() {
    return { heard: [...this.heard] };
  },

  /** Restore from save */
  fromJSON(data) {
    this.heard = new Set(data.heard || []);
  },
};
