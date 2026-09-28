const STORAGE_KEY = "missapp.soundSettings";

const defaults = { enabled:true, volume:0.7, messageSent:true, messageReceived:true, incomingCall:true, callConnected:true, status:true };
let settings = loadSettings();
let audioContext = null;

function loadSettings() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
  catch { return { ...defaults }; }
}
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
function getAudioContext() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioContext = new Ctx();
  return audioContext;
}
export async function unlockAudio() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try { if (ctx.state !== "running") await ctx.resume(); return ctx.state === "running"; }
  catch { return false; }
}
function tone(frequency, duration=.1, offset=0) {
  const ctx=getAudioContext();
  if (!ctx || ctx.state !== "running") return false;
  const now=ctx.currentTime+offset, osc=ctx.createOscillator(), gain=ctx.createGain();
  osc.type="sine"; osc.frequency.setValueAtTime(frequency,now);
  const peak=Math.max(.02, settings.volume*.32);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(peak,now+.015);
  gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
  osc.connect(gain).connect(ctx.destination); osc.start(now); osc.stop(now+duration+.03);
  return true;
}
export function playSound(name) {
  if (!settings.enabled || settings.volume<=0 || settings[name]===false) return false;
  const ctx=getAudioContext();
  if (!ctx || ctx.state!=="running") return false;
  const patterns={
    messageSent:[[620,.09,0],[820,.1,.07]],
    messageReceived:[[520,.11,0],[690,.14,.08]],
    incomingCall:[[740,.2,0],[920,.2,.23],[740,.2,.46]],
    callConnected:[[540,.1,0],[720,.12,.1]],
    status:[[460,.1,0],[610,.12,.1]]
  };
  const pattern=patterns[name];
  if (!pattern) return false;
  pattern.forEach(x=>tone(...x));
  return true;
}
export function getSoundSettings(){ return {...settings}; }
export function updateSoundSettings(patch={}){ settings={...settings,...patch}; persist(); return getSoundSettings(); }
export function resetSoundSettings(){ settings={...defaults}; persist(); return getSoundSettings(); }
document.addEventListener("click",()=>{unlockAudio();},{once:true,capture:true});
document.addEventListener("keydown",()=>{unlockAudio();},{once:true,capture:true});
