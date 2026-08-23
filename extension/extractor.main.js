// Runs in the page's MAIN world so it can read FB_PUBLIC_LOAD_DATA_ (a page
// global invisible to isolated content scripts). Extracts the form structure
// on request and posts it back to the content script via window.postMessage.
(function () {
  function extract() {
    try {
      const d = window.FB_PUBLIC_LOAD_DATA_;
      if (!d || !d[1] || !d[1][1]) return null;

      const questions = d[1][1]
        .filter((q) => q[4] && q[4][0])
        .map((q) => ({
          title: q[1],
          type: q[3],
          entryId: 'entry.' + q[4][0][0],
          options: (q[4][0][1] || []).map((o) => o[0]),
          required: !!q[4][0][2],
        }));

      const title = (d[1] && d[1][8]) || document.title;
      return { title, questions };
    } catch (e) {
      return null;
    }
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data) return;
    if (ev.data.type !== 'GFAI_EXTRACT_REQUEST') return;
    window.postMessage({ type: 'GFAI_STRUCTURE', payload: extract() }, '*');
  });
})();
