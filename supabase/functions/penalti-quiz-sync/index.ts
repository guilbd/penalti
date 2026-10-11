// Atualização semanal das trajetórias do quiz pelo Wikidata (dados CC0).
// Compara o clube ATUAL de cada jogador (vínculo sem data de fim) com o último clube cadastrado:
// toda diferença vira sugestão "pendente" para o gestor aceitar com um clique (o Wikidata às vezes erra ou é vandalizado,
// então nada muda sozinho). Sugestão já vista (aceita ou rejeitada) não volta.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const UA = 'PenaltiQuizBot/1.0 (quiz educativo de futebol)';
const SHORT: Record<string, string> = {"Clube Atlético Mineiro": "Atlético-MG", "Atlético Mineiro": "Atlético-MG", "Cruzeiro Esporte Clube": "Cruzeiro", "Cruzeiro E.C.": "Cruzeiro", "Sport Club Corinthians Paulista": "Corinthians", "S.C. Corinthians Paulista": "Corinthians", "Sociedade Esportiva Palmeiras": "Palmeiras", "São Paulo Futebol Clube": "São Paulo", "Santos Futebol Clube": "Santos", "Red Bull Bragantino": "Bragantino", "Clube Atlético Bragantino": "Bragantino", "Clube de Regatas do Flamengo": "Flamengo", "CR Flamengo": "Flamengo", "Fluminense Football Club": "Fluminense", "Fluminense FC": "Fluminense", "Club de Regatas Vasco da Gama": "Vasco", "CR Vasco da Gama": "Vasco", "Botafogo de Futebol e Regatas": "Botafogo", "Mirassol Futebol Clube": "Mirassol", "Club Athletico Paranaense": "Athletico-PR", "Coritiba Foot Ball Club": "Coritiba", "Grêmio Foot-Ball Porto Alegrense": "Grêmio", "Grêmio FBPA": "Grêmio", "Sport Club Internacional": "Internacional", "SC Internacional": "Internacional", "Associação Chapecoense de Futebol": "Chapecoense", "Esporte Clube Bahia": "Bahia", "EC Bahia": "Bahia", "Esporte Clube Vitória": "Vitória", "EC Vitória": "Vitória", "Clube do Remo": "Remo", "Fortaleza Esporte Clube": "Fortaleza", "Ceará Sporting Club": "Ceará", "Sport Club do Recife": "Sport", "Esporte Clube Juventude": "Juventude", "Goiás Esporte Clube": "Goiás", "América Futebol Clube": "América-MG", "Cuiabá Esporte Clube": "Cuiabá", "Avaí Futebol Clube": "Avaí", "Real Madrid Club de Fútbol": "Real Madrid", "Real Madrid CF": "Real Madrid", "Futbol Club Barcelona": "Barcelona", "FC Barcelona": "Barcelona", "Manchester City Football Club": "Manchester City", "Liverpool Football Club": "Liverpool", "Arsenal Football Club": "Arsenal", "Chelsea Football Club": "Chelsea", "Manchester United Football Club": "Manchester United", "Fußball-Club Bayern München": "Bayern de Munique", "FC Bayern München": "Bayern de Munique", "Bayern München": "Bayern de Munique", "Paris Saint-Germain Football Club": "PSG", "Paris Saint-Germain": "PSG", "Football Club Internazionale Milano": "Inter de Milão", "Internazionale": "Inter de Milão", "Inter Milan": "Inter de Milão", "Associazione Calcio Milan": "Milan", "AC Milan": "Milan", "Juventus Football Club": "Juventus", "Juventus FC": "Juventus", "Società Sportiva Calcio Napoli": "Napoli", "SSC Napoli": "Napoli", "Club Atlético de Madrid": "Atlético de Madrid", "Atlético Madrid": "Atlético de Madrid", "Ballspielverein Borussia 09 e.V. Dortmund": "Borussia Dortmund", "Tottenham Hotspur Football Club": "Tottenham", "Tottenham Hotspur": "Tottenham", "Sport Lisboa e Benfica": "Benfica", "Futebol Clube do Porto": "Porto", "FC Porto": "Porto", "Sporting Clube de Portugal": "Sporting", "Ajax Amsterdam": "Ajax", "AFC Ajax": "Ajax", "Olympique Lyonnais": "Lyon", "Olympique de Marseille": "Olympique de Marseille", "AS Monaco FC": "Monaco", "Bayer 04 Leverkusen": "Bayer Leverkusen", "RB Leipzig": "RB Leipzig", "Sevilla FC": "Sevilla", "Real Betis Balompié": "Betis", "Valencia CF": "Valencia", "Villarreal CF": "Villarreal", "Associazione Sportiva Roma": "Roma", "AS Roma": "Roma", "ACF Fiorentina": "Fiorentina", "Società Sportiva Lazio": "Lazio", "SS Lazio": "Lazio", "Atalanta BC": "Atalanta", "Newcastle United F.C.": "Newcastle", "West Ham United F.C.": "West Ham", "Aston Villa F.C.": "Aston Villa", "Everton F.C.": "Everton", "Galatasaray SK": "Galatasaray", "Fenerbahçe SK": "Fenerbahçe", "Al-Hilal SFC": "Al-Hilal", "Al Nassr FC": "Al-Nassr", "Al-Ittihad Club": "Al-Ittihad", "Club Atlético River Plate": "River Plate", "Club Atlético Boca Juniors": "Boca Juniors", "Futbolniy Klub Shakhtar": "Shakhtar Donetsk", "Fenerbahçe Spor Kulübü": "Fenerbahçe", "Girona Futbol Club": "Girona", "Frosinone Calcio": "Frosinone", "Granada Club de Fútbol": "Granada", "PSV Eindhoven": "PSV", "VfL Wolfsburg": "Wolfsburg", "Lekhwiya Sports Club": "Al-Duhail", "Real Sociedad de Fútbol": "Real Sociedad", "Club Alianza Lima": "Alianza Lima", "Swansea City Association": "Swansea City", "Real Club Deportivo Mallorca": "Mallorca", "Grupo Desportivo de Chaves": "Chaves", "Sporting Clube de Braga": "Braga", "Anyang LG Cheetahs": "FC Seoul", "Futbolniy Klub Dynamo Kyiv": "Dínamo de Kiev", "Sparta Roterdã": "Sparta Rotterdam", "Deportivo Alavés": "Alavés", "Club Atlético Huracán": "Huracán", "Racing Club de Avellaneda": "Racing Club", "RSC Anderlecht": "Anderlecht", "1. FC Nürnberg": "Nürnberg", "Çaykur Rizespor": "Rizespor", "Brighton & Hove Albion": "Brighton", "West Ham United": "West Ham", "Rosario Central": "Rosario Central", "Al-Qadsiah": "Al-Qadsiah"};
const CLUB: Record<string, string> = {"Genoa Cricket and": "Genoa", "de Nantes": "Nantes", "Amsterdamsche Football Club Ajax": "Ajax", "RasenBallsport Leipzig": "RB Leipzig", "Clube Botafogo de Futebol e Regatas": "Botafogo", "Reial Club Deportiu Espanyol de Barcelona": "Espanyol", "Association Sportive de Monaco": "Monaco", "Atalanta Bergamasca": "Atalanta", "Koninklijke Racing Club Genk": "Genk", "Club Brugge K.V.": "Club Brugge", "SBV Vitesse": "Vitesse", "Unione Sportiva Sassuolo": "Sassuolo", "Lille Olympique Sporting Club Métropole": "Lille", "Verein für Bewegungsspiele Stuttgart 1893": "Stuttgart", "Sport-Club Freiburg": "Freiburg", "1. Fußballclub Union Berlin": "Union Berlin", "Fußballclub Union Berlin": "Union Berlin", "1. Fußball-Club Köln 01/07": "Colônia", "Fußball-Club Köln 01/07": "Colônia", "Stade Rennais": "Rennes", "Sunderland Association": "Sunderland", "Hull City Association": "Hull City", "América Futebol Clube (Minas Gerais)": "América-MG", "Atlético Clube Goianiense": "Atlético-GO", "Portuguesa de Desportos": "Portuguesa", "Club Estudiantes de La Plata": "Estudiantes", "Estudiantes de La Plata": "Estudiantes", "Club Nacional de Football": "Nacional (Uruguai)", "Club Social y Deportivo Defensa y Justicia": "Defensa y Justicia", "Club Olimpia": "Olimpia", "Club de Gimnasia y Esgrima La Plata": "Gimnasia La Plata", "Club Libertad": "Libertad", "Santa Fe Corporación Deportiva": "Independiente Santa Fe", "Club Santos Laguna": "Santos Laguna", "Barcelona Sporting Club": "Barcelona de Guayaquil", "Corporación Deportiva Envigado": "Envigado", "Portimonense Sporting Clube": "Portimonense", "Futebol Clube de Vizela": "Vizela", "Casa Pia Atlético Clube": "Casa Pia", "Club Social y Deportivo Independiente José Terán": "Independiente del Valle", "Wydad Athletic Club": "Wydad", "Rayo Vallecano de Madrid": "Rayo Vallecano", "Rosenborg Ballklub": "Rosenborg", "FK Bodø/Glimt": "Bodø/Glimt", "Koninklijke Atletiek Associatie Gent": "Gent", "Sportklub Sturm Graz": "Sturm Graz", "Sportklub Rapid Wien": "Rapid Viena", "Verein für Bewegungsspiele Admira Wacker Mödling": "Admira Wacker", "F.C. København": "Copenhague", "Union Sportive Boulogne Côte d'Opale": "Boulogne", "e Recreativa Caxias do Sul": "Caxias", "Association Sportive Nancy-Lorraine": "Nancy", "Association de la Jeunesse Auxerroise": "Auxerre", "Amiens Sporting Club Football": "Amiens", "Stade Lavallois Mayenne": "Laval", "Idrottsföreningen Brommapojkarna": "Brommapojkarna", "AIK Fotboll": "AIK", "Viking Fotballklubb": "Viking", "Düsseldorfer Turn- und Sportverein Fortuna 1895": "Fortuna Düsseldorf", "Klub Sportowy Górnik Zabrze": "Górnik Zabrze", "Lanciano Calcio 1920": "Lanciano", "ACR Siena 1904": "Siena", "L.R. Vicenza": "Vicenza", "Unione Sportiva Cremonese": "Cremonese", "Real Sporting de Gijón": "Sporting Gijón", "FK AS Trenčín": "Trenčín", "Brasil": "Brasil de Pelotas", "1899 Hoffenheim": "Hoffenheim", "Dnipro Dnipropetrovsk": "Dnipro", "İstanbul Büyükşehir Belediyespor": "İstanbul Başakşehir", "Zenit São Petersburgo": "Zenit", "Clube de Futebol Estrela da Amadora": "Estrela da Amadora", "Académica de Coimbra – O.A.F.": "Académica", "Esbjerg fB": "Esbjerg", "des Girondins de Bordeaux": "Bordeaux", "Grêmio Esportivo Juventus": "Juventus (SC)", "Joinville Esporte Clube": "Joinville", "Ferroviária de Esportes": "Ferroviária", "Atlética Internacional (Limeira)": "Inter de Limeira", "Beşiktaş Jimnastik Kulübü": "Beşiktaş", "Seoul": "FC Seoul", "Sharjah": "Sharjah", "Hamburger SV": "Hamburgo", "Newcastle United": "Newcastle", "Wolverhampton Wanderers": "Wolverhampton", "Los Angeles Galaxy": "LA Galaxy", "Dinamo Moscou": "Dínamo de Moscou", "AFC Bournemouth": "Bournemouth", "Olympique de Marseille": "Olympique de Marseille", "Club Atlético Talleres": "Talleres", "América de Cáli": "América de Cali", "Club Social y Deportivo Defensa y Justicia ": "Defensa y Justicia"};
Object.assign(CLUB, { 'Club Internacional de Fútbol Miami': 'Inter Miami', 'Inter Miami CF': 'Inter Miami', 'Orlando City Soccer Club': 'Orlando City',
  'Orlando City': 'Orlando City', 'América': 'América (México)', 'Chicago Fire': 'Chicago Fire' });
const JUNK = /sub-?\d|\bu-?\d|\bB\b|juvenil|youth|reserv|\bII\b|j[uú]nior|primavera|academy|castilla|amateur|under-?\d|olympic|olímpic|^Jong |Mestalla| B$/i;

export function short(t0: string): string {
  let t = SHORT[t0] ?? t0;
  t = t.replace(/\s+(Football Club|Futebol Clube|Fútbol Club|Futbol Club|Club de Fútbol|Spor Kulübü|Sports Club|Soccer Club|Calcio|F\.C\.|FC|CF|S\.C\.|SC|A\.C\.|AC|SFC|F\.K\.|FK|SK)$/, '');
  t = t.replace(/^(Futbolniy Klub |Futbolny Klub |Football Club |VfL |VfB |SV |TSG |1\. FC |Real Club Deportivo |Club Deportivo )/, '');
  t = t.replace(/^(Clube de Regatas do |Clube de Regatas |Esporte Clube |Sport Club |Club de Fútbol |Club Atlético |Associação |Sociedade Esportiva |FC |AC |AS |SS |SC |CA |CD |RC |SL )/, '');
  t = (SHORT[t] ?? t).trim();
  return CLUB[t] ?? t;
}
// comparação tolerante: sem acento, minúsculas, sem palavras genéricas
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(fc|cf|sc|ac|club|clube|futebol|football|de|do|da|the)\b/g, '').replace(/[^a-z0-9]/g, '');
export const same = (a: string, b: string) => { const x = norm(a), y = norm(b); return x === y || (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x))); };

async function sparql(q: string) {
  for (let t = 0; t < 4; t++) {
    const r = await fetch('https://query.wikidata.org/sparql?' + new URLSearchParams({ query: q }), { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
    if (r.ok) return (await r.json()).results.bindings as Record<string, { value: string }>[];
    await new Promise(res => setTimeout(res, 5000 * (t + 1)));
  }
  throw new Error('wikidata indisponível');
}

Deno.serve(async req => {
  const { data: cfg } = await sb.from('penalti_push_config').select('token').eq('id', 1).single();
  if (!cfg || req.headers.get('x-penalti-token') !== cfg.token) return new Response('forbidden', { status: 403 });
  const dry = !!(await req.json().catch(() => ({}))).dry;      // simulação: só lista o que mudaria
  const preview: unknown[] = [];
  const { data: players } = await sb.from('penalti_quiz_players').select('id,name,clubs,qid').eq('active', true).eq('retired', false).not('qid', 'is', null);
  const { data: seenRows } = await sb.from('penalti_quiz_updates').select('quiz_player,wd_club');
  const seen = new Set((seenRows || []).map(r => r.quiz_player + '|' + norm(r.wd_club)));
  let checked = 0, applied = 0, pending = 0, errors = 0;
  const list = players || [];
  for (let i = 0; i < list.length; i += 40) {
    const part = list.slice(i, i + 40);
    let rows: Record<string, { value: string }>[] = [];
    try {
      rows = await sparql(`SELECT ?p ?teamLabel ?st WHERE { VALUES ?p { ${part.map(p => 'wd:' + p.qid).join(' ')} }
        ?p p:P54 ?s . ?s ps:P54 ?team . FILTER NOT EXISTS { ?s pq:P582 ?en } OPTIONAL { ?s pq:P580 ?st }
        FILTER NOT EXISTS { ?team wdt:P31/wdt:P279* wd:Q6979593 }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "pt-br,pt,en". } }`);
    } catch (_) { errors += part.length; continue; }
    // clube atual = vínculo sem fim mais recente (ignora base, time B e seleções)
    const cur: Record<string, { team: string; st: string }> = {};
    for (const b of rows) {
      const qid = b.p.value.split('/').pop()!, team = b.teamLabel.value, st = b.st?.value || '';
      if (JUNK.test(team) || /^Q\d+$/.test(team)) continue;
      if (!cur[qid] || st > cur[qid].st) cur[qid] = { team, st };
    }
    for (const p of part) {
      checked++;
      const c = cur[p.qid]; if (!c) continue;
      const club = short(c.team), clubs: string[] = p.clubs || [], last = clubs[clubs.length - 1];
      if (!last || same(club, last)) continue;
      if (seen.has(p.id + '|' + norm(club))) continue;
      const isNew = !clubs.some(x => same(x, club));
      const next = clubs.concat(club);
      if (dry) { preview.push({ jogador: p.name, de: last, wd: c.team, para: club, novo: isNew }); continue; }
      // isNew = clube que ainda não está na trajetória (transferência); senão, volta a um clube antigo ou dado atrasado
      const { error } = await sb.from('penalti_quiz_updates').insert({ quiz_player: p.id, old_clubs: clubs, new_clubs: next, wd_club: club, status: 'pendente', novo: isNew });
      if (error) errors++; else pending++;
      seen.add(p.id + '|' + norm(club));
    }
    await new Promise(res => setTimeout(res, 1500));
  }
  if (dry) return new Response(JSON.stringify({ checked, errors, preview }), { headers: { 'Content-Type': 'application/json' } });
  await sb.from('penalti_quiz_sync_runs').insert({ checked, applied, pending, errors });
  return new Response(JSON.stringify({ checked, applied, pending, errors }), { headers: { 'Content-Type': 'application/json' } });
});
