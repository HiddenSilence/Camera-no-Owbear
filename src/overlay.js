import OBR from "@owlbear-rodeo/sdk";

const camera = document.querySelector("#camera");
const status = document.querySelector("#status");

const CAMERA_PROP_KEY = "hiddenSilence.cameraNoOwbear";
const CAMERA_DEVICE_KEY = "hiddenSilence.cameraNoOwbear.deviceId";

// v0.10: sinalização persistente usando metadata dos próprios jogadores.
// O GM publica a oferta no seu metadata, direcionada por connectionId.
// Cada PLAYER publica a resposta no próprio metadata.
const PLAYER_STATE_KEY = `${CAMERA_PROP_KEY}/player-state-v1`;
const OFFER_KEY = "offer";
const ANSWER_KEY = "answer";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

let role = null;
let selfConnectionId = null;
let localStream = null;
let playerPeer = null;
let renderTimer = null;
let partyTimer = null;
let partyUnsubscribe = null;
let gmGeneration = null;
let playerOfferId = null;
let gmActivationBusy = false;

const gmPeers = new Map();

function log(...args) {
  console.log("[Câmera OBS v0.10]", ...args);
}

function setStatus(text, visible = true) {
  status.textContent = text;
  status.className = visible ? "error" : "";
}

function clearStatus() {
  status.textContent = "";
  status.className = "";
}

function getFrameFromItems(items) {
  return items.find(
    (item) => item.metadata?.[CAMERA_PROP_KEY]?.kind === "camera-frame"
  );
}

async function renderFrame() {
  try {
    const items = await OBR.scene.items.getItems();
    const frame = getFrameFromItems(items);

    if (!frame || frame.metadata?.[CAMERA_PROP_KEY]?.enabled !== true) {
      camera.style.opacity = "0";
      return;
    }

    const scale = await OBR.viewport.getScale();
    const screenPosition = await OBR.viewport.transformPoint(frame.position);
    const width = Math.max(40, frame.width * frame.scale.x * scale);
    const height = Math.max(40, frame.height * frame.scale.y * scale);

    camera.style.left = `${screenPosition.x}px`;
    camera.style.top = `${screenPosition.y}px`;
    camera.style.width = `${Math.max(20, width - 12)}px`;
    camera.style.height = `${Math.max(20, height - 12)}px`;
    camera.style.transform = `translate(-50%, -50%) rotate(${frame.rotation}deg)`;
    camera.style.opacity = "1";
  } catch (error) {
    console.error("Erro ao posicionar câmera:", error);
  }
}

async function getObsCameraStream() {
  const permissionStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
  permissionStream.getTracks().forEach((track) => track.stop());

  const devices = await navigator.mediaDevices.enumerateDevices();
  const savedDeviceId = localStorage.getItem(CAMERA_DEVICE_KEY);
  const obsDevice = devices.find(
    (device) =>
      device.kind === "videoinput" &&
      device.label.toLowerCase().includes("obs")
  );
  const savedDevice = savedDeviceId
    ? devices.find(
        (device) =>
          device.kind === "videoinput" &&
          device.deviceId === savedDeviceId
      )
    : null;
  const device = savedDevice || obsDevice;

  if (!device?.deviceId) {
    throw new Error("A OBS Virtual Camera não foi encontrada neste navegador.");
  }

  return navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: device.deviceId },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 60 },
    },
    audio: false,
  });
}

function plainDescription(description) {
  return { type: description.type, sdp: description.sdp };
}

function waitForIceGatheringComplete(peer, timeoutMs = 10000) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(finish, timeoutMs);
    peer.addEventListener("icegatheringstatechange", () => {
      if (peer.iceGatheringState === "complete") finish();
    });
  });
}

async function startGM() {
  try {
    if (localStream) return;
    localStream = await getObsCameraStream();
    camera.srcObject = localStream;
    camera.muted = true;
    await camera.play();
    clearStatus();
    log("GM: OBS Virtual Camera conectada.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Não foi possível abrir a OBS Virtual Camera.");
  }
}

async function getParty() {
  return await OBR.party.getPlayers();
}

function closeGMPeer(peerId) {
  const peer = gmPeers.get(peerId);
  if (!peer) return;
  try {
    peer.close();
  } catch {}
  gmPeers.delete(peerId);
}

function makePeerForGM(peerId) {
  const existing = gmPeers.get(peerId);
  if (existing && !["closed", "failed"].includes(existing.connectionState)) {
    return existing;
  }

  const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peer.__offerInFlight = false;
  peer.__offerId = null;
  peer.__answerAccepted = false;
  gmPeers.set(peerId, peer);

  peer.onconnectionstatechange = () => {
    log("GM →", peerId, "connection:", peer.connectionState);
    if (["failed", "closed"].includes(peer.connectionState)) {
      closeGMPeer(peerId);
    }
  };

  peer.oniceconnectionstatechange = () => {
    log("GM →", peerId, "ICE:", peer.iceConnectionState);
  };

  peer.onicegatheringstatechange = () => {
    log("GM →", peerId, "gathering:", peer.iceGatheringState);
  };

  for (const track of localStream?.getTracks() ?? []) {
    peer.addTrack(track, localStream);
  }

  return peer;
}

async function writeGMPlayerState(state) {
  await OBR.player.setMetadata({
    [PLAYER_STATE_KEY]: state,
  });
}

async function offerToPlayer(peerId, force = false) {
  if (!localStream || peerId === selfConnectionId || !gmGeneration) return;

  let peer = gmPeers.get(peerId);
  if (!peer || ["failed", "closed"].includes(peer.connectionState)) {
    peer = makePeerForGM(peerId);
  }

  if (!force && (peer.__offerInFlight || peer.connectionState === "connected")) {
    return;
  }

  try {
    peer.__offerInFlight = true;
    peer.__answerAccepted = false;
    peer.__offerId = crypto.randomUUID();

    log("GM: criando oferta para", peerId, peer.__offerId);

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGatheringComplete(peer);

    const current = await OBR.player.getMetadata();
    const currentState = current?.[PLAYER_STATE_KEY];
    const offers = { ...(currentState?.offers ?? {}) };
    offers[peerId] = {
      targetConnectionId: peerId,
      offerId: peer.__offerId,
      description: plainDescription(peer.localDescription),
      updatedAt: Date.now(),
    };

    const state = {
      role: "GM",
      active: true,
      generation: gmGeneration,
      gmConnectionId: selfConnectionId,
      updatedAt: Date.now(),
      offers,
    };

    await writeGMPlayerState(state);
    log("GM: oferta publicada no metadata do GM para", peerId);
  } catch (error) {
    peer.__offerInFlight = false;
    console.error("GM: erro criando/publicando oferta:", error);
  }
}

async function processPlayerAnswers(players) {
  if (role !== "GM" || !gmGeneration) return;

  for (const player of players) {
    if (player.role !== "PLAYER") continue;
    const peerId = player.connectionId;
    const answerData = player.metadata?.[PLAYER_STATE_KEY]?.[ANSWER_KEY];
    if (!peerId || !answerData?.answer) continue;
    if (answerData.generation !== gmGeneration) continue;
    if (answerData.gmConnectionId !== selfConnectionId) continue;

    await acceptAnswerForGM(peerId, answerData);
  }
}

async function acceptAnswerForGM(peerId, answerData) {
  const peer = gmPeers.get(peerId);
  if (!peer || peer.__answerAccepted) return;
  if (!peer.__offerId || answerData.offerId !== peer.__offerId) return;

  try {
    await peer.setRemoteDescription(answerData.answer);
    peer.__answerAccepted = true;
    peer.__offerInFlight = false;
    log("GM: resposta recebida de", peerId);
  } catch (error) {
    peer.__offerInFlight = false;
    console.error("GM: erro aplicando resposta:", error);
  }
}

async function syncGMParty() {
  if (role !== "GM" || !localStream || !gmGeneration) return;

  try {
    const players = await getParty();
    const playerIds = players
      .filter((player) => player.role === "PLAYER")
      .map((player) => player.connectionId)
      .filter(Boolean);

    log("GM: players:", playerIds);

    for (const playerId of playerIds) {
      await offerToPlayer(playerId);
    }

    await processPlayerAnswers(players);

    for (const peerId of gmPeers.keys()) {
      if (!playerIds.includes(peerId)) closeGMPeer(peerId);
    }
  } catch (error) {
    console.error("GM: erro sincronizando party:", error);
  }
}

async function createPlayerPeer() {
  if (playerPeer && !["failed", "closed"].includes(playerPeer.connectionState)) {
    return playerPeer;
  }

  playerPeer = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  playerPeer.ontrack = async (event) => {
    log("PLAYER: faixa de vídeo recebida.");
    const stream = event.streams[0] || new MediaStream([event.track]);
    camera.srcObject = stream;
    camera.muted = true;

    try {
      await camera.play();
      clearStatus();
      log("PLAYER: vídeo remoto reproduzindo.");
    } catch (error) {
      console.error("PLAYER: autoplay:", error);
      setStatus("O vídeo chegou, mas o navegador bloqueou a reprodução automática.");
    }
  };

  playerPeer.onconnectionstatechange = () => {
    log("PLAYER connection:", playerPeer?.connectionState);
    if (["failed", "closed"].includes(playerPeer?.connectionState)) {
      setStatus("Conexão perdida. Aguardando nova oferta do GM...");
      try {
        playerPeer.close();
      } catch {}
      playerPeer = null;
      playerOfferId = null;
    } else if (playerPeer?.connectionState === "connecting") {
      setStatus("Conectando à câmera do GM...");
    }
  };

  playerPeer.oniceconnectionstatechange = () => {
    log("PLAYER ICE:", playerPeer?.iceConnectionState);
  };

  return playerPeer;
}

async function inspectGMOffer(players) {
  if (role !== "PLAYER" || !selfConnectionId) return;

  const gms = players.filter((player) => player.role === "GM");
  if (gms.length === 0) {
    setStatus("Aguardando o GM...");
    return;
  }

  const gm = gms[0];
  const state = gm.metadata?.[PLAYER_STATE_KEY];
  const offerData = state?.offers?.[selfConnectionId];

  if (!state?.active || !offerData) {
    if (!playerPeer?.connectionState || ["new", "connecting"].includes(playerPeer.connectionState)) {
      setStatus("Aguardando a câmera do GM...");
    }
    return;
  }

  if (offerData.targetConnectionId !== selfConnectionId) return;
  if (state.gmConnectionId !== gm.connectionId) return;
  if (!state.generation) return;
  if (offerData.offerId === playerOfferId) return;

  playerOfferId = null;
  setStatus("Recebendo câmera do GM...");
  log("PLAYER: oferta encontrada", offerData.offerId, "do GM", gm.connectionId);

  try {
    if (playerPeer && !["closed", "failed"].includes(playerPeer.signalingState)) {
      try { playerPeer.close(); } catch {}
      playerPeer = null;
    }

    const peer = await createPlayerPeer();
    await peer.setRemoteDescription(offerData.description);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await waitForIceGatheringComplete(peer);

    await OBR.player.setMetadata({
      [PLAYER_STATE_KEY]: {
        role: "PLAYER",
        updatedAt: Date.now(),
        [ANSWER_KEY]: {
          gmConnectionId: gm.connectionId,
          generation: state.generation,
          offerId: offerData.offerId,
          answer: plainDescription(peer.localDescription),
        },
      },
    });

    playerOfferId = offerData.offerId;
    log("PLAYER: resposta publicada no meu metadata");
  } catch (error) {
    playerOfferId = null;
    console.error("PLAYER: erro processando oferta:", error);
    setStatus("Não foi possível conectar à câmera do GM.");
  }
}

async function syncPartyForPlayer() {
  try {
    const players = await getParty();
    await inspectGMOffer(players);
  } catch (error) {
    console.error("PLAYER: erro lendo party:", error);
  }
}

async function startGMControl() {
  if (gmGeneration) return;
  gmGeneration = crypto.randomUUID();
  await writeGMPlayerState({
    role: "GM",
    active: true,
    generation: gmGeneration,
    gmConnectionId: selfConnectionId,
    updatedAt: Date.now(),
    offers: {},
  });
  log("GM: controle ativo", gmGeneration);
}

async function stopGMControl() {
  try {
    await writeGMPlayerState({
      role: "GM",
      active: false,
      generation: gmGeneration || crypto.randomUUID(),
      gmConnectionId: selfConnectionId,
      updatedAt: Date.now(),
      offers: {},
    });
  } catch (error) {
    console.warn("GM: não foi possível desativar controle:", error);
  }
}


async function closeAllGMConnections() {
  for (const peerId of gmPeers.keys()) closeGMPeer(peerId);
}

async function syncGMActivation() {
  if (role !== "GM" || !localStream || gmActivationBusy) return;
  gmActivationBusy = true;

  try {
    const items = await OBR.scene.items.getItems();
    const frame = getFrameFromItems(items);
    const enabled = frame?.metadata?.[CAMERA_PROP_KEY]?.enabled === true;

    if (enabled) {
      if (!gmGeneration) {
        await startGMControl();
        log("GM: moldura ativa detectada; controle iniciado automaticamente.");
      }
      await syncGMParty();
    } else {
      if (gmGeneration) {
        log("GM: moldura desativada; encerrando conexões.");
        gmGeneration = null;
        await stopGMControl();
        await closeAllGMConnections();
      }
    }
  } catch (error) {
    console.error("GM: erro sincronizando ativação da câmera:", error);
  } finally {
    gmActivationBusy = false;
  }
}

async function cleanup() {
  if (renderTimer) clearTimeout(renderTimer);
  if (partyTimer) clearInterval(partyTimer);

  if (partyUnsubscribe) {
    partyUnsubscribe();
    partyUnsubscribe = null;
  }

  if (role === "GM") {
    await stopGMControl();
  }

  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;

  try { playerPeer?.close(); } catch {}
  playerPeer = null;

  for (const peer of gmPeers.values()) {
    try { peer.close(); } catch {}
  }
  gmPeers.clear();
}

OBR.onReady(async () => {
  try {
    role = await OBR.player.getRole();
    selfConnectionId = await OBR.player.getConnectionId();

    log("inicializado", { role, selfConnectionId, sdkReady: OBR.isReady });

    await renderFrame();

    if (role === "GM") {
      await startGM();

      // A extensão também observa a cena para perceber quando o GM
      // liga/desliga a câmera pelo popover. Esta era a peça que faltava: 
      // antes, o WebRTC só era inicializado se a extensão já estivesse aberta
      // no momento em que a moldura era ativada.
      OBR.scene.items.onChange(() => {
        void renderFrame();
        void syncGMActivation();
      });

      partyUnsubscribe = OBR.party.onChange(() => void syncGMActivation());
      await syncGMActivation();
      partyTimer = setInterval(() => void syncGMActivation(), 1200);
    } else {
      OBR.scene.items.onChange(() => void renderFrame());
      partyUnsubscribe = OBR.party.onChange(() => void syncPartyForPlayer());
      await syncPartyForPlayer();
      setStatus("Aguardando a câmera do GM...");
      partyTimer = setInterval(() => void syncPartyForPlayer(), 1000);
    }
  } catch (error) {
    console.error("Inicialização da câmera:", error);
    setStatus("Não foi possível iniciar o sistema de câmera.");
  }
});

window.addEventListener("beforeunload", () => {
  void cleanup();
});
