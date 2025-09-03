(function () {
  function openModal(backdropId) {
    const back = document.getElementById(backdropId);
    if (!back) {
      console.warn('[modal] missing:', backdropId);
      return;
    }
    back.classList.add('show');
  }

  function closeModal(backdropId) {
    const back = document.getElementById(backdropId);
    if (!back) return;
    back.classList.remove('show');
  }

  // Close on Escape (shared)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-backdrop.show').forEach((back) => {
      back.classList.remove('show');
    });
  });

  // Expose
  window.openModal = openModal;
  window.closeModal = closeModal;
})();
