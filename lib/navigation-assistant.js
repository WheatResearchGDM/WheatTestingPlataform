/**
 * Local navigation adapter. No credentials, remote calls or record mutations.
 * A future model adapter can return the same { type, target } intents.
 */
export function interpretCommand(input) {
  const text = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (/explic|esta tela|ajuda|como funciona/.test(text)) return { type: 'explain' };
  if (/tema|escuro|claro/.test(text)) return { type: 'theme' };
  if (/brasil/.test(text)) return { type: 'program', target: 'Brasil' };
  const program = text.match(/programa\s*([ukx])\b/);
  if (program) return { type: 'program', target: program[1].toUpperCase() };
  const routes = [
    ['cadastros', /configura|gerenc|implantacao|cadastr/],
    ['operacional', /operacional|semeadura|colheita/],
    ['campo', /registro de campo|inspec|avaliar/],
    ['planejamento', /calendario|planejamento|agenda/],
    ['rotas', /rota|percurso|visita avulsa/],
    ['clima', /clima|climat|chuva|previsao/],
    ['mapa', /mapa|croqui/],
    ['historico', /historico|realizada/],
    ['ensaios', /ensaio/],
    ['usuarios', /usuario|permiss/],
    ['dashboard', /relatorio|resultado|qualidade|inicio|home|visao geral/],
  ];
  const match = routes.find(([, pattern]) => pattern.test(text));
  return match ? { type: 'navigate', target: match[0] } : { type: 'unknown' };
}

export function mountNavigationAssistant({ root = document.body } = {}) {
  const controller = new AbortController();
  const { signal } = controller;
  const host = document.createElement('div');
  host.className = 'navigation-assistant';
  host.innerHTML = `
    <button class="ai-launcher" type="button" aria-expanded="false" aria-controls="navigation-assistant-panel" aria-label="Abrir assistente de navegação">
      <span aria-hidden="true">✦</span><span>Assistente</span>
    </button>
    <aside id="navigation-assistant-panel" class="ai-panel" role="dialog" aria-modal="false" aria-labelledby="assistant-title" aria-hidden="true" inert>
      <header class="ai-panel-header">
        <div><span class="ai-spark" aria-hidden="true">✦</span><div><h2 id="assistant-title">Seu assistente de campo</h2><p>Ajuda de navegação · comandos locais</p></div></div>
        <button type="button" class="ai-close" aria-label="Fechar assistente">×</button>
      </header>
      <div class="ai-messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversa com o assistente"></div>
      <div class="ai-suggestions" aria-label="Sugestões rápidas">
        <button type="button" data-prompt="Ir para Relatórios">Ir para Relatórios</button>
        <button type="button" data-prompt="Abrir Configurações">Abrir Configurações</button>
        <button type="button" data-prompt="Explicar esta tela">Explicar esta tela</button>
      </div>
      <form class="ai-composer">
        <label class="sr-only" for="assistant-prompt">Como posso ajudar na navegação?</label>
        <textarea id="assistant-prompt" rows="2" maxlength="500" placeholder="O que você quer encontrar?"></textarea>
        <button type="submit" aria-label="Enviar comando">↑</button>
      </form>
      <footer>Não altera seus registros. Use os formulários para salvar atividades.</footer>
    </aside>`;
  root.append(host);
  const launcher = host.querySelector('.ai-launcher');
  const panel = host.querySelector('.ai-panel');
  const input = host.querySelector('textarea');
  const messages = host.querySelector('.ai-messages');
  let highlightTimer;
  let focusTimer;
  let highlighted;

  function appendMessage(text, author = 'assistant') {
    const item = document.createElement('p');
    item.className = 'ai-message ai-message--' + author;
    item.textContent = text;
    messages.append(item);
    while (messages.children.length > 40) messages.firstElementChild.remove();
    messages.scrollTop = messages.scrollHeight;
  }
  function setOpen(open) {
    panel.classList.toggle('is-open', open);
    panel.inert = !open;
    panel.setAttribute('aria-hidden', String(!open));
    launcher.setAttribute('aria-expanded', String(open));
    launcher.hidden = open;
    clearTimeout(focusTimer);
    if (open) focusTimer = setTimeout(() => input.focus(), 150);
    else launcher.focus();
  }
  function highlight(element) {
    clearTimeout(highlightTimer);
    highlighted?.classList.remove('ai-highlight');
    highlighted = element;
    element.classList.add('ai-highlight');
    element.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    highlightTimer = setTimeout(() => element.classList.remove('ai-highlight'), 4500);
  }
  function run(command) {
    const prompt = command.trim().slice(0, 500);
    if (!prompt) return;
    appendMessage(prompt, 'user');
    input.value = '';
    const intent = interpretCommand(prompt);
    if (intent.type === 'explain') {
      const title = document.querySelector('main h1')?.textContent ?? 'Visão geral';
      const program = document.querySelector('.program-breadcrumb')?.textContent ?? 'Brasil';
      const descriptions = {
        'Visão geral': 'Acompanhe semeadura, prazo para colheita e qualidade média. Clique na qualidade ou abra um local para conferir erros e indicadores.',
        'Condições climáticas': 'Cada linha é um local e cada coluna um dos próximos sete dias. Clique no nome do local para consultar o histórico.',
        'Calendário da safra': 'Abra uma atividade para conferir local, tipo de ensaio e registrar sua execução.',
        'Rotas': 'Selecione áreas com visitas nos próximos ou últimos cinco dias. Ajuste a permanência e abra o percurso no navegador de sua preferência.',
        'Gerenciamento': 'Cadastre locais e mapas, organize programas e reporte problemas de implantação por PlotID.',
        'Registro de campo': 'Escolha a atividade, informe a data realizada e preencha o checklist. Estabelecimento e uniformidade são avaliados no perfilhamento.',
        'Registro operacional': 'Escolha semeadura, aplicação ou colheita e confirme a execução. A semeadura registrada alimenta o progresso da rede.',
      };
      appendMessage(program + ' · ' + title + '. ' + (descriptions[title] ?? 'Use o menu lateral para acessar os módulos disponíveis. A pasta selecionada define os locais e ensaios exibidos.'));
      const heading = document.querySelector('main h1');
      if (heading) highlight(heading);
      return;
    }
    if (intent.type === 'theme') {
      const dark = document.documentElement.dataset.theme !== 'dark';
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      appendMessage('Tema ' + (dark ? 'escuro' : 'claro') + ' ativado.');
      return;
    }
    if (intent.type === 'navigate' || intent.type === 'program') {
      const attribute = intent.type === 'program' ? 'data-program' : 'data-route';
      const element = document.querySelector('[' + attribute + '="' + intent.target + '"]');
      if (!element) {
        appendMessage('Esse acesso não está disponível neste contexto. Abra um programa U, K ou X pelas pastas no topo e confira as opções permitidas ao seu perfil.');
        const programs = document.querySelector('.program-hierarchy');
        if (programs) highlight(programs);
        return;
      }
      element.click();
      highlight(element);
      appendMessage('Abri ' + (element.getAttribute('title') ?? element.textContent.trim()) + '. O acesso usado está destacado na tela.');
      return;
    }
    appendMessage('Posso abrir calendário, clima, rotas, registros, gerenciamento e a síntese de relatórios. Tente “Abrir calendário”, “Programa U” ou “Explicar esta tela”.');
  }
  appendMessage('Olá! Posso ajudar você a encontrar telas e entender o acompanhamento da rede. O que deseja abrir?');
  launcher.addEventListener('click', () => setOpen(true), { signal });
  host.querySelector('.ai-close').addEventListener('click', () => setOpen(false), { signal });
  host.querySelector('form').addEventListener('submit', (event) => { event.preventDefault(); run(input.value); }, { signal });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); run(input.value); }
  }, { signal });
  host.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => run(button.dataset.prompt), { signal }));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && panel.classList.contains('is-open')) setOpen(false); }, { signal });
  return () => {
    controller.abort();
    clearTimeout(highlightTimer);
    clearTimeout(focusTimer);
    highlighted?.classList.remove('ai-highlight');
    host.remove();
  };
}
