/* MissApp group calls — small-group star topology over WebRTC.
   For larger production calls, an SFU is preferable; this keeps the current
   Firebase/WebRTC architecture dependency-free and practical for small groups. */
import { auth, db } from "./firebase.js";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  serverTimestamp, query, where, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { turnConfig } from "./config.js";
import { playSound } from "./sounds.js";

let incomingUnsubscribe = null;
let active = null;

const stunServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" }
];

const turnServers = Array.isArray(turnConfig?.urls) && turnConfig.urls.length
  ? [{
      urls: turnConfig.urls,
      username: turnConfig.username || undefined,
      credential: turnConfig.credential || undefined
    }]
  : [];

const rtcConfig = {
  iceServers: [...stunServers, ...turnServers],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceTransportPolicy: "all"
};

export function initGroupCalls() {
  if (!auth.currentUser) return;

  incomingUnsubscribe?.();
  incomingUnsubscribe = null;

  const uid = auth.currentUser.uid;
  const callsRef = collection(db, "groupCalls");
  const q = query(callsRef, where("participants", "array-contains", uid));

  incomingUnsubscribe = onSnapshot(
    q,
    snapshot => {
      snapshot.docChanges().forEach(change => {
        if (!["added", "modified"].includes(change.type)) return;

        const call = { id: change.doc.id, ...change.doc.data() };

        if (
          call.caller !== uid &&
          call.status === "ringing" &&
          Array.isArray(call.participants) &&
          call.participants.includes(uid) &&
          !active
        ) {
          playSound("incomingCall");
          showIncoming(call);
        }
      });
    },
    error => {
      console.error("Group call listener error:", error);
      window.MissApp?.showToast?.(
        "Group calls cannot receive invitations. Check Firestore permissions.",
        "error"
      );
    }
  );

  return incomingUnsubscribe;
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

  const caller = auth.currentUser.uid;
  const participants = [caller, ...new Set(participantIds.filter(uid => uid && uid !== caller))];

  if (participants.length < 3) throw new Error("Group calls need at least three participants.");
  if (participants.length > 25) throw new Error("Groups are limited to 25 participants.");

  const stream = await media(video);
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

  try {
    await setDoc(callRef, call);

    console.info("Group call invitation created:", {
      callId: callRef.id,
      participants,
      caller
    });

    active = { ...call, stream, peers: new Map(), remoteStreams: new Map(), unsubscribers: [], role: "caller" };
    const stateUnsub = onSnapshot(doc(db, "groupCalls", call.id), snapshot => {
      const data = snapshot.data();
      if (!data || ["ended", "declined"].includes(data.status)) endGroupCall(false);
    });
    active.unsubscribers.push(stateUnsub);
    showScreen(active);
    await setupGroupMesh();
    return active;
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    throw error;
  }
}

async function setupGroupMesh() {
  if (!active || !auth.currentUser) return;

  const uid = auth.currentUser.uid;
  for (const remoteUid of active.participants) {
    if (!remoteUid || remoteUid === uid) continue;

    // One deterministic initiator per pair prevents offer collisions.
    try {
      if (uid < remoteUid) {
        await createMeshOffer(remoteUid);
      } else {
        await listenForMeshOffer(remoteUid);
      }
    } catch (error) {
      console.error("Group call peer setup failed:", remoteUid, error);
    }
  }
}

function pairId(a, b) {
  return [a, b].sort().join("_");
}

async function createMeshOffer(remoteUid) {
  if (!active || active.peers.has(remoteUid)) return;

  const uid = auth.currentUser.uid;
  const callId = active.id;
  const peer = new RTCPeerConnection(rtcConfig);
  active.peers.set(remoteUid, peer);

  active.stream.getTracks().forEach(track => peer.addTrack(track, active.stream));

  const remoteStream = new MediaStream();
  active.remoteStreams.set(remoteUid, remoteStream);
  peer.ontrack = event => {
    event.streams[0]?.getTracks().forEach(track => remoteStream.addTrack(track));
    attachRemote(remoteUid, remoteStream, active.participantData?.[remoteUid]);
  };

  peer.onconnectionstatechange = () => {
    console.info("Group peer connection:", remoteUid, peer.connectionState);
    const status = document.getElementById("group-call-status");
    if (status) status.textContent =
      peer.connectionState === "connected" ? "Connected" :
      peer.connectionState === "connecting" ? "Connecting…" :
      peer.connectionState === "failed" ? "Connection failed" :
      peer.connectionState === "disconnected" ? "Disconnected" : "Calling…";
  };
  peer.oniceconnectionstatechange = () => {
    console.info("Group ICE:", remoteUid, peer.iceConnectionState);
  };
  peer.onicegatheringstatechange = () => {
    console.info("Group ICE gathering:", remoteUid, peer.iceGatheringState);
  };

  peer.onicecandidate = async event => {
    if (!event.candidate) return;
    try {
      await addDoc(
        collection(db, "groupCalls", callId, "candidates", route(uid, remoteUid), "items"),
        event.candidate.toJSON()
      );
    } catch (error) {
      console.error("Group call candidate write error:", error);
    }
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  const signal = {
    from: uid,
    to: remoteUid,
    type: offer.type,
    sdp: offer.sdp
  };

  try {
    await setDoc(doc(db, "groupCalls", callId, "offers", pairId(uid, remoteUid)), signal);
  } catch (error) {
    peer.close();
    active.peers.delete(remoteUid);
    active.remoteStreams.delete(remoteUid);
    console.error("Group call offer write failed:", remoteUid, error);
    throw error;
  }

  const answerUnsub = onSnapshot(
    doc(db, "groupCalls", callId, "answers", pairId(uid, remoteUid)),
    async snapshot => {
      const data = snapshot.data();
      if (!data || peer.currentRemoteDescription) return;
      try {
        await peer.setRemoteDescription(new RTCSessionDescription(data));
        await flushCandidates(callId, route(remoteUid, uid), peer);
      } catch (error) {
        console.error("Group call answer error:", error);
      }
    }
  );

  const candidateUnsub = onSnapshot(
    collection(db, "groupCalls", callId, "candidates", route(remoteUid, uid), "items"),
    snapshot => snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        peer.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
      }
    })
  );

  active.unsubscribers.push(answerUnsub, candidateUnsub);
}

async function listenForMeshOffer(remoteUid) {
  if (!active || active.peers.has(remoteUid)) return;

  const uid = auth.currentUser.uid;
  const callId = active.id;
  const offerRef = doc(db, "groupCalls", callId, "offers", pairId(uid, remoteUid));

  const offerUnsub = onSnapshot(offerRef, async snapshot => {
    const data = snapshot.data();
    if (!data || data.from !== remoteUid || data.to !== uid || active.peers.has(remoteUid)) return;

    const peer = new RTCPeerConnection(rtcConfig);
    active.peers.set(remoteUid, peer);
    active.stream.getTracks().forEach(track => peer.addTrack(track, active.stream));

    const remoteStream = new MediaStream();
    active.remoteStreams.set(remoteUid, remoteStream);
    peer.ontrack = event => {
      event.streams[0]?.getTracks().forEach(track => remoteStream.addTrack(track));
      attachRemote(remoteUid, remoteStream, active.participantData?.[remoteUid]);
    };

    peer.onconnectionstatechange = () => {
      console.info("Group peer connection:", remoteUid, peer.connectionState);
      const status = document.getElementById("group-call-status");
      if (status) status.textContent =
        peer.connectionState === "connected" ? "Connected" :
        peer.connectionState === "connecting" ? "Connecting…" :
        peer.connectionState === "failed" ? "Connection failed" :
        peer.connectionState === "disconnected" ? "Disconnected" : "Calling…";
    };
    peer.oniceconnectionstatechange = () => {
      console.info("Group ICE:", remoteUid, peer.iceConnectionState);
    };

    peer.onicecandidate = async event => {
      if (!event.candidate) return;
      try {
        await addDoc(
          collection(db, "groupCalls", callId, "candidates", route(uid, remoteUid), "items"),
          event.candidate.toJSON()
        );
      } catch (error) {
        console.error("Group call candidate write error:", error);
      }
    };

    try {
      await peer.setRemoteDescription(new RTCSessionDescription(data));
      await flushCandidates(callId, route(remoteUid, uid), peer);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      await setDoc(doc(db, "groupCalls", callId, "answers", pairId(uid, remoteUid)), {
        from: uid,
        to: remoteUid,
        type: answer.type,
        sdp: answer.sdp
      });
    } catch (error) {
      active.peers.delete(remoteUid);
      active.remoteStreams.delete(remoteUid);
      peer.close();
      console.error("Group call offer handling error:", error);
    }

    const candidateUnsub = onSnapshot(
      collection(db, "groupCalls", callId, "candidates", route(remoteUid, uid), "items"),
      snapshot => snapshot.docChanges().forEach(change => {
        if (change.type === "added") {
          peer.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
        }
      })
    );
    active.unsubscribers.push(candidateUnsub);
  });

  active.unsubscribers.push(offerUnsub);
}

async function waitForGroupOffer(callId, uid, attempts = 20, delayMs = 500) {
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

  const stream = await media(call.type === "video");

  active = {
    ...call,
    stream,
    peers: new Map(),
    remoteStreams: new Map(),
    unsubscribers: [],
    role: "callee"
  };

  const stateUnsub = onSnapshot(doc(db, "groupCalls", call.id), snapshot => {
    const data = snapshot.data();
    if (!data || ["ended", "declined"].includes(data.status)) endGroupCall(false);
  });
  active.unsubscribers.push(stateUnsub);

  hideIncoming();
  showScreen(active);

  try {
    await setupGroupMesh();
  } catch (error) {
    console.error("Group call mesh setup error:", error);
  }
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

async function replaceGroupVideoTrack(call, newTrack) {
  const old = call.stream.getVideoTracks()[0];
  for (const peer of call.peers.values()) {
    const sender = peer.getSenders().find(item => item.track?.kind === "video");
    if (sender) await sender.replaceTrack(newTrack);
  }
  if (old && old !== newTrack) old.stop();
  if (old) call.stream.removeTrack(old);
  call.stream.addTrack(newTrack);
  const local = document.querySelector("#group-active-call .local");
  if (local) local.srcObject = call.stream;
}
async function switchGroupCamera() {
  const call = active;
  if (!call?.stream?.getVideoTracks().length) return;
  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
  if (cameras.length < 2) return;
  const current = call.stream.getVideoTracks()[0].getSettings?.().deviceId;
  const next = cameras.find(d => d.deviceId !== current) || cameras[0];
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: next.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  await replaceGroupVideoTrack(call, stream.getVideoTracks()[0]);
}
async function toggleGroupScreenShare() {
  const call = active;
  if (!call || !navigator.mediaDevices?.getDisplayMedia) return;
  if (call.screenTrack) {
    await replaceGroupVideoTrack(call, call.cameraTrack);
    call.screenTrack.stop();
    call.screenTrack = null;
    return;
  }
  const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  const screenTrack = display.getVideoTracks()[0];
  call.cameraTrack = call.stream.getVideoTracks()[0];
  call.screenTrack = screenTrack;
  await replaceGroupVideoTrack(call, screenTrack);
  screenTrack.onended = () => { if (active?.id === call.id) toggleGroupScreenShare().catch(() => {}); };
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
      ${call.type === "video" ? '<button id="group-camera" class="call-control" title="Camera">📹</button><button id="group-switch-camera" class="call-control" title="Switch camera">🔄</button><button id="group-share-screen" class="call-control" title="Share screen">🖥</button>' : ""}
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
  screen.querySelector("#group-switch-camera")?.addEventListener("click", () => switchGroupCamera().catch(error => console.error("Group camera switch error:", error)));
  screen.querySelector("#group-share-screen")?.addEventListener("click", () => toggleGroupScreenShare().catch(error => console.error("Group screen share error:", error)));
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
  try {
    const callSnapshot = await getDoc(doc(db, "groupCalls", call.id));
    const callData = callSnapshot.exists() ? callSnapshot.data() : {};
    const messageId = call.messageId || callData.messageId;
    const conversationId = call.conversationId || callData.conversationId;
    if (messageId && conversationId) {
      await deleteDoc(doc(db, "conversations", conversationId, "messages", messageId));
    }
  } catch (error) {
    console.debug("Group call history cleanup failed:", error);
  }
  call.unsubscribers?.forEach(unsubscribe => unsubscribe());
  call.peers?.forEach(peer => peer.close());
  call.stream?.getTracks().forEach(track => track.stop());
  document.getElementById("group-active-call")?.remove();
}

function hideIncoming() {
  document.getElementById("group-incoming")?.remove();
}
