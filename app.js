OBR.onReady(() => {
  console.log("Extensão carregada!");
});

const videoElement = document.getElementById("video-webcam");
const btnConectar = document.getElementById("btn-conectar");

btnConectar.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    videoElement.srcObject = stream;
    btnConectar.style.display = "none";
  } catch (err) {
    alert("Erro ao abrir a câmera. Verifique as permissões de vídeo no navegador.");
  }
});
