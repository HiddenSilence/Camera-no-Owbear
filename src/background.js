import OBR from "@owlbear-rodeo/sdk";

const CAMERA_PROP_KEY = "hiddenSilence.cameraNoOwbear";
const MODAL_ID = `${CAMERA_PROP_KEY}/overlay`;
let modalOpen = false;
let syncing = false;

async function getCameraFrame(items) {
  return items.find(
    (item) => item.metadata?.[CAMERA_PROP_KEY]?.kind === "camera-frame"
  );
}

async function syncViewer() {
  if (syncing) return;
  syncing = true;

  try {
    const items = await OBR.scene.items.getItems();
    const frame = await getCameraFrame(items);
    const enabled = frame?.metadata?.[CAMERA_PROP_KEY]?.enabled === true;

    if (enabled && !modalOpen) {
      await OBR.modal.open({
        id: MODAL_ID,
        url: "/overlay.html",
        fullScreen: true,
        hideBackdrop: true,
        hidePaper: true,
        disablePointerEvents: true,
      });
      modalOpen = true;
    } else if (!enabled && modalOpen) {
      await OBR.modal.close(MODAL_ID);
      modalOpen = false;
    }
  } catch (error) {
    console.error("Câmera OBS background:", error);
  } finally {
    syncing = false;
  }
}

OBR.onReady(async () => {
  await syncViewer();
  OBR.scene.items.onChange(() => syncViewer());
});
