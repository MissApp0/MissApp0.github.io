import { auth, db } from "./firebase.js";
import { turnConfig } from "./config.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const stunServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" }
];

function buildIceServers() {
  const urls = Array.isArray(turnConfig?.urls)
    ? turnConfig.urls.filter(Boolean)
    : [];

  const hasCredentials =
    Boolean(turnConfig?.username) &&
    Boolean(turnConfig?.credential);

  const turnServers = hasCredentials && urls.length
    ? [{
        urls,
        username: turnConfig.username,
        credential: turnConfig.credential,
        ...(turnConfig.credentialType
          ? { credentialType: turnConfig.credentialType }
          : {})
      }]
    : [];

  return [...stunServers, ...turnServers];
}

const rtcConfig = {
  iceServers: buildIceServers(),
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceTransportPolicy: "all"
};

let activeCall = null;
let incomingUnsubscribe = null;

function attachPeerMonitoring(peer, call) {
  peer.onconnectionstatechange = () => {
    const status = document.getElementById("call-status");

    if (peer.connectionState === "connected") {
      if (status) status.textContent = "Connected";
      return;
    }

    if (peer.connectionState === "connecting") {
      if (status) status.textContent = "Connecting…";
      return;
    }

    if (peer.connectionState === "disconnected") {
      if (status) status.textContent = "Connection interrupted…";
      return;
    }

    if (peer.connectionState === "failed") {
      if (status) status.textContent = "Connection failed";
      setTimeout(() => {
        if (activeCall?.id === call.id) {
          endActiveCall(true);
        }
      }, 1200);
    }
  };

  peer.oniceconnectionstatechange = () => {
    console.log("MissApp ICE state:", peer.iceConnectionState);

    const status = document.getElementById("call-status");

    if (peer.iceConnectionState === "checking") {
      if (status) status.textContent = "Connecting…";
    } else if (peer.iceConnectionState === "connected" ||
               peer.iceConnectionState === "completed") {
      if (status) status.textContent = "Connected";
    } else if (peer.iceConnectionState === "disconnected") {
      if (status) status.textContent = "Reconnecting…";
    } else if (peer.iceConnectionState === "failed") {
      if (status) status.textContent = "Network connection failed";
    }
  };

  peer.onicegatheringstatechange = () => {
    console.log("MissApp ICE gathering:", peer.iceGatheringState);
  };
}

function addRemoteCandidate(peer, candidate) {
  if (!candidate) return;

  if (!peer.remoteDescription) {
    peer.__missappIceQueue = peer.__missappIceQueue || [];
    peer.__missappIceQueue.push(candidate);
    return;
  }

  peer.addIceCandidate(candidate).catch(error => {
    console.error("ICE candidate error:", error);
  });
}

async function flushRemoteCandidates(peer) {
  const queue = peer.__missappIceQueue || [];
  peer.__missappIceQueue = [];

  for (const candidate of queue) {
    try {
      await peer.addIceCandidate(candidate);
    } catch (error) {
      console.error("Queued ICE candidate error:", error);
    }
  }
}

export function initCalls() {
  if (!auth.currentUser) return;
  listenForIncomingCalls();
}

function listenForIncomingCalls() {
  incomingUnsubscribe?.();

  const callsRef = query(
    collection(db, "calls"),
    where("callee", "==", auth.currentUser.uid)
  );

  incomingUnsubscribe = onSnapshot(callsRef, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type !== "added" && change.type !== "modified") return;

      const call = { id: change.doc.id, ...change.doc.data() };

      if (
        call.callee === auth.currentUser?.uid &&
        call.status === "ringing" &&
        !activeCall
      ) {
        showIncomingCall(call);
      }
    });
  }, error => {
    console.error("Incoming call listener error:", error);
  });
}

export async function startCall({ calleeId, calleeName, video = false }) {
  if (!auth.currentUser || !calleeId) {
    throw new Error("The other user could not be identified.");
  }

  if (activeCall) {
    throw new Error("A call is already active.");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera and microphone are not available in this browser.");
  }

  let stream;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: video
        ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 }
          }
        : false
    });
  } catch (error) {
    throw new Error(getMediaError(error));
  }

  const peer = new RTCPeerConnection(rtcConfig);
  stream.getTracks().forEach(track => peer.addTrack(track, stream));

  const callRef = doc(collection(db, "calls"));
  const caller = auth.currentUser.uid;

  const call = {
    id: callRef.id,
    caller,
    callee: calleeId,
    callerName: auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "User",
    calleeName: calleeName || "User",
    type: video ? "video" : "voice",
    status: "ringing",
    createdAt: serverTimestamp()
  };

  attachPeerMonitoring(peer, call);

  const remoteStream = new MediaStream();

  peer.ontrack = event => {
    event.streams[0]?.getTracks().forEach(track => remoteStream.addTrack(track));
    attachRemoteStream(remoteStream);
  };

  peer.onicecandidate = async event => {
    if (!event.candidate) return;
    await addDoc(collection(db, "calls", callRef.id, "callerCandidates"), event.candidate.toJSON());
  };

  await setDoc(callRef, call);

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await updateDoc(callRef, { offer: { type: offer.type, sdp: offer.sdp } });

  activeCall = {
    ...call,
    peer,
    stream,
    remoteStream,
    role: "caller",
    unsubscribers: []
  };

  listenForAnswer(callRef.id, peer);
  listenForCalleeCandidates(callRef.id, peer);

  showCallScreen(activeCall);
}

async function answerCall(call) {
  if (!auth.currentUser || activeCall) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera and microphone are not available in this browser.");
  }

  const video = call.type === "video";
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video
  });

  const peer = new RTCPeerConnection(rtcConfig);
  stream.getTracks().forEach(track => peer.addTrack(track, stream));

  const remoteStream = new MediaStream();

  peer.ontrack = event => {
    event.streams[0]?.getTracks().forEach(track => remoteStream.addTrack(track));
    attachRemoteStream(remoteStream);
  };

  peer.onicecandidate = async event => {
    if (!event.candidate) return;
    await addDoc(collection(db, "calls", call.id, "calleeCandidates"), event.candidate.toJSON());
  };

  attachPeerMonitoring(peer, call);

  const callRef = doc(db, "calls", call.id);
  const snapshot = await getDoc(callRef);

  if (!snapshot.exists()) {
    stream.getTracks().forEach(track => track.stop());
    peer.close();
    throw new Error("This call is no longer available.");
  }

  const data = snapshot.data();

  await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
  await flushRemoteCandidates(peer);

  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);

  await updateDoc(callRef, {
    answer: { type: answer.type, sdp: answer.sdp },
    status: "connected"
  });

  activeCall = {
    ...call,
    peer,
    stream,
    remoteStream,
    role: "callee",
    unsubscribers: []
  };

  listenForCallerCandidates(call.id, peer);
  listenForCallState(call.id);

  showCallScreen(activeCall);
}

function listenForAnswer(callId, peer) {
  const unsub = onSnapshot(doc(db, "calls", callId), async snapshot => {
    const data = snapshot.data();
    if (!data) return;

    if (data.status === "declined" || data.status === "ended") {
      endActiveCall(false);
      return;
    }

    if (!data.answer || peer.currentRemoteDescription) return;

    try {
      await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
      await flushRemoteCandidates(peer);
      await updateDoc(doc(db, "calls", callId), { status: "connected" });
    } catch (error) {
      console.error("Set remote answer error:", error);
    }
  });

  activeCall?.unsubscribers.push(unsub);
}

function listenForCallState(callId) {
  const unsub = onSnapshot(doc(db, "calls", callId), snapshot => {
    const data = snapshot.data();
    if (!data || data.status === "ended" || data.status === "declined") {
      endActiveCall(false);
    }
  });

  activeCall?.unsubscribers.push(unsub);
}

function listenForCalleeCandidates(callId, peer) {
  const unsub = onSnapshot(collection(db, "calls", callId, "calleeCandidates"), snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        addRemoteCandidate(peer, new RTCIceCandidate(change.doc.data()));
      }
    });
  });

  activeCall?.unsubscribers.push(unsub);
}

function listenForCallerCandidates(callId, peer) {
  const unsub = onSnapshot(collection(db, "calls", callId, "callerCandidates"), snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        addRemoteCandidate(
          peer,
          new RTCIceCandidate(change.doc.data())
        );
      }
    });
  });

  activeCall?.unsubscribers.push(unsub);
}

export async function declineCall(callId) {
  try {
    await updateDoc(doc(db, "calls", callId), {
      status: "declined",
      endedAt: serverTimestamp()
    });
  } finally {
    hideIncomingCall();
  }
}

export async function endActiveCall(notify = true) {
  const call = activeCall;
  if (!call) return;

  activeCall = null;

  if (notify) {
    try {
      await updateDoc(doc(db, "calls", call.id), {
        status: "ended",
        endedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("End call update error:", error);
    }
  }

  call.unsubscribers?.forEach(unsub => unsub());

  call.stream?.getTracks().forEach(track => track.stop());
  call.remoteStream?.getTracks().forEach(track => track.stop());
  call.peer?.close();

  hideCallScreen();
}

function showIncomingCall(call) {
  const existing = document.getElementById("incoming-call");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "incoming-call";
  modal.className = "call-modal";
  modal.innerHTML = `
    <div class="incoming-call-card">
      <div class="call-avatar">${escapeHtml((call.callerName || "U").charAt(0).toUpperCase())}</div>
      <div class="incoming-call-name">${escapeHtml(call.callerName || "User")}</div>
      <div class="incoming-call-type">${call.type === "video" ? "Incoming video call" : "Incoming voice call"}</div>
      <div class="incoming-call-actions">
        <button class="call-action decline" id="decline-call">✕</button>
        <button class="call-action accept" id="accept-call">✓</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#decline-call").addEventListener("click", () => declineCall(call.id));
  modal.querySelector("#accept-call").addEventListener("click", async () => {
    modal.remove();
    try {
      await answerCall(call);
    } catch (error) {
      console.error("Answer call error:", error);
      alert(error.message || "Could not answer the call.");
      await declineCall(call.id);
    }
  });
}

function showCallScreen(call) {
  hideIncomingCall();

  let screen = document.getElementById("active-call");
  if (screen) screen.remove();

  screen = document.createElement("div");
  screen.id = "active-call";
  screen.className = "active-call";
  screen.innerHTML = `
    <video id="remote-video" class="remote-video" autoplay playsinline></video>
    <div class="call-topbar">
      <div class="call-name">${escapeHtml(call.role === "caller" ? call.calleeName : call.callerName)}</div>
      <div class="call-status" id="call-status">Calling…</div>
    </div>
    <video id="local-video" class="local-video" autoplay muted playsinline></video>
    <div class="call-controls">
      <button id="toggle-mic" class="call-control" title="Mute microphone">🎙</button>
      ${call.type === "video" ? '<button id="toggle-camera" class="call-control" title="Camera">📹</button>' : ""}
      <button id="end-call" class="call-control end" title="End call">☎</button>
    </div>
  `;

  document.body.appendChild(screen);

  const localVideo = screen.querySelector("#local-video");
  const remoteVideo = screen.querySelector("#remote-video");
  localVideo.srcObject = call.stream;
  remoteVideo.srcObject = call.remoteStream;

  screen.querySelector("#end-call").addEventListener("click", () => endActiveCall(true));

  screen.querySelector("#toggle-mic").addEventListener("click", event => {
    const track = call.stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    event.currentTarget.classList.toggle("off", !track.enabled);
  });

  screen.querySelector("#toggle-camera")?.addEventListener("click", event => {
    const track = call.stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    event.currentTarget.classList.toggle("off", !track.enabled);
  });
}

function attachRemoteStream(stream) {
  const video = document.getElementById("remote-video");
  if (video) video.srcObject = stream;
}

function hideIncomingCall() {
  document.getElementById("incoming-call")?.remove();
}

function hideCallScreen() {
  document.getElementById("active-call")?.remove();
}

function getMediaError(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera or microphone permission was denied. Allow access in your browser settings and try again.";

    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No usable microphone or camera was found.";

    case "NotReadableError":
    case "TrackStartError":
      return "Your camera or microphone is already being used by another app.";

    case "OverconstrainedError":
      return "The selected camera or microphone does not support the requested settings.";

    case "SecurityError":
      return "Camera and microphone access is blocked by browser security settings.";

    default:
      return error?.message || "Could not access the camera or microphone.";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.MissAppCalls = {
  startCall,
  answerCall,
  declineCall,
  endActiveCall
};
