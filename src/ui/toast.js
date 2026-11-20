/** Non-blocking toast. Expects <div id="toastBox"> in index.html. */
let timer = null;

export function showToast(message, ms = 3000) {
  const box = document.getElementById('toastBox');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('opacity-0');
  box.classList.add('opacity-100');
  clearTimeout(timer);
  timer = setTimeout(() => {
    box.classList.remove('opacity-100');
    box.classList.add('opacity-0');
  }, ms);
}
