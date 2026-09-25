# Instalação no Windows — v0.10.0

1. Pare o servidor atual com `Ctrl + C`.
2. Extraia esta versão e abra a pasta no VS Code.
3. No terminal, rode `npm install`.
4. Depois rode `npm run dev`.
5. No Owlbear, remova a extensão antiga e adicione novamente `http://localhost:5173/manifest.json`.
6. Use Chrome para os testes.
7. No GM, abra a extensão, clique em `Listar câmeras`, selecione `OBS Virtual Camera` e clique em `Iniciar câmera`.
8. Clique `Criar moldura no mapa`.
9. Clique `Ativar para jogadores`.
10. Abra a mesma sala em outra janela/conta para testar o jogador. O jogador não deve clicar para ativar nada.

Nesta versão o vídeo real é enviado ao vivo por WebRTC. A moldura e o estado ligado/desligado continuam sendo sincronizados pelo Owlbear.
