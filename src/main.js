import OBR, { buildShape } from "@owlbear-rodeo/sdk";
import "./style.css";

const CAMERA_PROP_KEY = "hiddenSilence.cameraNoOwbear";
const CAMERA_DEVICE_KEY = "hiddenSilence.cameraNoOwbear.deviceId";
const CAMERA_LABEL_KEY = "hiddenSilence.cameraNoOwbear.deviceLabel";

const cameraSelect = document.querySelector("#camera-select");
const refreshBtn = document.querySelector("#refresh-btn");
const startBtn = document.querySelector("#start-btn");
const stopBtn = document.querySelector("#stop-btn");
const preview = document.querySelector("#camera-preview");
const emptyState = document.querySelector("#empty-state");
const status = document.querySelector("#status");
const createPropBtn = document.querySelector("#create-prop-btn");
const propStatus = document.querySelector("#prop-status");
const toggleViewBtn = document.querySelector("#toggle-view-btn");

let currentStream = null;
let cameras = [];

function setStatus(text, kind = "idle") {
  status.textContent = text;
  status.dataset.kind = kind;
}

function stopCurrentStream() {
  if (!currentStream) return;

  for (const track of currentStream.getTracks()) track.stop();
  currentStream = null;
  preview.srcObject = null;
  emptyState.hidden = false;
  stopBtn.disabled = true;
  startBtn.disabled = cameraSelect.disabled || !cameraSelect.value;
  setStatus("Desconectada", "idle");
}

async function listCameras() {
  try {
    const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    for (const track of permissionStream.getTracks()) track.stop();

    const devices = await navigator.mediaDevices.enumerateDevices();
    cameras = devices.filter((device) => device.kind === "videoinput");
    cameraSelect.innerHTML = "";

    if (cameras.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Nenhuma câmera encontrada";
      cameraSelect.appendChild(option);
      cameraSelect.disabled = true;
      startBtn.disabled = true;
      setStatus("Sem câmera", "error");
      return;
    }

    cameras.forEach((camera, index) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.textContent = camera.label || `Câmera ${index + 1}`;
      cameraSelect.appendChild(option);
    });

    cameraSelect.disabled = false;
    startBtn.disabled = false;

    const savedDeviceId = localStorage.getItem(CAMERA_DEVICE_KEY);
    const savedLabel = localStorage.getItem(CAMERA_LABEL_KEY);
    const obsIndex = cameras.findIndex((camera) => camera.label.toLowerCase().includes("obs"));
    const savedIndex = cameras.findIndex((camera) => camera.deviceId === savedDeviceId);

    if (savedIndex >= 0) {
      cameraSelect.value = cameras[savedIndex].deviceId;
    } else if (obsIndex >= 0) {
      cameraSelect.value = cameras[obsIndex].deviceId;
    } else if (savedLabel) {
      const labelIndex = cameras.findIndex((camera) => camera.label === savedLabel);
      if (labelIndex >= 0) cameraSelect.value = cameras[labelIndex].deviceId;
    }

    setStatus(`${cameras.length} câmera(s) encontrada(s)`, "ready");
  } catch (error) {
    console.error(error);
    setStatus("Permissão negada", "error");
    alert("Não foi possível acessar as câmeras. Verifique a permissão de câmera do navegador e tente novamente.");
  }
}

async function startCamera() {
  const deviceId = cameraSelect.value;
  if (!deviceId) {
    alert("Escolha uma câmera primeiro.");
    return;
  }

  stopCurrentStream();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    });

    currentStream = stream;
    preview.srcObject = stream;
    emptyState.hidden = true;
    stopBtn.disabled = false;
    startBtn.disabled = true;

    const selectedCamera = cameras.find((camera) => camera.deviceId === deviceId);
    localStorage.setItem(CAMERA_DEVICE_KEY, deviceId);
    localStorage.setItem(CAMERA_LABEL_KEY, selectedCamera?.label || "");
    setStatus(selectedCamera?.label || "Câmera conectada", "live");
  } catch (error) {
    console.error(error);
    setStatus("Erro ao iniciar", "error");
    alert("Não foi possível iniciar esta câmera. Ela pode estar sendo usada por outro programa ou o navegador pode ter bloqueado o acesso.");
  }
}

refreshBtn.addEventListener("click", listCameras);
startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCurrentStream);
cameraSelect.addEventListener("change", () => {
  startBtn.disabled = !cameraSelect.value;
});
window.addEventListener("beforeunload", stopCurrentStream);

async function getCameraFrame() {
  const items = await OBR.scene.items.getItems(
    (item) => item.metadata?.[CAMERA_PROP_KEY]?.kind === "camera-frame"
  );
  return items[0] ?? null;
}

async function updateGMViewControls() {
  try {
    const role = await OBR.player.getRole();
    if (role !== "GM") {
      createPropBtn.disabled = true;
      toggleViewBtn.disabled = true;
      createPropBtn.textContent = "Disponível apenas para o GM";
      toggleViewBtn.textContent = "Controlado pelo GM";
      propStatus.textContent = "A câmera é controlada pelo GM e aparece automaticamente quando ativada.";
      return;
    }

    const frame = await getCameraFrame();
    createPropBtn.disabled = false;

    if (!frame) {
      toggleViewBtn.disabled = true;
      toggleViewBtn.textContent = "Ativar para jogadores";
      propStatus.textContent = "GM: crie a moldura primeiro.";
      return;
    }

    const enabled = frame.metadata?.[CAMERA_PROP_KEY]?.enabled === true;
    toggleViewBtn.disabled = false;
    toggleViewBtn.textContent = enabled ? "Desativar para jogadores" : "Ativar para jogadores";
    propStatus.textContent = enabled
      ? "Visão da câmera ATIVADA para todos na sala."
      : "Visão da câmera DESATIVADA para os jogadores.";
  } catch (error) {
    console.error(error);
    createPropBtn.disabled = true;
    toggleViewBtn.disabled = true;
    propStatus.textContent = "Não foi possível verificar o estado da câmera.";
  }
}

async function createCameraProp() {
  try {
    const role = await OBR.player.getRole();
    if (role !== "GM") {
      alert("Somente o GM pode criar a câmera no mapa.");
      return;
    }

    const existing = await OBR.scene.items.getItems((item) => {
      const kind = item.metadata?.[CAMERA_PROP_KEY]?.kind;
      return kind === "camera-frame" || kind === "camera-prop";
    });

    const currentFrame = existing.find(
      (item) => item.metadata?.[CAMERA_PROP_KEY]?.kind === "camera-frame"
    );

    if (currentFrame) {
      propStatus.textContent = "A moldura da câmera já existe nesta cena.";
      await OBR.player.select([currentFrame.id], true);
      return;
    }

    const oldTestVideos = existing.filter(
      (item) => item.metadata?.[CAMERA_PROP_KEY]?.kind === "camera-prop"
    );
    if (oldTestVideos.length > 0) {
      await OBR.scene.items.deleteItems(oldTestVideos.map((item) => item.id));
    }

    const position = await OBR.viewport.getPosition();
    const frame = buildShape()
      .width(640)
      .height(360)
      .shapeType("RECTANGLE")
      .fillColor("#111111")
      .fillOpacity(0.12)
      .strokeColor("#ffffff")
      .strokeOpacity(0.96)
      .strokeWidth(12)
      .position(position)
      .rotation(0)
      .scale({ x: 0.75, y: 0.75 })
      .name("Câmera OBS")
      .layer("PROP")
      .metadata({
        [CAMERA_PROP_KEY]: {
          kind: "camera-frame",
          version: 7,
          width: 640,
          height: 360,
          enabled: false,
        },
      })
      .description("Moldura da câmera OBS no mapa.")
      .build();

    await OBR.scene.items.addItems([frame]);
    await OBR.player.select([frame.id], true);
    propStatus.textContent = "Moldura criada. Você pode mover, girar e redimensionar pelo Owlbear.";
    await updateGMViewControls();
  } catch (error) {
    console.error("Erro ao criar a moldura:", error);
    propStatus.textContent = "Erro ao criar a moldura. Veja o console do navegador.";
    alert("Não foi possível criar a moldura da câmera.");
  }
}

async function togglePlayerView() {
  try {
    const role = await OBR.player.getRole();
    if (role !== "GM") return;

    const frame = await getCameraFrame();
    if (!frame) {
      alert("Crie primeiro a moldura da câmera no mapa.");
      return;
    }

    const currentEnabled = frame.metadata?.[CAMERA_PROP_KEY]?.enabled === true;
    const nextEnabled = !currentEnabled;

    await OBR.scene.items.updateItems([frame], (items) => {
      for (const item of items) {
        item.metadata[CAMERA_PROP_KEY] = {
          ...(item.metadata?.[CAMERA_PROP_KEY] ?? {}),
          kind: "camera-frame",
          version: 7,
          enabled: nextEnabled,
        };
      }
    });

    await updateGMViewControls();
  } catch (error) {
    console.error(error);
    alert("Não foi possível alterar a exibição da câmera.");
  }
}

createPropBtn.addEventListener("click", createCameraProp);
toggleViewBtn.addEventListener("click", togglePlayerView);

OBR.onReady(() => {
  console.log("Câmera OBS no Owlbear v0.6 carregada.");
  setStatus("Extensão carregada", "ready");
  updateGMViewControls();
  OBR.scene.items.onChange(() => updateGMViewControls());
});
