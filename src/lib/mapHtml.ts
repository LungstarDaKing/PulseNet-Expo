import { LatLng } from './geo';

export interface MapPoint { lat: number; lon: number; title: string; detail: string; color: string; kind: 'me' | 'alert' | 'help' }

/** Escapes JSON for safe embedding in an inline <script>. Alert text is untrusted. */
export const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function buildMapHtml(me: LatLng, points: MapPoint[]): string {
  // Leaflet 1.9.4 with Subresource Integrity. Popups are built with textContent, never innerHTML.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>html,body,#m{height:100%;margin:0;background:#0B0B10}.leaflet-popup-content{font:13px sans-serif}#err{color:#fff;font:14px sans-serif;padding:16px}</style></head>
<body><div id="m"></div><script>
if(!window.L){document.body.innerHTML='<div id="err">The map could not load. Check your internet connection.</div>';}else{
var me=${safeJson(me)},pts=${safeJson(points)};
var map=L.map('m').setView([me.latitude,me.longitude],14);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
pts.forEach(function(p){var m=L.circleMarker([p.lat,p.lon],{radius:p.kind==='me'?8:10,color:'#fff',weight:2,fillColor:p.color,fillOpacity:0.95}).addTo(map);
var d=document.createElement('div');var b=document.createElement('b');b.textContent=p.title;d.appendChild(b);d.appendChild(document.createElement('br'));d.appendChild(document.createTextNode(p.detail));m.bindPopup(d);});
}
</script></body></html>`;
}

