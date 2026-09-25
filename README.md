# Câmera OBS no Owlbear — v0.12.0

Nesta versão a câmera do GM é transmitida ao vivo para os jogadores usando WebRTC. O Owlbear Broadcast é usado apenas para sinalização (troca de offer/answer/ICE); o vídeo não é enviado como frames pela Scene API.

Fluxo:
- GM cria a moldura no mapa.
- GM ativa a câmera para a sala.
- O overlay abre automaticamente em cada cliente.
- O GM captura a OBS Virtual Camera.
- Jogadores entram na sessão WebRTC automaticamente e recebem o vídeo.

Observação: esta versão usa servidores STUN públicos para descoberta de conexão. Em algumas redes muito restritivas pode ser necessário um servidor TURN na próxima etapa.


## v0.12.0

A sinalização WebRTC foi migrada do Broadcast efêmero para o Room Metadata do Owlbear. O metadata contém apenas ofertas/respostas SDP; os frames de vídeo continuam fora do sistema de scene/metadata.


## v0.12.0
A sinalização foi simplificada: o GM publica a oferta no próprio metadata e cada jogador publica sua resposta no próprio metadata. O Owlbear Party distribui esses estados; o vídeo continua sendo enviado diretamente por WebRTC.
