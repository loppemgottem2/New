// =====================================================================
//  CONFIG.JS  —  every tunable number in the game lives here.
//  Change a value, save, refresh the page. No build step needed.
// =====================================================================

export const CONFIG = {
  VERSION: '1.0.0',
  TITLE: 'KILLER MYSTERY',
  SUBTITLE: '',

  // ---------------- Server / lobby ----------------
  SERVER: {
    MAX_PLAYERS: 12,        // total characters per server (humans + bots)
    FILL_WITH_BOTS_TO: 8,   // if fewer humans than this, bots fill the gap
    MAX_HUMANS: 12,         // hard cap of real players per server
  },

  // ---------------- Round timing (seconds) ----------------
  ROUND: {
    PRE_TIME: 4,            // role reveal (no attacking yet)
    TIME_LIMIT: 300,        // bystanders win if the murderer runs out of time
    POST_TIME: 8,           // results screen before next round
  },

  // ---------------- Player movement / physics ----------------
  PLAYER: {
    RADIUS: 0.32,
    HEIGHT: 1.8,
    EYE: 1.64,
    WALK_SPEED: 3.8,
    RUN_SPEED: 6.6,
    GROUND_ACCEL: 40,       // how fast you reach target speed on ground
    AIR_ACCEL: 6,           // air control
    GRAVITY: 18,
    JUMP_SPEED: 6.4,        // jump apex = JUMP_SPEED^2 / (2*GRAVITY) ≈ 1.14 m
    STEP_HEIGHT: 0.4,       // max ledge you auto-step onto
    STAMINA_MAX: 100,
    STAMINA_DRAIN: 16,      // per second while sprinting
    STAMINA_REGEN: 11,      // per second while not sprinting
    STAMINA_RECOVER_AT: 25, // after running out, need this much to sprint again
  },

  // ---------------- Weapons ----------------
  WEAPONS: {
    KNIFE_RANGE: 2.1,           // meters
    KNIFE_ANGLE_DEG: 55,        // half-angle of the stab cone
    KNIFE_COOLDOWN: 0.85,       // seconds between stabs
    KNIFE_THROW_SPEED: 24,      // m/s
    KNIFE_THROW_COOLDOWN: 1.2,
    KNIFE_PICKUP_RADIUS: 1.2,
    GUN_RANGE: 90,
    GUN_COOLDOWN: 2.0,          // revolver fire rate
    GUN_PICKUP_RADIUS: 1.1,
    INNOCENT_KILL_PENALTY: true // gun holder who shoots a bystander drops the gun & can't pick up guns again this round
  },

  // ---------------- Gun parts (build a revolver) ----------------
  GUNPARTS: {
    COUNT: 5,               // parts needed per player
    PICKUP_RADIUS: 1.15,
  },

  // ---------------- Bots ----------------
  BOTS: {
    NAMES: ['Bot Arnold', 'Bot Bella', 'Bot Carl', 'Bot Dina', 'Bot Eddie', 'Bot Fay', 'Bot Gus', 'Bot Hana',
            'Bot Ivan', 'Bot Jules', 'Bot Kurt', 'Bot Lena', 'Bot Milo', 'Bot Nora', 'Bot Otto', 'Bot Pia'],
    VIEW_DISTANCE: 28,      // meters they can see
    FOV_DEG: 120,           // field of view
    CLOSE_SENSE: 3.5,       // always notice people this close (hearing)
    THINK_INTERVAL: 0.2,    // seconds between perception updates
    REACTION_MIN: 0.3,      // seconds before they react to a threat
    REACTION_MAX: 0.75,
    TURN_SPEED: 5.0,        // radians/sec while aiming
    AIM_SPREAD_DEG: 2.4,    // random error when shooting
    SHOOT_SUSPICION: 90,    // suspicion (0-100) needed to fire at someone
    DRAW_SUSPICION: 60,     // suspicion needed to pull out the gun
    SUSPICION_DECAY: 1.5,   // per second (witnessed murders never decay)
    CORPSE_SUSPICION: 35,   // suspicion added to people standing near a fresh corpse
    MURDER_FIRST_DELAY: [10, 22], // seconds before the murderer bot starts hunting
    MURDER_NEXT_DELAY: [5, 16],   // pause after a kill
    THROW_CHANCE: 0.35,     // chance murderer bot throws knife at a fleeing target
    COLLECT_PARTS_CHANCE: 0.45,
    COLLECT_PARTS_RANGE: 22,      // bots only go for parts this close
    BRAVERY: 0.55,          // chance a bot goes to pick up a dropped gun
  },

  // ---------------- Networking ----------------
  NET: {
    PEER_PREFIX: 'killermystery-v1-', // change this to get your own isolated server network
    PUBLIC_SLOTS: 8,        // number of public server slots in the browser
    SNAPSHOT_RATE: 15,      // host -> clients updates per second
    INPUT_RATE: 20,         // client -> host updates per second
    CONNECT_TIMEOUT: 8000,
    HOST_TIMEOUT: 9000,     // client gives up if host silent this long
    CLIENT_TIMEOUT: 12000,  // host kicks a client silent this long
    ICE_SERVERS: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },

  // ---------------- Controls defaults (changeable in Settings) ----------------
  CONTROLS: {
    MOUSE_SENS: 0.0022,
    TOUCH_SENS: 0.0060,
    JOYSTICK_RADIUS: 60,     // px
    JOYSTICK_RUN_AT: 0.9,    // push joystick past 90% to sprint
  },

  GRAPHICS: {
    FOV: 75,
    MAX_PIXEL_RATIO: 1.5,
  },

  // Bystander identities (re-shuffled every round, like the original gamemode style)
  IDENTITIES: [
    ['Alpha', 0xd03838], ['Bravo', 0x2f6fd8], ['Charlie', 0x2fa84a], ['Delta', 0xe0c020],
    ['Echo', 0x9b40d0], ['Foxtrot', 0xe07a20], ['Golf', 0x20b8b8], ['Hotel', 0xe050a0],
    ['India', 0x6b4a2a], ['Juliett', 0xf0f0f0], ['Kilo', 0x303030], ['Lima', 0x90d040],
    ['Mike', 0x6070a0], ['November', 0xa02040],
  ],
};
