/**
 * NoteReader — Non-blocking Toast Notification Helper
 */

let toastTimer = null;

export function showToast(message, duration = 3000) {
    let box = document.getElementById('toastBox');
    if (!box) {
        box = document.createElement('div');
        box.id = 'toastBox';
        box.setAttribute('role', 'status');
        box.setAttribute('aria-live', 'polite');
        box.className = 'fixed left-1/2 -translate-x-1/2 z-50 pointer-events-none opacity-0 transition-opacity duration-300 bg-[#2c1e16]/95 text-[#fdf6e7] border border-[#5e4332] px-4 py-2 rounded-full shadow-lg text-xs font-medium text-center max-w-xs sm:max-w-sm';
        box.style.top = 'calc(var(--safe-top, 0px) + 3.75rem)';
        document.body.appendChild(box);
    }

    box.textContent = message;
    box.classList.remove('opacity-0');
    box.classList.add('opacity-100');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        box.classList.remove('opacity-100');
        box.classList.add('opacity-0');
    }, duration);
}
