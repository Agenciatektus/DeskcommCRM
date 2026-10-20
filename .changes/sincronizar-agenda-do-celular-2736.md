---
impacto: capacidade_nova
secao: adicionado
titulo: Contatos ganham o botão "Sincronizar agenda" que importa os contatos salvos no celular conectado
---

Na tela de Contatos, ao lado de "Importar CSV", o botão "Sincronizar agenda" lê a agenda do número de WhatsApp conectado pelo aplicativo e cria no CRM, até 500 por vez, os contatos salvos no aparelho que têm WhatsApp. Quando a agenda é maior que uma passada, o botão "Continuar de onde parou" segue do contato seguinte — sem reler os primeiros nem repetir quem já entrou, e agendas de qualquer tamanho terminam em passadas de 500. Grupos não entram, e quem já está no CRM não é duplicado nem alterado. O diálogo avisa que a agenda traz também contatos pessoais e que campanha só deve ir a quem autorizou receber. Os contatos importados aparecem com a origem "Agenda do celular" na ficha e no filtro de origem da lista. O nome salvo no celular vai para o campo "Nome na agenda do celular", que só a equipe vê, e nunca para o nome usado nas mensagens. Cada sincronização fica registrada na auditoria. Só números conectados pelo aplicativo do WhatsApp (QR code) têm agenda para ler; número da API oficial não tem.

Você não precisa fazer nada.

Contribuição de @webtecnica (#2776), a partir da issue #2736.
