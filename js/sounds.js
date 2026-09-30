const STORAGE_KEY = "missapp.soundSettings";

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

let settings = loadSettings();
let audioContext = null;
let audioUnlocked = false;
let pendingSounds = [];
let customRingtoneUrl = null;
let customRingtoneBuffer = null;
let customRingtoneName = "";
let customRingtoneType = "";

const RINGTONE_DB = "missapp-ringtones";
const RINGTONE_STORE = "files";

function openRingtoneDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RINGTONE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(RINGTONE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadCustomRingtone() {
  if (customRingtoneBuffer) return;
  try {
    const db = await openRingtoneDb();
    const data = await new Promise((resolve, reject) => {
      const tx = db.transaction(RINGTONE_STORE, "readonly");
      const request = tx.objectStore(RINGTONE_STORE).get("custom");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!data?.buffer) return;
    customRingtoneBuffer = data.buffer;
    customRingtoneName = data.name || "Custom ringtone";
    customRingtoneType = data.type || "";
    settings.customRingtone = { name: customRingtoneName, type: customRingtoneType };
  } catch (error) {
    console.warn("MissApp custom ringtone load failed:", error);
  }
}

export async function importCustomRingtone(file) {
  if (!file) throw new Error("Choose a ringtone file first.");
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "ringtone");
  const extension = name.split(".").pop()?.toLowerCase();
  const isMp3 = type === "audio/mpeg" || extension === "mp3";
  const isMidi = ["mid", "midi"].includes(extension) || type.includes("midi");
  if (!isMp3 && !isMidi) throw new Error("Only MP3 and MIDI files can be used as custom ringtones.");
  const buffer = await file.arrayBuffer();
  const db = await openRingtoneDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(RINGTONE_STORE, "readwrite");
    tx.objectStore(RINGTONE_STORE).put({ buffer, name, type: isMp3 ? "mp3" : "midi" }, "custom");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  customRingtoneBuffer = buffer;
  customRingtoneName = name;
  customRingtoneType = isMp3 ? "mp3" : "midi";
  settings.customRingtone = { name, type: customRingtoneType };
  persist();
  return { name, type: customRingtoneType };
}

export async function clearCustomRingtone() {
  try {
    const db = await openRingtoneDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(RINGTONE_STORE, "readwrite");
      tx.objectStore(RINGTONE_STORE).delete("custom");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    console.warn("MissApp custom ringtone clear failed:", error);
  }
  if (customRingtoneUrl) URL.revokeObjectURL(customRingtoneUrl);
  customRingtoneUrl = null;
  customRingtoneBuffer = null;
  customRingtoneName = "";
  customRingtoneType = "";
  settings.customRingtone = null;
  persist();
}

function playMp3Ringtone() {
  if (!customRingtoneBuffer) return false;
  if (customRingtoneUrl) URL.revokeObjectURL(customRingtoneUrl);
  const blob = new Blob([customRingtoneBuffer], { type: "audio/mpeg" });
  customRingtoneUrl = URL.createObjectURL(blob);
  const audio = new Audio(customRingtoneUrl);
  audio.volume = settings.volume;
  audio.loop = false;
  audio.play().catch(() => {});
  audio.addEventListener("ended", () => URL.revokeObjectURL(customRingtoneUrl), { once: true });
  return true;
}

function readMidiEvents(buffer) {
  const bytes = new Uint8Array(buffer);
  const text = String.fromCharCode(...bytes.slice(0, 4));
  if (text !== "MThd") throw new Error("Invalid MIDI file.");
  const view = new DataView(buffer);
  const tracks = view.getUint16(10);
  const division = view.getUint16(12);
  let offset = 14;
  const events = [];
  for (let track = 0; track < tracks; track++) {
    if (String.fromCharCode(...bytes.slice(offset, offset + 4)) !== "MTrk") break;
    const length = view.getUint32(offset + 4);
    let p = offset + 8;
    const end = p + length;
    let tick = 0;
    let status = 0;
    while (p < end) {
      let delta = 0, b;
      do { b = bytes[p++]; delta = (delta << 7) | (b & 0x7f); } while (b & 0x80 && p < end);
      tick += delta;
      let type = bytes[p];
      if (type < 0x80) type = status; else { p++; status = type; }
      const command = type & 0xf0;
      if (command === 0x90 || command === 0x80) {
        const note = bytes[p++];
        const velocity = bytes[p++];
        if (command === 0x90 && velocity) events.push({ tick, note, velocity, on: true });
        else events.push({ tick, note, velocity, on: false });
      } else if (command === 0xa0 || command === 0xb0 || command === 0xe0) p += 2;
      else if (command === 0xc0 || command === 0xd0) p += 1;
      else if (type === 0xff) { const meta = bytes[p++]; let len = 0, q; do { q = bytes[p++]; len = (len << 7) | (q & 0x7f); } while (q & 0x80); p += len; }
      else if (type === 0xf0 || type === 0xf7) { let len = 0, q; do { q = bytes[p++]; len = (len << 7) | (q & 0x7f); } while (q & 0x80); p += len; }
      else break;
    }
    offset = end;
  }
  return { events, division: division & 0x7fff };
}

function playMidiRingtone() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running" || !customRingtoneBuffer) return false;
  try {
    const midi = readMidiEvents(customRingtoneBuffer);
    const now = ctx.currentTime;
    const secondsPerTick = 0.5 / Math.max(1, midi.division);
    midi.events.slice(0, 250).forEach(event => {
      const time = now + Math.min(8, event.tick * secondsPerTick);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 440 * Math.pow(2, (event.note - 69) / 12);
      const duration = 0.18;
      gain.gain.setValueAtTime(event.on ? Math.max(.01, settings.volume * .16) : .0001, time);
      gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(time);
      osc.stop(time + duration + .03);
    });
    return true;
  } catch (error) {
    console.warn("MissApp MIDI ringtone playback failed:", error);
    return false;
  }
}

loadCustomRingtone();

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...defaults };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function getAudioContext() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioContext = new Ctx();
  audioContext.addEventListener?.("statechange", () => {
    audioUnlocked = audioContext.state === "running";
  });
  return audioContext;
}

async function resumeAudio() {
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state !== "running") await ctx.resume();
    audioUnlocked = ctx.state === "running";
    if (audioUnlocked && pendingSounds.length) {
      const queued = pendingSounds.splice(0);
      queued.forEach(name => playSound(name));
    }
    return audioUnlocked;
  } catch (error) {
    audioUnlocked = false;
    console.warn("MissApp audio resume failed:", error);
    return false;
  }
}

export async function unlockAudio() {
  return resumeAudio();
}

function tone(frequency, duration = .1, offset = 0) {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return false;

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
  osc.start(now);
  osc.stop(now + duration + .03);
  return true;
}

export const soundTypes = {
  classic: { name: "Classic", description: "Clean notification tones" },
  soft: { name: "Soft", description: "Gentle, rounded tones" },
  pop: { name: "Pop", description: "Bright and playful" },
  pulse: { name: "Pulse", description: "Modern digital tones" },
  retro: { name: "Retro", description: "Old-school electronic" }
};

export function playSound(name) {
  if (!settings.enabled || settings.volume <= 0 || settings[name] === false) return false;
  if (settings.doNotDisturb && ["messageReceived", "incomingCall", "callRinging", "status"].includes(name)) return false;
  if ((name === "incomingCall" || name === "callRinging") && customRingtoneBuffer) {
    if (customRingtoneType === "mp3") return playMp3Ringtone();
    if (customRingtoneType === "midi") return playMidiRingtone();
  }

  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") {
    if (pendingSounds.length < 3) pendingSounds.push(name);
    return false;
  }

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

  const pattern = patterns[settings.soundType]?.[name] || patterns.classic[name];
  if (!pattern) return false;

  pattern.forEach(x => tone(...x));
  return true;
}

export function getSoundSettings() {
  return { ...settings };
}

export function updateSoundSettings(patch = {}) {
  settings = { ...settings, ...patch };
  persist();
  return getSoundSettings();
}

export function isDoNotDisturb() {
  return Boolean(settings.doNotDisturb);
}

export function resetSoundSettings() {
  settings = { ...defaults };
  persist();
  return getSoundSettings();
}

const unlockFromGesture = () => {
  unlockAudio();
};

document.addEventListener("click", unlockFromGesture, { capture: true });
document.addEventListener("pointerdown", unlockFromGesture, { capture: true, passive: true });
window.addEventListener("pageshow", () => unlockAudio());
document.addEventListener("keydown", unlockFromGesture, { capture: true });
document.addEventListener("touchstart", unlockFromGesture, { capture: true, passive: true });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) unlockAudio();
});
