// Aktualisiert den Channel-Baum regelmäßig, solange der Tab sichtbar ist
const container = document.getElementById('viewer-tree');

if (container) {
  const seconds = Number(container.dataset.refresh) || 10;

  const refresh = async () => {
    if (document.hidden) return;
    try {
      const response = await fetch('/viewer/tree');
      if (response.ok) container.innerHTML = await response.text();
    } catch {
      // Netzwerkfehler: beim nächsten Durchlauf erneut versuchen
    }
  };

  setInterval(refresh, seconds * 1000);
}