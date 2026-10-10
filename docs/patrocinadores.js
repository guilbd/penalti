// Patrocinadores do painel de LED da arquibancada.
//
// Cada marca fica alguns segundos no painel e depois troca para a próxima.
// Campos de cada marca (todos opcionais):
//   nome   – nome da marca (aparece escrito se não houver logo nem texto)
//   logo   – imagem da marca, de preferência PNG com fundo transparente, guardada em
//            assets/patrocinadores/ (ex.: 'assets/patrocinadores/minha-marca.png')
//   texto  – frase ao lado do logo (ex.: 'O MELHOR AÇAÍ DA CIDADE')
//   fundo  – cor de fundo do painel (ex.: '#000000')
//   cor    – cor do texto (ex.: '#ffffff')
//   peso   – quantas vezes a marca aparece a cada rodada (2 = o dobro do tempo de tela)
//   tipo   – 'nextplayer' usa a arte pronta da Next Player
window.PK_SPONSORS = {
  tempo: 7,          // segundos de cada marca no painel
  marcas: [
    { tipo: 'nextplayer', peso: 2 },
    { nome: 'Anuncie aqui', texto: 'SUA MARCA AQUI · ANUNCIE', fundo: '#060606', cor: '#f2c230' },
    { tipo: 'nextplayer', variante: 1 },
    { nome: 'Anuncie aqui', texto: 'ESPAÇO PARA PATROCINADOR', fundo: '#0b2a6b', cor: '#ffffff' },
  ]
};
