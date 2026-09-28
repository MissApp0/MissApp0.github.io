const STORAGE_KEY = "missapp.soundSettings";

const defaults = {
  enabled: true,
  volume: 0.55,
  messageSent: true,
  messageReceived: true,
  incomingCall: true,
  callConnected: true,
  status: true
};

let settings = loadSettings();
let audioContext = null;

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

function ensureAudio() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(frequency, duration = 0.09, offset = 0, type = "sine") {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime + offset;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, settings.volume * 0.16), now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

export function playSound(name) {
  if (!settings.enabled || settings.volume <= 0) return;
  if (settings[name] === false) return;

  switch (name) {
    case "messageSent":
      tone(620, 0.07, 0, "sine");
      tone(820, 0.08, 0.06, "sine");
      break;
    case "messageReceived":
      tone(520, 0.09, 0, "sine");
      tone(690, 0.12, 0.07, "sine");
      break;
    case "incomingCall":
      tone(740, 0.18, 0, "sine");
      tone(920, 0.18, 0.22, "sine");
      tone(740, 0.18, 0.44, "sine");
      break;
    case "callConnected":
      tone(540, 0.08, 0, "sine");
      tone(720, 0.1, 0.08, "sine");
      break;
    case "status":
      tone(460, 0.08, 0, "sine");
      tone(610, 0.1, 0.08, "sine");
      break;
  }
}

export function getSoundSettings() {
  return { ...settings };
}

export function updateSoundSettings(patch = {}) {
  settings = { ...settings, ...patch };
  persist();
  return getSoundSettings();
}

export function resetSoundSettings() {
  settings = { ...defaults };
  persist();
  return getSoundSettings();
}

export function openAudio() {
  ensureAudio();
}

window.addEventListener("pointerdown", openAudio, { once: true, passive: true });
