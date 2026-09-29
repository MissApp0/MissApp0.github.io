/* MissApp group calls — small-group star topology over WebRTC.
   For larger production calls, an SFU is preferable; this keeps the current
   Firebase/WebRTC architecture dependency-free and practical for small groups. */
import { auth, db } from "./firebase.js";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  serverTimestamp, query, where, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { turnConfig } from "./config.js";
import { playSound } from "./sounds.js";

let incomingUnsubscribe = null;
let active = null;

const rtcConfig = {
  iceServers: Array.isArray(turnConfig?.urls) && turnConfig.urls.length
    ? [{ urls: turnConfig.urls, username: turnConfig.username || undefined, credential: turnConfig.credential || undefined }]
    : []
};

export function initGroupCalls() {
  if (!auth.currentUser) return;
  incomingUnsubscribe?.();
  const q = query(collection(db, "groupCalls"), where("participants", "array-contains", auth.currentUser.uid));
  incomingUnsubscribe = onSnapshot(q, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (!["added", "modified"].includes(change.type)) return;
      const call = { id: change.doc.id, ...change.doc.data() };
      if (call.caller !== auth.currentUser.uid && call.status === "ringing" && !active) {
        playSound("incomingCall");
        showIncoming(call);
      }
    });
  }, error => console.error("Group call listener error:", error));
}

async function media(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera and microphone are unavailable.");
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } : false
  });
}

export async function startGroupCall({ participantIds, participantData = {}, groupName = "Group", video = false }) {
  if (!auth.currentUser) throw new Error("You must be logged in.");
  if (!participantIds?.length) throw new Error("This group has no other participants.");
  if (!window.isSecureContext) throw new Error("Group calls require HTTPS.");
  if (active) throw new Error("A call is already active.");

  const stream = await media(video);
  const caller = auth.currentUser.uid;
  const participants = [caller, ...new Set(participantIds.filter(Boolean))];
  const callRef = doc(collection(db, "groupCalls"));
  const call = {
    id: callRef.id,
    caller,
    callerName: auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "User",
    participants,
    participantData,
    groupName,
    type: video ? "video" : "voice",
    status: "ringing",
    createdAt: serverTimestamp()
  };

  await setDoc(callRef, call);
  active = { ...call, stream, peers: new Map(), remoteStreams: new Map(), unsubscribers: [], role: "caller" };
  showScreen(active);

  for (const uid of participants.slice(1)) await createCallerPeer(uid);
}

async function createCallerPeer(uid) {
  if (!active) return;
  const callId = active.id;
  const peer = new RTCPeerConnection(rtcConfig);
  active.peers.set(uid, peer);
  active.stream.getTracks().forEach(track => peer.addTrack(track, active.stream));

  const remoteStream = new MediaStream();
  active.remoteStreams.set(uid, remoteStream);
  peer.ontrack = event => {
    event.streams[0]?.getTracks().forEach(track => remoteStream.addTrack(track));
    attachRemote(uid, remoteStream, active.participantData?.[uid]);
  };
  peer.onicecandidate = async event => {
    if (!event.candidate) return;
    await addDoc(collection(db, "groupCalls", callId, "candidates", route(active.caller, uid), "items"), event.candidate.toJSON());
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await setDoc(doc(db, "groupCalls", callId, "offers", uid), {
    type: offer.type, sdp: offer.sdp
  });

  const answerUnsub = onSnapshot(doc(db, "groupCalls", callId, "answers", uid), async snapshot => {
    const data = snapshot.data();
    if (!data || peer.currentRemoteDescription) return;
    try {
      await peer.setRemoteDescription(new RTCSessionDescription(data));
      await flushCandidates(callId, route(uid, active.caller), peer);
    } catch (error) {
      console.error("Group call answer error:", error);
    }
  });

  const candidateUnsub = onSnapshot(
    collection(db, "groupCalls", callId, "candidates", route(uid, active.caller), "items"),
    snapshot => snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        peer.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
      }
    })
  );

  active.unsubscribers.push(answerUnsub, candidateUnsub);
}

async function waitForGroupOffer(callId, uid, attempts = 12, delayMs = 500) {
  const offerRef = doc(db, "groupCalls", callId, "offers", uid);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snapshot = await getDoc(offerRef);
    if (snapshot.exists()) return snapshot;
    if (attempt < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

async function answerGroupCall(call) {
  if (active || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const offerSnapshot = await waitForGroupOffer(call.id, uid);
  if (!offerSnapshot) throw new Error("The group call offer is not available yet. Please try accepting again.");

  const stream = await media(call.type === "video");
  const peer = new RTCPeerConnection(rtcConfig);
  stream.getTracks().forEach(track => peer.addTrack(track, stream));

  const remoteStream = new MediaStream();
  peer.ontrack = event => {
    event.streams[0]?.getTracks().forEach(track => remoteStream.addTrack(track));
    attachRemote(call.caller, remoteStream, call.participantData?.[call.caller]);
  };
  peer.onicecandidate = async event => {
    if (!event.candidate) return;
    await addDoc(collection(db, "groupCalls", call.id, "candidates", route(uid, call.caller), "items"), event.candidate.toJSON());
  };

  await peer.setRemoteDescription(new RTCSessionDescription(offerSnapshot.data()));
  await flushCandidates(call.id, route(call.caller, uid), peer);

  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  await setDoc(doc(db, "groupCalls", call.id, "answers", uid), {
    type: answer.type, sdp: answer.sdp
  });

  active = {
    ...call,
    stream,
    peers: new Map([[call.caller, peer]]),
    remoteStreams: new Map([[call.caller, remoteStream]]),
    unsubscribers: [],
    role: "callee"
  };

  const stateUnsub = onSnapshot(doc(db, "groupCalls", call.id), snapshot => {
    const data = snapshot.data();
    if (!data || ["ended", "declined"].includes(data.status)) endGroupCall(false);
  });
  const candidateUnsub = onSnapshot(
    collection(db, "groupCalls", call.id, "candidates", route(call.caller, uid), "items"),
    snapshot => snapshot.docChanges().forEach(change => {
      if (change.type === "added") peer.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
    })
  );
  active.unsubscribers.push(stateUnsub, candidateUnsub);

  hideIncoming();
  showScreen(active);
}

async function flushCandidates(callId, routeId, peer) {
  const snapshot = await getDocs(collection(db, "groupCalls", callId, "candidates", routeId, "items"));
  for (const item of snapshot.docs) {
    await peer.addIceCandidate(new RTCIceCandidate(item.data())).catch(() => {});
  }
}

function route(from, to) {
  return [from, to].join("_");
}

function attachRemote(uid, stream, data) {
  const screen = document.getElementById("group-active-call");
  if (!screen) return;
  let tile = screen.querySelector(`[data-peer="${uid}"]`);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "group-call-tile-wrap";
    tile.dataset.peer = uid;
    tile.innerHTML = `<video class="group-call-tile" autoplay playsinline></video><div class="group-call-tile-name"></div>`;
    tile.querySelector(".group-call-tile-name").textContent =
      data?.displayName || data?.username || "Participant";
    screen.querySelector(".group-call-grid")?.appendChild(tile);
  }
  tile.querySelector("video").srcObject = stream;
}

function showScreen(call) {
  document.getElementById("group-active-call")?.remove();
  const screen = document.createElement("div");
  screen.id = "group-active-call";
  screen.className = "group-active-call";
  screen.innerHTML = `
    <div class="group-call-topbar"><strong></strong><span id="group-call-status">Calling…</span></div>
    <div class="group-call-grid">
      <div class="group-call-tile-wrap local-wrap"><video class="group-call-tile local" autoplay muted playsinline></video><div class="group-call-tile-name">You</div></div>
    </div>
    <div class="group-call-controls">
      <button id="group-mic" class="call-control" title="Mute microphone">🎙</button>
      ${call.type === "video" ? '<button id="group-camera" class="call-control" title="Camera">📹</button>' : ""}
      <button id="group-end" class="call-control end" title="End call">☎</button>
    </div>`;
  screen.querySelector("strong").textContent = call.groupName || "Group call";
  document.body.appendChild(screen);
  screen.querySelector(".local").srcObject = call.stream;
  screen.querySelector("#group-end").onclick = () => endGroupCall(true);
  screen.querySelector("#group-mic").onclick = event => {
    const track = call.stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    event.currentTarget.classList.toggle("off", !track.enabled);
  };
  screen.querySelector("#group-camera")?.addEventListener("click", event => {
    const track = call.stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    event.currentTarget.classList.toggle("off", !track.enabled);
  });
}

function showIncoming(call) {
  document.getElementById("group-incoming")?.remove();
  const modal = document.createElement("div");
  modal.id = "group-incoming";
  modal.className = "call-modal";
  modal.innerHTML = `
    <div class="incoming-call-card">
      <div class="call-avatar">👥</div>
      <div class="incoming-call-name"></div>
      <div class="incoming-call-type">Incoming group call</div>
      <div class="incoming-call-actions"><button id="group-decline" class="call-action decline">✕</button><button id="group-accept" class="call-action accept">✓</button></div>
    </div>`;
  modal.querySelector(".incoming-call-name").textContent = call.groupName || "Group call";
  document.body.appendChild(modal);
  modal.querySelector("#group-decline").onclick = () => declineGroup(call.id);
  modal.querySelector("#group-accept").onclick = async () => {
    try { await answerGroupCall(call); }
    catch (error) { console.error(error); alert(error.message || "Could not join the group call."); await declineGroup(call.id); }
  };
}

async function declineGroup(callId) {
  try {
    await setDoc(doc(db, "groupCalls", callId, "declinedBy", auth.currentUser.uid), {
      at: serverTimestamp()
    });
  } catch {}
  hideIncoming();
}

export async function endGroupCall(notify = true) {
  const call = active;
  if (!call) return;
  active = null;
  if (notify) {
    try { await updateDoc(doc(db, "groupCalls", call.id), { status: "ended", endedAt: serverTimestamp() }); } catch {}
  }
  call.unsubscribers?.forEach(unsubscribe => unsubscribe());
  call.peers?.forEach(peer => peer.close());
  call.stream?.getTracks().forEach(track => track.stop());
  document.getElementById("group-active-call")?.remove();
}

function hideIncoming() {
  document.getElementById("group-incoming")?.remove();
}
