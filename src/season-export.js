import { formatSeasonDate, seasonPointsForPosition } from './season.js';

export function buildSeasonHtml({
  season = 2026,
  seriesName = 'Puchar Polski Strongman',
  maxCountedStarts = 4,
  events = [],
  standings = [],
  exportedAt = new Date().toISOString(),
  logoData = ''
} = {}) {
  const eventById = new Map(events.map(event => [event.id, event]));
  const completedEvents = events.filter(event => event.ranking?.length).length;
  const generatedAt = new Date(exportedAt).toLocaleString('pl-PL');
  const title = `Klasyfikacja generalna ${seriesName} ${season}`;

  const standingsMarkup = standings.map(row => {
    const countedIds = new Set(row.countedEventIds || []);
    const starts = (row.results || []).map(result => {
      const event = eventById.get(result.eventId);
      const counted = countedIds.has(result.eventId);
      return `
        <span class="start-chip ${counted ? 'is-counted' : 'is-rejected'}">
          <small>${escapeHtml(event?.location || result.location || 'Zawody')}</small>
          <strong>${escapeHtml(String(result.points))} pkt</strong>
          <em>${escapeHtml(String(result.position))}. miejsce${counted ? '' : ' · odrzucone'}</em>
        </span>`;
    }).join('');
    return `
      <article class="standing ${Number(row.rank) <= 3 ? 'is-podium' : ''}">
        <span class="rank">${escapeHtml(String(row.rank))}</span>
        <div class="standing-main">
          <h2>${escapeHtml(row.name)}</h2>
          <p>${escapeHtml(String(row.starts))} ${Number(row.starts) === 1 ? 'start' : 'starty'} · wszystkie punkty: ${escapeHtml(String(row.allPoints))}${Number(row.rejectedPoints) ? ` · odrzucone: ${escapeHtml(String(row.rejectedPoints))}` : ''}</p>
          <div class="starts">${starts}</div>
        </div>
        <strong class="total">${escapeHtml(String(row.countedPoints))} pkt</strong>
      </article>`;
  }).join('');

  const eventsMarkup = events.map((event, index) => `
    <article class="event-card">
      <header>
        <span>${index + 1}</span>
        <div>
          <h3>${escapeHtml(event.location)}</h3>
          <p>${escapeHtml(formatSeasonDate(event.date))}</p>
        </div>
      </header>
      <table>
        <thead><tr><th>Miejsce</th><th>Zawodnik</th><th>Punkty</th></tr></thead>
        <tbody>
          ${(event.ranking || []).map(result => `
            <tr>
              <td>${escapeHtml(String(result.position))}</td>
              <td>${escapeHtml(result.name)}</td>
              <td>${seasonPointsForPosition(result.position)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </article>`).join('');

  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escapeAttr(title)}">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:light;--navy:#0b2545;--orange:#f04a23;--green:#087a43;--gold:#f3b700;--ink:#111827;--muted:#425466;--line:#b7c4d1;--pale:#eef3f8}
    *{box-sizing:border-box}
    body{margin:0;color:var(--ink);background:#f5f8fb;font-family:Arial,Helvetica,sans-serif;letter-spacing:0}
    .page{width:min(1120px,100%);margin:auto;padding:22px}
    .hero{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:18px;border:3px solid var(--navy);border-radius:8px;padding:20px;background:#fff}
    .logo{width:120px;max-height:82px;object-fit:contain}
    .eyebrow{margin:0 0 5px;color:var(--orange);font-size:14px;font-weight:900;text-transform:uppercase}
    h1{margin:0;font-size:clamp(26px,5vw,44px);line-height:1.05}
    .hero-info{margin:10px 0 0;color:var(--muted);font-size:16px;font-weight:700}
    .rules{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0 22px}
    .rule{border:2px solid var(--line);border-radius:8px;padding:13px;background:#fff;text-align:center}
    .rule strong{display:block;color:var(--navy);font-size:22px}
    .rule span{display:block;margin-top:3px;color:var(--muted);font-size:13px;font-weight:700}
    .section-title{margin:28px 0 12px;font-size:25px}
    .standings{display:grid;gap:10px}
    .standing{display:grid;grid-template-columns:52px minmax(0,1fr) auto;align-items:start;gap:14px;border:2px solid var(--line);border-radius:8px;padding:14px;background:#fff}
    .standing.is-podium{border-color:var(--gold)}
    .rank{display:grid;width:44px;height:44px;place-items:center;border-radius:50%;color:#fff;background:var(--navy);font-size:20px;font-weight:900}
    .standing-main{min-width:0}
    .standing h2{margin:0;font-size:20px;overflow-wrap:anywhere}
    .standing p{margin:4px 0 10px;color:var(--muted);font-size:14px;font-weight:700}
    .total{align-self:center;color:var(--green);font-size:23px;white-space:nowrap}
    .starts{display:flex;flex-wrap:wrap;gap:6px}
    .start-chip{display:grid;min-width:96px;border:2px solid var(--line);border-radius:8px;padding:7px 9px;background:var(--pale)}
    .start-chip small{overflow-wrap:anywhere;font-weight:800}
    .start-chip strong{margin-top:2px}
    .start-chip em{margin-top:2px;color:var(--muted);font-size:11px;font-style:normal}
    .start-chip.is-counted{border-color:var(--green);background:#e8f7ef}
    .start-chip.is-rejected{border-color:#c73737;background:#fff0f0;opacity:.8}
    .events{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .event-card{break-inside:avoid;border:2px solid var(--line);border-radius:8px;padding:14px;background:#fff}
    .event-card header{display:grid;grid-template-columns:42px minmax(0,1fr);align-items:center;gap:10px;margin-bottom:10px}
    .event-card header>span{display:grid;width:38px;height:38px;place-items:center;border-radius:50%;color:#fff;background:var(--orange);font-weight:900}
    .event-card h3,.event-card p{margin:0}.event-card p{margin-top:2px;color:var(--muted);font-weight:700}
    table{width:100%;border-collapse:collapse;font-size:14px}
    th,td{border:1px solid var(--line);padding:8px;text-align:left}
    th{color:#fff;background:var(--navy)}
    td:first-child,td:last-child{width:76px;text-align:center;font-weight:900}
    footer{margin-top:26px;border-top:2px solid var(--line);padding-top:14px;color:var(--muted);font-size:13px;text-align:center}
    @media(max-width:700px){.page{padding:12px}.hero{grid-template-columns:78px minmax(0,1fr);padding:14px}.logo{width:78px}.rules{grid-template-columns:1fr}.standing{grid-template-columns:44px minmax(0,1fr);gap:10px}.rank{width:40px;height:40px}.total{grid-column:2;font-size:22px}.events{grid-template-columns:1fr}.start-chip{flex:1 1 104px}.section-title{font-size:22px}}
    @media print{body{background:#fff}.page{width:100%;padding:0}.hero,.standing,.event-card,.rule{box-shadow:none}.standing,.event-card{break-inside:avoid}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      ${logoData ? `<img class="logo" src="${escapeAttr(logoData)}" alt="Strong Man">` : '<div class="rank">SM</div>'}
      <div>
        <p class="eyebrow">Strongman Next · sezon ${escapeHtml(String(season))}</p>
        <h1>${escapeHtml(seriesName)}</h1>
        <p class="hero-info">Klasyfikacja generalna po ${completedEvents} imprezach</p>
      </div>
    </header>
    <section class="rules" aria-label="Zasady klasyfikacji">
      <div class="rule"><strong>5-4-3-2-1</strong><span>Punkty za miejsca 1-5</span></div>
      <div class="rule"><strong>${escapeHtml(String(maxCountedStarts))}</strong><span>Najlepsze starty w sumie</span></div>
      <div class="rule"><strong>${completedEvents}</strong><span>Rozegrane imprezy</span></div>
    </section>
    <h2 class="section-title">Klasyfikacja generalna</h2>
    <section class="standings">${standingsMarkup || '<p>Brak wyników sezonu.</p>'}</section>
    <h2 class="section-title">Wyniki poszczególnych imprez</h2>
    <section class="events">${eventsMarkup || '<p>Brak rozegranych imprez.</p>'}</section>
    <footer>Wygenerowano ${escapeHtml(generatedAt)} w aplikacji Strongman Next. Plik działa samodzielnie i nie wymaga dostępu do aplikacji.</footer>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}
