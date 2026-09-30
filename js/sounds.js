// MissApp sound module
// - Ringtones (MP3 / MIDI) loop until stopCustomRingtone() is called
// - Repeated playSound("incomingCall") calls do NOT restart a ringtone that is already playing

const STORAGE_KEY = "missapp.soundSettings";
const RINGTONE_DB = "missapp-ringtones";
const RINGTONE_STORE = "files";
const RINGTONE_KEY = "custom";

const RING_SOUNDS = ["incomingCall", "callRinging"];
const DND_MUTED = ["messageReceived", "incomingCall", "callRinging", "status"];

const PENDING_MAX = 3;
const PENDING_TTL_MS = 5000;
const MIDI_MAX_SECONDS = 8;
const MIDI_MAX_NOTES = 250;
const PREVIEW_MS = 6000;
const PERSIST_DELAY_MS = 150;
const MAX_RINGTONE_BYTES = 8 * 1024 * 1024;

export const soundTypes = {
  classic: { name: "Classic", description: "Clean notification tones" },
  soft: { name: "Soft", description: "Gentle, rounded tones" },
  pop: { name: "Pop", description: "Bright and playful" },
  pulse: { name: "Pulse", description: "Modern digital tones" },
  retro: { name: "Retro", description: "Old-school electronic" }
};

const defaults = {
  enabled: true,
  volume: 0.7,
  soundType: "classic",
  messageSent: true,
  messageReceived: true,
  incomingCall: true,
  callRinging: true,
  callConnected: true,
  status: true,
  doNotDisturb: false,
  customRingtone: null
};

// Built once instead of on every playSound() call
const patterns = {
  classic: {
    messageSent: [[620, .09, 0], [820, .1, .07]],
    messageReceived: [[520, .11, 0], [690, .14, .08]],
    incomingCall: [[740, .2, 0], [920, .2, .23], [740, .2, .46]],
    callRinging: [[520, .18, 0], [700, .2, .22]],
    callConnected: [[540, .1, 0], [720, .12, .1]],
    status: [[460, .1, 0], [610, .12, .1]]
  },
  soft: {
    messageSent: [[520, .12, 0], [660, .14, .09]],
    messageReceived: [[440, .13, 0], [560, .16, .1]],
    incomingCall: [[520, .18, 0], [660, .2, .2], [780, .22, .42]],
    callRinging: [[420, .18, 0], [560, .2, .22]],
    callConnected: [[420, .13, 0], [560, .15, .12]],
    status: [[390, .13, 0], [500, .15, .11]]
  },
  pop: {
    messageSent: [[700, .07, 0], [980, .08, .06]],
    messageReceived: [[620, .08, 0], [860, .1, .07]],
    incomingCall: [[820, .12, 0], [1040, .13, .15], [820, .12, .3], [1040, .13, .45]],
    callRinging: [[700, .1, 0], [920, .12, .15]],
    callConnected: [[660, .08, 0], [900, .1, .08]],
    status: [[560, .08, 0], [760, .1, .07]]
  },
  pulse: {
    messageSent: [[480, .06, 0], [760, .08, .07]],
    messageReceived: [[400, .08, 0], [640, .09, .08]],
    incomingCall: [[620, .1, 0], [820, .1, .14], [1020, .12, .28]],
    callRinging: [[500, .09, 0], [720, .1, .14]],
    callConnected: [[500, .07, 0], [800, .09, .08]],
    status: [[430, .07, 0], [700, .09, .08]]
  },
  retro: {
    messageSent: [[440, .07, 0], [660, .07, .08], [880, .08, .16]],
    messageReceived: [[330, .08, 0], [520, .08, .09]],
    incomingCall: [[660, .12, 0], [880, .12, .15], [660, .12, .3], [880, .12, .45]],
    callRinging: [[440, .12, 0], [660, .12, .16], [880, .12, .32]],
    callConnected: [[330, .08, 0], [520, .09, .09], [780, .1, .19]],
    status: [[380, .08, 0], [570, .09, .09]]
  }
};

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let settings = loadSettings();
let persistTimer = null;

let audioContext = null;
let audioUnlocked = false;
let resumePromise = null;
let pendingSounds = []; // [{ name, at }]

// { buffer, name, type: "mp3" | "midi", url: string|null, plan?: object|null }
let ringtone = null;
let ringtoneLoad = null;

let customRingtoneAudio = null;
let midiLoopTimer = null;
let previewTimer = null;
const activeOscillators = new Set();

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function clampVolume(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : defaults.volume;
}

function sanitize(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const next = { ...defaults };

  for (const key of Object.keys(defaults)) {
    if (!(key in source)) continue;
    if (typeof defaults[key] === "boolean") next[key] = Boolean(source[key]);
  }

  next.volume = "volume" in source ? clampVolume(source.volume) : defaults.volume;
  next.soundType = soundTypes[source.soundType] ? source.soundType : defaults.soundType;

  const rt = source.customRingtone;
  next.customRingtone =
    rt && typeof rt === "object" && typeof rt.name === "string" && (rt.type === "mp3" || rt.type === "midi")
      ? { name: rt.name, type: rt.type }
      : null;

  return next;
}

function loadSettings() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return sanitize({});
  }
}

function writeSettings() {
  persistTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("MissApp sound settings could not be saved:", error);
  }
}

// Debounced so sliders don't hit localStorage on every tick
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(writeSettings, PERSIST_DELAY_MS);
}

function flushPersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    writeSettings();
  }
}

export function getSoundSettings() {
  return { ...settings, customRingtone: settings.customRingtone ? { ...settings.customRingtone } : null };
}

export function updateSoundSettings(patch = {}) {
  const next = { ...patch };
  delete next.customRingtone; // managed only by import/clear
  settings = sanitize({ ...settings, ...next, customRingtone: settings.customRingtone });
  persist();

  if (customRingtoneAudio) customRingtoneAudio.volume = settings.volume;
  if (!settings.enabled || settings.volume <= 0 || settings.doNotDisturb) stopCustomRingtone();

  return getSoundSettings();
}

export function isDoNotDisturb() {
  return Boolean(settings.doNotDisturb);
}

export function resetSoundSettings() {
  // The imported ringtone file is kept; use clearCustomRingtone() to remove it
  settings = sanitize({ ...defaults, customRingtone: settings.customRingtone });
  persist();
  stopCustomRingtone();
  return getSoundSettings();
}

/* ------------------------------------------------------------------ */
/* IndexedDB (one cached connection)                                   */
/* ------------------------------------------------------------------ */

let dbPromise = null;

function openRingtoneDb() {
  if (dbPromise) return dbPromise;

  const promise = new Promise((resolve, reject) => {
    const request = indexedDB.open(RINGTONE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RINGTONE_STORE)) {
        request.result.createObjectStore(RINGTONE_STORE);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });

  promise.catch(() => {
    if (dbPromise === promise) dbPromise = null;
  });
  dbPromise = promise;
  return promise;
}

async function dbRun(mode, work) {
  const db = await openRingtoneDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RINGTONE_STORE, mode);
    let result;
    const request = work(tx.objectStore(RINGTONE_STORE));
    if (request) request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
  });
}

/* ------------------------------------------------------------------ */
/* Custom ringtone management                                          */
/* ------------------------------------------------------------------ */

function releaseRingtoneUrl() {
  if (ringtone?.url) {
    URL.revokeObjectURL(ringtone.url);
    ringtone.url = null;
  }
}

function loadCustomRingtone() {
  if (ringtone) return Promise.resolve(ringtone);
  if (ringtoneLoad) return ringtoneLoad;

  const promise = (async () => {
    try {
      const data = await dbRun("readonly", store => store.get(RINGTONE_KEY));
      if (ringtone) return ringtone; // an import finished while we were loading

      if (data?.buffer && (data.type === "mp3" || data.type === "midi")) {
        ringtone = { buffer: data.buffer, name: data.name || "Custom ringtone", type: data.type, url: null };
        settings.customRingtone = { name: ringtone.name, type: ringtone.type };
        persist();
      } else if (settings.customRingtone) {
        // Settings mention a ringtone that no longer exists in storage
        settings.customRingtone = null;
        persist();
      }
    } catch (error) {
      console.warn("MissApp custom ringtone load failed:", error);
    }
    return ringtone;
  })();

  ringtoneLoad = promise;
  promise.then(() => {
    if (ringtoneLoad === promise) ringtoneLoad = null;
  });
  return promise;
}

export async function importCustomRingtone(file) {
  if (!file) throw new Error("Choose a ringtone file first.");

  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "ringtone");
  const extension = name.split(".").pop()?.toLowerCase();
  const isMp3 = type === "audio/mpeg" || extension === "mp3";
  const isMidi = ["mid", "midi"].includes(extension) || type.includes("midi");

  if (!isMp3 && !isMidi) throw new Error("Only MP3 and MIDI files can be used as custom ringtones.");
  if (file.size > MAX_RINGTONE_BYTES) throw new Error("Ringtone file is too large (max 8 MB).");

  const buffer = await file.arrayBuffer();
  const kind = isMp3 ? "mp3" : "midi";

  if (kind === "midi") parseMidi(buffer); // throws "Invalid MIDI file." before anything is stored

  await dbRun("readwrite", store => store.put({ buffer, name, type: kind }, RINGTONE_KEY));

  stopCustomRingtone();
  releaseRingtoneUrl();
  ringtone = { buffer, name, type: kind, url: null };
  settings.customRingtone = { name, type: kind };
  persist();
  return { name, type: kind };
}

export async function clearCustomRingtone() {
  try {
    await dbRun("readwrite", store => store.delete(RINGTONE_KEY));
  } catch (error) {
    console.warn("MissApp custom ringtone clear failed:", error);
  }
  stopCustomRingtone();
  releaseRingtoneUrl();
  ringtone = null;
  settings.customRingtone = null;
  persist();
}

export function stopCustomRingtone() {
  pendingSounds = pendingSounds.filter(item => !RING_SOUNDS.includes(item.name));

  if (midiLoopTimer) {
    clearTimeout(midiLoopTimer);
    midiLoopTimer = null;
  }
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
  if (customRingtoneAudio) {
    const audio = customRingtoneAudio;
    customRingtoneAudio = null;
    audio.pause();
    audio.currentTime = 0;
  }
  activeOscillators.forEach(osc => {
    try { osc.stop(); } catch {}
  });
  activeOscillators.clear();
}

/* ------------------------------------------------------------------ */
/* MP3 ringtone                                                        */
/* ------------------------------------------------------------------ */

function playMp3Ringtone(name) {
  if (!ringtone || ringtone.type !== "mp3") return false;

  // Already ringing: keep looping, don't restart
  if (customRingtoneAudio && !customRingtoneAudio.paused) return true;

  stopCustomRingtone();

  // Blob URL is created once and reused for every ring
  if (!ringtone.url) {
    ringtone.url = URL.createObjectURL(new Blob([ringtone.buffer], { type: "audio/mpeg" }));
  }

  const audio = new Audio(ringtone.url);
  audio.volume = settings.volume;
  audio.loop = true;
  customRingtoneAudio = audio;

  const fail = () => {
    if (customRingtoneAudio === audio) customRingtoneAudio = null;
    if (name) queueSound(name); // retry after the next user gesture
  };
  audio.addEventListener("error", fail, { once: true });
  audio.play().catch(fail);
  return true;
}

/* ------------------------------------------------------------------ */
/* MIDI ringtone                                                       */
/* ------------------------------------------------------------------ */

function readTag(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function parseMidi(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 14 || readTag(bytes, 0) !== "MThd") throw new Error("Invalid MIDI file.");

  const view = new DataView(buffer);
  const headerLength = view.getUint32(4);
  const trackCount = view.getUint16(10);
  const rawDivision = view.getUint16(12);
  const division = rawDivision & 0x8000 ? 480 : Math.max(1, rawDivision); // SMPTE timing not supported

  let offset = 8 + headerLength;
  let tempo = 500000; // microseconds per quarter note (120 BPM default)
  let tempoFound = false;
  const notes = [];

  for (let t = 0; t < trackCount && offset + 8 <= bytes.length; t++) {
    if (readTag(bytes, offset) !== "MTrk") break;

    const length = view.getUint32(offset + 4);
    let p = offset + 8;
    const end = Math.min(bytes.length, p + length);
    let tick = 0;
    let status = 0;
    const open = new Map();

    while (p < end) {
      let delta = 0;
      let b;
      do {
        b = bytes[p++];
        delta = (delta << 7) | (b & 0x7f);
      } while (b & 0x80 && p < end);
      tick += delta;
      if (p >= end) break;

      let type = bytes[p];
      if (type < 0x80) {
        if (!status) break; // data byte without running status: corrupt
        type = status;
      } else {
        p++;
        if (type < 0xf0) status = type;
      }

      if (type === 0xff || type === 0xf0 || type === 0xf7) {
        const metaType = type === 0xff ? bytes[p++] : null;
        let len = 0;
        let q;
        do {
          q = bytes[p++];
          len = (len << 7) | (q & 0x7f);
        } while (q & 0x80 && p < end);
        if (metaType === 0x51 && len === 3 && !tempoFound) {
          tempo = (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2];
          if (tempo > 0) tempoFound = true; else tempo = 500000;
        }
        p += len;
        continue;
      }

      const command = type & 0xf0;
      const channel = type & 0x0f;

      if (command === 0x90 || command === 0x80) {
        const note = bytes[p++];
        const velocity = bytes[p++];
        if (note === undefined || velocity === undefined) break;
        const key = channel * 128 + note;

        if (command === 0x90 && velocity > 0) {
          if (channel !== 9) { // channel 10 is percussion, which sounds wrong as sine tones
            open.set(key, notes.push({ tick, note, velocity, ticks: 0 }) - 1);
          }
        } else {
          const index = open.get(key);
          if (index !== undefined) {
            notes[index].ticks = tick - notes[index].tick;
            open.delete(key);
          }
        }
      } else if (command === 0xc0 || command === 0xd0) {
        p += 1;
      } else {
        p += 2;
      }
    }

    offset += 8 + length;
  }

  return { notes, secondsPerTick: tempo / 1e6 / division };
}

// Parsed once per ringtone, not on every ring
function buildMidiPlan(buffer) {
  const { notes, secondsPerTick } = parseMidi(buffer);
  notes.sort((a, b) => a.tick - b.tick);

  const plan = [];
  for (const n of notes) {
    const time = n.tick * secondsPerTick;
    if (time > MIDI_MAX_SECONDS || plan.length >= MIDI_MAX_NOTES) break;
    const duration = n.ticks > 0 ? Math.min(.6, Math.max(.08, n.ticks * secondsPerTick)) : .18;
    plan.push({ time, duration, frequency: 440 * 2 ** ((n.note - 69) / 12), velocity: n.velocity });
  }
  if (!plan.length) return null;

  const last = plan.reduce((max, n) => Math.max(max, n.time + n.duration), 0);
  return { notes: plan, loopMs: (last + 1.5) * 1000 };
}

function getMidiPlan() {
  if (!ringtone || ringtone.type !== "midi") return null;
  if (ringtone.plan === undefined) {
    try {
      ringtone.plan = buildMidiPlan(ringtone.buffer);
    } catch (error) {
      console.warn("MissApp MIDI ringtone could not be read:", error);
      ringtone.plan = null;
    }
  }
  return ringtone.plan;
}

function playMidiRingtone() {
  // Already looping: don't restart
  if (midiLoopTimer) return true;

  const plan = getMidiPlan();
  const ctx = getAudioContext();
  if (!plan || !ctx || ctx.state !== "running") return false;

  stopCustomRingtone();

  const playPass = () => {
    if (ctx.state === "running") {
      const now = ctx.currentTime;
      const base = Math.max(.01, settings.volume * .16);

      for (const n of plan.notes) {
        const start = now + n.time;
        const peak = base * (.5 + .5 * (n.velocity / 127));
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.value = n.frequency;
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + .01);
        gain.gain.exponentialRampToValueAtTime(.0001, start + n.duration);

        osc.connect(gain).connect(ctx.destination);
        activeOscillators.add(osc);
        osc.onended = () => {
          activeOscillators.delete(osc);
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(start);
        osc.stop(start + n.duration + .03);
      }
    }
    midiLoopTimer = setTimeout(playPass, plan.loopMs);
  };

  playPass();
  return true;
}

/* ------------------------------------------------------------------ */
/* Audio context / unlock                                              */
/* ------------------------------------------------------------------ */

const GESTURE_EVENTS = ["pointerdown", "click", "keydown", "touchstart"];
const GESTURE_OPTIONS = { capture: true, passive: true };
let gestureListenersAttached = false;

function unlockFromGesture() {
  resumeAudio();
}

function attachGestureListeners() {
  if (gestureListenersAttached || typeof document === "undefined") return;
  GESTURE_EVENTS.forEach(type => document.addEventListener(type, unlockFromGesture, GESTURE_OPTIONS));
  gestureListenersAttached = true;
}

// Once audio is running there's no reason to run a handler on every click/keypress
function detachGestureListeners() {
  if (!gestureListenersAttached) return;
  GESTURE_EVENTS.forEach(type => document.removeEventListener(type, unlockFromGesture, GESTURE_OPTIONS));
  gestureListenersAttached = false;
}

function getAudioContext() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;

  audioContext = new Ctx();
  audioContext.addEventListener?.("statechange", () => {
    audioUnlocked = audioContext.state === "running";
    if (audioUnlocked) detachGestureListeners();
    else attachGestureListeners();
  });
  return audioContext;
}

function queueSound(name) {
  const now = Date.now();
  pendingSounds = pendingSounds.filter(item => now - item.at < PENDING_TTL_MS && item.name !== name);
  pendingSounds.push({ name, at: now });
  if (pendingSounds.length > PENDING_MAX) pendingSounds.shift();
}

function flushPending() {
  if (!pendingSounds.length) return;
  const now = Date.now();
  const queued = pendingSounds.splice(0).filter(item => now - item.at < PENDING_TTL_MS); // drop stale sounds
  queued.forEach(item => playSound(item.name));
}

async function resumeAudio() {
  const ctx = getAudioContext();
  if (!ctx) return false;

  if (!resumePromise) {
    const promise = Promise.resolve()
      .then(() => (ctx.state !== "running" ? ctx.resume() : undefined))
      .catch(error => console.warn("MissApp audio resume failed:", error))
      .then(() => ctx.state === "running");
    resumePromise = promise;
    promise.then(() => {
      if (resumePromise === promise) resumePromise = null;
    });
  }

  const ok = await resumePromise;
  audioUnlocked = ok;
  if (ok) {
    detachGestureListeners();
    flushPending();
  }
  return ok;
}

export async function unlockAudio() {
  return resumeAudio();
}

/* ------------------------------------------------------------------ */
/* Playback                                                            */
/* ------------------------------------------------------------------ */

function tone(ctx, frequency, duration = .1, offset = 0) {
  const now = ctx.currentTime + offset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, now);

  const peak = Math.max(.02, settings.volume * .32);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  osc.start(now);
  osc.stop(now + duration + .03);
}

function shouldPlay(name) {
  if (!settings.enabled || settings.volume <= 0 || settings[name] === false) return false;
  if (settings.doNotDisturb && DND_MUTED.includes(name)) return false;
  return true;
}

export function playSound(name) {
  if (!shouldPlay(name)) return false;

  const isRing = RING_SOUNDS.includes(name);

  if (isRing && ringtone?.type === "mp3") return playMp3Ringtone(name);

  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") {
    queueSound(name);
    return false;
  }

  if (isRing && ringtone?.type === "midi" && getMidiPlan()) return playMidiRingtone();

  const pattern = patterns[settings.soundType]?.[name] || patterns.classic[name];
  if (!pattern) return false;

  pattern.forEach(([frequency, duration, offset]) => tone(ctx, frequency, duration, offset));
  return true;
}

export async function previewCustomRingtone() {
  stopCustomRingtone();
  await loadCustomRingtone();
  if (!ringtone) return false;

  await resumeAudio();
  stopCustomRingtone(); // guard against overlapping preview calls

  const started = ringtone.type === "mp3" ? playMp3Ringtone(null) : playMidiRingtone();
  if (started) previewTimer = setTimeout(stopCustomRingtone, PREVIEW_MS);
  return started;
}

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

loadCustomRingtone();
attachGestureListeners();

window.addEventListener("pageshow", () => {
  if (!audioContext || audioContext.state !== "running") attachGestureListeners();
  if (audioContext) resumeAudio();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (!audioContext || audioContext.state !== "running") attachGestureListeners();
  if (audioContext) resumeAudio();
});
window.addEventListener("pagehide", flushPersist);
window.addEventListener("beforeunload", flushPersist);
