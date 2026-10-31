// Interface texts by id (contract C11, site/rts/dados/textos/pt-BR.json, owned by the design front): the file is
// { versao, idioma, textos: { "hud.carga": "Carga", ... } }, nested objects inside are read as dotted ids too, and
// {name} in a text is replaced by the value given for it. Unit and building names are "unidade.<nome>.nome" and
// "predio.<nome>.nome", with <nome> the data id of C5.
// PROVISORIOS is the copy of the ids this front asked the design front for, used only while the C11 file lacks them;
// a test checks the file against this list, and once every id is there the list can go.

export const PROVISORIOS = Object.freeze({
  'hud.carga': 'Carga',
  'hud.lotacao': 'Lotação',
  'hud.selecionadas': '{n} selecionadas',
  'hud.selecionada': '1 selecionada',
  'hud.nada_selecionado': 'Nada selecionado',
  'hud.fila': 'Fila',
  'hud.fila_vazia': 'Fila vazia',
  'hud.pronto_posicionar': 'Pronto: clique no mapa para posicionar',
  'hud.posicionar': 'Clique dentro da rede para posicionar {nome}; Esc ou clique direito cancela',
  'hud.posicao_invalida': 'Fora da rede ou terreno ocupado',
  'hud.sem_carga': 'Carga insuficiente',
  'hud.lotacao_cheia': 'Lotação cheia',
  'hud.fila_cheia': 'Fila cheia',
  'hud.coletor_ocioso': 'Coletor ocioso',
  'hud.coletores_ociosos': '{n} coletores ociosos',
  'hud.ultimo_alerta': 'Ir ao último alerta',
  'hud.base': 'Base',
  'hud.pausado': 'Pausado. P continua.',
  'hud.saturacao': '{n}/{max} coletores',
  'hud.restante': '{n} C restantes',
  'hud.em_construcao': 'Em construção {pct}%',
  'hud.fora_da_area': 'Fora da rede',
  'hud.terreno_ocupado': 'Terreno ocupado',
  'hud.terreno_improprio': 'Terreno impróprio para construir',
  'hud.celula_nao_ventosa': 'Precisa de um ponto de vento',
  'hud.bloqueado': 'Ainda não disponível',
  'hud.nada_pronto': 'Nada pronto para posicionar',
  'hud.limite': 'Limite desse tipo atingido',
  'hud.perto_das_pilhas': 'Perto demais das pilhas',
  'hud.sem_energia': '{nome} sem energia',
  'hud.rajada': 'Rajada de vento em {s} s',
  'hud.rajada_em': 'Rajada de vento em {s} s',
  'hud.aviso_ataque': 'Ataque a caminho',
  'hud.objetivos': 'Objetivos',
  'hud.mais': 'Mais',
  'alerta.sob_ataque': 'Sob ataque',
  'alerta.base_sob_ataque': 'A base está sob ataque',
  'alerta.coletor_sob_ataque': 'Coletor sob ataque',
  'alerta.producao_concluida': '{nome} pronto',
  'alerta.construcao_concluida': '{nome} concluído',
  'alerta.predio_pronto': '{nome} pronto para posicionar',
  'alerta.recurso_esgotado': 'Cemitério esgotado',
  'alerta.coletor_perdido': 'Coletor destruído: a carga ficou no chão',
  'alerta.rede_cortada': 'Poste derrubado: parte da base ficou sem rede',
  'alerta.rajada_paga': 'Rajada: +{n} C',
  'alerta.promocao': '{nome} subiu para o nível {n}',
  'alerta.religado': '{nome} religado',
  'menu.titulo': 'Menu',
  'menu.continuar': 'Continuar',
  'menu.recomecar': 'Recomeçar',
  'menu.velocidade': 'Velocidade',
  'menu.sair': 'Sair para a Salinha',
  'menu.som': 'Som',
  'menu.comecar': 'Começar',
  'menu.carregando': 'Carregando',
  'menu.aba_oculta': 'Pausado porque a aba ficou escondida',
  'menu.copiar_registro': 'Copiar registro',
  'fim.vitoria': 'Vitória',
  'fim.derrota': 'Derrota',
  'fim.encerrada': 'Partida encerrada',
  'fim.tempo': 'Partida de {min} min',
  'fim.diversao': 'De 1 a 5, quanto você se divertiu?',
  'fim.jogaria': 'Jogaria de novo?',
  'fim.sim': 'Sim',
  'fim.nao': 'Não',
  'fim.comentario': 'Comentário (opcional)',
  'fim.baixar': 'Baixar registro',
  'fim.baixado': 'Registro baixado: {arquivo}. Mande esse arquivo ao Victor.',
  'fim.sem_registro': 'O registro não carregou; anote as respostas e mande ao Victor.',
  'fim.encerrar': 'Encerrar e responder',
  'comando.atacar_mover': 'Atacar-mover',
  'comando.mover': 'Mover',
  'comando.parar': 'Parar',
  'comando.segurar': 'Segurar',
  'comando.patrulhar': 'Patrulhar',
  'comando.ponto_encontro': 'Ponto de encontro',
  'comando.coletar': 'Coletar',
  'comando.cancelar': 'Cancelar',
  'comando.reparar': 'Reparar',
  'hud.modo_alvo': 'Clique no alvo; Shift mantém para outro; Esc ou clique direito cancela.',
  'hud.modo_reparar': 'Clique na unidade, no prédio ou na estrutura a reparar; Shift mantém para outro; Esc ou clique direito cancela.',
  'hud.modo_chao': 'Clique no chão para {modo}; Shift mantém para enfileirar; Esc ou clique direito cancela.',
  'hud.guardar_grupo': 'Toque no número do grupo para guardar a seleção.',
  'hud.religacao': '{nome}: religando, faltam {s} s',
  'hud.religacao_parada': '{nome}: religação parada em {pct}%',
  'briefing.titulo': 'Ordem de serviço',
  'briefing.pular': 'Pular',
  'briefing.proxima': 'Próxima',
  'briefing.comecar': 'Ao trabalho',
  'falante.supervisora': 'Supervisora da Regional',
  'falante.locutor': 'Locutor',
  'fim.jogaria_proxima': 'Jogaria a próxima fase?',
  'resultado.objetivos': 'Objetivos: {feitos} de {total} principais, {opcionais} de {totalOpcionais} opcionais',
  'menu.dificuldade': 'Dificuldade',
  'dificuldade.facil': 'Fácil',
  'dificuldade.normal': 'Normal',
  'dificuldade.dificil': 'Difícil',
  'resultado.tempo': 'Tempo: {tempo}',
  'resultado.veteranos': 'Veteranos: {n}',
  'resultado.coletores_perdidos': 'Coletores perdidos: {n}',
});

/** Flattens nested objects into dotted ids; only string leaves are texts. */
export function achatar(objeto, prefixo = '', saida = {}) {
  for (const [chave, valor] of Object.entries(objeto ?? {})) {
    const id = prefixo ? `${prefixo}.${chave}` : chave;
    if (typeof valor === 'string') saida[id] = valor;
    else if (valor && typeof valor === 'object' && !Array.isArray(valor)) achatar(valor, id, saida);
  }
  return saida;
}

/**
 * Text lookup over a C11 table. A missing id falls back to PROVISORIOS and then to the id itself, so a gap shows on
 * screen instead of breaking the page; each missing id is reported once.
 */
export function criarTextos(arquivo = {}) {
  const textos = { ...PROVISORIOS, ...achatar(arquivo.textos ?? arquivo) };
  const avisados = new Set();
  function texto(id, valores) {
    let modelo = textos[id];
    if (modelo === undefined) {
      if (!avisados.has(id)) {
        avisados.add(id);
        console.warn(`text id missing from C11: ${id}`);
      }
      modelo = id;
    }
    return valores ? modelo.replace(/\{(\w+)\}/g, (inteiro, nome) => (nome in valores ? String(valores[nome]) : inteiro)) : modelo;
  }
  /** Whether the id has a text, so a caller can fall back without a warning (names of kinds without copy yet). */
  texto.tem = id => id in textos;
  /** Every id with a text (the briefing finds a mission's lines by their id pattern). */
  texto.ids = () => Object.keys(textos);
  return texto;
}

/** Loads the C11 file; a missing or broken file leaves only the provisional texts, with a warning. */
export async function carregarTextos(url = new URL('../../dados/textos/pt-BR.json', import.meta.url)) {
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return criarTextos(await resposta.json());
  } catch (erro) {
    console.warn('interface texts (C11) not loaded, using the provisional ones', erro);
    return criarTextos();
  }
}
