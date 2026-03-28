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

  // Supplemental broadcasts — fill in "temp text" entries for both stations
  SUPPLEMENTAL: {
    // KPTN — Grace Spivack, NPR-style
    'KPTN': {
      3: `This is Grace Spivack, KPTN 89.3 FM, New Hampton Public Radio. Day three.

The Mainland Bridge is confirmed destroyed. An explosion collapsed the central span during the early hours of Day One. We have unconfirmed reports that several individuals crossed before the collapse.

The federal response team has still not arrived. Via shortwave, we have been told the situation is "being assessed remotely." No timeline was given.

Dr. Whitcombe at New Hampton General reports the zombie virus takes twelve to twenty-four hours after a bite to fully take hold. Any bite wound should be treated as a potential death sentence.

Stay indoors. Conserve your resources. Move quietly.

This is Grace Spivack. We will continue broadcasting as long as we are able.`,

      4: `KPTN 89.3 FM. I'm Grace Spivack. Day Four.

The zombie population is growing. Dr. Whitcombe's last communication indicated the hospital was breached. We have not heard from him since.

Power remains out. Our generators continue to function, but fuel is a concern.

Reports from shortwave: the federal government is debating "containment protocol" and "quarantine enforcement." We do not yet know what this means for us.

The ferry terminal and the municipal airfield remain viable evacuation points. If you can reach either, do so soon.

This is Grace Spivack, KPTN 89.3 FM.`,

      7: `Grace Spivack, KPTN 89.3 FM. Day Seven.

The shortwave relay has gone silent. We are broadcasting without confirmation that anyone beyond this island can hear us. We will continue regardless.

The zombie presence downtown has become severe. Evacuate to suburban or rural areas if possible.

Our fuel situation is critical. We estimate several more days of generator capacity.

I have been a journalist for twenty-two years. Nothing prepared me for this. But I believe the role of public radio is to keep the public informed, especially when the information is difficult.

This is Grace Spivack. KPTN 89.3 FM, New Hampton.`,

      10: `KPTN 89.3 FM. Grace Spivack. Day Ten.

We have lost contact with all mainland frequencies. The silence is complete.

The zombie population continues to grow. Rural areas are no longer safe. The creatures are everywhere.

To any survivors still listening: the harbor on the east shore and the airfield to the northeast remain your best options. We have also heard unconfirmed reports that some boathouses along the shore may contain seaworthy vessels. If you find one, take it.

We are rationing our fuel carefully. KPTN will continue as long as possible.

Grace Spivack, KPTN 89.3 FM.`,

      14: `Grace Spivack. KPTN 89.3 FM. Day Fourteen. Two weeks.

Half the fuel is gone. I am broadcasting every other day now to conserve.

Something has changed in the zombies' behavior. They are congregating in larger groups. Moving together. I would not call it coordination, but it is something more than random wandering.

A fire broke out in the downtown commercial district last night. No one came to put it out. It burned for hours before the rain stopped it.

To anyone still out there: you are not forgotten. I am still here. KPTN is still here.

Grace Spivack.`,

      18: `KPTN 89.3 FM. Day Eighteen.

Military aircraft were spotted over New Hampton yesterday. They did not land. They did not drop supplies. They circled the island twice and departed north.

I have covered government long enough to know what reconnaissance flights look like.

The harbor. The airfield. The shore. A boat, a plane, anything that floats or flies. If you have been waiting for rescue, stop waiting. Get off this island.

Grace Spivack, KPTN.`,

      22: `KPTN. Day Twenty-Two. Grace Spivack.

Our generator fuel is nearly exhausted. This may be one of our last regular broadcasts.

The zombie population in the city center is in the hundreds. Suburban areas are following. The island is being consumed.

To WHMP 103.3: we have been monitoring your broadcasts. We heard about Justin. I am sorry.

To the people of New Hampton: it has been my privilege to serve as your voice. I hope this is not the last time you hear mine.

Grace Spivack, KPTN 89.3 FM.`,

      26: `KPTN 89.3 FM. Grace Spivack. Day Twenty-Six.

The generator died at 4 AM. I am recording this on a battery-powered device. It will broadcast once on a loop until the battery fails.

At approximately 2 AM, we intercepted a fragment of military communication on an open frequency. The words were: "Sterilization protocol approved. Estimated window: ninety-six hours."

I will not speculate on what sterilization means in this context. I think we all know.

The harbor. The airfield. The shore. Find a way.

I am leaving Romero Towers now. I am going to try for the airfield.

To whoever finds this recording: the people of New Hampton did not deserve this. They were ordinary people in an extraordinary situation, and most of them tried to help each other. Remember that.

This is Grace Spivack, signing off. Good luck. Good night.`,
    },

    // WHMP — Madman Zack / Pete, shock jock style
    'WHMP': {
      8: `This is Pete from WHMP 103.3. Zack's still not doing great after what happened to Justin. Len and I are keeping things running.

We patched the south wall as best we could. The group that tried to break in hasn't come back. I don't think they made it.

If you're out there, folks: stay away from downtown. We can see it from up here and it's crawling with those things. Suburbs aren't much better.

Pete, WHMP 103.3.`,

      11: `Madman Zack back on the mic. Sorry I was gone for a while. Pete held it down. I owed it to Justin to keep going.

Listen up: we're seeing something weird from up here on the hill. The zombies are moving in packs now. Like, groups of twenty or thirty shuffling in the same direction. I don't know what that means but it can't be good.

Food's getting low. Water's getting lower. But WHMP ain't going anywhere.

This is Madman Zack. Stay strong out there.`,

      15: `WHMP 103.3, Madman Zack. Day Fifteen. Halfway through the month and still kicking.

Len spotted something last night — looked like a small boat heading out from the east shore. Someone made it out. Or tried to, anyway. We lost sight of it in the dark.

If you can find a boat — any boat — that might be your ticket. Check the boathouses along the shore. Check everywhere.

The Madman's not going anywhere. But you should. Get out if you can.

Madman Zack, WHMP.`,

      20: `WHMP 103.3. Pete here. Day Twenty.

Zack's on watch. We take shifts now. There's always something at the perimeter.

We saw planes yesterday. Military. They didn't stop. They didn't even slow down. I used to produce a radio show. Now I watch the sky and hope someone remembers we're here.

Len says the generator's got maybe another week in it. After that, WHMP goes dark.

If you can hear this, get to the water. Get to the airfield. Get off this island.

Pete, WHMP 103.3.`,

      24: `This is Madman Zack and I'm gonna level with you, New Hampton. We're fucked.

The generator's dying. The food's gone. Len's sick — I don't think it's the zombie thing, I think it's just regular sick, but in this world that's bad enough.

I started this whole thing making jokes. Zombie Party. Can you believe that? A fucking Zombie Party. Now Justin's dead and we're sitting in the dark waiting to see if the government remembers we exist.

But Madman Zack doesn't quit. Not today. Not tomorrow. I'll keep talking into this mic until there's nobody left to hear it.

WHMP 103.3. Still here. Barely.`,

      28: `Pete. WHMP. Last broadcast.

The generator died this morning. I'm recording this on Zack's phone. The battery won't last long.

Zack left last night. Said he was going for the harbor. I told him he was crazy. He said crazy's what he does best. I hope he makes it.

Len passed two days ago. Not the virus. Just... everything else.

I'm going to try for the airfield. It's a long walk from here. I don't know if I'll make it.

To anyone still listening: don't give up. Don't sit still. Move.

This is Pete, signing off from WHMP 103.3 FM. It's been real, New Hampton. It's been so god damned real.`,
    },
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

    // Inject supplemental broadcasts for both stations
    Object.entries(this.SUPPLEMENTAL).forEach(([station, days]) => {
      Object.entries(days).forEach(([day, text]) => {
        const key = `${day}_${station}`;
        if (!this.broadcasts[key]) {
          this.broadcasts[key] = {
            day: parseInt(day),
            station: station,
            text: text,
          };
        }
      });
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
