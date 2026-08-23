const tokenEl = document.getElementById('token');
const serverEl = document.getElementById('serverUrl');
const statusEl = document.getElementById('status');

chrome.storage.sync.get(['token', 'serverUrl'], ({ token, serverUrl }) => {
  if (token) tokenEl.value = token;
  serverEl.value = serverUrl || 'http://localhost:7638';
});

document.getElementById('save').addEventListener('click', () => {
  const token = tokenEl.value.trim();
  const serverUrl = serverEl.value.trim();
  chrome.storage.sync.set({ token, serverUrl }, () => {
    statusEl.textContent = 'Salvo!';
    setTimeout(() => (statusEl.textContent = ''), 2000);
  });
});
