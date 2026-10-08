/*
  Miners - entry point
  Code by Mert Dalbudak. Originally created 2015, rebuilt in 3D with PlayCanvas in 2026.
*/

import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './styles/main.css';
import { App } from './app.js';

// iOS Safari ignores user-scalable=no; stop pinch-zoom gestures over the game
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, e => e.preventDefault(), { passive: false });
}

const app = new App();
app.boot().then(() => {
  if (import.meta.env.DEV) {
    window.__miners = app;
    window.__ready = true;
  }
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
