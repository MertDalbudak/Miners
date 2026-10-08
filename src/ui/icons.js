/*
  Inline SVG icons (consistent across platforms, unlike emoji)
*/

const svg = (body, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

export const Icons = {
  energy: svg('<path d="M13.5 2 4 13.5h6.2L9 22l10-12.2h-6.4L13.5 2z" fill="currentColor"/>'),
  pickaxe: svg('<path d="M4.5 3.5c4.7-1.6 10.4-.6 14.9 3.1-3.4-1.6-6.8-2-9.9-1.2l9.6 9.6-1.8 1.8-9.6-9.6c-.8 3.1-.4 6.5 1.2 9.9C5.2 12.6 2.9 8.2 4.5 3.5z" fill="currentColor"/><path d="m11.8 11.2 1.8-1.8 7.7 7.7a1.3 1.3 0 0 1-1.8 1.8l-7.7-7.7z" fill="currentColor" opacity=".75"/>'),
  shield: svg('<path d="M12 4.5c-4.6 0-8 3.3-8 7.6v1.6H2.5v2.2h19v-2.2H20v-1.6c0-4.3-3.4-7.6-8-7.6z" fill="currentColor"/><circle cx="12" cy="9.7" r="2.1" fill="#fff6d8"/><path d="M11 4.6h2v3.2h-2z" fill="currentColor" opacity=".6"/>'),
  flare: svg('<path d="M9.2 9.6 14.4 21l-3.2 1.4L6 11z" fill="currentColor"/><path d="M8.2 9.2c-.6-2.6.7-4.6 2.8-6.8.2 1.7 1 2.6 2.1 3.2 1.4.8 1.9 2.4 1.3 3.8-.9 2.2-5.6 2.6-6.2-.2z" fill="#ffd36b"/>'),
  coin: svg('<circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="12" cy="12" r="6.3" fill="none" stroke="#7a4a00" stroke-width="1.6" opacity=".45"/><path d="M10.6 8h2.8v8h-2.8z" fill="#7a4a00" opacity=".45"/>'),
  gem: svg('<path d="M7 3h10l4 5.5L12 21 3 8.5z" fill="currentColor"/><path d="M7 3 9.5 8.5 12 21 14.5 8.5 17 3M3 8.5h18" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.2"/>'),
  torch: svg('<path d="M10.2 11h3.6l-1.1 10.5h-1.4z" fill="#a8743d"/><path d="M12 2.2c2.8 2.6 4 4.7 3.6 6.6-.3 1.6-1.8 2.7-3.6 2.7S8.7 10.4 8.4 8.8C8 6.9 9.2 4.8 12 2.2z" fill="currentColor"/>'),
  lamp: svg('<path d="M12 5c-4 0-7 2.7-7 6.3V13h14v-1.7C19 7.7 16 5 12 5z" fill="currentColor"/><circle cx="12" cy="9.5" r="2" fill="#fff6d8"/><path d="M3 15h18v2H3z" fill="currentColor"/><path d="M12 9.5 22 4v11z" fill="#fff3c0" opacity=".35"/>'),
  pause: svg('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>'),
  play: svg('<path d="M8 5v14l11-7z" fill="currentColor"/>'),
  gear: svg('<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 5.1-.1-3.2 2-1.5-2-3.5-2.4.8a8 8 0 0 0-2.7-1.6L14.7 2h-4l-.6 2.5a8 8 0 0 0-2.7 1.6L5 5.3 3 8.8l2 1.6v3.2l-2 1.6 2 3.5 2.4-.9c.8.7 1.7 1.2 2.7 1.6l.6 2.6h4l.6-2.6c1-.4 1.9-.9 2.7-1.6l2.4.9 2-3.5z" fill="currentColor"/>'),
  trophy: svg('<path d="M7 3h10v2h3v2.5c0 2.6-1.9 4.6-4.4 4.9A5 5 0 0 1 13 15.8V18h3v3H8v-3h3v-2.2a5 5 0 0 1-2.6-3.4C5.9 12.1 4 10.1 4 7.5V5h3zm-1 4v.5c0 1.2.6 2.2 1.6 2.6A9 9 0 0 1 7 7zm12 0h-1c0 1.1-.2 2.2-.6 3.1 1-.4 1.6-1.4 1.6-2.6z" fill="currentColor"/>'),
  back: svg('<path d="M14.6 5.4 8 12l6.6 6.6 1.6-1.6-5-5 5-5z" fill="currentColor"/>'),
  left: svg('<path d="M15.4 5.4 8.8 12l6.6 6.6 1.7-1.7L12.2 12l4.9-4.9z" fill="currentColor"/>'),
  right: svg('<path d="m8.6 5.4 6.6 6.6-6.6 6.6-1.7-1.7 4.9-4.9-4.9-4.9z" fill="currentColor"/>'),
  down: svg('<path d="M5.4 8.6 12 15.2l6.6-6.6 1.7 1.7L12 18.6l-8.3-8.3z" fill="currentColor"/>'),
  calendar: svg('<path d="M7 2h2v2h6V2h2v2h3v17H4V4h3zm-1 7v10h12V9zm2 2h3v3H8z" fill="currentColor"/>'),
  chart: svg('<path d="M4 20h17v1.5H2.5V3H4zm2-3h3V9H6zm5 0h3V5h-3zm5 0h3v-6h-3z" fill="currentColor"/>'),
  star: svg('<path d="m12 2.8 2.8 6 6.5.6-4.9 4.3 1.5 6.4L12 16.8l-5.9 3.3 1.5-6.4-4.9-4.3 6.5-.6z" fill="currentColor"/>'),
  lock: svg('<path d="M7 10V7.5a5 5 0 0 1 10 0V10h1.5v11h-13V10zm2.5 0h5V7.5a2.5 2.5 0 0 0-5 0z" fill="currentColor"/>'),
  sound: svg('<path d="M4 9h4l5-4.5v15L8 15H4zm11.5 3c0-1.6-.9-3-2.2-3.7v7.4c1.3-.7 2.2-2.1 2.2-3.7zm-2.2-8.4v2.1A6.5 6.5 0 0 1 18.5 12a6.5 6.5 0 0 1-5.2 6.3v2.1A8.6 8.6 0 0 0 20.6 12a8.6 8.6 0 0 0-7.3-8.4z" fill="currentColor"/>'),
  mute: svg('<path d="M4 9h4l5-4.5v15L8 15H4zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" fill="currentColor"/>'),
  fullscreen: svg('<path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z" fill="currentColor"/>'),
  skull: svg('<path d="M12 2.5c-4.7 0-8 3.2-8 7.6 0 2.7 1.3 4.6 3 5.8V19h2v-1.5h1.5V19h3v-1.5H15V19h2v-3.1c1.7-1.2 3-3.1 3-5.8 0-4.4-3.3-7.6-8-7.6zM8.6 13a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8zm6.8 0a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8z" fill="currentColor"/>'),
  heart: svg('<path d="M12 20.5 3.6 12.3A5 5 0 0 1 12 6a5 5 0 0 1 8.4 6.3z" fill="currentColor"/>'),
  info: svg('<path d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm1.2 15h-2.4v-7h2.4zm-1.2-8.6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" fill="currentColor"/>')
};
