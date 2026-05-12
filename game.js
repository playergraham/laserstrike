import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const canvas = document.querySelector("#game");
const hud = document.querySelector("#hud");
const menu = document.querySelector("#menu");
const loadoutMenu = document.querySelector("#loadoutMenu");
const matchOver = document.querySelector("#matchOver");
const pauseMenu = document.querySelector("#pauseMenu");
const scoreMenu = document.querySelector("#scoreMenu");
const healthEl = document.querySelector("#health");
const playerRoundsEl = document.querySelector("#playerRounds");
const aiRoundsEl = document.querySelector("#aiRounds");
const roundEl = document.querySelector("#round");
const zombieRemainingStat = document.querySelector("#zombieRemainingStat");
const zombieRemainingEl = document.querySelector("#zombieRemaining");
const messageEl = document.querySelector("#message");
const weaponBar = document.querySelector("#weaponBar");
const loadoutGrid = document.querySelector("#loadoutGrid");
const startLoadout = document.querySelector("#startLoadout");
const backToMaps = document.querySelector("#backToMaps");
const hitMarker = document.querySelector("#hitMarker");
const damageNumber = document.querySelector("#damageNumber");
const damageFlash = document.querySelector("#damageFlash");
const blindFlash = document.querySelector("#blindFlash");
const scopeFlash = document.querySelector("#scopeFlash");
const matchTitle = document.querySelector("#matchTitle");
const matchSummary = document.querySelector("#matchSummary");
const scoreTitle = document.querySelector("#scoreTitle");
const scoreSummary = document.querySelector("#scoreSummary");
const continueGame = document.querySelector("#continueGame");
const homeFromScore = document.querySelector("#homeFromScore");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 280);
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();

const keys = new Set();
const mouse = { yaw: 0, pitch: 0 };
const roundsToWin = 5;
const titanAiCount = 25;
const zombieWaveSize = 25;
const zombieSpeedMultiplier = 0.3;
let audioContext = null;
let extraAis = [];

// Weapon catalog drives the loadout menu, weapon bar, and default cooldowns. Damage rules live in each attack function.
const weaponCatalog = {
  knife: { id: "knife", category: "melee", name: "Knife", note: "50 damage", cooldown: 0.45 },
  fists: { id: "fists", category: "melee", name: "Fists", note: "25 damage, double jump", cooldown: 0.35 },
  sniper: { id: "sniper", category: "gun", name: "Sniper", note: "50 body / 100 head", cooldown: 0.9 },
  rifle: { id: "rifle", category: "gun", name: "Assault Rifle", note: "10 damage, rapid fire", cooldown: 0.1 },
  medkit: { id: "medkit", category: "heal", name: "Medkit", note: "One full heal", cooldown: 0.2 },
  grenade: { id: "grenade", category: "utility", name: "Grenade", note: "75 blast damage", cooldown: 1.1 },
  flashbang: { id: "flashbang", category: "utility", name: "Flashbang", note: "3 second blind, huge range", cooldown: 1.0 },
};
const loadoutCategories = [
  { id: "melee", name: "Melee", options: ["knife", "fists"] },
  { id: "gun", name: "Gun", options: ["sniper", "rifle"] },
  { id: "heal", name: "Heal", options: ["medkit"] },
  { id: "utility", name: "Utility", options: ["grenade", "flashbang"] },
];
let weapons = [];

const state = {
  mapId: "outdoor",
  pendingMapId: "outdoor",
  pendingGameMode: "standard",
  gameMode: "standard",
  loadout: { melee: "knife", gun: "sniper", heal: "medkit", utility: "grenade" },
  aiLoadout: { melee: "knife", gun: "sniper", heal: "medkit", utility: "grenade" },
  round: 1,
  playerRounds: 0,
  aiRounds: 0,
  playing: false,
  inMenu: true,
  weapon: "sniper",
  cooldown: 0,
  medkitUsed: false,
  grenadeUsed: false,
  blindTimer: 0,
  fireHeld: false,
  jumpQueued: false,
  roundEnding: false,
  scoped: false,
  paused: false,
  mouseCaptureRequested: false,
};

const player = {
  position: new THREE.Vector3(),
  previousPosition: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  verticalVelocity: 0,
  grounded: true,
  jumpsUsed: 0,
  movementSpeed: 0,
  stuckTimer: 0,
  health: 100,
  radius: 1.05,
  speed: 18,
};

const ai = {
  group: new THREE.Group(),
  position: new THREE.Vector3(),
  previousPosition: new THREE.Vector3(),
  health: 100,
  radius: 1.05,
  speed: 8.7,
  shootTimer: 1.2,
  medkitUsed: false,
  grenadeUsed: false,
  blindTimer: 0,
  weapon: "sniper",
  strafe: 1,
  mode: "wander",
  tactic: "stalker",
  awareness: 0,
  decisionTimer: 0,
  pauseTimer: 0,
  memoryTimer: 0,
  stuckTimer: 0,
  objectiveTimer: 0,
  goal: new THREE.Vector3(),
  objective: new THREE.Vector3(),
  roundTarget: new THREE.Vector3(),
  lastSeenPlayer: new THREE.Vector3(),
  facing: new THREE.Vector3(0, 0, 1),
  head: null,
  body: null,
  hitHead: null,
  hitBody: null,
  hitboxes: [],
  leftArm: null,
  rightArm: null,
  leftLeg: null,
  rightLeg: null,
};

const playerView = {
  group: new THREE.Group(),
  leftArm: null,
  rightArm: null,
  weapon: null,
};

const world = {
  solids: [],
  grenades: [],
  beams: [],
  skyObjects: [],
  playerSpawn: new THREE.Vector3(),
  aiSpawn: new THREE.Vector3(),
  bounds: { width: 80, depth: 60 },
  routeMemory: [],
  routeSampleTimer: 0,
};

const mats = {
  floorOutdoor: new THREE.MeshStandardMaterial({ color: 0x4f875e, roughness: 0.92, metalness: 0.02 }),
  floorGraveyard: new THREE.MeshStandardMaterial({ color: 0x223426, roughness: 0.96, metalness: 0.01 }),
  floorIndoor: new THREE.MeshStandardMaterial({ color: 0x263137, roughness: 0.58, metalness: 0.08 }),
  floorMansion: new THREE.MeshStandardMaterial({ color: 0x3d332b, roughness: 0.72, metalness: 0.04 }),
  floorSchool: new THREE.MeshStandardMaterial({ color: 0x354149, roughness: 0.78, metalness: 0.03 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x30494b, roughness: 0.74, metalness: 0.06 }),
  wallRed: new THREE.MeshStandardMaterial({ color: 0x67364c, roughness: 0.68, metalness: 0.08 }),
  cover: new THREE.MeshStandardMaterial({ color: 0x14272b, roughness: 0.78, metalness: 0.12 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x8dffd4, emissive: 0x1d6c5b, emissiveIntensity: 0.65 }),
  stripe: new THREE.MeshBasicMaterial({ color: 0xd7ff66 }),
  playerBeam: new THREE.LineBasicMaterial({ color: 0x8dffd4, transparent: true, opacity: 0.9 }),
  aiBeam: new THREE.LineBasicMaterial({ color: 0xff4f7b, transparent: true, opacity: 0.9 }),
  grenade: new THREE.MeshStandardMaterial({ color: 0xd7ff66, emissive: 0x516614 }),
  aiBody: new THREE.MeshStandardMaterial({ color: 0xff4f7b, roughness: 0.45 }),
  aiHead: new THREE.MeshStandardMaterial({ color: 0xffb0c1, roughness: 0.35 }),
};

const mapDefs = {
  outdoor: {
    sky: 0x94d6f7,
    floor: "floorOutdoor",
    playerSpawn: [-56, 0, 0],
    aiSpawn: [56, 0, 0],
    bounds: [132, 96],
    obstacles: [
      [-19, 0, 0, 6, 7, 38, "cover"],
      [19, 0, 0, 6, 7, 38, "cover"],
      [0, 0, -31, 46, 5.5, 6, "cover"],
      [0, 0, 31, 46, 5.5, 6, "cover"],
      [-40, 0, -25, 17, 5, 9, "wall"],
      [40, 0, 25, 17, 5, 9, "wall"],
      [-44, 0, 20, 18, 4.5, 7, "cover"],
      [44, 0, -20, 18, 4.5, 7, "cover"],
    ],
    props: "outdoor",
  },
  indoor: {
    sky: 0x11181c,
    floor: "floorIndoor",
    playerSpawn: [-52, 0, -30],
    aiSpawn: [52, 0, 30],
    bounds: [122, 88],
    obstacles: [
      [0, 0, 0, 7, 11, 64, "wallRed"],
      [-28, 0, -14, 6, 11, 42, "wall"],
      [28, 0, 14, 6, 11, 42, "wall"],
      [-12, 0, 32, 36, 11, 6, "wall"],
      [12, 0, -32, 36, 11, 6, "wall"],
      [-46, 0, 0, 13, 5.5, 14, "cover"],
      [46, 0, 0, 13, 5.5, 14, "cover"],
      [-30, 0, 31, 16, 5, 8, "cover"],
      [30, 0, -31, 16, 5, 8, "cover"],
    ],
    props: "indoor",
  },
  hybrid: {
    sky: 0x7dc5de,
    floor: "floorOutdoor",
    playerSpawn: [-56, 0, 28],
    aiSpawn: [56, 0, -28],
    bounds: [132, 92],
    obstacles: [
      [-31, 0, -16, 34, 11, 30, "wall"],
      [-7, 0, -34, 6, 11, 36, "wallRed"],
      [28, 0, 0, 7, 7, 52, "cover"],
      [46, 0, 28, 24, 5.5, 7, "cover"],
      [-30, 0, 29, 25, 5.5, 8, "cover"],
      [5, 0, 28, 22, 4.5, 10, "wall"],
      [42, 0, -26, 18, 4.5, 8, "cover"],
      [-50, 0, 5, 18, 5, 9, "cover"],
    ],
    props: "hybrid",
  },
  rooftop: {
    sky: 0x63b7dc,
    floor: "floorIndoor",
    playerSpawn: [-54, 0, 32],
    aiSpawn: [54, 0, -32],
    bounds: [124, 90],
    obstacles: [
      [-38, 0, 18, 20, 5, 10, "wall"],
      [38, 0, -18, 20, 5, 10, "wall"],
      [-18, 0, -8, 6, 8, 44, "cover"],
      [18, 0, 8, 6, 8, 44, "cover"],
      [0, 0, 0, 26, 3.5, 7, "wallRed"],
      [-48, 0, -28, 14, 4.5, 12, "cover"],
      [48, 0, 28, 14, 4.5, 12, "cover"],
      [0, 0, 32, 40, 2.8, 5, "wall"],
      [0, 0, -32, 40, 2.8, 5, "wall"],
    ],
    props: "rooftop",
  },
  canyon: {
    sky: 0x9bd7f0,
    floor: "floorOutdoor",
    playerSpawn: [-58, 0, -26],
    aiSpawn: [58, 0, 26],
    bounds: [138, 98],
    obstacles: [
      [-20, 0, 0, 14, 10, 52, "wall"],
      [20, 0, 0, 14, 10, 52, "wall"],
      [0, 0, 0, 18, 12, 18, "wallRed"],
      [-50, 0, 18, 18, 6, 12, "cover"],
      [50, 0, -18, 18, 6, 12, "cover"],
      [-38, 0, -34, 32, 5.5, 8, "cover"],
      [38, 0, 34, 32, 5.5, 8, "cover"],
      [0, 0, -38, 28, 4, 6, "wall"],
      [0, 0, 38, 28, 4, 6, "wall"],
    ],
    props: "canyon",
  },
  reactor: {
    sky: 0x151a22,
    floor: "floorIndoor",
    playerSpawn: [-50, 0, 0],
    aiSpawn: [50, 0, 0],
    bounds: [120, 86],
    obstacles: [
      [0, 0, 0, 18, 9, 18, "wallRed"],
      [-24, 0, -22, 7, 10, 32, "wall"],
      [24, 0, 22, 7, 10, 32, "wall"],
      [-24, 0, 22, 7, 10, 32, "wall"],
      [24, 0, -22, 7, 10, 32, "wall"],
      [0, 0, -34, 44, 6, 6, "cover"],
      [0, 0, 34, 44, 6, 6, "cover"],
      [-48, 0, -28, 13, 5, 12, "cover"],
      [48, 0, 28, 13, 5, 12, "cover"],
      [-48, 0, 28, 13, 5, 12, "cover"],
      [48, 0, -28, 13, 5, 12, "cover"],
    ],
    props: "reactor",
  },
  village: {
    sky: 0x8bcff0,
    floor: "floorOutdoor",
    playerSpawn: [-60, 0, -34],
    aiSpawn: [60, 0, 34],
    bounds: [142, 102],
    obstacles: [
      [0, 0, 0, 16, 4.5, 6, "cover"],
      [-42, 0, 0, 22, 4, 6, "cover"],
      [42, 0, 0, 22, 4, 6, "cover"],
      [0, 0, -38, 44, 3.5, 5, "cover"],
      [0, 0, 38, 44, 3.5, 5, "cover"],
      [-62, 0, 18, 12, 4, 8, "cover"],
      [62, 0, -18, 12, 4, 8, "cover"],
    ],
    props: "village",
  },
  city: {
    sky: 0x7dbfe4,
    floor: "floorIndoor",
    playerSpawn: [-72, 0, -16],
    aiSpawn: [72, 0, 16],
    bounds: [168, 124],
    obstacles: [
      [-34, 0, 0, 7, 14, 72, "wall"],
      [34, 0, 0, 7, 14, 72, "wall"],
      [0, 0, -34, 54, 5, 7, "cover"],
      [0, 0, 34, 54, 5, 7, "cover"],
      [-66, 0, 12, 16, 7, 10, "cover"],
      [66, 0, -12, 16, 7, 10, "cover"],
      [-10, 0, 48, 28, 5, 8, "cover"],
      [10, 0, -48, 28, 5, 8, "cover"],
      [0, 0, 0, 18, 4, 18, "wallRed"],
    ],
    props: "city",
  },
  building: {
    sky: 0x101820,
    floor: "floorIndoor",
    playerSpawn: [-52, 0, -40],
    aiSpawn: [52, 0, 40],
    bounds: [118, 92],
    obstacles: [
      [0, 0, 0, 5, 8, 54, "wallRed"],
      [-28, 0, -18, 4, 8, 30, "wall"],
      [28, 0, 18, 4, 8, 30, "wall"],
      [-16, 0, 34, 32, 8, 4, "wall"],
      [16, 0, -34, 32, 8, 4, "wall"],
      [-46, 0, 4, 12, 4, 10, "cover"],
      [46, 0, -4, 12, 4, 10, "cover"],
      [0, 0, 28, 18, 3.5, 7, "cover"],
      [0, 0, -28, 18, 3.5, 7, "cover"],
    ],
    props: "building",
  },
  graveyard: {
    sky: 0x182431,
    floor: "floorGraveyard",
    playerSpawn: [-62, 0, -34],
    aiSpawn: [62, 0, 34],
    bounds: [146, 104],
    obstacles: [
      [-30, 0, -8, 12, 5.5, 18, "wall"],
      [30, 0, 8, 12, 5.5, 18, "wall"],
      [0, 0, 0, 26, 4, 7, "cover"],
      [-48, 0, 24, 18, 4, 7, "cover"],
      [48, 0, -24, 18, 4, 7, "cover"],
      [-12, 0, 32, 18, 3.2, 6, "cover"],
      [12, 0, -32, 18, 3.2, 6, "cover"],
    ],
    props: "graveyard",
  },
  mansion: {
    sky: 0x101820,
    floor: "floorMansion",
    playerSpawn: [-66, 0, -46],
    aiSpawn: [66, 0, 46],
    bounds: [158, 116],
    obstacles: [
      [-48, 0, -30, 4, 9, 42, "wall"],
      [-48, 0, 34, 4, 9, 32, "wall"],
      [48, 0, 30, 4, 9, 42, "wall"],
      [48, 0, -34, 4, 9, 32, "wall"],
      [-18, 0, -38, 4, 9, 28, "wall"],
      [18, 0, 38, 4, 9, 28, "wall"],
      [-42, 0, -16, 36, 9, 4, "wallRed"],
      [42, 0, 16, 36, 9, 4, "wallRed"],
      [-48, 0, 12, 30, 9, 4, "wall"],
      [48, 0, -12, 30, 9, 4, "wall"],
      [0, 0, -46, 30, 9, 4, "wall"],
      [0, 0, 46, 30, 9, 4, "wall"],
      [0, 0, 0, 34, 3.2, 10, "cover"],
      [-66, 0, 0, 14, 3, 12, "cover"],
      [66, 0, 0, 14, 3, 12, "cover"],
    ],
    props: "mansion",
  },
  school: {
    sky: 0x101820,
    floor: "floorSchool",
    playerSpawn: [-64, 0, -42],
    aiSpawn: [64, 0, 42],
    bounds: [150, 110],
    obstacles: [
      [0, 0, 0, 5, 9, 86, "wallRed"],
      [-38, 0, -28, 4, 9, 36, "wall"],
      [38, 0, 28, 4, 9, 36, "wall"],
      [-38, 0, 26, 4, 9, 28, "wall"],
      [38, 0, -26, 4, 9, 28, "wall"],
      [-54, 0, 0, 32, 9, 4, "wall"],
      [54, 0, 0, 32, 9, 4, "wall"],
      [-18, 0, -42, 30, 9, 4, "wall"],
      [18, 0, 42, 30, 9, 4, "wall"],
      [-58, 0, -34, 16, 3, 8, "cover"],
      [58, 0, 34, 16, 3, 8, "cover"],
      [0, 0, -26, 24, 3, 8, "cover"],
      [0, 0, 26, 24, 3, 8, "cover"],
    ],
    props: "school",
  },
  titan: {
    sky: 0x94d6f7,
    floor: "floorOutdoor",
    playerSpawn: [-340, 0, -210],
    aiSpawn: [340, 0, 210],
    bounds: [760, 560],
    obstacles: [
      [-160, 0, 0, 28, 18, 160, "wall"],
      [160, 0, 0, 28, 18, 160, "wall"],
      [0, 0, -140, 220, 14, 26, "cover"],
      [0, 0, 140, 220, 14, 26, "cover"],
      [-270, 0, -160, 80, 12, 44, "cover"],
      [270, 0, 160, 80, 12, 44, "cover"],
      [-240, 0, 120, 60, 16, 60, "wallRed"],
      [240, 0, -120, 60, 16, 60, "wallRed"],
      [0, 0, 0, 90, 10, 90, "cover"],
    ],
    props: "titan",
  },
};

function init() {
  scene.add(new THREE.HemisphereLight(0xcdfdff, 0x23372c, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(-18, 42, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x8dffd4, 0.45);
  fill.position.set(42, 18, -28);
  scene.add(fill);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.7, 6, 12), mats.aiBody);
  body.position.y = 1.45;
  body.scale.set(1.08, 1.05, 1.08);
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 20, 14), mats.aiHead);
  head.position.y = 3.05;
  head.scale.setScalar(1.08);
  head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.18, 0.1), mats.trim);
  visor.position.set(0, 3.1, -0.52);
  visor.castShadow = true;
  const leftArm = createLimb(0.18, 1.7, mats.aiBody);
  leftArm.position.set(-1.0, 1.62, -0.08);
  leftArm.rotation.z = -0.24;
  const rightArm = createLimb(0.18, 1.7, mats.aiBody);
  rightArm.position.set(1.0, 1.62, -0.08);
  rightArm.rotation.z = 0.24;
  const leftLeg = createLimb(0.22, 1.65, mats.cover);
  leftLeg.position.set(-0.36, 0.45, 0);
  const rightLeg = createLimb(0.22, 1.65, mats.cover);
  rightLeg.position.set(0.36, 0.45, 0);
  const leftFoot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.82), mats.cover);
  leftFoot.position.set(-0.36, -0.32, -0.16);
  const rightFoot = leftFoot.clone();
  rightFoot.position.x = 0.36;
  for (const part of [visor, leftArm, rightArm, leftLeg, rightLeg, leftFoot, rightFoot]) part.castShadow = true;

  const hitBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 2.35, 1.2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hitBody.position.y = 1.5;
  hitBody.userData.hitZone = "body";
  hitBody.userData.owner = ai;
  const hitHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 16, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hitHead.position.y = 3.08;
  hitHead.userData.hitZone = "head";
  hitHead.userData.owner = ai;

  ai.group.add(body, head, visor, leftArm, rightArm, leftLeg, rightLeg, leftFoot, rightFoot, hitBody, hitHead);
  ai.body = body;
  ai.head = head;
  ai.hitBody = hitBody;
  ai.hitHead = hitHead;
  ai.hitboxes = [hitHead, hitBody];
  ai.leftArm = leftArm;
  ai.rightArm = rightArm;
  ai.leftLeg = leftLeg;
  ai.rightLeg = rightLeg;
  scene.add(ai.group);

  updateLoadoutWeapons();
  buildWeaponBar();
  buildLoadoutMenu();
  bindEvents();
  resize();
  renderer.setAnimationLoop(tick);
}

function createLimb(radius, length, material) {
  const limb = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 10), material);
  limb.castShadow = true;
  return limb;
}

function setupPlayerViewModel() {
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x1d3f46, roughness: 0.52, metalness: 0.05 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x101719, roughness: 0.7 });
  const weaponMat = new THREE.MeshStandardMaterial({ color: 0x26363d, roughness: 0.46, metalness: 0.24 });
  playerView.leftArm = createLimb(0.08, 0.72, sleeveMat);
  playerView.rightArm = createLimb(0.08, 0.78, sleeveMat);
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), gloveMat);
  const rightHand = leftHand.clone();
  playerView.weapon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.9), weaponMat);
  playerView.leftArm.position.set(-0.34, -0.34, -0.62);
  playerView.leftArm.rotation.set(0.95, 0.18, -0.35);
  playerView.rightArm.position.set(0.32, -0.32, -0.58);
  playerView.rightArm.rotation.set(0.9, -0.18, 0.32);
  leftHand.position.set(-0.22, -0.44, -0.95);
  rightHand.position.set(0.2, -0.42, -0.95);
  playerView.weapon.position.set(0.12, -0.38, -1.12);
  playerView.weapon.rotation.x = -0.08;
  playerView.group.add(playerView.leftArm, playerView.rightArm, leftHand, rightHand, playerView.weapon);
  camera.add(playerView.group);
  scene.add(camera);
}

function bindEvents() {
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => {
    unlockAudio();
    if (event.code === "Escape") {
      if (state.playing && !state.roundEnding && matchOver.classList.contains("hidden")) {
        event.preventDefault();
        showScoreScreen();
      }
      return;
    }
    if (event.code === "KeyH") {
      goHome();
      return;
    }
    if (event.code === "KeyP") {
      togglePause();
      return;
    }
    if (event.code === "Space" && !keys.has("Space")) state.jumpQueued = true;
    keys.add(event.code);
    const weapon = weapons.find((item) => item.key === event.key);
    if (weapon) setWeapon(weapon.id);
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("mousemove", (event) => {
    if (!state.playing || state.paused) return;
    if (state.weapon === "sniper" && (event.buttons & 2)) setScoped(true);
    const sensitivity = state.scoped ? 0.0011 : 0.0022;
    mouse.yaw -= event.movementX * sensitivity;
    mouse.pitch -= event.movementY * sensitivity;
    mouse.pitch = THREE.MathUtils.clamp(mouse.pitch, -1.22, 1.22);
  });
  canvas.addEventListener("mousedown", (event) => {
    if (state.playing && !state.roundEnding) {
      event.preventDefault();
      unlockAudio();
      if (document.pointerLockElement !== canvas) requestMouseCapture(true);
      if (event.button === 0) {
        state.fireHeld = true;
        useWeapon();
      }
    }
  });
  window.addEventListener("mousedown", (event) => {
    if (event.button === 2) beginScope(event);
  });
  window.addEventListener("pointerdown", (event) => {
    if (event.button === 2) beginScope(event);
  });
  canvas.addEventListener("wheel", (event) => {
    if (!state.playing || state.paused || state.roundEnding) return;
    event.preventDefault();
    cycleWeapon(event.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  window.addEventListener("mouseup", (event) => {
    if (event.button === 0) state.fireHeld = false;
    if (event.button === 2) setScoped(false);
  });
  window.addEventListener("pointerup", (event) => {
    if (event.button === 2) setScoped(false);
  });
  window.addEventListener("blur", () => {
    state.fireHeld = false;
    state.jumpQueued = false;
    setScoped(false);
  });
  window.addEventListener("contextmenu", (event) => {
    if (state.playing) event.preventDefault();
  });
  document.querySelectorAll(".map-card").forEach((button) => {
    button.addEventListener("click", () => showLoadoutMenu(button.dataset.map, button.dataset.mode || "standard"));
  });
  startLoadout.addEventListener("click", startSelectedMatch);
  backToMaps.addEventListener("click", () => showMapMenu("Choose Your Arena"));
  document.querySelector("#restart").addEventListener("click", resetMatch);
  continueGame.addEventListener("click", continueFromScore);
  homeFromScore.addEventListener("click", goHome);
  document.addEventListener("pointerlockchange", () => {
    if (
      state.playing &&
      !state.paused &&
      !state.roundEnding &&
      state.mouseCaptureRequested &&
      document.pointerLockElement !== canvas
    ) {
      showScoreScreen();
    }
  });
}

function buildWeaponBar() {
  weaponBar.innerHTML = "";
  for (const weapon of weapons) {
    const item = document.createElement("div");
    item.className = "weapon";
    item.dataset.weapon = weapon.id;
    item.innerHTML = `<span>${weapon.key}</span><strong>${weapon.name}</strong><span>${weapon.note}</span>`;
    weaponBar.appendChild(item);
  }
  refreshHud();
}

function updateLoadoutWeapons() {
  weapons = loadoutCategories.map((category, index) => ({
    ...weaponCatalog[state.loadout[category.id]],
    key: String(index + 1),
  }));
}

function buildLoadoutMenu() {
  loadoutGrid.innerHTML = "";
  for (const category of loadoutCategories) {
    const section = document.createElement("div");
    section.className = "loadout-category";
    section.innerHTML = `<h2>${category.name}</h2>`;
    for (const id of category.options) {
      const option = weaponCatalog[id];
      const button = document.createElement("button");
      button.className = "loadout-option";
      button.dataset.category = category.id;
      button.dataset.weapon = id;
      button.innerHTML = `<strong>${option.name}</strong><span>${option.note}</span>`;
      button.addEventListener("click", () => {
        state.loadout[category.id] = id;
        updateLoadoutWeapons();
        buildWeaponBar();
        refreshLoadoutMenu();
      });
      section.appendChild(button);
    }
    loadoutGrid.appendChild(section);
  }
  refreshLoadoutMenu();
}

function refreshLoadoutMenu() {
  for (const option of loadoutGrid.querySelectorAll(".loadout-option")) {
    option.classList.toggle("active", state.loadout[option.dataset.category] === option.dataset.weapon);
  }
}

function showLoadoutMenu(mapId, mode = "standard") {
  state.pendingMapId = mapId;
  state.pendingGameMode = mode;
  menu.classList.add("hidden");
  loadoutMenu.classList.remove("hidden");
  refreshLoadoutMenu();
}

function startSelectedMatch() {
  updateLoadoutWeapons();
  randomizeAiLoadout();
  state.gameMode = state.pendingGameMode;
  buildWeaponBar();
  state.round = 1;
  state.playerRounds = 0;
  state.aiRounds = 0;
  world.routeMemory = [];
  world.routeSampleTimer = 0;
  loadoutMenu.classList.add("hidden");
  startRound(state.pendingMapId);
}

function randomizeAiLoadout() {
  for (const category of loadoutCategories) {
    const roll = category.options[Math.floor(Math.random() * category.options.length)];
    state.aiLoadout[category.id] = roll;
  }
}

function randomLoadout() {
  const loadout = {};
  for (const category of loadoutCategories) {
    loadout[category.id] = category.options[Math.floor(Math.random() * category.options.length)];
  }
  return loadout;
}

function zombieLoadout() {
  return { melee: "knife", gun: "sniper", heal: "medkit", utility: "grenade" };
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function resetMatch() {
  state.round = 1;
  state.playerRounds = 0;
  state.aiRounds = 0;
  state.paused = false;
  state.mouseCaptureRequested = false;
  state.fireHeld = false;
  state.jumpQueued = false;
  world.routeMemory = [];
  world.routeSampleTimer = 0;
  keys.clear();
  matchOver.classList.add("hidden");
  pauseMenu.classList.add("hidden");
  scoreMenu.classList.add("hidden");
  showMapMenu("Choose Your Arena");
}

function showMapMenu(title = "Choose Your Arena") {
  state.inMenu = true;
  state.playing = false;
  state.paused = false;
  state.mouseCaptureRequested = false;
  state.fireHeld = false;
  state.jumpQueued = false;
  keys.clear();
  setScoped(false);
  menu.querySelector("h1").textContent = title;
  menu.classList.remove("hidden");
  loadoutMenu.classList.add("hidden");
  hud.classList.add("hidden");
  pauseMenu.classList.add("hidden");
  scoreMenu.classList.add("hidden");
  if (document.pointerLockElement) document.exitPointerLock();
}

function goHome() {
  state.round = 1;
  state.playerRounds = 0;
  state.aiRounds = 0;
  state.roundEnding = false;
  state.mouseCaptureRequested = false;
  state.fireHeld = false;
  state.jumpQueued = false;
  matchOver.classList.add("hidden");
  scoreMenu.classList.add("hidden");
  loadoutMenu.classList.add("hidden");
  showMapMenu("Choose Your Arena");
}

function togglePause() {
  if (!state.playing && !state.paused) return;
  if (state.inMenu || state.roundEnding || !matchOver.classList.contains("hidden")) return;
  state.paused = !state.paused;
  keys.clear();
  pauseMenu.classList.toggle("hidden", !state.paused);
  if (!state.paused) requestMouseCapture(true);
  setMessage(state.paused ? "Paused. Press P to resume or H for home." : "Round live. Mouse captured, WASD moves, Space jumps, scroll swaps weapons, left click shoots.");
}

function showScoreScreen() {
  if (!state.playing || state.roundEnding) return;
  state.paused = true;
  state.mouseCaptureRequested = false;
  state.fireHeld = false;
  state.jumpQueued = false;
  keys.clear();
  setScoped(false);
  scoreTitle.textContent = `Round ${state.round}`;
  scoreSummary.textContent = `You ${state.playerRounds} : ${state.aiRounds} AI`;
  scoreMenu.classList.remove("hidden");
  pauseMenu.classList.add("hidden");
  setMessage("Score screen open. Continue recaptures the mouse.");
  if (document.pointerLockElement) document.exitPointerLock();
}

function continueFromScore() {
  if (!state.playing || state.roundEnding) return;
  state.paused = false;
  keys.clear();
  scoreMenu.classList.add("hidden");
  requestMouseCapture(true);
  setMessage("Round live. Mouse captured, WASD moves, Space jumps, scroll swaps weapons, left click shoots.");
}

function requestMouseCapture(showMessage = false) {
  if (!state.playing || state.paused || document.pointerLockElement === canvas) return;
  try {
    const lockResult = canvas.requestPointerLock?.();
    state.mouseCaptureRequested = true;
    lockResult?.catch?.(() => {
      state.mouseCaptureRequested = false;
      if (showMessage) setMessage("Mouse capture was blocked. Click the game to try again.");
    });
  } catch {
    state.mouseCaptureRequested = false;
    if (showMessage) setMessage("Mouse capture was blocked. Click the game to try again.");
  }
}

function beginScope(event) {
  if (!state.playing || state.paused || state.roundEnding) return;
  event.preventDefault();
  unlockAudio();
  if (document.pointerLockElement !== canvas) requestMouseCapture(true);
  setScoped(true);
}

function startRound(mapId) {
  state.mapId = mapId;
  state.inMenu = false;
  state.playing = true;
  state.roundEnding = false;
  state.paused = false;
  state.mouseCaptureRequested = false;
  keys.clear();
  state.cooldown = 0;
  state.medkitUsed = false;
  state.grenadeUsed = false;
  state.blindTimer = 0;
  setScoped(false);
  player.health = getPlayerMaxHealth();
  player.radius = state.gameMode === "titan" ? 3.15 : 1.05;
  player.speed = state.gameMode === "titan" ? 24 : 18;
  player.verticalVelocity = 0;
  player.grounded = true;
  player.jumpsUsed = 0;
  player.movementSpeed = 0;
  player.stuckTimer = 0;
  ai.health = 100;
  state.jumpQueued = false;
  ai.shootTimer = 1.1;
  ai.medkitUsed = false;
  ai.grenadeUsed = false;
  ai.blindTimer = 0;
  ai.weapon = state.aiLoadout.gun;
  ai.strafe = Math.random() > 0.5 ? 1 : -1;
  ai.mode = "wander";
  ai.tactic = rollAiTactic();
  ai.awareness = 0;
  ai.decisionTimer = 0;
  ai.pauseTimer = 0.45;
  ai.memoryTimer = 0;
  ai.stuckTimer = 0;
  ai.objectiveTimer = 3.5 + Math.random() * 2.5;
  buildMap(mapId);
  spawnTitanAis();
  setWeapon(state.loadout.gun);
  menu.classList.add("hidden");
  pauseMenu.classList.add("hidden");
  scoreMenu.classList.add("hidden");
  hud.classList.remove("hidden");
  requestMouseCapture(false);
  if (state.gameMode === "zombie") {
    setMessage(`Wave ${state.round}: ${state.round * zombieWaveSize} zombies incoming.`);
  } else {
    setMessage("Round live. Mouse captured, WASD moves, Space jumps, scroll swaps weapons, left click shoots. Esc opens scores.");
  }
}

function setScoped(scoped) {
  if (scoped && !state.scoped && state.weapon === "sniper") flashScope();
  state.scoped = scoped;
  camera.fov = scoped ? 30 : 75;
  camera.updateProjectionMatrix();
}

function unlockAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

function playTone(frequency, duration, type = "sine", volume = 0.14, startOffset = 0, slideTo = null) {
  if (!audioContext) return;
  const start = audioContext.currentTime + startOffset;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function playNoise(duration, volume = 0.12, startOffset = 0, filterFrequency = 1200) {
  if (!audioContext) return;
  const start = audioContext.currentTime + startOffset;
  const bufferSize = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(filterFrequency, start);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(audioContext.destination);
  source.start(start);
}

function playSound(name) {
  if (!audioContext) return;
  if (name === "sniper") {
    playNoise(0.08, 0.2, 0, 3600);
    playTone(95, 0.16, "sawtooth", 0.13, 0, 42);
    playTone(1250, 0.05, "square", 0.08);
  } else if (name === "jump") {
    playTone(220, 0.12, "triangle", 0.09, 0, 390);
  } else if (name === "land") {
    playNoise(0.09, 0.12, 0, 520);
    playTone(90, 0.08, "sine", 0.08, 0, 55);
  } else if (name === "medkit") {
    playTone(520, 0.09, "sine", 0.1);
    playTone(720, 0.11, "sine", 0.1, 0.08);
    playTone(980, 0.13, "sine", 0.08, 0.18);
  } else if (name === "grenadeThrow") {
    playTone(310, 0.12, "triangle", 0.08, 0, 180);
    playNoise(0.07, 0.06, 0.02, 1800);
  } else if (name === "explosion") {
    playNoise(0.32, 0.26, 0, 700);
    playTone(72, 0.3, "sawtooth", 0.18, 0, 34);
  } else if (name === "hit") {
    playTone(760, 0.07, "square", 0.08);
    playTone(540, 0.08, "triangle", 0.06, 0.045);
  } else if (name === "playerHit") {
    playNoise(0.12, 0.13, 0, 1200);
    playTone(160, 0.12, "sawtooth", 0.1, 0, 90);
  } else if (name === "knife") {
    playNoise(0.06, 0.08, 0, 2400);
    playTone(420, 0.08, "triangle", 0.05, 0, 260);
  } else if (name === "rifle") {
    playNoise(0.045, 0.13, 0, 2600);
    playTone(180, 0.07, "sawtooth", 0.07, 0, 120);
  } else if (name === "flashbang") {
    playTone(1280, 0.24, "sine", 0.12);
    playNoise(0.12, 0.12, 0, 3400);
  }
}

function buildMap(mapId) {
  const def = mapDefs[mapId];
  clearWorld();
  scene.background = new THREE.Color(def.sky);
  scene.fog = new THREE.Fog(def.sky, 110, 245);
  world.playerSpawn.fromArray(def.playerSpawn);
  world.aiSpawn.fromArray(def.aiSpawn);
  if (state.gameMode === "zombie") {
    world.playerSpawn.set(0, 0, 70);
    world.aiSpawn.copy(world.playerSpawn);
  }
  world.bounds.width = def.bounds[0];
  world.bounds.depth = def.bounds[1];
  player.position.copy(world.playerSpawn);
  player.previousPosition.copy(world.playerSpawn);
  ai.position.copy(world.aiSpawn);
  ai.previousPosition.copy(world.aiSpawn);
  mouse.pitch = 0;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(def.bounds[0], 0.5, def.bounds[1]), mats[def.floor]);
  floor.position.y = -0.3;
  floor.receiveShadow = true;
  floor.userData.world = true;
  scene.add(floor);
  addSkyDetails(def.props, def.bounds);
  addFloorDetails(def.bounds, def.props);
  addRealisticMapDetails(def.props, def.bounds);

  addWall(0, -def.bounds[1] / 2, 4.5, def.bounds[0], 9, 2.4, "wall");
  addWall(0, def.bounds[1] / 2, 4.5, def.bounds[0], 9, 2.4, "wall");
  addWall(-def.bounds[0] / 2, 0, 4.5, 2.4, 9, def.bounds[1], "wall");
  addWall(def.bounds[0] / 2, 0, 4.5, 2.4, 9, def.bounds[1], "wall");
  for (const box of def.obstacles) {
    if (shouldSkipObstacleForMode(box, mapId)) continue;
    addWall(box[0], box[2], box[1] + box[4] / 2, box[3], box[4], box[5], box[6]);
  }
  addJumpPlatforms(def.props, def.bounds);
  addProps(def.props, def.bounds);
  placeEntityOnOpenGround(player.position, world.playerSpawn, player.radius);
  player.previousPosition.copy(player.position);
  if (state.gameMode === "standard") world.aiSpawn.copy(randomRegularAiSpawnPoint());
  placeEntityOnOpenGround(ai.position, world.aiSpawn, ai.radius);
  ai.previousPosition.copy(ai.position);
  ai.lastSeenPlayer.copy(player.position);
  ai.facing.set(player.position.x - ai.position.x, 0, player.position.z - ai.position.z).normalize();
  mouse.yaw = Math.atan2(player.position.x - ai.position.x, player.position.z - ai.position.z);
  ai.roundTarget.copy(randomGroundTargetPoint());
  ai.objective.copy(ai.roundTarget);
  ai.goal.copy(ai.roundTarget);
  updateCamera();
  updateAiMesh();
}

function shouldSkipObstacleForMode(box, mapId) {
  const isTitanCenterObstacle = mapId === "titan" && Math.abs(box[0]) <= 170 && Math.abs(box[2]) <= 150;
  return state.gameMode === "zombie" && isTitanCenterObstacle;
}

function randomRegularAiSpawnPoint() {
  const minDistance = Math.min(world.bounds.width, world.bounds.depth) * 0.38;
  const margin = 12;
  let best = null;
  let bestScore = -Infinity;
  const preferred = mapDefs[state.mapId]?.aiSpawn || [world.aiSpawn.x, 0, world.aiSpawn.z];

  for (let i = 0; i < 80; i++) {
    const point = new THREE.Vector3(
      THREE.MathUtils.randFloat(-world.bounds.width / 2 + margin, world.bounds.width / 2 - margin),
      0,
      THREE.MathUtils.randFloat(-world.bounds.depth / 2 + margin, world.bounds.depth / 2 - margin)
    );
    if (!isSafeGroundPoint(point, ai.radius + 0.65)) continue;
    const distToPlayer = point.distanceTo(player.position);
    if (distToPlayer < minDistance) continue;
    const spawnScore = distToPlayer + Math.min(point.distanceTo(new THREE.Vector3(...preferred)), 36) * 0.25 + openSpaceScore(point);
    if (spawnScore > bestScore) {
      best = point;
      bestScore = spawnScore;
    }
  }

  if (best) return best;
  const fallback = world.aiSpawn.clone();
  clampToMap(fallback, ai.radius);
  return fallback.distanceTo(player.position) >= minDistance ? fallback : randomGroundTargetPoint();
}

function spawnTitanAis() {
  if (!["titan", "zombie"].includes(state.gameMode)) {
    ai.group.visible = true;
    ai.health = 100;
    ai.speed = 8.7;
    return;
  }
  const zombieMode = state.gameMode === "zombie";
  const totalCount = zombieMode ? state.round * zombieWaveSize : titanAiCount;
  ai.group.visible = true;
  ai.health = 100;
  ai.speed = zombieMode ? 8.7 * zombieSpeedMultiplier : 8.7;
  ai.loadout = zombieMode ? zombieLoadout() : randomLoadout();
  if (zombieMode) {
    const preferred = zombiePerimeterSpawnPoint(0, totalCount);
    placeEntityOnOpenGround(ai.position, preferred, ai.radius);
    ai.previousPosition.copy(ai.position);
    ai.group.position.copy(ai.position);
  }
  extraAis = [];
  const bodyOwner = ai.hitBody.userData.owner;
  const headOwner = ai.hitHead.userData.owner;
  delete ai.hitBody.userData.owner;
  delete ai.hitHead.userData.owner;
  for (let i = 1; i < totalCount; i++) {
    const unit = {
      group: ai.group.clone(true),
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      health: 100,
      radius: 1.05,
      speed: zombieMode ? (9.2 + Math.random() * 1.8) * zombieSpeedMultiplier : 7.2 + Math.random() * 2,
      shootTimer: Math.random() * 1.6,
      grenadeUsed: false,
      medkitUsed: false,
      blindTimer: 0,
      facing: new THREE.Vector3(0, 0, 1),
      loadout: zombieMode ? zombieLoadout() : randomLoadout(),
      hitboxes: [],
    };
    unit.group.userData.world = true;
    unit.group.traverse((child) => {
      child.userData.world = true;
      if (child.userData.hitZone) {
        child.userData.owner = unit;
        unit.hitboxes.push(child);
      }
    });
    const angle = (Math.PI * 2 * i) / (titanAiCount - 1);
    const ring = 24 + (i % 5) * 12;
    const preferred = zombieMode
      ? zombiePerimeterSpawnPoint(i, totalCount)
      : world.aiSpawn.clone().add(new THREE.Vector3(Math.cos(angle) * ring, 0, Math.sin(angle) * ring));
    if (zombieMode) placeEntityOnOpenGround(unit.position, preferred, unit.radius);
    else {
      unit.position.copy(preferred);
      clampToMap(unit.position, unit.radius);
    }
    unit.previousPosition.copy(unit.position);
    unit.group.position.copy(unit.position);
    scene.add(unit.group);
    extraAis.push(unit);
  }
  ai.hitBody.userData.owner = bodyOwner;
  ai.hitHead.userData.owner = headOwner;
}

function zombiePerimeterSpawnPoint(index, total) {
  const margin = 8;
  const halfWidth = world.bounds.width / 2 - margin;
  const halfDepth = world.bounds.depth / 2 - margin;
  const width = halfWidth * 2;
  const depth = halfDepth * 2;
  const perimeter = width * 2 + depth * 2;
  const jitter = THREE.MathUtils.randFloat(-0.32, 0.32) / Math.max(total, 1);
  let distance = (((index / Math.max(total, 1)) + jitter + 1) % 1) * perimeter;
  const point = new THREE.Vector3();

  if (distance < width) {
    point.set(-halfWidth + distance, 0, -halfDepth);
  } else if ((distance -= width) < depth) {
    point.set(halfWidth, 0, -halfDepth + distance);
  } else if ((distance -= depth) < width) {
    point.set(halfWidth - distance, 0, halfDepth);
  } else {
    distance -= width;
    point.set(-halfWidth, 0, halfDepth - distance);
  }
  return point;
}

function placeEntityOnOpenGround(position, preferred, radius) {
  const candidates = [preferred.clone()];
  for (const distance of [6, 12, 18, 26]) {
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      candidates.push(preferred.clone().add(new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)));
    }
  }
  for (const candidate of candidates) {
    candidate.y = 0;
    clampToMap(candidate, radius);
    if (!collides(candidate, radius + 0.35)) {
      position.copy(candidate);
      return;
    }
  }
  position.copy(preferred);
  clampToMap(position, radius);
}

function clearWorld() {
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const child = scene.children[i];
    if (child.userData.world) scene.remove(child);
  }
  world.solids = [];
  world.grenades = [];
  world.beams = [];
  world.skyObjects = [];
  extraAis = [];
}

function addWall(x, z, y, w, h, d, matKey) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[matKey]);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.world = true;
  mesh.userData.solid = true;
  mesh.userData.box = { x, z, w, d };
  scene.add(mesh);
  world.solids.push(mesh);
  if (w > 8 || d > 8) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.35, w * 0.94), 0.12, Math.max(0.35, d * 0.94)), mats.trim);
    trim.position.set(x, y + h / 2 + 0.08, z);
    trim.userData.world = true;
    scene.add(trim);
  }
  return mesh;
}

function addSkyDetails(kind, bounds) {
  if (["indoor", "reactor", "building", "mansion", "school"].includes(kind)) return;
  if (kind === "graveyard") {
    addCrescentMoon(bounds);
    return;
  }
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(7, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff6bf })
  );
  sun.position.set(-bounds[0] * 0.28, 72, -bounds[1] * 0.34);
  sun.userData.world = true;
  scene.add(sun);
  world.skyObjects.push(sun);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(11, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xffdf72, transparent: true, opacity: 0.28 })
  );
  glow.position.copy(sun.position);
  glow.userData.world = true;
  scene.add(glow);
  world.skyObjects.push(glow);

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.82 });
  const cloudPositions = [
    [-bounds[0] * 0.22, 58, bounds[1] * 0.18],
    [bounds[0] * 0.18, 64, -bounds[1] * 0.12],
    [bounds[0] * 0.34, 54, bounds[1] * 0.28],
    [-bounds[0] * 0.38, 66, -bounds[1] * 0.05],
  ];
  for (const [x, y, z] of cloudPositions) {
    addCloudCluster(x, y, z, cloudMat);
  }
}

function addCloudCluster(x, y, z, material) {
  const group = new THREE.Group();
  const puffs = [
    [0, 0, 0, 5.8],
    [5.2, -0.2, 0.5, 4.8],
    [-5.0, -0.3, 0.2, 4.4],
    [1.6, 1.3, -0.2, 5.2],
    [-1.8, 1.0, 0.4, 4.8],
  ];
  for (const [px, py, pz, scale] of puffs) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), material);
    puff.position.set(px, py, pz);
    puff.scale.set(scale * 1.35, scale * 0.42, scale * 0.7);
    group.add(puff);
  }
  group.position.set(x, y, z);
  group.userData.world = true;
  scene.add(group);
  world.skyObjects.push(group);
}

function addCrescentMoon(bounds) {
  const moon = new THREE.Group();
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xdce8dd });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x182431 });
  const bright = new THREE.Mesh(new THREE.SphereGeometry(6.8, 32, 16), moonMat);
  const shadow = new THREE.Mesh(new THREE.SphereGeometry(6.9, 32, 16), shadowMat);
  shadow.position.set(3.2, 0.15, 0.35);
  moon.add(bright, shadow);
  moon.position.set(-bounds[0] * 0.3, 66, -bounds[1] * 0.32);
  moon.userData.world = true;
  scene.add(moon);
  world.skyObjects.push(moon);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(13, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x8ea6bd, transparent: true, opacity: 0.14 })
  );
  glow.position.copy(moon.position);
  glow.userData.world = true;
  scene.add(glow);
  world.skyObjects.push(glow);
}

function addPlatform(x, z, w, h, d) {
  const platform = addWall(x, z, h / 2, w, h, d, "cover");
  platform.userData.platform = true;
  const pad = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 0.1, d * 0.84), mats.trim);
  pad.position.set(x, h + 0.08, z);
  pad.userData.world = true;
  scene.add(pad);
  return platform;
}

function addRaisedFloor(x, z, w, d, topHeight) {
  const thickness = 0.38;
  const floor = addWall(x, z, topHeight - thickness / 2, w, thickness, d, "floorIndoor");
  floor.userData.platform = true;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.08, d * 0.96), mats.trim);
  edge.position.set(x, topHeight + 0.06, z);
  edge.userData.world = true;
  scene.add(edge);
  return floor;
}

function addJumpPlatforms(kind, bounds) {
  if (kind === "outdoor") {
    addPlatform(-34, 9, 13, 1.5, 13);
    addPlatform(-23, 9, 12, 2.7, 12);
    addPlatform(34, -10, 13, 1.5, 13);
    addPlatform(23, -10, 12, 2.7, 12);
    addPlatform(0, 0, 15, 2.1, 15);
  } else if (kind === "indoor") {
    addPlatform(-48, -24, 15, 1.5, 15);
    addPlatform(-35, -24, 13, 2.8, 13);
    addPlatform(48, 24, 15, 1.5, 15);
    addPlatform(35, 24, 13, 2.8, 13);
    addPlatform(0, 34, 19, 2.2, 12);
  } else if (kind === "mansion") {
    addPlatform(-58, -36, 14, 1.0, 10);
    addPlatform(-48, -36, 12, 1.9, 10);
    addPlatform(58, 36, 14, 1.0, 10);
    addPlatform(48, 36, 12, 1.9, 10);
    addPlatform(-18, 0, 16, 1.2, 12);
    addPlatform(18, 0, 16, 1.2, 12);
    addPlatform(0, -22, 20, 1.5, 10);
    addPlatform(0, 22, 20, 1.5, 10);
    addPlatform(-66, 20, 12, 1.1, 12);
    addPlatform(66, -20, 12, 1.1, 12);
  } else if (kind === "school") {
    addPlatform(-56, -34, 14, 1.0, 10);
    addPlatform(-45, -34, 12, 1.9, 10);
    addPlatform(56, 34, 14, 1.0, 10);
    addPlatform(45, 34, 12, 1.9, 10);
    addPlatform(-18, 0, 16, 1.2, 12);
    addPlatform(18, 0, 16, 1.2, 12);
    addPlatform(0, -26, 18, 1.5, 10);
    addPlatform(0, 26, 18, 1.5, 10);
    addPlatform(-62, 16, 12, 1.1, 12);
    addPlatform(62, -16, 12, 1.1, 12);
  } else {
    addPlatform(-50, 18, 15, 1.5, 15);
    addPlatform(-38, 18, 13, 2.7, 13);
    addPlatform(42, -18, 16, 1.6, 16);
    addPlatform(31, -18, 13, 2.9, 13);
    addPlatform(6, -2, 17, 2.2, 17);
    if (kind === "rooftop") {
      addPlatform(-52, 0, 18, 1.2, 18);
      addPlatform(-39, 0, 16, 2.1, 16);
      addPlatform(52, 0, 18, 1.2, 18);
      addPlatform(39, 0, 16, 2.1, 16);
      addPlatform(0, 24, 24, 1.5, 14);
      addPlatform(0, -24, 24, 1.5, 14);
      addPlatform(-18, 34, 14, 1.1, 14);
      addPlatform(18, -34, 14, 1.1, 14);
    } else if (kind === "canyon") {
      addPlatform(-60, -3, 20, 1.1, 20);
      addPlatform(-46, -3, 18, 2.0, 18);
      addPlatform(60, 3, 20, 1.1, 20);
      addPlatform(46, 3, 18, 2.0, 18);
      addPlatform(-10, 25, 18, 1.4, 16);
      addPlatform(6, 25, 16, 2.3, 14);
      addPlatform(10, -25, 18, 1.4, 16);
      addPlatform(-6, -25, 16, 2.3, 14);
      addPlatform(0, 0, 20, 1.7, 20);
    } else if (kind === "reactor") {
      addPlatform(-42, 0, 17, 1.2, 17);
      addPlatform(-29, 0, 15, 2.1, 15);
      addPlatform(42, 0, 17, 1.2, 17);
      addPlatform(29, 0, 15, 2.1, 15);
      addPlatform(0, 0, 28, 1.8, 28);
      addPlatform(0, -28, 22, 1.4, 12);
      addPlatform(0, 28, 22, 1.4, 12);
      addPlatform(-22, -28, 14, 1.1, 12);
      addPlatform(22, 28, 14, 1.1, 12);
    } else if (kind === "village") {
      addPlatform(-50, -22, 14, 1.1, 14);
      addPlatform(-20, -22, 12, 2.0, 12);
      addPlatform(22, 20, 14, 1.1, 14);
      addPlatform(51, 20, 12, 2.0, 12);
      addPlatform(-10, 33, 13, 1.1, 12);
      addPlatform(15, 33, 12, 1.9, 12);
      addPlatform(0, 0, 18, 1.4, 18);
      addPlatform(-48, 28, 13, 1.0, 13);
      addPlatform(48, -30, 13, 1.0, 13);
    } else if (kind === "city") {
      addPlatform(-72, -16, 18, 1.1, 18);
      addPlatform(-56, -16, 16, 2.0, 16);
      addPlatform(72, 16, 18, 1.1, 18);
      addPlatform(56, 16, 16, 2.0, 16);
      addPlatform(-18, 0, 20, 1.4, 14);
      addPlatform(18, 0, 20, 1.4, 14);
      addPlatform(0, 52, 24, 1.3, 12);
      addPlatform(0, -52, 24, 1.3, 12);
      addPlatform(-48, 42, 16, 1.6, 16);
      addPlatform(48, -42, 16, 1.6, 16);
    } else if (kind === "building") {
      addPlatform(-42, -20, 14, 1.0, 14);
      addPlatform(-32, -20, 14, 2.0, 14);
      addPlatform(-22, -20, 14, 3.0, 14);
      addPlatform(-12, -20, 16, 3.9, 16);
      addPlatform(42, 20, 14, 1.0, 14);
      addPlatform(32, 20, 14, 2.0, 14);
      addPlatform(22, 20, 14, 3.0, 14);
      addPlatform(12, 20, 16, 3.9, 16);
      addPlatform(-18, 18, 24, 3.2, 18);
      addPlatform(18, -18, 24, 3.2, 18);
      addPlatform(0, 0, 18, 1.3, 18);
      addPlatform(-46, 8, 13, 1.1, 13);
      addPlatform(46, -8, 13, 1.1, 13);
    } else if (kind === "graveyard") {
      addPlatform(-52, -26, 13, 1.0, 13);
      addPlatform(-42, -26, 12, 1.9, 12);
      addPlatform(52, 26, 13, 1.0, 13);
      addPlatform(42, 26, 12, 1.9, 12);
      addPlatform(-16, 34, 14, 1.1, 12);
      addPlatform(-4, 34, 12, 2.0, 12);
      addPlatform(16, -34, 14, 1.1, 12);
      addPlatform(4, -34, 12, 2.0, 12);
      addPlatform(0, 0, 18, 1.35, 14);
    }
  }
}

function addFloorDetails(bounds, kind) {
  const lineMat = ["indoor", "mansion", "school"].includes(kind) ? mats.trim : mats.stripe;
  const spacing = ["indoor", "mansion", "school"].includes(kind) ? 14 : 18;
  for (let x = -bounds[0] / 2 + spacing; x < bounds[0] / 2; x += spacing) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, bounds[1] - 8), lineMat);
    line.position.set(x, 0.02, 0);
    line.userData.world = true;
    scene.add(line);
  }
  for (let z = -bounds[1] / 2 + spacing; z < bounds[1] / 2; z += spacing) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(bounds[0] - 8, 0.04, 0.16), lineMat);
    line.position.set(0, 0.025, z);
    line.userData.world = true;
    scene.add(line);
  }
  const center = new THREE.Mesh(new THREE.RingGeometry(8, 8.25, 48), lineMat);
  center.rotation.x = -Math.PI / 2;
  center.position.y = 0.04;
  center.userData.world = true;
  scene.add(center);
}

function addRealisticMapDetails(kind, bounds) {
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x20282b, roughness: 0.88, metalness: 0.03 });
  const pathMat = new THREE.MeshStandardMaterial({ color: 0x6d604f, roughness: 0.95 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x6e7778, roughness: 0.72 });
  if (["city", "village", "rooftop"].includes(kind)) {
    addFlatDetail(0, 0, bounds[0] - 10, 12, roadMat);
    addFlatDetail(0, 0, 12, bounds[1] - 10, roadMat);
    addFlatDetail(0, 10, bounds[0] - 12, 2.2, sidewalkMat);
    addFlatDetail(0, -10, bounds[0] - 12, 2.2, sidewalkMat);
    addFlatDetail(10, 0, 2.2, bounds[1] - 12, sidewalkMat);
    addFlatDetail(-10, 0, 2.2, bounds[1] - 12, sidewalkMat);
  }
  if (["outdoor", "hybrid", "village", "canyon", "graveyard"].includes(kind)) {
    addFlatDetail(0, 0, bounds[0] * 0.72, 5, pathMat);
    addFlatDetail(0, 0, 5, bounds[1] * 0.72, pathMat);
  }
  if (kind === "canyon") {
    for (const [x, z, s] of [[-46, -8, 8], [46, 8, 8], [-4, 34, 5], [4, -34, 5]]) {
      const slope = new THREE.Mesh(new THREE.ConeGeometry(s, s * 1.6, 5), new THREE.MeshStandardMaterial({ color: 0x766653, roughness: 0.96 }));
      slope.position.set(x, s * 0.45, z);
      slope.rotation.y = Math.random() * Math.PI;
      slope.scale.y = 0.55;
      slope.castShadow = true;
      slope.receiveShadow = true;
      slope.userData.world = true;
      scene.add(slope);
    }
  }
}

function addFlatDetail(x, z, w, d, material) {
  const detail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), material);
  detail.position.set(x, 0.04, z);
  detail.receiveShadow = true;
  detail.userData.world = true;
  scene.add(detail);
  return detail;
}

function addProps(kind, bounds) {
  if (["outdoor", "hybrid", "canyon", "village", "graveyard"].includes(kind)) {
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x275c38, roughness: 0.8 });
    for (const [x, z] of [
      [-56, -36], [56, 36], [-54, 36], [54, -36], [-18, -40], [20, 40], [-62, 3], [62, -3],
    ]) {
      if (kind === "village" && Math.abs(x) < 55) continue;
      if (kind === "graveyard" && Math.abs(x) < 52 && Math.abs(z) < 38) continue;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 5, 8), mats.cover);
      trunk.position.set(x, 2.2, z);
      const top = new THREE.Mesh(new THREE.ConeGeometry(2.3, 5, 10), treeMat);
      top.position.set(x, 6, z);
      trunk.userData.world = top.userData.world = true;
      scene.add(trunk, top);
    }
  }
  if (["indoor", "hybrid", "reactor", "building", "mansion", "school"].includes(kind)) {
    for (let x = -bounds[0] / 2 + 10; x < bounds[0] / 2; x += 16) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(8, 0.1, 0.8),
        mats.trim
      );
      strip.position.set(x, 9.8, 0);
      strip.userData.world = true;
      scene.add(strip);
    }
    for (let z = -bounds[1] / 2 + 14; z < bounds[1] / 2; z += 22) {
      const pillarLeft = new THREE.Mesh(new THREE.BoxGeometry(2.2, 8.5, 2.2), mats.wallRed);
      const pillarRight = pillarLeft.clone();
      pillarLeft.position.set(-bounds[0] / 2 + 8, 4.2, z);
      pillarRight.position.set(bounds[0] / 2 - 8, 4.2, z);
      pillarLeft.castShadow = pillarRight.castShadow = true;
      pillarLeft.receiveShadow = pillarRight.receiveShadow = true;
      pillarLeft.userData.world = pillarRight.userData.world = true;
      scene.add(pillarLeft, pillarRight);
    }
  }
  if (kind === "rooftop") {
    for (const [x, z, h] of [[-18, 34, 18], [18, -34, 16], [46, -4, 22], [-46, 4, 20]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, h, 10), mats.trim);
      mast.position.set(x, h / 2, z);
      mast.userData.world = true;
      scene.add(mast);
    }
  }
  if (kind === "canyon") {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f6254, roughness: 0.96 });
    for (const [x, z, s] of [[-64, 24, 5], [64, -24, 5], [-10, -42, 4], [10, 42, 4], [0, 0, 7]]) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      rock.position.set(x, s * 0.45, z);
      rock.scale.y = 0.85 + Math.random() * 0.4;
      rock.castShadow = true;
      rock.receiveShadow = true;
      rock.userData.world = true;
      scene.add(rock);
    }
    addPlatform(-64, 24, 18, 1.2, 18);
    addPlatform(64, -24, 18, 1.2, 18);
    addPlatform(-10, -42, 16, 1.1, 16);
    addPlatform(10, 42, 16, 1.1, 16);
  }
  if (kind === "reactor") {
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 5, 7, 32),
      new THREE.MeshStandardMaterial({ color: 0xd7ff66, emissive: 0x9abf24, emissiveIntensity: 1.25 })
    );
    core.position.set(0, 4, 0);
    core.userData.world = true;
    scene.add(core);
  }
  if (kind === "village") {
    addVillageHouse(-34, -22, 24, 18, 7);
    addVillageHouse(36, 20, 26, 20, 7.5);
    addVillageHouse(2, 33, 22, 16, 6.5);
    addCropField(-48, 28, 34, 18);
    addCropField(48, -30, 36, 20);
    addCropField(0, -18, 30, 16);
    for (const [x, z, w, d] of [[-15, 5, 24, 2], [17, -6, 24, 2], [-66, -6, 2, 34], [66, 8, 2, 34]]) {
      addWall(x, z, 1.1, w, 2.2, d, "cover");
    }
  }
  if (kind === "city") {
    addCityBuilding(-66, 34, 20, 20, 34, "tower");
    addCityBuilding(66, -34, 22, 22, 32, "tower");
    addCityBuilding(-66, -40, 30, 22, 18, "apartment");
    addCityBuilding(66, 40, 30, 22, 18, "apartment");
    addCityHouse(-18, 42, 22, 16, 8);
    addCityHouse(18, -42, 22, 16, 8);
    addBillboard(-8, -58, 28, "LASER");
    addBillboard(8, 58, 28, "TAG");
    addBillboard(-52, 0, 22, "5 ROUNDS");
    for (const [x, z, w, d] of [[-70, 0, 20, 5], [70, 0, 20, 5], [0, 0, 5, 36], [-18, -18, 18, 4], [18, 18, 18, 4]]) {
      addWall(x, z, 1.2, w, 2.4, d, "cover");
    }
  }
  if (kind === "building") {
    addRaisedFloor(-30, 18, 44, 32, 3.9);
    addRaisedFloor(30, -18, 44, 32, 3.9);
    addRaisedFloor(0, 0, 18, 24, 3.9);
    addSecondFloorWall(-30, 2, 44, 3.2, 2.2);
    addSecondFloorWall(-50, 18, 2.2, 3.2, 32);
    addSecondFloorWall(-10, 18, 2.2, 3.2, 32);
    addSecondFloorWall(-30, 33, 24, 3.2, 2.2);
    addSecondFloorWall(30, -2, 44, 3.2, 2.2);
    addSecondFloorWall(10, -18, 2.2, 3.2, 32);
    addSecondFloorWall(50, -18, 2.2, 3.2, 32);
    addSecondFloorWall(30, -33, 24, 3.2, 2.2);
    addPlatform(-36, 24, 10, 1.1, 10);
    addPlatform(-24, 12, 10, 1.8, 10);
    addPlatform(36, -24, 10, 1.1, 10);
    addPlatform(24, -12, 10, 1.8, 10);
    for (const [x, z] of [[-46, -28], [-18, -34], [46, 28], [18, 34], [0, 18], [0, -18]]) {
      addWall(x, z, 1.2, 6, 2.4, 6, "cover");
    }
  }
  if (kind === "graveyard") {
    addGraveyardFence(bounds);
    addMausoleum(-42, 18, 20, 16, 7);
    addMausoleum(42, -18, 20, 16, 7);
    addChapel(0, -36, 24, 18, 9);
    addGravestones();
    addStoneBench(-22, -12, 12, 4);
    addStoneBench(22, 12, 12, 4);
    addStoneBench(-4, 26, 10, 4);
    addStoneBench(4, -24, 10, 4);
  }
  if (kind === "mansion") {
    addMansionCeiling(bounds);
    addMansionRooms();
  }
  if (kind === "school") {
    addSchoolCeiling(bounds);
    addSchoolRooms();
  }
}

function addSchoolCeiling(bounds) {
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x172126, roughness: 0.82, metalness: 0.04 });
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bounds[0], 0.7, bounds[1]), ceilingMat);
  ceiling.position.set(0, 9.5, 0);
  ceiling.receiveShadow = true;
  ceiling.userData.world = true;
  scene.add(ceiling);
  for (let z = -42; z <= 42; z += 28) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(44, 0.12, 4), mats.trim);
    light.position.set(0, 9.12, z);
    light.userData.world = true;
    scene.add(light);
  }
  for (const x of [-54, 54]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(24, 0.12, 4), mats.trim);
    light.position.set(x, 9.12, 0);
    light.userData.world = true;
    scene.add(light);
  }
}

function addSchoolRooms() {
  const gymMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2d, roughness: 0.78 });
  const tileMat = new THREE.MeshStandardMaterial({ color: 0x53636a, roughness: 0.8 });
  const hallMat = new THREE.MeshStandardMaterial({ color: 0x27343b, roughness: 0.82 });
  addFlatDetail(0, 0, 20, 94, hallMat);
  addFlatDetail(-56, -34, 28, 22, tileMat);
  addFlatDetail(56, 34, 28, 22, tileMat);
  addFlatDetail(-56, 26, 30, 22, gymMat);
  addFlatDetail(56, -26, 30, 22, gymMat);
  addFlatDetail(0, -26, 32, 18, tileMat);
  addFlatDetail(0, 26, 32, 18, tileMat);

  addClassroom(-56, -34);
  addClassroom(56, 34);
  addScienceLab(0, -26);
  addLibraryRoom(0, 26);
  addSchoolBathroom(-58, 2);
  addSchoolBathroom(58, -2);
  addCafeteria(-56, 26);
  addGym(56, -26);
}

function addClassroom(x, z) {
  addWall(x, z - 9, 1.2, 20, 2.4, 4, "wallRed");
  for (const rowZ of [-2, 4, 10]) {
    for (const colX of [-7, 0, 7]) {
      addWall(x + colX, z + rowZ, 0.8, 4.2, 1.6, 3.2, "cover");
    }
  }
  addWall(x + 11, z + 8, 1.4, 4, 2.8, 8, "cover");
  addPlatform(x - 12, z + 10, 10, 1.0, 8);
}

function addScienceLab(x, z) {
  addWall(x, z, 1.15, 22, 2.3, 5, "cover");
  addWall(x - 15, z - 5, 1.4, 4, 2.8, 14, "wallRed");
  addWall(x + 15, z + 5, 1.4, 4, 2.8, 14, "wallRed");
  addPlatform(x, z + 11, 12, 1.1, 9);
}

function addLibraryRoom(x, z) {
  addWall(x - 14, z, 2.3, 3, 4.6, 18, "wall");
  addWall(x + 14, z, 2.3, 3, 4.6, 18, "wall");
  addWall(x, z, 1, 14, 2, 5, "cover");
  addPlatform(x, z - 11, 12, 1.1, 8);
}

function addSchoolBathroom(x, z) {
  addWall(x - 7, z, 1, 8, 2, 4, "wall");
  addWall(x + 4, z - 5, 1.1, 5, 2.2, 4, "cover");
  addWall(x + 4, z + 5, 1.1, 5, 2.2, 4, "cover");
}

function addCafeteria(x, z) {
  for (const dz of [-7, 0, 7]) {
    addWall(x, z + dz, 0.9, 22, 1.8, 3.2, "cover");
  }
  addWall(x - 15, z + 12, 1.2, 6, 2.4, 8, "wallRed");
  addPlatform(x + 13, z - 12, 12, 1.0, 8);
}

function addGym(x, z) {
  addWall(x, z, 0.25, 20, 0.5, 12, "cover");
  addPlatform(x - 16, z - 8, 12, 1.0, 8);
  addPlatform(x - 8, z - 8, 12, 1.8, 8);
  addPlatform(x + 10, z + 8, 12, 1.0, 8);
  addPlatform(x + 18, z + 8, 12, 1.8, 8);
}

function addMansionCeiling(bounds) {
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x1b2428, roughness: 0.78, metalness: 0.05 });
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(bounds[0], 0.7, bounds[1]), ceilingMat);
  ceiling.position.set(0, 9.7, 0);
  ceiling.receiveShadow = true;
  ceiling.userData.world = true;
  scene.add(ceiling);
  for (const [x, z, w, d] of [[0, 0, 38, 12], [0, -38, 34, 10], [0, 38, 34, 10], [-54, 0, 10, 44], [54, 0, 10, 44]]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mats.trim);
    light.position.set(x, 9.28, z);
    light.userData.world = true;
    scene.add(light);
  }
}

function addMansionRooms() {
  const rugMat = new THREE.MeshStandardMaterial({ color: 0x6c3048, roughness: 0.88 });
  const tileMat = new THREE.MeshStandardMaterial({ color: 0x596468, roughness: 0.8 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5b3b28, roughness: 0.82 });
  addFlatDetail(0, 0, 44, 24, rugMat);
  addFlatDetail(-58, -34, 24, 18, rugMat);
  addFlatDetail(58, 34, 24, 18, rugMat);
  addFlatDetail(-58, 36, 26, 18, tileMat);
  addFlatDetail(58, -36, 26, 18, tileMat);
  addFlatDetail(0, -42, 28, 16, woodMat);
  addFlatDetail(0, 42, 28, 16, woodMat);

  addMansionBed(-62, -38, 16, 10);
  addMansionBed(62, 38, 16, 10);
  addMansionBathroom(-58, 36);
  addMansionBathroom(58, -36);
  addMansionKitchen(-4, -42);
  addMansionDiningRoom(0, 42);
  addMansionLivingRoom(0, 0);
  addMansionLibrary(-60, 4);
  addMansionStudy(60, -4);
}

function addMansionBed(x, z, w, d) {
  addWall(x, z, 0.75, w, 1.5, d, "cover");
  addWall(x, z - d / 2 - 1.2, 1.8, w, 3.6, 1.4, "wallRed");
  addWall(x - w / 2 - 2, z + 2, 1.1, 3.2, 2.2, 4.2, "cover");
  addWall(x + w / 2 + 2, z + 2, 1.1, 3.2, 2.2, 4.2, "cover");
  addPlatform(x, z + d / 2 + 4, 11, 1.0, 8);
}

function addMansionBathroom(x, z) {
  addWall(x - 5, z, 1, 9, 2, 5, "wall");
  addWall(x + 6, z - 3, 0.9, 6, 1.8, 3.2, "cover");
  addWall(x + 6, z + 4, 1.2, 4.5, 2.4, 4.5, "cover");
  addWall(x - 10, z + 4, 1.1, 5, 2.2, 4, "cover");
}

function addMansionKitchen(x, z) {
  addWall(x, z, 1.25, 24, 2.5, 5, "cover");
  addWall(x - 17, z, 1.4, 5, 2.8, 18, "wallRed");
  addWall(x + 17, z, 1.4, 5, 2.8, 18, "wallRed");
  addWall(x, z + 10, 1.1, 18, 2.2, 4, "cover");
  addPlatform(x + 10, z - 11, 12, 1.1, 9);
}

function addMansionDiningRoom(x, z) {
  addWall(x, z, 1.15, 26, 2.3, 8, "cover");
  for (const chairX of [-18, -10, 10, 18]) {
    addWall(x + chairX, z - 7, 0.8, 3.5, 1.6, 3.5, "cover");
    addWall(x + chairX, z + 7, 0.8, 3.5, 1.6, 3.5, "cover");
  }
}

function addMansionLivingRoom(x, z) {
  addWall(x - 19, z - 7, 1.1, 16, 2.2, 5, "cover");
  addWall(x + 19, z + 7, 1.1, 16, 2.2, 5, "cover");
  addWall(x, z, 0.8, 12, 1.6, 12, "wallRed");
  addPlatform(x - 24, z + 7, 12, 1.0, 8);
  addPlatform(x + 24, z - 7, 12, 1.0, 8);
}

function addMansionLibrary(x, z) {
  addWall(x - 8, z, 2.4, 3, 4.8, 28, "wall");
  addWall(x + 8, z, 2.4, 3, 4.8, 28, "wall");
  addWall(x, z + 12, 1, 14, 2, 4, "cover");
  addPlatform(x, z - 12, 12, 1.1, 8);
}

function addMansionStudy(x, z) {
  addWall(x, z, 1, 14, 2, 9, "cover");
  addWall(x - 13, z + 8, 2.2, 4, 4.4, 14, "wallRed");
  addWall(x + 13, z - 8, 2.2, 4, 4.4, 14, "wallRed");
  addPlatform(x, z - 14, 12, 1.0, 8);
}

function addSecondFloorWall(x, z, w, h, d) {
  addWall(x, z, 3.9 + h / 2, w, h, d, "wall");
}

function addGraveyardFence(bounds) {
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x1c2522, roughness: 0.62, metalness: 0.28 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x46534c, roughness: 0.58, metalness: 0.22 });
  const halfW = bounds[0] / 2 - 4;
  const halfD = bounds[1] / 2 - 4;
  for (let x = -halfW; x <= halfW; x += 5) {
    addFencePost(x, -halfD, fenceMat);
    addFencePost(x, halfD, fenceMat);
  }
  for (let z = -halfD; z <= halfD; z += 5) {
    addFencePost(-halfW, z, fenceMat);
    addFencePost(halfW, z, fenceMat);
  }
  addFenceRail(0, -halfD, bounds[0] - 8, 0.35, railMat);
  addFenceRail(0, halfD, bounds[0] - 8, 0.35, railMat);
  addFenceRail(-halfW, 0, 0.35, bounds[1] - 8, railMat);
  addFenceRail(halfW, 0, 0.35, bounds[1] - 8, railMat);
}

function addFencePost(x, z, material) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.4, 8), material);
  post.position.set(x, 1.7, z);
  post.castShadow = true;
  post.userData.world = true;
  scene.add(post);
}

function addFenceRail(x, z, w, d, material) {
  const lower = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), material);
  const upper = lower.clone();
  lower.position.set(x, 1.25, z);
  upper.position.set(x, 2.45, z);
  lower.castShadow = upper.castShadow = true;
  lower.userData.world = upper.userData.world = true;
  scene.add(lower, upper);
}

function addMausoleum(x, z, w, d, h) {
  const wallT = 2;
  const doorGap = 6;
  addWall(x - w / 2 + wallT / 2, z, h / 2, wallT, h, d, "wall");
  addWall(x + w / 2 - wallT / 2, z, h / 2, wallT, h, d, "wall");
  addWall(x, z - d / 2 + wallT / 2, h / 2, w, h, wallT, "wall");
  addWall(x - (w + doorGap) / 4, z + d / 2 - wallT / 2, h / 2, (w - doorGap) / 2, h, wallT, "wallRed");
  addWall(x + (w + doorGap) / 4, z + d / 2 - wallT / 2, h / 2, (w - doorGap) / 2, h, wallT, "wallRed");
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.6, d + 1.4), mats.cover);
  cap.position.set(x, h + 0.35, z);
  cap.castShadow = true;
  cap.userData.world = true;
  scene.add(cap);
  addPlatform(x, z + d / 2 + 5, 12, 1.1, 9);
}

function addChapel(x, z, w, d, h) {
  addVillageHouse(x, z, w, d, h);
  const steeple = new THREE.Mesh(new THREE.ConeGeometry(3.5, 9, 4), mats.wallRed);
  steeple.position.set(x, h + 7, z - d * 0.18);
  steeple.rotation.y = Math.PI / 4;
  steeple.castShadow = true;
  steeple.userData.world = true;
  scene.add(steeple);
}

function addGravestones() {
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xaab2aa, roughness: 0.94, metalness: 0.02 });
  const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x747d76, roughness: 0.96 });
  const rows = [-34, -24, -14, 14, 24, 34];
  for (const z of rows) {
    for (let x = -58; x <= 58; x += 11) {
      if (Math.abs(x) < 11 || (Math.abs(x) > 36 && Math.abs(z) < 20)) continue;
      const mat = (x + z) % 3 === 0 ? darkStoneMat : stoneMat;
      const stone = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.8 + Math.random() * 0.8, 0.55), mat);
      stone.position.set(x + THREE.MathUtils.randFloat(-1.2, 1.2), stone.geometry.parameters.height / 2, z + THREE.MathUtils.randFloat(-0.8, 0.8));
      stone.rotation.y = THREE.MathUtils.randFloat(-0.12, 0.12);
      stone.castShadow = true;
      stone.receiveShadow = true;
      stone.userData.world = true;
      scene.add(stone);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.58, 12, 1, false, 0, Math.PI), mat);
      cap.rotation.z = Math.PI / 2;
      cap.rotation.y = stone.rotation.y;
      cap.position.set(stone.position.x, stone.position.y + stone.geometry.parameters.height / 2, stone.position.z);
      cap.castShadow = true;
      cap.userData.world = true;
      scene.add(cap);
    }
  }
}

function addStoneBench(x, z, w, d) {
  addWall(x, z, 0.55, w, 1.1, d, "cover");
  addWall(x - w / 2 + 1.4, z, 1.7, 1.2, 2.3, d * 0.8, "wall");
  addWall(x + w / 2 - 1.4, z, 1.7, 1.2, 2.3, d * 0.8, "wall");
}

function addVillageHouse(x, z, w, d, h) {
  const wallT = 2.2;
  const doorGap = 7;
  addWall(x - w / 2 + wallT / 2, z, h / 2, wallT, h, d, "wall");
  addWall(x + w / 2 - wallT / 2, z, h / 2, wallT, h, d, "wall");
  addWall(x, z - d / 2 + wallT / 2, h / 2, w, h, wallT, "wall");
  addWall(x - (w + doorGap) / 4, z + d / 2 - wallT / 2, h / 2, (w - doorGap) / 2, h, wallT, "wallRed");
  addWall(x + (w + doorGap) / 4, z + d / 2 - wallT / 2, h / 2, (w - doorGap) / 2, h, wallT, "wallRed");

  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 5, 4), mats.wallRed);
  roof.position.set(x, h + 2.2, z);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = d / w;
  roof.castShadow = true;
  roof.userData.world = true;
  scene.add(roof);

  const windowMat = new THREE.MeshBasicMaterial({ color: 0x8dffd4 });
  for (const side of [-1, 1]) {
    const windowPane = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 0.12), windowMat);
    windowPane.position.set(x + side * (w * 0.24), h * 0.55, z + d / 2 + 0.08);
    windowPane.userData.world = true;
    scene.add(windowPane);
  }

  addPlatform(x - w / 2 - 3, z + d / 2 - 1, 8, 1.1, 8);
  addPlatform(x + w / 2 + 3, z - d / 2 + 2, 8, 1.1, 8);
}

function addCropField(x, z, w, d) {
  const cropMat = new THREE.MeshStandardMaterial({ color: 0xd7ff66, roughness: 0.82 });
  for (let row = -d / 2 + 2; row <= d / 2 - 2; row += 4) {
    const crop = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 0.8), cropMat);
    crop.position.set(x, 0.6, z + row);
    crop.castShadow = true;
    crop.userData.world = true;
    scene.add(crop);
  }
}

function addCityBuilding(x, z, w, d, h, type) {
  const matKey = type === "tower" ? "wall" : "wallRed";
  addWall(x, z, h / 2, w, h, d, matKey);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x151b20, roughness: 0.64, metalness: 0.18 });
  const roofCap = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.55, d + 1.2), roofMat);
  roofCap.position.set(x, h + 0.32, z);
  roofCap.castShadow = true;
  roofCap.userData.world = true;
  scene.add(roofCap);
  const windowMat = new THREE.MeshBasicMaterial({ color: 0x8dffd4 });
  for (let row = 4; row < h - 3; row += 5) {
    for (let col = -w / 2 + 4; col < w / 2 - 3; col += 6) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 0.12), windowMat);
      pane.position.set(x + col, row, z + d / 2 + 0.08);
      pane.userData.world = true;
      scene.add(pane);
    }
  }
  for (let row = 4; row < h - 3; row += 5) {
    for (let col = -d / 2 + 4; col < d / 2 - 3; col += 6) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 2.6), windowMat);
      pane.position.set(x + w / 2 + 0.08, row, z + col);
      pane.userData.world = true;
      scene.add(pane);
    }
  }
  addPlatform(x, z + d / 2 + 5, Math.min(w, 16), 1.2, 10);
}

function addCityHouse(x, z, w, d, h) {
  addVillageHouse(x, z, w, d, h);
}

function addBillboard(x, z, w, label) {
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, 8, 0.6), mats.wallRed);
  board.position.set(x, 11, z);
  board.castShadow = true;
  board.userData.world = true;
  scene.add(board);
  const signTexture = createBillboardTexture("Laser Strike");
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.82, 5.2),
    new THREE.MeshBasicMaterial({ map: signTexture, transparent: true })
  );
  sign.position.set(x, 11.2, z + 0.34);
  sign.userData.world = true;
  scene.add(sign);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 5.7, 0.18), mats.trim);
  glow.position.set(x, 11.2, z + 0.02);
  glow.userData.world = true;
  scene.add(glow);
  addWall(x - w * 0.32, z, 4, 1.2, 8, 1.2, "cover");
  addWall(x + w * 0.32, z, 4, 1.2, 8, 1.2, "cover");
}

function createBillboardTexture(text) {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 512;
  canvasEl.height = 160;
  const ctx = canvasEl.getContext("2d");
  ctx.fillStyle = "#091514";
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.strokeStyle = "#8dffd4";
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, canvasEl.width - 24, canvasEl.height - 24);
  ctx.fillStyle = "#8dffd4";
  ctx.font = "900 54px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#8dffd4";
  ctx.shadowBlur = 18;
  ctx.fillText(text, canvasEl.width / 2, canvasEl.height / 2);
  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.playing && !state.paused) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.blindTimer = Math.max(0, state.blindTimer - dt);
    ai.blindTimer = Math.max(0, ai.blindTimer - dt);
    blindFlash.classList.toggle("show", state.blindTimer > 0);
    if (state.fireHeld && state.weapon === "rifle" && !state.roundEnding) useWeapon();
    updatePlayer(dt);
    updateAi(dt);
    updateExtraAis(dt);
    updateGrenades(dt);
    updateBeams(dt);
    updateCamera();
    refreshHud();
  }
  renderer.render(scene, camera);
}

function updatePlayer(dt) {
  player.previousPosition.copy(player.position);
  const wasGrounded = player.grounded;
  const input = new THREE.Vector3();
  if (keys.has("KeyW")) input.z += 1;
  if (keys.has("KeyS")) input.z -= 1;
  if (keys.has("KeyA")) input.x += 1;
  if (keys.has("KeyD")) input.x -= 1;
  if (input.lengthSq() > 0) input.normalize();
  const forward = new THREE.Vector3(-Math.sin(mouse.yaw), 0, -Math.cos(mouse.yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const move = right.multiplyScalar(input.x).add(forward.multiplyScalar(input.z)).multiplyScalar(player.speed * dt);
  const moved = moveEntity(player.position, player.radius, move);
  updatePlayerStuckState(dt, input.lengthSq() > 0, moved);
  const maxJumps = state.weapon === "fists" ? 2 : 1;
  if (state.jumpQueued && (player.grounded || player.jumpsUsed < maxJumps)) {
    player.verticalVelocity = 10;
    player.grounded = false;
    player.jumpsUsed += 1;
    playSound("jump");
  }
  state.jumpQueued = false;
  player.verticalVelocity -= 24 * dt;
  player.position.y += player.verticalVelocity * dt;
  const groundHeight = getGroundHeight(player.position, player.radius);
  if (player.position.y <= groundHeight) {
    player.position.y = groundHeight;
    player.verticalVelocity = 0;
    player.grounded = true;
    player.jumpsUsed = 0;
    if (!wasGrounded) playSound("land");
  }
  const horizontalMove = new THREE.Vector2(
    player.position.x - player.previousPosition.x,
    player.position.z - player.previousPosition.z
  );
  player.movementSpeed = horizontalMove.length() / Math.max(dt, 0.001);
  updateRouteMemory(dt);
}

function updateRouteMemory(dt) {
  world.routeSampleTimer -= dt;
  if (world.routeSampleTimer > 0 || player.movementSpeed < 2.5) return;
  world.routeSampleTimer = 0.55;
  const point = player.position.clone();
  point.y = 0;
  const recent = world.routeMemory[world.routeMemory.length - 1];
  if (recent && recent.distanceTo(point) < 8) return;
  world.routeMemory.push(point);
  if (world.routeMemory.length > 28) world.routeMemory.shift();
}

function updatePlayerStuckState(dt, tryingToMove, moved) {
  const embedded = collides(player.position, player.radius + 0.12);
  const blocked = tryingToMove && moved < player.speed * dt * 0.08;
  player.stuckTimer = embedded || blocked ? player.stuckTimer + dt : Math.max(0, player.stuckTimer - dt * 2);
  if (player.stuckTimer < 0.75) return;
  player.stuckTimer = 0;
  const rescuePoint = nearestOpenPlayerPoint(player.position);
  player.position.copy(rescuePoint);
  player.verticalVelocity = 0;
  player.grounded = true;
  setMessage("Unstuck: moved to nearby open ground.");
}

function nearestOpenPlayerPoint(origin) {
  const candidates = [origin.clone()];
  for (const distance of [3, 5, 8, 12, 18]) {
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16;
      candidates.push(origin.clone().add(new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)));
    }
  }
  for (const candidate of candidates) {
    candidate.y = getGroundHeight(candidate, player.radius);
    clampToMap(candidate, player.radius);
    if (!collides(candidate, player.radius + 0.18)) return candidate;
  }
  const fallback = world.playerSpawn.clone();
  fallback.y = 0;
  return fallback;
}

function updateAi(dt) {
  if (ai.health <= 0 || state.roundEnding) return;
  if (state.gameMode === "zombie") {
    updateZombieUnit(ai, dt);
    return;
  }
  ai.previousPosition.copy(ai.position);
  const toPlayer = player.position.clone().sub(ai.position);
  const dist = toPlayer.length();
  const seesPlayer = canAiSeePlayer(dist);
  if (seesPlayer) {
    const exposedBoost = player.movementSpeed < 1.2 || state.scoped ? 0.16 : 0;
    const movementBoost = player.movementSpeed > 2 ? 0.66 : exposedBoost;
    const tacticBoost = ai.tactic === "camper" ? 0.18 : ai.tactic === "rush" ? 0.13 : 0.16;
    ai.awareness = Math.min(1, ai.awareness + dt * ((dist < 26 ? 1.24 : 0.84) + movementBoost + tacticBoost));
    ai.lastSeenPlayer.copy(player.position);
    ai.memoryTimer = 7 + Math.random() * 2;
  } else if (canInferStillPlayer(dist)) {
    const inferred = inferredPlayerPosition(dist);
    ai.awareness = Math.min(0.9, ai.awareness + dt * (dist < 24 ? 0.9 : 0.54));
    ai.lastSeenPlayer.lerp(inferred, 0.62);
    ai.memoryTimer = Math.max(ai.memoryTimer, 4.8 + Math.random() * 1.8);
  } else if (canHearPlayer(dist)) {
    const heard = inferredPlayerPosition(dist);
    ai.awareness = Math.min(0.82, ai.awareness + dt * (dist < 30 ? 0.62 : 0.36));
    ai.lastSeenPlayer.lerp(heard, 0.42);
    ai.memoryTimer = Math.max(ai.memoryTimer, 3.8 + Math.random() * 1.5);
  } else {
    ai.memoryTimer = Math.max(0, ai.memoryTimer - dt);
    ai.awareness = Math.max(0, ai.awareness - dt * (ai.memoryTimer > 0 ? 0.12 : 0.34));
  }

  if (state.gameMode === "standard") {
    updateCampingAi(dist, seesPlayer, dt);
    return;
  }

  ai.decisionTimer -= dt;
  ai.objectiveTimer -= dt;
  if (ai.objectiveTimer <= 0 && ai.awareness < 0.72) {
    if (ai.position.distanceTo(ai.roundTarget) > 5.5) {
      ai.objective.copy(ai.roundTarget);
    } else {
      ai.objective.copy(
        Math.random() < 0.5
          ? randomGroundTargetPoint()
          : backtrackObjectivePoint()
      );
    }
    ai.objectiveTimer = 2.5 + Math.random() * 2.5;
  }
  ai.pauseTimer = Math.max(0, ai.pauseTimer - dt);
  if (ai.decisionTimer <= 0 || ai.position.distanceTo(ai.goal) < 4.5) chooseAiGoal(dist, seesPlayer);

  const toGoal = ai.goal.clone().sub(ai.position);
  toGoal.y = 0;
  if (toGoal.lengthSq() > 0.1 && ai.pauseTimer <= 0) {
    if (routeBlockedByElevation(ai.position, ai.goal)) {
      ai.goal.copy(detourAroundBlock(ai.goal));
      toGoal.copy(ai.goal).sub(ai.position);
      toGoal.y = 0;
    }
    const speedMod =
      ai.mode === "rush" ? 1.24 :
      ai.mode === "hold" ? 0.42 :
      ai.mode === "sneak" ? 0.78 :
      ai.mode === "heal" ? 1.18 :
      ai.mode === "attack" ? 1.08 :
      0.98;
    let desired = toGoal.normalize();
    desired = avoidElevatedRoadblocks(desired);
    ai.facing.lerp(desired, 0.06).normalize();
    const moved = moveEntity(ai.position, ai.radius, desired.multiplyScalar(ai.speed * speedMod * dt));
    ai.stuckTimer = moved < ai.speed * speedMod * dt * 0.28 ? ai.stuckTimer + dt : Math.max(0, ai.stuckTimer - dt * 2);
    if (ai.stuckTimer > 0.35) {
      ai.stuckTimer = 0;
      ai.decisionTimer = 0;
      ai.goal.copy(detourAroundBlock(ai.goal));
    }
  }
  updateAiMesh();
  const seekingHeal = handleAiLowHealth(dist, seesPlayer);
  ai.shootTimer -= dt;
  if (!seekingHeal && ai.shootTimer <= 0 && ai.awareness > 0.52 && dist < 66 && seesPlayer) {
    aiUseWeapon(dist);
  }
}

function updateCampingAi(dist, seesPlayer, dt) {
  ai.mode = "hold";
  ai.goal.copy(world.aiSpawn);
  ai.objective.copy(world.aiSpawn);
  ai.roundTarget.copy(world.aiSpawn);
  if (seesPlayer) {
    const lookDir = player.position.clone().sub(ai.position);
    lookDir.y = 0;
    if (lookDir.lengthSq() > 0.01) ai.facing.lerp(lookDir.normalize(), 0.08).normalize();
  }
  updateAiMesh();
  ai.shootTimer -= dt;
  if (ai.shootTimer <= 0 && ai.awareness > 0.52 && dist < 66 && seesPlayer) {
    aiUseWeapon(dist);
  }
}

function updateExtraAis(dt) {
  if (!["titan", "zombie"].includes(state.gameMode)) return;
  for (const unit of extraAis) {
    if (unit.health <= 0) continue;
    if (state.gameMode === "zombie") {
      updateZombieUnit(unit, dt);
      continue;
    }
    unit.previousPosition.copy(unit.position);
    unit.blindTimer = Math.max(0, unit.blindTimer - dt);
    const toPlayer = player.position.clone().sub(unit.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const sees = unit.blindTimer <= 0 && dist < 95 && hasLineOfSight(unit.position, player.position);
    const desired = dist > 7 ? toPlayer.normalize() : unit.facing.clone().multiplyScalar(-1);
    unit.facing.lerp(desired, 0.08).normalize();
    moveEntity(unit.position, unit.radius, desired.multiplyScalar(unit.speed * dt));
    unit.group.position.copy(unit.position);
    unit.group.lookAt(player.position.x, 1.4, player.position.z);
    unit.shootTimer -= dt;
    if (sees && unit.shootTimer <= 0) extraAiAttack(unit, dist);
  }
}

function updateZombieUnit(unit, dt) {
  unit.previousPosition.copy(unit.position);
  const toPlayer = player.position.clone().sub(unit.position);
  toPlayer.y = 0;
  const dist = toPlayer.length();
  const desired = dist > 4.8 ? toPlayer.normalize() : unit.facing.clone().multiplyScalar(-1);
  unit.facing.lerp(desired, 0.12).normalize();
  moveEntity(unit.position, unit.radius, desired.multiplyScalar(unit.speed * dt));
  unit.group.position.copy(unit.position);
  unit.group.lookAt(player.position.x, 1.4, player.position.z);
  unit.shootTimer -= dt;
  if (dist < 4.8 && unit.shootTimer <= 0) {
    unit.shootTimer = 0.75 + Math.random() * 0.25;
    playSound("knife");
    damagePlayer(50);
    setMessage("Zombie knife hit: 50 damage.");
  }
}

function extraAiAttack(unit, dist) {
  if (dist < 4.2) {
    const melee = unit.loadout.melee;
    unit.shootTimer = 0.65;
    damagePlayer(melee === "fists" ? 25 : 50);
    setMessage(melee === "fists" ? "Titan AI fists hit: 25 damage." : "Titan AI knife hit: 50 damage.");
    return;
  }
  if (!unit.grenadeUsed && dist < 38 && Math.random() < 0.18) {
    unit.grenadeUsed = true;
    unit.shootTimer = 1.5;
    unit.loadout.utility === "flashbang" ? throwUnitFlashbang(unit) : throwUnitGrenade(unit);
    return;
  }
  if (unit.loadout.gun === "rifle") {
    unit.shootTimer = 0.55 + Math.random() * 0.25;
    aiUnitRifleShot(unit, dist);
  } else {
    unit.shootTimer = 1.0 + Math.random() * 0.6;
    aiUnitSniperShot(unit, dist);
  }
}

function chooseAiGoal(dist, seesPlayer) {
  ai.decisionTimer = 0.25 + Math.random() * 0.55;
  if (ai.health <= 50 && !ai.medkitUsed && !aiShouldKeepFighting(dist, seesPlayer)) {
    ai.mode = "heal";
    ai.decisionTimer = 0.18 + Math.random() * 0.18;
    ai.goal.copy(findHealingCoverPoint());
    ai.pauseTimer = 0;
    clampToMap(ai.goal, ai.radius);
    return;
  }
  if (!seesPlayer && ai.memoryTimer > 0 && ai.awareness > 0.16) {
    ai.mode = ai.awareness > 0.55 ? "investigate" : "hunt";
    ai.decisionTimer = 0.18 + Math.random() * 0.24;
    const prediction = predictedLastKnownPlayerPoint();
    ai.goal.copy(routeBlockedByElevation(ai.position, prediction) ? detourAroundBlock(prediction) : bestOpenPoint([prediction, ai.lastSeenPlayer], prediction));
    ai.pauseTimer = 0;
    clampToMap(ai.goal, ai.radius);
    return;
  }
  if (!seesPlayer && ai.awareness < 0.28 && ai.position.distanceTo(ai.roundTarget) > 5.5) {
    ai.mode = "hunt";
    ai.goal.copy(routeBlockedByElevation(ai.position, ai.roundTarget) ? detourAroundBlock(ai.roundTarget) : ai.roundTarget);
    ai.pauseTimer = 0;
    clampToMap(ai.goal, ai.radius);
    return;
  }
  if (seesPlayer && ai.awareness > 0.7) {
    ai.mode = "attack";
    ai.strafe = Math.random() > 0.5 ? 1 : -1;
    const fromPlayer = ai.position.clone().sub(player.position).normalize();
    const sideDir = new THREE.Vector3(fromPlayer.z, 0, -fromPlayer.x);
    const range = dist < 13 ? 16 : 7;
    const candidates = [];
    for (const sideAmount of [-16, -8, 8, 16]) {
      const point = player.position.clone()
        .add(fromPlayer.clone().multiplyScalar(range + Math.random() * 8))
        .add(sideDir.clone().multiplyScalar(sideAmount));
      point.y = 0;
      clampToMap(point, ai.radius);
      candidates.push(point);
    }
    ai.goal.copy(bestOpenPoint(candidates, huntSweepPoint(0.62)));
  } else if (ai.tactic === "camper" && ai.awareness < 0.42) {
    ai.mode = "hunt";
    ai.decisionTimer = 0.2 + Math.random() * 0.35;
    ai.goal.copy(bestOpenPoint([ai.roundTarget, ai.objective, predictedRoutePoint(), huntSweepPoint(0.42), randomArenaPoint()], huntSweepPoint(0.42)));
    ai.pauseTimer = 0;
  } else if (ai.tactic === "rush" && ai.awareness < 0.5) {
    ai.mode = "rush";
    ai.decisionTimer = 0.22 + Math.random() * 0.38;
    ai.goal.copy(bestOpenPoint([ai.roundTarget, ai.objective, predictedRoutePoint(), rushPointNearPlayerSide()], rushPointNearPlayerSide()));
  } else if (ai.awareness > 0.28 && ai.memoryTimer > 0) {
    ai.mode = Math.random() > 0.45 ? "sneak" : "investigate";
    const candidates = [];
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 8 + Math.random() * 20;
      const point = new THREE.Vector3(
        ai.lastSeenPlayer.x + Math.cos(angle) * radius,
        0,
        ai.lastSeenPlayer.z + Math.sin(angle) * radius
      );
      clampToMap(point, ai.radius);
      candidates.push(point);
    }
    candidates.push(predictedRoutePoint());
    ai.goal.copy(bestOpenPoint(candidates, huntSweepPoint(0.56)));
  } else {
    ai.mode = ai.tactic === "stalker" ? "hunt" : "hunt";
    ai.goal.copy(bestOpenPoint([ai.roundTarget, ai.objective, predictedRoutePoint(), huntSweepPoint(ai.tactic === "stalker" ? 0.58 : 0.46)], huntSweepPoint(0.52)));
    ai.pauseTimer = 0;
  }
  clampToMap(ai.goal, ai.radius);
}

function handleAiLowHealth(dist, seesPlayer) {
  if (ai.health > 50 || ai.medkitUsed) return false;
  if (aiShouldKeepFighting(dist, seesPlayer)) return false;

  ai.mode = "heal";
  ai.pauseTimer = 0;
  if (ai.decisionTimer <= 0 || ai.position.distanceTo(ai.goal) < 4) {
    ai.goal.copy(findHealingCoverPoint());
    ai.decisionTimer = 0.16 + Math.random() * 0.22;
  }

  const hiddenFromPlayer = !hasLineOfSight(player.position, ai.position) || ai.position.distanceTo(player.position) > 44;
  if (hiddenFromPlayer || ai.position.distanceTo(ai.goal) < 5.2) {
    ai.medkitUsed = true;
    ai.health = 100;
    ai.weapon = "medkit";
    ai.awareness = Math.max(ai.awareness, 0.58);
    ai.memoryTimer = Math.max(ai.memoryTimer, 4.5);
    playSound("medkit");
    setMessage("AI hid and used medkit. AI health restored to 100.");
    return false;
  }

  return true;
}

function aiShouldKeepFighting(dist, seesPlayer) {
  if (!seesPlayer) return false;
  const playerWeak = player.health <= 50;
  const finishingShotReady = ai.shootTimer <= 0.25 && dist < 56;
  const closeKnifeChance = dist < 4.8 && player.health <= 50;
  const strongRead = ai.awareness > 0.82 && player.health <= 75 && dist < 30;
  return playerWeak || closeKnifeChance || (finishingShotReady && strongRead);
}

function findHealingCoverPoint() {
  const candidates = [];
  const awayFromPlayer = ai.position.clone().sub(player.position);
  awayFromPlayer.y = 0;
  const retreatDir = awayFromPlayer.lengthSq() > 0.1 ? awayFromPlayer.normalize() : ai.facing.clone().multiplyScalar(-1);
  const side = new THREE.Vector3(retreatDir.z, 0, -retreatDir.x);

  for (const solid of world.solids) {
    if (solid.userData.platform) continue;
    const box = solid.userData.box;
    const size = Math.max(box.w, box.d);
    if (size < 5) continue;
    const base = new THREE.Vector3(box.x, 0, box.z);
    for (const sideSign of [-1, 1]) {
      const offset = retreatDir.clone().multiplyScalar(size * 0.5 + 7).add(side.clone().multiplyScalar(sideSign * (size * 0.35 + 4)));
      const point = base.clone().add(offset);
      clampToMap(point, ai.radius);
      candidates.push(point);
    }
  }

  for (const distance of [12, 20, 30]) {
    candidates.push(ai.position.clone().add(retreatDir.clone().multiplyScalar(distance)));
    candidates.push(ai.position.clone().add(retreatDir.clone().multiplyScalar(distance)).add(side.clone().multiplyScalar(10)));
    candidates.push(ai.position.clone().add(retreatDir.clone().multiplyScalar(distance)).add(side.clone().multiplyScalar(-10)));
  }

  let best = null;
  let bestScore = -Infinity;
  for (const point of candidates) {
    point.y = 0;
    clampToMap(point, ai.radius);
    if (!isSafeGroundPoint(point, ai.radius + 0.5)) continue;
    const hiddenScore = hasLineOfSight(player.position, point) ? -22 : 22;
    const distanceScore = Math.min(point.distanceTo(player.position), 60) * 0.25;
    const routeScore = routeClearScore(ai.position, point);
    const score = hiddenScore + distanceScore + routeScore + openSpaceScore(point) * 0.35;
    if (score > bestScore) {
      best = point.clone();
      bestScore = score;
    }
  }

  return best || detourAroundBlock(ai.position.clone().add(retreatDir.multiplyScalar(22)));
}

function rollAiTactic() {
  const roll = Math.random();
  if (roll < 0.2) return "camper";
  if (roll < 0.62) return "rush";
  return "stalker";
}

function roundObjectivePoint(roundNumber = null) {
  const lane = world.playerSpawn.clone().sub(world.aiSpawn);
  lane.y = 0;
  const forward = lane.lengthSq() > 0 ? lane.normalize() : new THREE.Vector3(-1, 0, 0);
  const side = new THREE.Vector3(forward.z, 0, -forward.x);
  const sideMax = Math.min(world.bounds.depth, world.bounds.width) * 0.36;
  const roundZones = [
    { forwardBias: 0.24, sideOffset: -sideMax, sideSpread: 9 },
    { forwardBias: 0.36, sideOffset: sideMax * 0.82, sideSpread: 12 },
    { forwardBias: 0.62, sideOffset: -sideMax * 0.58, sideSpread: 18 },
    { forwardBias: 0.78, sideOffset: sideMax * 0.7, sideSpread: 14 },
    { forwardBias: 0.9, sideOffset: THREE.MathUtils.randFloat(-sideMax, sideMax), sideSpread: 20 },
  ];
  const randomZones = [
    { forwardBias: THREE.MathUtils.randFloat(0.18, 0.36), sideOffset: THREE.MathUtils.randFloat(-sideMax, sideMax), sideSpread: 12 },
    { forwardBias: THREE.MathUtils.randFloat(0.42, 0.68), sideOffset: THREE.MathUtils.randFloat(-sideMax, sideMax), sideSpread: 18 },
    { forwardBias: THREE.MathUtils.randFloat(0.72, 0.92), sideOffset: THREE.MathUtils.randFloat(-sideMax, sideMax), sideSpread: 16 },
    { forwardBias: THREE.MathUtils.randFloat(0.16, 0.88), sideOffset: Math.random() > 0.5 ? sideMax : -sideMax, sideSpread: 8 },
  ];
  const zone = roundNumber && Math.random() > 0.25
    ? roundZones[(roundNumber - 1) % roundZones.length]
    : randomZones[Math.floor(Math.random() * randomZones.length)];
  const candidates = [];
  for (let i = 0; i < 14; i++) {
    const point = world.aiSpawn.clone()
      .add(forward.clone().multiplyScalar(world.aiSpawn.distanceTo(world.playerSpawn) * (zone.forwardBias + THREE.MathUtils.randFloat(-0.04, 0.04))))
      .add(side.clone().multiplyScalar(zone.sideOffset + THREE.MathUtils.randFloat(-zone.sideSpread, zone.sideSpread)));
    point.x += THREE.MathUtils.randFloat(-8, 8);
    point.z += THREE.MathUtils.randFloat(-8, 8);
    clampToMap(point, ai.radius);
    candidates.push(point);
  }
  return bestOpenPoint(candidates, huntSweepPoint(0.52));
}

function randomGroundTargetPoint() {
  const candidates = [];
  const margin = 8;
  for (let i = 0; i < 36; i++) {
    const point = new THREE.Vector3(
      THREE.MathUtils.randFloat(-world.bounds.width / 2 + margin, world.bounds.width / 2 - margin),
      0,
      THREE.MathUtils.randFloat(-world.bounds.depth / 2 + margin, world.bounds.depth / 2 - margin)
    );
    if (point.distanceTo(world.aiSpawn) < 16) continue;
    candidates.push(point);
  }
  return bestOpenPoint(candidates, roundObjectivePoint());
}

function backtrackObjectivePoint() {
  const lane = world.playerSpawn.clone().sub(world.aiSpawn);
  lane.y = 0;
  const forward = lane.lengthSq() > 0 ? lane.normalize() : new THREE.Vector3(-1, 0, 0);
  const side = new THREE.Vector3(forward.z, 0, -forward.x);
  const sideMax = Math.min(world.bounds.depth, world.bounds.width) * 0.38;
  const candidates = [];
  for (let i = 0; i < 10; i++) {
    const point = ai.position.clone()
      .add(forward.clone().multiplyScalar(THREE.MathUtils.randFloat(-12, 20)))
      .add(side.clone().multiplyScalar((Math.random() > 0.5 ? 1 : -1) * THREE.MathUtils.randFloat(sideMax * 0.45, sideMax)));
    clampToMap(point, ai.radius);
    candidates.push(point);
  }
  return bestOpenPoint(candidates, randomArenaPoint());
}

function predictedRoutePoint() {
  if (world.routeMemory.length < 3) return roundObjectivePoint();
  const last = world.routeMemory[world.routeMemory.length - 1];
  const previous = world.routeMemory[Math.max(0, world.routeMemory.length - 4)];
  const trend = last.clone().sub(previous);
  trend.y = 0;
  const direction = trend.lengthSq() > 0.1 ? trend.normalize() : world.playerSpawn.clone().sub(world.aiSpawn).normalize();
  const candidates = [];
  for (let i = 0; i < 10; i++) {
    const memoryPoint = world.routeMemory[Math.floor(Math.random() * world.routeMemory.length)];
    const point = memoryPoint.clone()
      .add(direction.clone().multiplyScalar(THREE.MathUtils.randFloat(8, 24)))
      .add(new THREE.Vector3(THREE.MathUtils.randFloat(-16, 16), 0, THREE.MathUtils.randFloat(-16, 16)));
    clampToMap(point, ai.radius);
    candidates.push(point);
  }
  return bestOpenPoint(candidates, roundObjectivePoint());
}

function predictedLastKnownPlayerPoint() {
  const base = ai.lastSeenPlayer.clone();
  base.y = 0;
  const candidates = [base];
  if (world.routeMemory.length >= 2) {
    const last = world.routeMemory[world.routeMemory.length - 1];
    const previous = world.routeMemory[Math.max(0, world.routeMemory.length - 4)];
    const trend = last.clone().sub(previous);
    trend.y = 0;
    if (trend.lengthSq() > 0.1) {
      const direction = trend.normalize();
      for (const lead of [7, 13, 20]) {
        candidates.push(base.clone().add(direction.clone().multiplyScalar(lead)));
      }
    }
  }
  const fromAi = base.clone().sub(ai.position);
  fromAi.y = 0;
  if (fromAi.lengthSq() > 0.1) {
    const direction = fromAi.normalize();
    candidates.push(base.clone().add(direction.clone().multiplyScalar(8)));
    candidates.push(base.clone().add(new THREE.Vector3(direction.z, 0, -direction.x).multiplyScalar(8)));
    candidates.push(base.clone().add(new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(8)));
  }
  return bestOpenPoint(candidates, base);
}

function huntSweepPoint(centerBias) {
  const fromAiToPlayerSpawn = world.playerSpawn.clone().sub(world.aiSpawn);
  const routeStyle = Math.random();
  const forwardBias =
    routeStyle < 0.25 ? THREE.MathUtils.randFloat(0.15, 0.34) :
    routeStyle < 0.5 ? THREE.MathUtils.randFloat(0.62, 0.9) :
    centerBias + Math.random() * 0.32;
  const base = world.aiSpawn.clone().add(fromAiToPlayerSpawn.multiplyScalar(forwardBias));
  const side = new THREE.Vector3(-fromAiToPlayerSpawn.z, 0, fromAiToPlayerSpawn.x).normalize();
  const sideMax = Math.min(world.bounds.depth, world.bounds.width) * 0.34;
  const sideAnchor = routeStyle < 0.72 ? THREE.MathUtils.randFloat(-sideMax, sideMax) : (Math.random() > 0.5 ? sideMax : -sideMax);
  const candidates = [];
  for (let i = 0; i < 10; i++) {
    const point = base.clone().add(side.clone().multiplyScalar(sideAnchor + THREE.MathUtils.randFloat(-18, 18)));
    point.x += THREE.MathUtils.randFloat(-12, 12);
    point.z += THREE.MathUtils.randFloat(-12, 12);
    clampToMap(point, ai.radius);
    candidates.push(point);
  }
  return bestOpenPoint(candidates, randomArenaPoint());
}

function rushPointNearPlayerSide() {
  const candidates = [];
  for (let i = 0; i < 10; i++) {
    const sideNoise = new THREE.Vector3(
      THREE.MathUtils.randFloat(-18, 18),
      0,
      THREE.MathUtils.randFloat(-22, 22)
    );
    const point = world.playerSpawn.clone().lerp(new THREE.Vector3(0, 0, 0), 0.22).add(sideNoise);
    clampToMap(point, ai.radius);
    candidates.push(point);
  }
  return bestOpenPoint(candidates, randomArenaPoint());
}

function canAiSeePlayer(dist) {
  if (ai.blindTimer > 0) return false;
  const playerMoving = player.movementSpeed > 2;
  const visionRange = playerMoving ? 82 : 68;
  if (dist > visionRange || !hasLineOfSight(ai.position, player.position)) return false;
  const toPlayer = player.position.clone().sub(ai.position);
  toPlayer.y = 0;
  if (toPlayer.lengthSq() === 0) return true;
  toPlayer.normalize();
  const facing = ai.facing.lengthSq() > 0 ? ai.facing.clone().normalize() : toPlayer;
  const inFront = facing.dot(toPlayer) > (dist < 18 ? -0.32 : 0);
  if (!inFront) return playerMoving && dist < 26 && Math.random() < 0.11;
  const baseChance = playerMoving ? 1.22 : 0.92;
  const awarenessChance = THREE.MathUtils.clamp(baseChance - dist / 110, playerMoving ? 0.44 : 0.24, playerMoving ? 0.94 : 0.76);
  return Math.random() < awarenessChance;
}

function canInferStillPlayer(dist) {
  const exposed = player.movementSpeed <= 1.2 || state.scoped;
  if (!exposed || dist > 38) return false;
  const sameGroundLevel = Math.abs(player.position.y - ai.position.y) < 4.6;
  if (!sameGroundLevel) return false;
  if (hasLineOfSight(ai.position, player.position)) return true;
  return dist < 24 && Math.random() < 0.54;
}

function canHearPlayer(dist) {
  if (player.movementSpeed < 3.6 || dist > 46) return false;
  if (Math.abs(player.position.y - ai.position.y) > 5.2) return false;
  const closeEnough = dist < 18;
  return closeEnough || Math.random() < THREE.MathUtils.clamp(0.56 - dist / 105, 0.1, 0.36);
}

function inferredPlayerPosition(dist) {
  const noise = THREE.MathUtils.clamp(dist * 0.16, 2, 6.2);
  const point = new THREE.Vector3(
    player.position.x + THREE.MathUtils.randFloatSpread(noise),
    0,
    player.position.z + THREE.MathUtils.randFloatSpread(noise)
  );
  clampToMap(point, ai.radius);
  return collides(point, ai.radius + 0.5) ? player.position.clone() : point;
}

function alertAiFromNoise(amount, range, origin = player.position) {
  const dist = ai.position.distanceTo(origin);
  if (dist > range) return;
  const strength = amount * (1 - dist / range);
  const noise = THREE.MathUtils.clamp(dist * 0.18, 3, 11);
  const point = origin.clone();
  point.x += THREE.MathUtils.randFloatSpread(noise);
  point.z += THREE.MathUtils.randFloatSpread(noise);
  point.y = 0;
  clampToMap(point, ai.radius);
  ai.awareness = Math.min(1, ai.awareness + strength);
  ai.lastSeenPlayer.lerp(point, 0.78);
  ai.memoryTimer = Math.max(ai.memoryTimer, 4.2 + strength * 4.5);
  if (ai.awareness > 0.35) {
    ai.objective.copy(bestOpenPoint([point, huntSweepPoint(0.58)], huntSweepPoint(0.52)));
    ai.decisionTimer = 0;
  }
}

function randomArenaPoint() {
  const margin = 5;
  const candidates = [];
  for (let i = 0; i < 12; i++) {
    const point = new THREE.Vector3(
      THREE.MathUtils.randFloat(-world.bounds.width / 2 + margin, world.bounds.width / 2 - margin),
      0,
      THREE.MathUtils.randFloat(-world.bounds.depth / 2 + margin, world.bounds.depth / 2 - margin)
    );
    candidates.push(point);
  }
  return bestOpenPoint(candidates, world.aiSpawn.clone());
}

function bestOpenPoint(candidates, fallback) {
  let best = null;
  let bestScore = -Infinity;
  for (const point of candidates) {
    point.y = 0;
    clampToMap(point, ai.radius);
    if (!isSafeGroundPoint(point, ai.radius + 0.7)) continue;
    const score = openSpaceScore(point) + routeClearScore(ai.position, point);
    if (score > bestScore) {
      best = point;
      bestScore = score;
    }
  }
  return best || fallback;
}

function openSpaceScore(point) {
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0.7, 0, 0.7).normalize(),
    new THREE.Vector3(-0.7, 0, 0.7).normalize(),
    new THREE.Vector3(0.7, 0, -0.7).normalize(),
    new THREE.Vector3(-0.7, 0, -0.7).normalize(),
  ];
  let score = 0;
  for (const dir of directions) {
    for (let step = 2; step <= 14; step += 2) {
      const probe = point.clone().add(dir.clone().multiplyScalar(step));
      clampToMap(probe, ai.radius);
      if (!isSafeGroundPoint(probe, ai.radius + 0.45)) break;
      score += 1;
    }
  }
  const edgeBufferX = world.bounds.width / 2 - Math.abs(point.x);
  const edgeBufferZ = world.bounds.depth / 2 - Math.abs(point.z);
  score += Math.min(edgeBufferX, edgeBufferZ) * 0.04;
  return score;
}

function routeClearScore(from, to) {
  const path = to.clone().sub(from);
  path.y = 0;
  const distance = path.length();
  if (distance < 0.1) return 0;
  const dir = path.normalize();
  let score = 0;
  const steps = Math.min(18, Math.ceil(distance / 4));
  for (let i = 1; i <= steps; i++) {
    const probe = from.clone().add(dir.clone().multiplyScalar((distance * i) / steps));
    probe.y = 0;
    clampToMap(probe, ai.radius);
    if (!isSafeGroundPoint(probe, ai.radius + 0.5) || nearPlatform(probe, ai.radius + 2.4)) {
      score -= 14;
      break;
    }
    score += 1.5;
  }
  return score;
}

function isSafeGroundPoint(point, padding) {
  if (getGroundHeight(point, ai.radius) > 0.2) return false;
  if (collides(point, padding)) return false;
  if (nearPlatform(point, padding + 1.5)) return false;
  return true;
}

function routeBlockedByElevation(from, to) {
  const path = to.clone().sub(from);
  path.y = 0;
  const distance = path.length();
  if (distance < 4) return false;
  const dir = path.normalize();
  const steps = Math.min(24, Math.ceil(distance / 3));
  for (let i = 1; i <= steps; i++) {
    const probe = from.clone().add(dir.clone().multiplyScalar((distance * i) / steps));
    probe.y = 0;
    clampToMap(probe, ai.radius);
    if (!isSafeGroundPoint(probe, ai.radius + 0.35)) return true;
  }
  return false;
}

function avoidElevatedRoadblocks(desired) {
  const lookAhead = ai.position.clone().add(desired.clone().multiplyScalar(4.5));
  lookAhead.y = ai.position.y;
  if (isSafeGroundPoint(lookAhead, ai.radius + 0.25)) return desired;
  const left = new THREE.Vector3(-desired.z, 0, desired.x).normalize();
  const right = new THREE.Vector3(desired.z, 0, -desired.x).normalize();
  const leftProbe = ai.position.clone().add(left.clone().multiplyScalar(6)).add(desired.clone().multiplyScalar(2));
  const rightProbe = ai.position.clone().add(right.clone().multiplyScalar(6)).add(desired.clone().multiplyScalar(2));
  clampToMap(leftProbe, ai.radius);
  clampToMap(rightProbe, ai.radius);
  const leftScore = (isSafeGroundPoint(leftProbe, ai.radius + 0.35) ? 8 : -20) + openSpaceScore(leftProbe) + routeClearScore(ai.position, leftProbe);
  const rightScore = (isSafeGroundPoint(rightProbe, ai.radius + 0.35) ? 8 : -20) + openSpaceScore(rightProbe) + routeClearScore(ai.position, rightProbe);
  return (leftScore > rightScore ? left : right).lerp(desired, 0.25).normalize();
}

function nearPlatform(point, padding) {
  for (const solid of world.solids) {
    if (!solid.userData.platform) continue;
    const box = solid.userData.box;
    const near =
      point.x > box.x - box.w / 2 - padding &&
      point.x < box.x + box.w / 2 + padding &&
      point.z > box.z - box.d / 2 - padding &&
      point.z < box.z + box.d / 2 + padding;
    if (near) return true;
  }
  return false;
}

function detourAroundBlock(target = ai.goal) {
  const toTarget = target.clone().sub(ai.position);
  toTarget.y = 0;
  const forward = toTarget.lengthSq() > 0 ? toTarget.normalize() : ai.facing.clone();
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const candidates = [];
  for (const side of [-1, 1]) {
    for (const distance of [10, 18, 26]) {
      const point = ai.position.clone()
        .add(right.clone().multiplyScalar(side * distance))
        .add(forward.clone().multiplyScalar(8 + distance * 0.25));
      clampToMap(point, ai.radius);
      candidates.push(point);
    }
  }
  candidates.push(randomArenaPoint());
  return bestOpenPoint(candidates, randomArenaPoint());
}

function moveEntity(position, radius, delta) {
  const startX = position.x;
  const startZ = position.z;
  position.x += delta.x;
  clampToMap(position, radius);
  if (collides(position, radius)) position.x -= delta.x;
  position.z += delta.z;
  clampToMap(position, radius);
  if (collides(position, radius)) position.z -= delta.z;
  clampToMap(position, radius);
  return Math.hypot(position.x - startX, position.z - startZ);
}

function clampToMap(position, radius) {
  const halfWidth = world.bounds.width / 2 - radius - 0.15;
  const halfDepth = world.bounds.depth / 2 - radius - 0.15;
  position.x = THREE.MathUtils.clamp(position.x, -halfWidth, halfWidth);
  position.z = THREE.MathUtils.clamp(position.z, -halfDepth, halfDepth);
}

function collides(position, radius) {
  const bodyBottom = position.y;
  const bodyTop = position.y + 3.35;
  for (const solid of world.solids) {
    const box = solid.userData.box;
    const top = solid.position.y + solid.geometry.parameters.height / 2;
    const bottom = solid.position.y - solid.geometry.parameters.height / 2;
    if (bodyTop < bottom + 0.08 || bodyBottom > top - 0.08) continue;
    if (solid.userData.platform && state.gameMode !== "zombie" && position.y >= top - 0.18) continue;
    const cx = THREE.MathUtils.clamp(position.x, box.x - box.w / 2, box.x + box.w / 2);
    const cz = THREE.MathUtils.clamp(position.z, box.z - box.d / 2, box.z + box.d / 2);
    if ((position.x - cx) ** 2 + (position.z - cz) ** 2 < radius ** 2) return true;
  }
  return false;
}

function getGroundHeight(position, radius) {
  if (state.gameMode === "zombie") return 0;
  let ground = 0;
  for (const solid of world.solids) {
    if (!solid.userData.platform) continue;
    const box = solid.userData.box;
    const top = solid.position.y + solid.geometry.parameters.height / 2;
    const onTop =
      position.x > box.x - box.w / 2 - radius * 0.55 &&
      position.x < box.x + box.w / 2 + radius * 0.55 &&
      position.z > box.z - box.d / 2 - radius * 0.55 &&
      position.z < box.z + box.d / 2 + radius * 0.55 &&
      position.y >= top - 0.45;
    if (onTop) ground = Math.max(ground, top);
  }
  return ground;
}

function updateCamera() {
  camera.position.set(player.position.x, player.position.y + getPlayerEyeHeight(), player.position.z);
  camera.rotation.order = "YXZ";
  camera.rotation.y = mouse.yaw;
  camera.rotation.x = mouse.pitch;
}

function getPlayerEyeHeight() {
  return state.gameMode === "titan" ? 6.45 : 2.15;
}

function getPlayerMaxHealth() {
  return state.gameMode === "titan" ? 500 : 100;
}

function updateAiMesh() {
  ai.group.position.copy(ai.position);
  const lookTarget = ai.awareness > 0.68 ? player.position : ai.position.clone().add(ai.facing);
  ai.group.lookAt(lookTarget.x, 1.4, lookTarget.z);
  const stride = Math.sin(performance.now() * 0.008) * Math.min(ai.previousPosition.distanceTo(ai.position) * 16, 0.55);
  if (ai.leftLeg && ai.rightLeg && ai.leftArm && ai.rightArm) {
    ai.leftLeg.rotation.x = stride;
    ai.rightLeg.rotation.x = -stride;
    ai.leftArm.rotation.x = -stride * 0.55;
    ai.rightArm.rotation.x = stride * 0.55;
  }
}

function getLivingAiUnits() {
  return [ai, ...extraAis].filter((unit) => unit.health > 0);
}

function getAiHitboxes() {
  return getLivingAiUnits().flatMap((unit) => unit.hitboxes || ai.hitboxes);
}

function nearestFacingAi(range, threshold) {
  let best = null;
  let bestDist = Infinity;
  for (const unit of getLivingAiUnits()) {
    const dist = player.position.distanceTo(unit.position);
    if (dist < range && dist < bestDist && isFacing(unit.position, threshold)) {
      best = unit;
      bestDist = dist;
    }
  }
  return best;
}

function allAiDefeated() {
  return getLivingAiUnits().length === 0;
}

function setWeapon(id) {
  state.weapon = id;
  refreshHud();
}

function cycleWeapon(direction) {
  const currentIndex = weapons.findIndex((item) => item.id === state.weapon);
  const nextIndex = (currentIndex + direction + weapons.length) % weapons.length;
  setWeapon(weapons[nextIndex].id);
  setMessage(`Selected ${weapons[nextIndex].name}.`);
}

function useWeapon() {
  if (state.cooldown > 0 || !state.playing || state.paused || state.roundEnding) return;
  const weapon = weapons.find((item) => item.id === state.weapon);
  state.cooldown = getWeaponCooldown(weapon);
  if (state.weapon === "knife") knifeAttack();
  if (state.weapon === "fists") fistsAttack();
  if (state.weapon === "sniper") sniperAttack();
  if (state.weapon === "rifle") rifleAttack();
  if (state.weapon === "medkit") useMedkit();
  if (state.weapon === "grenade") throwGrenade();
  if (state.weapon === "flashbang") throwFlashbang();
}

function getWeaponCooldown(weapon) {
  // Slows the assault rifle in standard matches so camping AI has counterplay and sniper/utility choices still matter.
  if (weapon.id === "rifle" && !["titan", "zombie"].includes(state.gameMode)) return 0.2;
  return weapon.cooldown;
}

function knifeAttack() {
  // Knife is the high-damage melee option: risky range, but two clean hits defeat a normal AI.
  playSound("knife");
  const target = nearestFacingAi(state.gameMode === "titan" ? 9 : 4.2, 0.8);
  if (target) damageAi(50, "Knife hit: 50 damage.", target);
  else setMessage("Knife missed. Get close.");
}

function fistsAttack() {
  // Fists trade damage for mobility; while equipped, the player gets a double jump in updatePlayer().
  playSound("knife");
  const target = nearestFacingAi(state.gameMode === "titan" ? 8 : 4, 0.78);
  if (target) damageAi(25, "Fists hit: 25 damage.", target);
  else setMessage("Fists missed. Get close.");
}

function sniperAttack() {
  // Sniper rewards accuracy: body shots hit for 50, headshots instantly defeat normal-health enemies.
  playSound("sniper");
  alertAiFromNoise(0.5, 80);
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = raycaster.intersectObjects(getAiHitboxes(), false);
  const wallHits = raycaster.intersectObjects(world.solids, false);
  const enemyHit = hits[0];
  const blocked = wallHits[0] && enemyHit && wallHits[0].distance < enemyHit.distance;
  const end = enemyHit && !blocked
    ? enemyHit.point
    : camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(70));
  addBeam(camera.position, end, mats.playerBeam);
  if (!enemyHit || blocked) {
    setMessage("Sniper shot missed.");
    return;
  }
  const headshot = enemyHit.object.userData.hitZone === "head";
  damageAi(headshot ? 100 : 50, headshot ? "Headshot: 100 damage." : "Body hit: 50 damage.", enemyHit.object.userData.owner || ai);
}

function rifleAttack() {
  // Rifle is sustained pressure: low per-shot damage, faster follow-up shots, and doubled headshot damage.
  playSound("rifle");
  alertAiFromNoise(0.38, 72);
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = raycaster.intersectObjects(getAiHitboxes(), false);
  const wallHits = raycaster.intersectObjects(world.solids, false);
  const enemyHit = hits[0];
  const blocked = wallHits[0] && enemyHit && wallHits[0].distance < enemyHit.distance;
  const end = enemyHit && !blocked
    ? enemyHit.point
    : camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(62));
  addBeam(camera.position, end, mats.playerBeam);
  if (!enemyHit || blocked) {
    setMessage("Rifle shot missed.");
    return;
  }
  const headshot = enemyHit.object.userData.hitZone === "head";
  damageAi(headshot ? 20 : 10, headshot ? "Rifle headshot: 20 damage." : "Rifle hit: 10 damage.", enemyHit.object.userData.owner || ai);
}

function useMedkit() {
  // Medkit is one use per round or wave and always restores the player's current mode max health.
  if (state.medkitUsed) {
    setMessage("Medkit already used this round.");
    return;
  }
  state.medkitUsed = true;
  player.health = getPlayerMaxHealth();
  playSound("medkit");
  setMessage(`Medkit used. Health restored to ${getPlayerMaxHealth()}.`);
}

function throwGrenade() {
  // Grenade shares the utility slot's one-use flag with flashbang and deals area damage after a short fuse.
  if (state.grenadeUsed) {
    setMessage("Grenade already thrown this round.");
    return;
  }
  state.grenadeUsed = true;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10), mats.grenade);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  mesh.position.copy(camera.position).add(dir.clone().multiplyScalar(1.2));
  mesh.userData.world = true;
  mesh.userData.owner = "player";
  mesh.userData.velocity = dir.multiplyScalar(28).add(new THREE.Vector3(0, 8, 0));
  mesh.userData.life = 1.35;
  scene.add(mesh);
  world.grenades.push(mesh);
  playSound("grenadeThrow");
  alertAiFromNoise(0.38, 70);
  setMessage("Grenade out.");
}

function throwFlashbang() {
  // Flashbang also uses the one utility charge; it blinds enemies, and a player-hit flash fully whites out the screen.
  if (state.grenadeUsed) {
    setMessage("Flashbang already thrown this round.");
    return;
  }
  state.grenadeUsed = true;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10), mats.grenade);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  mesh.position.copy(camera.position).add(dir.clone().multiplyScalar(1.2));
  mesh.userData.world = true;
  mesh.userData.owner = "player";
  mesh.userData.type = "flashbang";
  mesh.userData.velocity = dir.multiplyScalar(27).add(new THREE.Vector3(0, 8, 0));
  mesh.userData.life = 1.15;
  scene.add(mesh);
  world.grenades.push(mesh);
  playSound("grenadeThrow");
  alertAiFromNoise(0.34, 78);
  setMessage("Flashbang out.");
}

function updateGrenades(dt) {
  for (let i = world.grenades.length - 1; i >= 0; i--) {
    const grenade = world.grenades[i];
    grenade.userData.velocity.y -= 18 * dt;
    grenade.position.addScaledVector(grenade.userData.velocity, dt);
    if (grenade.position.y < 0.35) {
      grenade.position.y = 0.35;
      grenade.userData.velocity.y *= -0.38;
      grenade.userData.velocity.x *= 0.72;
      grenade.userData.velocity.z *= 0.72;
    }
    grenade.userData.life -= dt;
    if (grenade.userData.life <= 0) {
      if (grenade.userData.type === "flashbang") explodeFlashbang(grenade.position, grenade.userData.owner || "player");
      else explodeGrenade(grenade.position, grenade.userData.owner || "player");
      scene.remove(grenade);
      world.grenades.splice(i, 1);
    }
  }
}

function explodeFlashbang(pos, owner = "player") {
  playSound("flashbang");
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(state.gameMode === "titan" ? 4 : 0.8, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xf5ffe8, transparent: true, opacity: 0.68 })
  );
  blast.position.copy(pos);
  blast.userData.world = true;
  scene.add(blast);
  world.beams.push({ mesh: blast, life: 0.34, scaleBlast: true });
  if (owner === "ai") {
    if (pos.distanceTo(player.position) < (state.gameMode === "titan" ? 120 : 24) && hasLineOfSight(pos, player.position)) {
      state.blindTimer = 3;
      setMessage("AI flashbang blinded you for 3 seconds.");
    }
    return;
  }
  let blinded = 0;
  const flashRadius = state.gameMode === "titan" ? 120 : 24;
  for (const unit of getLivingAiUnits()) {
    if (pos.distanceTo(unit.position) < flashRadius && hasLineOfSight(pos, unit.position)) {
      unit.blindTimer = 3;
      if (unit === ai) ai.awareness = Math.max(0, ai.awareness - 0.35);
      blinded += 1;
    }
  }
  if (blinded > 0) {
    setMessage("Flashbang blinded AI for 3 seconds.");
  }
}

function explodeGrenade(pos, owner = "player") {
  playSound("explosion");
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(state.gameMode === "titan" ? 2.5 : 0.5, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xd7ff66, transparent: true, opacity: 0.5 })
  );
  blast.position.copy(pos);
  blast.userData.world = true;
  scene.add(blast);
  world.beams.push({ mesh: blast, life: 0.22, scaleBlast: true });
  alertAiFromNoise(0.55, 90, pos);
  if (owner === "ai") {
    if (pos.distanceTo(player.position) < (state.gameMode === "titan" ? 40 : 8) && hasLineOfSight(pos, player.position)) {
      damagePlayer(75);
      setMessage("AI grenade blast: 75 damage.");
    }
    return;
  }
  const grenadeRadius = state.gameMode === "titan" ? 40 : 8;
  for (const unit of getLivingAiUnits()) {
    if (pos.distanceTo(unit.position) < grenadeRadius && hasLineOfSight(pos, unit.position)) damageAi(75, "Grenade blast: 75 damage.", unit);
  }
  if (pos.distanceTo(player.position) < (state.gameMode === "titan" ? 35 : 7)) damagePlayer(35);
}

function damageAi(amount, text, target = ai) {
  const finalAmount = state.gameMode === "titan" ? amount * 2 : amount;
  target.health = Math.max(0, target.health - finalAmount);
  playSound("hit");
  showHit();
  showDamage(finalAmount);
  setMessage(`${text} AI health ${target.health}.`);
  if (target.health <= 0 && target.group) target.group.visible = false;
  if (allAiDefeated()) endRound("player");
}

function aiUseWeapon(dist) {
  if (dist < 4.2) {
    ai.weapon = state.aiLoadout.melee;
    ai.shootTimer = 0.55 + Math.random() * 0.25;
    playSound("knife");
    const amount = ai.weapon === "fists" ? 25 : 50;
    damagePlayer(amount);
    setMessage(ai.weapon === "fists" ? "AI fists hit: 25 damage." : "AI knife hit: 50 damage.");
    return;
  }

  if (!ai.grenadeUsed && dist > 8 && dist < 36 && Math.random() < 0.36) {
    ai.weapon = state.aiLoadout.utility;
    ai.grenadeUsed = true;
    ai.shootTimer = 1.25 + Math.random() * 0.55;
    if (ai.weapon === "flashbang") throwAiFlashbang();
    else throwAiGrenade();
    return;
  }

  ai.weapon = state.aiLoadout.gun;
  if (ai.weapon === "rifle") {
    ai.shootTimer = 0.5 + Math.random() * 0.18;
    aiRifleShot(dist);
  } else {
    ai.shootTimer = 0.9 + Math.random() * 0.75;
    aiSniperShot(dist);
  }
}

function aiSniperShot(dist) {
  const origin = ai.position.clone().add(new THREE.Vector3(0, 2.2, 0));
  const target = player.position.clone().add(new THREE.Vector3(0, 1.3 + Math.random() * 0.9, 0));
  addBeam(origin, target, mats.aiBeam);
  playSound("sniper");
  const hitChance = THREE.MathUtils.clamp(0.84 - dist / 100, 0.22, 0.68);
  const playerStill = player.movementSpeed < 1.2;
  const stillBonus = playerStill || state.scoped ? 0.16 : 0;
  if (Math.random() < hitChance + stillBonus) {
    const headshot = Math.random() < (playerStill || state.scoped ? 0.24 : 0.1);
    damagePlayer(headshot ? 100 : 50);
    setMessage(headshot ? "AI sniper headshot: 100 damage." : "AI sniper body hit: 50 damage.");
  }
}

function aiRifleShot(dist) {
  const origin = ai.position.clone().add(new THREE.Vector3(0, 2.0, 0));
  const target = player.position.clone().add(new THREE.Vector3(0, 1.35 + Math.random() * 0.5, 0));
  addBeam(origin, target, mats.aiBeam);
  playSound("rifle");
  const hitChance = THREE.MathUtils.clamp(0.78 - dist / 95, 0.24, 0.7);
  if (Math.random() < hitChance) {
    const headshot = Math.random() < 0.14;
    damagePlayer(headshot ? 20 : 10);
    setMessage(headshot ? "AI rifle headshot: 20 damage." : "AI rifle hit: 10 damage.");
  }
}

function aiUnitRifleShot(unit, dist) {
  const origin = unit.position.clone().add(new THREE.Vector3(0, 2.0, 0));
  const target = player.position.clone().add(new THREE.Vector3(0, 1.35 + Math.random() * 0.5, 0));
  addBeam(origin, target, mats.aiBeam);
  playSound("rifle");
  if (Math.random() < THREE.MathUtils.clamp(0.66 - dist / 130, 0.16, 0.58)) {
    const headshot = Math.random() < 0.12;
    damagePlayer(headshot ? 20 : 10);
    setMessage(headshot ? "Titan AI rifle headshot: 20 damage." : "Titan AI rifle hit: 10 damage.");
  }
}

function aiUnitSniperShot(unit, dist) {
  const origin = unit.position.clone().add(new THREE.Vector3(0, 2.2, 0));
  const target = player.position.clone().add(new THREE.Vector3(0, 1.3 + Math.random() * 0.9, 0));
  addBeam(origin, target, mats.aiBeam);
  playSound("sniper");
  if (Math.random() < THREE.MathUtils.clamp(0.55 - dist / 150, 0.12, 0.45)) {
    const headshot = Math.random() < 0.1;
    damagePlayer(headshot ? 100 : 50);
    setMessage(headshot ? "Titan AI sniper headshot: 100 damage." : "Titan AI sniper body hit: 50 damage.");
  }
}

function throwUnitGrenade(unit) {
  throwProjectileFromUnit(unit, "grenade");
}

function throwUnitFlashbang(unit) {
  throwProjectileFromUnit(unit, "flashbang");
}

function throwProjectileFromUnit(unit, type) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(type === "flashbang" ? 0.3 : 0.32, 16, 10), mats.grenade);
  const origin = unit.position.clone().add(new THREE.Vector3(0, 2.25, 0));
  const target = player.position.clone().add(new THREE.Vector3(0, 0.6, 0));
  const dir = target.sub(origin).normalize();
  mesh.position.copy(origin).add(dir.clone().multiplyScalar(1.2));
  mesh.userData.world = true;
  mesh.userData.owner = "ai";
  if (type === "flashbang") mesh.userData.type = "flashbang";
  mesh.userData.velocity = dir.multiplyScalar(type === "flashbang" ? 24 : 25).add(new THREE.Vector3(0, 8, 0));
  mesh.userData.life = type === "flashbang" ? 1.15 : 1.25;
  scene.add(mesh);
  world.grenades.push(mesh);
  playSound("grenadeThrow");
  setMessage(type === "flashbang" ? "Titan AI threw flashbang." : "Titan AI threw grenade.");
}

function throwAiGrenade() {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10), mats.grenade);
  const origin = ai.position.clone().add(new THREE.Vector3(0, 2.25, 0));
  const target = player.position.clone().add(new THREE.Vector3(0, 0.6, 0));
  const dir = target.sub(origin).normalize();
  mesh.position.copy(origin).add(dir.clone().multiplyScalar(1.2));
  mesh.userData.world = true;
  mesh.userData.owner = "ai";
  mesh.userData.velocity = dir.multiplyScalar(25).add(new THREE.Vector3(0, 8, 0));
  mesh.userData.life = 1.25;
  scene.add(mesh);
  world.grenades.push(mesh);
  playSound("grenadeThrow");
  setMessage("AI threw grenade.");
}

function throwAiFlashbang() {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10), mats.grenade);
  const origin = ai.position.clone().add(new THREE.Vector3(0, 2.25, 0));
  const target = player.position.clone().add(new THREE.Vector3(0, 0.6, 0));
  const dir = target.sub(origin).normalize();
  mesh.position.copy(origin).add(dir.clone().multiplyScalar(1.2));
  mesh.userData.world = true;
  mesh.userData.owner = "ai";
  mesh.userData.type = "flashbang";
  mesh.userData.velocity = dir.multiplyScalar(24).add(new THREE.Vector3(0, 8, 0));
  mesh.userData.life = 1.15;
  scene.add(mesh);
  world.grenades.push(mesh);
  playSound("grenadeThrow");
  setMessage("AI threw flashbang.");
}

function damagePlayer(amount) {
  player.health = Math.max(0, player.health - amount);
  playSound("playerHit");
  flashDamage();
  setMessage(`Tagged by AI: ${amount} damage.`);
  if (player.health <= 0) endRound("ai");
}

function hasLineOfSight(from, to) {
  const start = from.clone().add(new THREE.Vector3(0, 1.5, 0));
  const end = to.clone().add(new THREE.Vector3(0, 1.5, 0));
  const dir = end.clone().sub(start);
  const dist = dir.length();
  raycaster.set(start, dir.normalize());
  const hits = raycaster.intersectObjects(world.solids, false);
  return !hits[0] || hits[0].distance > dist;
}

function isFacing(target, threshold) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const toTarget = target.clone().sub(camera.position).normalize();
  return forward.dot(toTarget) > threshold;
}

function addBeam(from, to, material) {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]), material.clone());
  line.userData.world = true;
  scene.add(line);
  world.beams.push({ mesh: line, life: 0.11 });
}

function updateBeams(dt) {
  for (let i = world.beams.length - 1; i >= 0; i--) {
    const beam = world.beams[i];
    beam.life -= dt;
    if (beam.scaleBlast) {
      const scale = beam.mesh.scale.x + dt * 35;
      beam.mesh.scale.setScalar(scale);
      beam.mesh.material.opacity = Math.max(0, beam.life * 2.6);
    } else {
      beam.mesh.material.opacity = Math.max(0, beam.life * 8);
    }
    if (beam.life <= 0) {
      scene.remove(beam.mesh);
      world.beams.splice(i, 1);
    }
  }
}

function endRound(winner) {
  if (state.roundEnding) return;
  state.roundEnding = true;
  state.playing = false;
  if (winner === "player") state.playerRounds += 1;
  else state.aiRounds += 1;
  refreshHud();
  if (state.gameMode === "zombie") {
    setTimeout(() => {
      if (winner !== "player") {
        state.mouseCaptureRequested = false;
        matchTitle.textContent = "Overrun";
        matchSummary.textContent = `You survived ${Math.max(0, state.round - 1)} wave${state.round === 2 ? "" : "s"}.`;
        hud.classList.add("hidden");
        scoreMenu.classList.add("hidden");
        matchOver.classList.remove("hidden");
        if (document.pointerLockElement) document.exitPointerLock();
        return;
      }
      state.round += 1;
      setMessage(`Wave cleared. Wave ${state.round} starts in 5 seconds.`);
      setTimeout(() => {
        startRound(state.mapId);
        setMessage(`Wave ${state.round}: ${state.round * zombieWaveSize} zombies incoming.`);
      }, 5000);
    }, 1200);
    return;
  }
  const targetRounds = state.gameMode === "titan" ? 1 : roundsToWin;
  const wonMatch = state.playerRounds >= targetRounds || state.aiRounds >= targetRounds;
  setTimeout(() => {
    if (wonMatch) {
      state.mouseCaptureRequested = false;
      matchTitle.textContent = state.playerRounds >= targetRounds ? "Victory" : "Defeat";
      matchSummary.textContent = `Final score: You ${state.playerRounds}, AI ${state.aiRounds}.`;
      hud.classList.add("hidden");
      scoreMenu.classList.add("hidden");
      matchOver.classList.remove("hidden");
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    state.round += 1;
    startRound(state.mapId);
    setMessage(`${winner === "player" ? "Round won" : "Round lost"}. Next round on the same map.`);
  }, 1500);
}

function refreshHud() {
  healthEl.textContent = Math.round(player.health);
  playerRoundsEl.textContent = state.playerRounds;
  aiRoundsEl.textContent = state.aiRounds;
  roundEl.textContent = state.round;
  zombieRemainingStat.classList.toggle("hidden", state.gameMode !== "zombie");
  if (state.gameMode === "zombie") zombieRemainingEl.textContent = getLivingAiUnits().length;
  for (const item of weaponBar.children) {
    item.classList.toggle("active", item.dataset.weapon === state.weapon);
    item.classList.toggle("disabled", item.dataset.weapon === "medkit" && state.medkitUsed);
    item.classList.toggle("disabled", ["grenade", "flashbang"].includes(item.dataset.weapon) && state.grenadeUsed);
  }
}

function setMessage(text) {
  messageEl.textContent = text;
}

function showHit() {
  hitMarker.classList.add("show");
  setTimeout(() => hitMarker.classList.remove("show"), 120);
}

function showDamage(amount) {
  damageNumber.textContent = `-${amount}`;
  damageNumber.classList.remove("show");
  damageNumber.offsetHeight;
  damageNumber.classList.add("show");
  setTimeout(() => damageNumber.classList.remove("show"), 520);
}

function flashDamage() {
  damageFlash.classList.add("show");
  setTimeout(() => damageFlash.classList.remove("show"), 130);
}

function flashScope() {
  scopeFlash.classList.remove("show");
  scopeFlash.offsetHeight;
  scopeFlash.classList.add("show");
  setTimeout(() => scopeFlash.classList.remove("show"), 170);
}

init();
showMapMenu();
