// Crawl the ES-module graph of a deployed page the way a browser would and report files that are missing or served with the wrong type.
// Usage: node tools/check_pages_modules.mjs https://<user>.github.io/<repo>/viewer/index_v2.html   (a failed import leaves window.THREE undefined)
const page = process.argv[2];
const html = await (await fetch(page)).text();
const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]).imports;
const entry = new URL(/<script type="module" src="([^"]+)"/.exec(html)[1], page).href;
const resolve = (spec, from) => {
  if (/^(\.|\/|https?:)/.test(spec)) return new URL(spec, from).href;
  if (map[spec]) return new URL(map[spec], page).href;
  const pre = Object.keys(map).filter(k => k.endsWith('/') && spec.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return pre ? new URL(map[pre] + spec.slice(pre.length), page).href : 'BARE:' + spec;
};
const seen = new Map(), queue = [[entry, '(page)']];
while (queue.length) {
  const [url, from] = queue.shift();
  if (seen.has(url)) continue;
  if (url.startsWith('BARE:')) { seen.set(url, { status: 'unresolvable bare specifier', from }); continue; }
  const r = await fetch(url), type = r.headers.get('content-type') || '', text = await r.text();
  seen.set(url, { status: r.status, type, bytes: text.length, from });
  if (r.status !== 200) continue;
  for (const m of text.matchAll(/(?:^|[\s;])(?:import|export)\s*(?:[^'"()]*?\sfrom\s*)?['"]([^'"]+)['"]/g)) queue.push([resolve(m[1], url), url]);
}
const bad = [...seen].filter(([, v]) => v.status !== 200 || !/javascript/.test(v.type));
console.log('modules:', seen.size, 'problems:', bad.length);
for (const [u, v] of bad) console.log('  ', v.status, v.type, u.replace(/^https?:\/\/[^/]+/, ''), ' <- ', String(v.from).split('/').pop());
