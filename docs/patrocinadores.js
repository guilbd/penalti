// Patrocinadores do painel de LED da arquibancada e da tela "Patrocinadores" do menu.
//
// Cada marca fica alguns segundos no painel e depois troca para a próxima.
// Campos de cada marca (todos opcionais):
//   nome    – nome da marca (aparece escrito se não houver logo nem texto)
//   id      – código da marca no relatório (letras minúsculas, números e hífen). Se faltar,
//             vem do nome. Não mude depois que a marca entrar, senão o relatório recomeça do zero.
//   logo    – imagem da marca, de preferência PNG com fundo transparente, guardada em
//             assets/patrocinadores/ (ex.: 'assets/patrocinadores/minha-marca.png')
//   texto   – frase ao lado do logo (ex.: 'O MELHOR AÇAÍ DA CIDADE')
//   fundo   – cor de fundo do painel (ex.: '#000000')
//   cor     – cor do texto (ex.: '#ffffff')
//   link    – site, Instagram ou WhatsApp da marca (botão "Visitar" na tela Patrocinadores)
//   peso    – quantas vezes a marca aparece a cada rodada (2 = o dobro do tempo de tela)
//   tipo    – 'nextplayer' usa a arte pronta da Next Player
//   exemplo – true para anúncios "anuncie aqui": aparecem no painel, mas não na lista de patrocinadores
//
// Exemplo de marca real:
//   { nome: 'Açaí do Zé', logo: 'assets/patrocinadores/acai-ze.png', texto: 'O MELHOR AÇAÍ DA CIDADE',
//     fundo: '#2a0a3a', cor: '#ffffff', link: 'https://instagram.com/acaidoze' },
window.PK_SPONSORS = {
  tempo: 7,          // segundos de cada marca no painel
  contato: '',       // link para quem quer anunciar (ex.: 'https://wa.me/5511999999999')
  marcas: [
    { tipo: 'nextplayer', nome: 'Next Player', peso: 2 },
    { nome: 'Anuncie aqui', texto: 'SUA MARCA AQUI · ANUNCIE', fundo: '#060606', cor: '#f2c230', exemplo: true },
    { tipo: 'nextplayer', nome: 'Next Player', variante: 1 },
    { nome: 'Anuncie aqui', texto: 'ESPAÇO PARA PATROCINADOR', fundo: '#0b2a6b', cor: '#ffffff', exemplo: true },
  ]
};
