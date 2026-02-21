// ========== CONFIGURACIÓN: cambia esta URL por la de tu API ==========
const API_BASE_URL = 'https://api.sotn.io';
const RACE_ENDPOINT = '/current/race';
// URL completa que se usa: API_BASE_URL + RACE_ENDPOINT
// =====================================================================

const POLL_INTERVAL_MS = 20000;

// Tema: ?style=blue | light | dark (default: blue)
function applyStyleFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const style = (params.get('style') || 'blue').toLowerCase();
  const valid = ['blue', 'light', 'dark'];
  document.body.classList.remove('style-blue', 'style-light', 'style-dark');
  document.body.classList.add(valid.includes(style) ? 'style-' + style : 'style-blue');
}
applyStyleFromQuery();

function getRaceUrl() {
  const base = API_BASE_URL.replace(/\/$/, '');
  const path = RACE_ENDPOINT.startsWith('/') ? RACE_ENDPOINT : '/' + RACE_ENDPOINT;
  return base + path;
}

function msToHMS(ms) {
  if (ms == null || ms <= 0) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function sortRacersInProgress(racers) {
  return [...racers].sort((a, b) => {
    const aDone = a.forfeited || (a.finish_time != null && a.finish_time > 0);
    const bDone = b.forfeited || (b.finish_time != null && b.finish_time > 0);
    if (!aDone && !bDone) return 0;
    if (!aDone) return 1;
    if (!bDone) return -1;
    if (a.forfeited && !b.forfeited) return 1;
    if (!a.forfeited && b.forfeited) return -1;
    return (a.finish_time || 0) - (b.finish_time || 0);
  });
}

function createCell(content, className = '') {
  const cell = document.createElement('div');
  cell.className = 'race-grid-cell' + (className ? ' ' + className : '');
  cell.textContent = content;
  return cell;
}

function buildHeaders(raceStatus) {
  const headers = ['Player', 'Rank', 'Elo'];
  if (raceStatus === 'In Progress' || raceStatus === 'Completed') {
    headers.push('Final Time');
  }
  if (raceStatus === 'Completed') {
    headers[1] = 'Final Rank';
    headers[2] = 'Final Elo';
  }
  return headers;
}

function buildRow(racer, raceStatus) {
  const row = document.createElement('div');
  row.className = 'race-grid-row';

  row.appendChild(createCell(racer.player_name || '—'));

  if (raceStatus === 'Completed') {
    const rankDisplay = racer.rank_change != null && racer.rank_change !== 0
      ? `${racer.rank} (${racer.rank_change > 0 ? '↓' : '↑'}${Math.abs(racer.rank_change)})`
      : String(racer.rank ?? '');
    const rankCell = createCell(rankDisplay);
    if (racer.rank_change != null) {
      if (racer.rank_change < 0) rankCell.classList.add('improved');
      else if (racer.rank_change > 0) rankCell.classList.add('worsened');
    }
    row.appendChild(rankCell);

    const eloStr = racer.elo != null ? String(racer.elo) : '—';
    const eloDisplay = racer.elo_change != null && racer.elo_change !== 0
      ? `${eloStr} (${racer.elo_change > 0 ? '+' : ''}${racer.elo_change})`
      : eloStr;
    const eloCell = createCell(eloDisplay);
    if (racer.elo_change != null) {
      if (racer.elo_change > 0) eloCell.classList.add('improved');
      else if (racer.elo_change < 0) eloCell.classList.add('worsened');
    }
    row.appendChild(eloCell);
  } else {
    row.appendChild(createCell(racer.rank != null ? String(racer.rank) : '—'));
    row.appendChild(createCell(racer.elo != null ? String(racer.elo) : '—'));
  }

  if (raceStatus === 'In Progress' || raceStatus === 'Completed') {
    let timeContent = '';
    if (racer.forfeited) {
      timeContent = 'Forfeit';
    } else if (racer.finish_time != null && racer.finish_time > 0) {
      timeContent = msToHMS(racer.finish_time);
    }
    row.appendChild(createCell(timeContent, racer.forfeited ? 'forfeit' : ''));
  }

  return row;
}

function render(data) {
  const gridEl = document.getElementById('raceGrid');
  const headerRowEl = document.getElementById('raceGridHeader');

  const raceStatus = data.race_status || 'Waiting for Players';
  let racers = data.racers || [];

  const headers = buildHeaders(raceStatus);
  const colCount = headers.length;
  gridEl.className = 'race-grid cols-' + colCount;

  // Encabezados: misma grid que las filas, siempre alineados
  headerRowEl.innerHTML = '';
  headers.forEach((h) => {
    const cell = document.createElement('div');
    cell.className = 'race-grid-cell race-grid-head';
    cell.textContent = h;
    headerRowEl.appendChild(cell);
  });

  if (raceStatus === 'In Progress') {
    racers = sortRacersInProgress(racers);
  }

  // Quitar todas las filas de datos (todo lo que no sea el header)
  while (gridEl.children.length > 1) {
    gridEl.removeChild(gridEl.lastChild);
  }

  racers.forEach((r) => gridEl.appendChild(buildRow(r, raceStatus)));
}

function showError(message) {
  const gridEl = document.getElementById('raceGrid');
  const headerRowEl = document.getElementById('raceGridHeader');

  gridEl.className = 'race-grid cols-3';

  headerRowEl.innerHTML = '';
  ['Player', 'Rank', 'Elo'].forEach((h) => {
    const cell = document.createElement('div');
    cell.className = 'race-grid-cell race-grid-head';
    cell.textContent = h;
    headerRowEl.appendChild(cell);
  });

  while (gridEl.children.length > 1) {
    gridEl.removeChild(gridEl.lastChild);
  }
  const row = document.createElement('div');
  row.className = 'race-grid-row';
  const loadingCell = document.createElement('div');
  loadingCell.className = 'race-grid-cell race-grid-loading';
  loadingCell.textContent = message;
  row.appendChild(loadingCell);
  gridEl.appendChild(row);
}

async function fetchRace() {
  const url = getRaceUrl();
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      showError(`Error ${res.status}: ${res.statusText}`);
      return;
    }
    const data = await res.json();
    render(data);
  } catch (err) {
    showError('No se pudo conectar con la API. Revisa la URL.');
    console.error(err);
  }
}

fetchRace();
setInterval(fetchRace, POLL_INTERVAL_MS);
