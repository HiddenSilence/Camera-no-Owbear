let ID_DO_TOKEN_CAM = null;
const video = document.getElementById("video-origem");
const canvas = document.getElementById("canvas-oculto");
const ctx = canvas.getContext("2d");
const btnIniciar = document.getElementById("btn-iniciar");

OBR.onReady(() => {
  console.log("Sistema de Câmera em Prop Iniciado!");
});

btnIniciar.addEventListener("click", async () => {
  try {
    // 1. Pede acesso à Câmera Virtual do OBS
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false
    });
    video.srcObject = stream;
    btnIniciar.style.display = "none";

    // 2. Cria o Prop/Token físico com uma moldura vermelha inicial na mesa de jogo
    const itemProp = OBR.scene.items.createImage({
      name: "Janela de Transmissão OBS",
      url: "data:image/svg+xml;utf8,<svg xmlns='http://w3.org' width='640' height='480'><rect width='640' height='480' style='fill:black;stroke:%23ff4500;stroke-width:20'/></svg>",
      mimeType: "image/svg+xml",
      scale: { x: 1, y: 1 },
      position: { x: 0, y: 0 },
      layer: "PROP" // Define que ele entra na camada de cenário/prop do mapa
    });

    // Envia o item para o mapa e guarda o ID dele
    const [itemAdicionado] = await OBR.scene.items.add([itemProp]);
    ID_DO_TOKEN_CAM = itemAdicionado.id;

    // 3. Começa a transmitir os frames da câmera para dentro desse item
    atualizarFrameNoMapa();

  } catch (err) {
    alert("Erro ao iniciar. Certifique-se de dar permissão para a câmera no seu navegador.");
  }
});

function atualizarFrameNoMapa() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    // Desenha o frame atual da câmera no canvas oculto
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Transforma o desenho em um texto de imagem comprimido (Base64)
    const imagemBase64 = canvas.toDataURL("image/jpeg", 0.5);

    // Atualiza a imagem do Prop direto no mapa do Owlbear Rodeo
    if (ID_DO_TOKEN_CAM) {
      OBR.scene.items.updateItems([ID_DO_TOKEN_CAM], (items) => {
        for (let item of items) {
          if (item.itemType === "IMAGE") {
            item.image.url = imagemBase64;
          }
        }
      });
    }
  }
  // Executa continuamente para simular o vídeo ao vivo (30 frames por segundo)
  requestAnimationFrame(atualizarFrameNoMapa);
}
