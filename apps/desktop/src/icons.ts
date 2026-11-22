const SVG = "http://www.w3.org/2000/svg";

const shapes = {
  play: '<path class="filled" d="M5 3.5v9l7-4.5z"/>',
  pause: '<path class="filled" d="M5 3.5h2v9H5zM9 3.5h2v9H9z"/>',
  restart: '<path d="M3 8a5 5 0 1 0 1.5-3.6"/><path d="M3 2.5v3h3"/>',
  "play-from-cursor": '<path d="M3.5 3v10"/><path class="filled" d="M7 3.5v9l6.5-4.5z"/>',
  record: '<circle class="filled" cx="8" cy="8" r="4.5"/>',
  stop: '<rect class="filled" x="4" y="4" width="8" height="8" rx="1.5"/>',
  mic: '<rect class="filled" x="5.5" y="1.5" width="5" height="8" rx="2.5"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5"/>',
  speaker: '<path class="filled" d="M2.5 6h2.5l3.5-3v10L5 10H2.5z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4"/>',
  perform: '<rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5"/><path d="M8 11v2.5M5 13.5h6"/>',
  chevron: '<path d="M4.5 6.5 8 10l3.5-3.5"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  folder: '<path d="M1.5 4.5a1 1 0 0 1 1-1h3.5l1.5 1.5h6a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/>',
  gear: '<circle cx="8" cy="8" r="2.25"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
  copy: '<rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M11 5V3.5A1 1 0 0 0 10 2.5H3.5a1 1 0 0 0-1 1V10a1 1 0 0 0 1 1H5"/>',
  external: '<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/>',
  swap: '<path d="M2.5 5.5h10l-2.5-2.5M13.5 10.5h-10l2.5 2.5"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  sidebar: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M10 2.5v11"/>',
  "panel-bottom": '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M1.5 9.5h13"/>',
} as const;

export type IconName = keyof typeof shapes;

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = shapes[name];
  return svg;
}
