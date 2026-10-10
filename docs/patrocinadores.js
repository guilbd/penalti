// Lista reserva do painel de LED, usada só quando o jogo não consegue buscar o cadastro
// (primeira abertura sem internet). As marcas de verdade são cadastradas em
// admin-patrocinadores.html.
window.PK_SPONSORS = {
  tempo: 7,
  contato: '',
  marcas: [
    { id: 'next-player', nome: 'Next Player', tipo: 'nextplayer' },
    { id: 'anuncie-aqui', nome: 'Anuncie aqui', texto: 'SUA MARCA AQUI · ANUNCIE', fundo: '#060606', cor: '#f2c230', exemplo: true },
    { id: 'next-player-verde', nome: 'Next Player (verde)', tipo: 'nextplayer', variante: 1 },
    { id: 'espaco-patrocinador', nome: 'Espaço para patrocinador', texto: 'ESPAÇO PARA PATROCINADOR', fundo: '#0b2a6b', cor: '#ffffff', exemplo: true },
  ]
};
