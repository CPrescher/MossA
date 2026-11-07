// Keep interface screenshots readable without an external image service.
const screenshots = document.querySelectorAll('.sl-markdown-content img');
if (screenshots.length) {
  const dialog = document.createElement('dialog');
  dialog.className = 'screenshot-dialog';
  dialog.setAttribute('aria-label', 'Screenshot preview');
  const heading = document.createElement('div');
  heading.className = 'screenshot-dialog-heading';
  const original = document.createElement('a');
  original.textContent = 'Open full-size image';
  original.target = '_blank';
  original.rel = 'noreferrer';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => dialog.close());
  heading.append(original, close);
  const preview = document.createElement('img');
  const description = document.createElement('p');
  description.className = 'screenshot-description';
  dialog.append(heading, preview, description);
  document.body.append(dialog);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  for (const image of screenshots) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'screenshot-enlarge';
    button.title = 'Enlarge screenshot';
    button.setAttribute('aria-label', `Enlarge screenshot: ${image.alt}`);
    image.before(button);
    button.append(image);
    button.addEventListener('click', () => {
      preview.src = image.currentSrc || image.src;
      preview.alt = image.alt;
      original.href = preview.src;
      description.textContent = image.alt;
      dialog.showModal();
      close.focus();
    });
  }
}
