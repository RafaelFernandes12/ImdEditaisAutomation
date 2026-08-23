// Isolated-world content script: injects the launcher + review panel, talks to
// the MAIN-world extractor and the background worker, and triggers the fill.
(function () {
  const PANEL_ID = 'gfai-panel';
  const LAUNCH_ID = 'gfai-launch';

  function requestExtract() {
    return new Promise((resolve) => {
      const handler = (ev) => {
        if (ev.source !== window || !ev.data) return;
        if (ev.data.type !== 'GFAI_STRUCTURE') return;
        window.removeEventListener('message', handler);
        resolve(ev.data.payload);
      };
      window.addEventListener('message', handler);
      window.postMessage({ type: 'GFAI_EXTRACT_REQUEST' }, '*');
    });
  }

  function getAnswers(structure) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'GET_ANSWERS',
          title: structure.title,
          questions: structure.questions,
        },
        (resp) => resolve(resp || { error: 'sem resposta do background' }),
      );
    });
  }

  function removePanel() {
    document.getElementById(PANEL_ID)?.remove();
  }

  function showPanel(innerHtml) {
    removePanel();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = innerHtml;
    document.body.appendChild(panel);
    panel.querySelector('.gfai-close')?.addEventListener('click', removePanel);
    return panel;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    })[c]);
  }

  function renderReview(structure, answers) {
    const byEntry = new Map(answers.map((a) => [a.entryId, a.answer]));
    const rows = structure.questions
      .map((q) => {
        const val = byEntry.get(q.entryId);
        const shown = Array.isArray(val) ? val.join(', ') : (val ?? '');
        return `<div class="gfai-row">
          <label>${escapeHtml(q.title)}</label>
          <textarea data-entry="${escapeHtml(q.entryId)}" rows="2">${escapeHtml(shown)}</textarea>
        </div>`;
      })
      .join('');

    const panel = showPanel(`
      <div class="gfai-header">
        <span>Revisar respostas</span>
        <button class="gfai-close" title="Fechar">×</button>
      </div>
      <div class="gfai-body">${rows}</div>
      <div class="gfai-footer">
        <button class="gfai-approve">Aprovar e preencher</button>
      </div>
    `);

    panel.querySelector('.gfai-approve').addEventListener('click', () => {
      // Read (possibly edited) values back out of the textareas.
      const edited = structure.questions.map((q) => {
        const ta = panel.querySelector(`textarea[data-entry="${CSS.escape(q.entryId)}"]`);
        const raw = ta ? ta.value : '';
        const answer = q.type === 4 ? raw.split(',').map((s) => s.trim()).filter(Boolean) : raw;
        return { entryId: q.entryId, answer };
      });
      const results = window.GFAI_fill(structure.questions, edited);
      const failed = results.filter((r) => !r.ok);
      removePanel();
      if (failed.length) {
        showPanel(`
          <div class="gfai-header"><span>Preenchido com avisos</span><button class="gfai-close">×</button></div>
          <div class="gfai-body"><p>${failed.length} campo(s) não puderam ser preenchidos automaticamente. Revise e complete manualmente antes de enviar.</p></div>
        `);
      }
    });
  }

  async function run() {
    const structure = await requestExtract();
    if (!structure || !structure.questions?.length) {
      showPanel(`<div class="gfai-header"><span>Erro</span><button class="gfai-close">×</button></div>
        <div class="gfai-body"><p>Não consegui ler o formulário. Abra a página do formulário (viewform) e tente de novo.</p></div>`);
      return;
    }

    showPanel(`<div class="gfai-header"><span>Gerando respostas…</span><button class="gfai-close">×</button></div>
      <div class="gfai-body"><p>Consultando a IA…</p></div>`);

    const resp = await getAnswers(structure);
    if (resp.error) {
      showPanel(`<div class="gfai-header"><span>Erro</span><button class="gfai-close">×</button></div>
        <div class="gfai-body"><p>${escapeHtml(resp.error)}</p></div>`);
      return;
    }
    renderReview(structure, resp.answers || []);
  }

  function injectLauncher() {
    if (document.getElementById(LAUNCH_ID)) return;
    const btn = document.createElement('button');
    btn.id = LAUNCH_ID;
    btn.textContent = '📝 Preencher com IA';
    btn.addEventListener('click', run);
    document.body.appendChild(btn);
  }

  injectLauncher();
})();
