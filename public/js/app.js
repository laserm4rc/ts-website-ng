// Rückfrage vor gefährlichen Aktionen: <form data-confirm="Wirklich löschen?">
document.addEventListener('submit', (event) => {
  const message = event.target.dataset?.confirm;
  if (message && !window.confirm(message)) event.preventDefault();
});

// Seitenbereiche mit data-live-url aktualisieren sich selbst, solange der Tab sichtbar ist
for (const element of document.querySelectorAll('[data-live-url]')) {
  const seconds = Number(element.dataset.refresh) || 30;

  setInterval(async () => {
    if (document.hidden) return;
    try {
      const response = await fetch(element.dataset.liveUrl);
      if (response.ok) element.innerHTML = await response.text();
    } catch {
      // Netzwerkfehler: beim nächsten Durchlauf erneut versuchen
    }
  }, seconds * 1000);
}
