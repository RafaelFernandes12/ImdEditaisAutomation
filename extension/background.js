// Service worker: holds the token + server URL and makes the cross-origin call
// to the NestJS server (which sends permissive CORS, so no host_permissions
// are required). Content scripts talk to it via chrome.runtime messaging.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'GET_ANSWERS') return;

  (async () => {
    const { token, serverUrl } = await chrome.storage.sync.get([
      'token',
      'serverUrl',
    ]);
    if (!token || !serverUrl) {
      sendResponse({
        error: 'Configure o token e a URL do servidor nas opções da extensão.',
      });
      return;
    }

    try {
      const url = serverUrl.replace(/\/$/, '') + '/forms/answer';
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          title: msg.title,
          questions: msg.questions,
        }),
      });
      if (!r.ok) {
        sendResponse({
          error: r.status === 401 ? 'Token inválido.' : 'HTTP ' + r.status,
        });
        return;
      }
      const data = await r.json();
      sendResponse({ answers: data.answers || [] });
    } catch (e) {
      sendResponse({ error: String(e) });
    }
  })();

  return true; // keep the message channel open for the async response
});
