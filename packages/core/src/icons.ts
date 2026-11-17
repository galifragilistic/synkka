// Icon glyphs (24×24 stroke icons) taken from design-source/*.dc.html.
// Platform-neutral: desktop renders them as <svg>, mobile with react-native-svg.

export type IconShape =
  | { type: 'path'; d: string }
  | { type: 'circle'; cx: number; cy: number; r: number }
  | { type: 'rect'; x: number; y: number; width: number; height: number; rx: number };

const p = (d: string): IconShape => ({ type: 'path', d });
const c = (cx: number, cy: number, r: number): IconShape => ({ type: 'circle', cx, cy, r });
const r = (x: number, y: number, width: number, height: number, rx: number): IconShape => ({
  type: 'rect', x, y, width, height, rx,
});

export const icons = {
  sync: [p('M21 12a9 9 0 0 1-15.5 6.2'), p('M3 12a9 9 0 0 1 15.5-6.2'), p('M18 2v4h-4'), p('M6 22v-4h4')],
  plus: [p('M12 5v14'), p('M5 12h14')],
  folder: [p('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z')],
  file: [p('M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z'), p('M14 3v5h5')],
  clock: [c(12, 12, 9), p('M12 7v5l3 2')],
  users: [c(9, 8, 3.5), p('M2.5 20a6.5 6.5 0 0 1 13 0'), p('M16 4.5a3.5 3.5 0 0 1 0 7'), p('M18 14a6.5 6.5 0 0 1 3.5 6')],
  monitor: [r(3, 4, 18, 12, 2), p('M8 20h8'), p('M12 16v4')],
  trash: [p('M4 7h16'), p('M10 11v6'), p('M14 11v6'), p('M6 7l1 13h10l1-13'), p('M9 7V4h6v3')],
  search: [c(11, 11, 7), p('M20 20l-3.5-3.5')],
  pause: [p('M9 5v14'), p('M15 5v14')],
  /** Not in the handover glyph list; needed for the "Jatka" (resume) state. */
  play: [p('M7 5l12 7-12 7z')],
  settings: [
    c(12, 12, 3),
    p('M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'),
  ],
  checkCircle: [c(12, 12, 9), p('M8 12l3 3 5-6')],
  alertTriangle: [p('M12 3l9.5 17h-19z'), p('M12 10v4'), p('M12 17.5v.5')],
  cloud: [p('M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z')],
  laptop: [r(4, 4, 16, 11, 1.5), p('M2 19h20')],
  smartphone: [r(6, 2, 12, 20, 2.5), p('M11 18h2')],
  copy: [r(8, 8, 12, 13, 2), p('M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2')],
  chevronLeft: [p('M15 6l-6 6 6 6')],
  chevronRight: [p('M9 6l6 6-6 6')],
  upload: [p('M12 15V3'), p('M7 8l5-5 5 5'), p('M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5')],
  user: [c(12, 8, 4), p('M4 21a8 8 0 0 1 16 0')],
  downloadCircle: [c(12, 12, 9), p('M12 7v8'), p('M8.5 12l3.5 3.5 3.5-3.5')],
  close: [p('M6 6l12 12'), p('M18 6L6 18')],
} satisfies Record<string, IconShape[]>;

export type IconName = keyof typeof icons;
