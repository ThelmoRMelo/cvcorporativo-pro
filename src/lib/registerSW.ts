import { registerSW } from 'virtual:pwa-register';

const isAdmin = location.pathname.startsWith('/admin');
const blocked = !isAdmin || import.meta.env.DEV || window.self !== window.top || /(^|\.)lovable\.(app|dev)$|(^|\.)lovableproject\.com$/.test(location.hostname) || new URLSearchParams(location.search).get('sw') === 'off';

// Install prompt only for the admin area; visitors never see "install app".
if (!isAdmin) window.addEventListener('beforeinstallprompt', e => e.preventDefault());
else if (!document.querySelector('link[rel="manifest"]')) {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.webmanifest';
  document.head.appendChild(link);
}

export function registerAppWorker() {
  if (blocked) {
    navigator.serviceWorker?.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister()));
    return;
  }
  registerSW({ immediate: true });
}
