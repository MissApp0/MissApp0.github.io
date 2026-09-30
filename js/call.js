import { auth, db } from "./firebase.js";
import { turnConfig } from "./config.js";
import { playSound } from "./sounds.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
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

const CALL_TIMEOUT_MS = 30000;
const RECONNECT_GRACE_MS = 12000;
const OFFER_WAIT_ATTEMPTS = 20;
const OFFER_WAIT_DELAY_MS = 500;

let activeCall = null;
let incomingUnsubscribe = null;
let callTimeout = null;
let ringingTimer = null;

function startOutgoingRinging() {
  stopOutgoingRinging();
  playSound("callRinging");
  ringingTimer = setInterval(() => playSound("callRinging"), 2500);
}
function stopOutgoingRinging() {
  if (ringingTimer) clearInterval(ringingTimer);
  ringingTimer = null;
}
async function replaceVideoTrack(call, newTrack) {
  const sender = call?.peer?.getSenders().find(item => item.track?.kind === "video");
  if (!sender || !newTrack) return false;
  const old = call.stream.getVideoTracks()[0];
  await sender.replaceTrack(newTrack);
  if (old && old !== newTrack) old.stop();
  if (old) call.stream.removeTrack(old);
  call.stream.addTrack(newTrack);
  const local = document.getElementById("local-video");
  if (local) local.srcObject = call.stream;
  return true;
}
async function switchCamera() {
  const call = activeCall;
  if (!call?.stream?.getVideoTracks().length) return;
  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
  if (cameras.length < 2) { setCallStatus("Only one camera is available."); return; }
  const current = call.stream.getVideoTracks()[0].getSettings?.().deviceId;
  const next = cameras.find(d => d.deviceId !== current) || cameras[0];
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: next.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  await replaceVideoTrack(call, stream.getVideoTracks()[0]);
}
async function toggleScreenShare() {
  const call = activeCall;
  if (!call?.peer || !navigator.mediaDevices?.getDisplayMedia) { setCallStatus("Screen sharing is not supported in this browser."); return; }
  const sender = call.peer.getSenders().find(item => item.track?.kind === "video");
  if (!sender) { setCallStatus("Screen sharing requires a video call."); return; }
  if (call.screenTrack) {
    const camera = call.cameraTrack;
    if (camera) await sender.replaceTrack(camera);
    call.screenTrack.stop();
    call.screenTrack = null;
    const local = document.getElementById("local-video");
    if (local) local.srcObject = call.stream;
    return;
  }
  const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  const screenTrack = display.getVideoTracks()[0];
  call.cameraTrack = call.stream.getVideoTracks()[0];
  call.screenTrack = screenTrack;
  await sender.replaceTrack(screenTrack);
  const local = document.getElementById("local-video");
  if (local) {
    const preview = new MediaStream([...call.stream.getAudioTracks(), screenTrack]);
    local.srcObject = preview;
  }
  screenTrack.onended = () => { if (activeCall?.id === call.id) toggleScreenShare().catch(() => {}); };
}
function clearCallTimeout() {
  if (callTimeout) {
    clearTimeout(callTimeout);
    callTimeout = null;
  }
}

function armCallTimeout(callId) {
  clearCallTimeout();
  callTimeout = setTimeout(() => {
    if (activeCall?.id !== callId) return;

    const state = activeCall.peer?.connectionState;
    if (state !== "connected") {
      setCallStatus("No answer", "The call could not establish a connection.");
      endActiveCall(true);
    }
  }, CALL_TIMEOUT_MS);
}

function setCallStatus(text, detail = "") {
  const status = document.getElementById("call-status");
  if (status) status.textContent = text;

  const sub = document.getElementById("call-status-detail");
  if (sub) sub.textContent = detail;
}

function getCallCapabilities() {
  return {
    webrtc: typeof RTCPeerConnection !== "undefined",
    media: Boolean(navigator.mediaDevices?.getUserMedia),
    secureContext: window.isSecureContext,
    video: Boolean(document.createElement("video").canPlayType),
    turnConfigured: buildIceServers().some(server => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some(url => String(url).startsWith("turn:") || String(url).startsWith("turns:"));
    })
  };
}

function attachPeerMonitoring(peer, call) {
  peer.onconnectionstatechange = () => {
    const status = document.getElementById("call-status");

    if (peer.connectionState === "connected") {
      clearCallTimeout();
      stopOutgoingRinging();
      playSound("callConnected");
      setCallStatus("Connected");
      logSelectedIceRoute(peer);
      return;
    }

    if (peer.connectionState === "connecting") {
      setCallStatus("Connecting…");
      return;
    }

    if (peer.connectionState === "disconnected") {
      setCallStatus("Reconnecting…");
      setTimeout(() => {
        if (activeCall?.id === call.id &&
            activeCall.peer?.connectionState === "disconnected") {
          setCallStatus("Connection lost");
        }
      }, RECONNECT_GRACE_MS);
      return;
    }

    if (peer.connectionState === "failed") {
      setCallStatus("Connection failed", "Check your network or TURN configuration.");
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

  peer.onicecandidateerror = event => {
    console.warn("MissApp ICE candidate error:", {
      url: event.url,
      errorCode: event.errorCode,
      errorText: event.errorText
    });
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
        playSound("incomingCall");
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

  const capabilities = getCallCapabilities();
  if (!capabilities.webrtc || !capabilities.media) {
    throw new Error("This browser does not support camera and microphone calling.");
  }
  if (!capabilities.secureContext) {
    throw new Error("Calls require HTTPS. Open MissApp through its secure HTTPS address.");
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
  startOutgoingRinging();
  armCallTimeout(call.id);
  return activeCall;
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
  let snapshot = null;

  for (let attempt = 0; attempt < OFFER_WAIT_ATTEMPTS; attempt += 1) {
    snapshot = await getDoc(callRef);

    if (!snapshot.exists()) {
      stream.getTracks().forEach(track => track.stop());
      peer.close();
      throw new Error("This call is no longer available.");
    }

    const data = snapshot.data();

    if (data.offer?.sdp && data.offer?.type) {
      break;
    }

    if (attempt < OFFER_WAIT_ATTEMPTS - 1) {
      await new Promise(resolve => setTimeout(resolve, OFFER_WAIT_DELAY_MS));
    }
  }

  const data = snapshot?.data();

  if (!data?.offer?.sdp || !data?.offer?.type) {
    stream.getTracks().forEach(track => track.stop());
    peer.close();
    throw new Error("The call offer was not ready. Please try accepting again.");
  }

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
  clearCallTimeout();
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
  clearCallTimeout();
  stopOutgoingRinging();

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

  try {
    const callSnapshot = await getDoc(doc(db, "calls", call.id));
    const callData = callSnapshot.exists() ? callSnapshot.data() : {};
    const messageId = call.messageId || callData.messageId;
    const conversationId = call.conversationId || callData.conversationId;
    if (messageId && conversationId) {
      await deleteDoc(doc(db, "conversations", conversationId, "messages", messageId));
    }
  } catch (error) {
    console.debug("Call history cleanup failed:", error);
  }

  call.unsubscribers?.forEach(unsub => unsub());

  call.stream?.getTracks().forEach(track => track.stop());
  call.remoteStream?.getTracks().forEach(track => track.stop());
  call.peer?.close();

  hideCallScreen();
}

function showIncomingCall(call) {
  if (window.missappDesktop?.showIncomingCall) {
    window.missappDesktop.showIncomingCall({
      callId: call.id,
      callerName: call.callerName || "User",
      type: call.type || "voice",
      title: call.type === "video" ? "Incoming video call" : "Incoming voice call"
    });
    return;
  }
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
      <div class="call-status-detail" id="call-status-detail"></div>
    </div>
    <video id="local-video" class="local-video" autoplay muted playsinline></video>
    <div class="call-controls">
      <button id="end-call" class="call-control end" title="End call">☎</button>
      <div class="call-options-wrap">
        <button id="call-options-button" class="call-control call-options-button" type="button" title="Call options" aria-label="Call options" aria-expanded="false">⋮</button>
        <div id="call-options-menu" class="call-options-menu hidden" role="menu">
          <button id="call-menu-mic" type="button" role="menuitem">🎙 Mute microphone</button>
          ${call.type === "video" ? '<button id="call-menu-camera" type="button" role="menuitem">📹 Camera</button><button id="call-menu-switch-camera" type="button" role="menuitem">🔄 Switch camera</button><button id="call-menu-share-screen" type="button" role="menuitem">🖥 Share screen</button>' : ""}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(screen);

  const localVideo = screen.querySelector("#local-video");
  const remoteVideo = screen.querySelector("#remote-video");
  localVideo.srcObject = call.stream;
  remoteVideo.srcObject = call.remoteStream;

  screen.querySelector("#end-call").addEventListener("click", () => endActiveCall(true));

  const optionsButton = screen.querySelector("#call-options-button");
  const optionsMenu = screen.querySelector("#call-options-menu");
  optionsButton?.addEventListener("click", event => {
    event.stopPropagation();
    const open = !optionsMenu?.classList.contains("hidden");
    optionsMenu?.classList.toggle("hidden", open);
    optionsButton.setAttribute("aria-expanded", String(!open));
  });

  screen.querySelector("#call-menu-mic")?.addEventListener("click", event => {
    const track = call.stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    event.currentTarget.textContent = track.enabled ? "🎙 Mute microphone" : "🔇 Unmute microphone";
  });

  screen.querySelector("#call-menu-camera")?.addEventListener("click", event => {
    const track = call.stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    event.currentTarget.textContent = track.enabled ? "📹 Camera" : "📷 Turn camera on";
  });

  screen.querySelector("#call-menu-switch-camera")?.addEventListener("click", async () => {
    try { await switchCamera(); } catch (error) { console.error("Switch camera error:", error); setCallStatus("Could not switch camera."); }
  });

  screen.querySelector("#call-menu-share-screen")?.addEventListener("click", async event => {
    try {
      await toggleScreenShare();
      event.currentTarget.textContent = call.screenTrack ? "🛑 Stop screen share" : "🖥 Share screen";
    } catch (error) {
      console.error("Screen share error:", error);
      setCallStatus("Could not share your screen.");
    }
  });

  screen.addEventListener("click", event => {
    if (optionsMenu && !optionsMenu.contains(event.target) && event.target !== optionsButton) {
      optionsMenu.classList.add("hidden");
      optionsButton?.setAttribute("aria-expanded", "false");
    }
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

async function logSelectedIceRoute(peer) {
  try {
    const stats = await peer.getStats();
    let selectedPair = null;
    const candidates = new Map();

    stats.forEach(report => {
      if (report.type === "candidate-pair" &&
          report.state === "succeeded" &&
          (report.nominated || report.selected)) {
        selectedPair = report;
      }

      if (report.type === "local-candidate" || report.type === "remote-candidate") {
        candidates.set(report.id, report);
      }
    });

    if (!selectedPair) return;

    const local = candidates.get(selectedPair.localCandidateId);
    const remote = candidates.get(selectedPair.remoteCandidateId);

    console.log("MissApp selected ICE route:", {
      localType: local?.candidateType,
      localProtocol: local?.protocol,
      remoteType: remote?.candidateType,
      remoteProtocol: remote?.protocol
    });
  } catch (error) {
    console.debug("MissApp ICE stats unavailable:", error);
  }
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
  endActiveCall,
  getCallCapabilities
};

if (window.missappDesktop?.onCallAction) {
  window.missappDesktop.onCallAction(async action => {
    if (action?.type === "accept" && action.callId) {
      const snapshot = await getDoc(doc(db, "calls", action.callId));
      if (snapshot.exists()) await answerCall({ id: action.callId, ...snapshot.data() });
    } else if (action?.type === "decline" && action.callId) {
      await declineCall(action.callId);
    } else if (action?.type === "end") {
      await endActiveCall(true);
    }
  });
}
