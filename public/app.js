/**
 * Stamplunch — Application Controller
 * Bespoke Gothenburg Gastro-Radar & Postal Lunch Decider
 */

(function () {
  let userCoords = null; // { lat, lng }
  let activeLocationMode = 'office'; // 'gps' or 'office'
  let activeScope = 'all'; // 'all' or 'curated'
  let activeCategory = 'all';
  let maxWalkFilter = 999;
  let activeSearch = '';
  let currentView = 'cards'; // 'cards', 'board', or 'map'
  let allRestaurants = [];
  let isLoading = false;
  let leafletMap = null;
  let mapMarkers = [];
  let userMarker = null;

  // Sound effects using Web Audio API
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  function playClick() {
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(540, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, audioCtx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    } catch(e) {}
  }

  function playStampThump() {
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.14);
    } catch(e) {}
  }

  function playWinChime() {
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      [440, 554.37, 659.25, 880].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.001, now + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.2, now + i * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.45);
      });
    } catch(e) {}
  }

  // Update live lunch clock in hero
  function updateLiveClock() {
    const clockEl = document.getElementById('live-lunch-clock');
    if (!clockEl) return;
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hrs}:${mins}`;
    
    let statusText = '🕒 Dags att välja lunch';
    const totalMinutes = now.getHours() * 60 + now.getMinutes();
    if (totalMinutes < 11 * 60) {
      statusText = `🕒 ${timeStr} · Snart lunch!`;
    } else if (totalMinutes <= 13 * 60 + 30) {
      statusText = `🕒 ${timeStr} · Hög lunchtid!`;
    } else if (totalMinutes <= 15 * 60) {
      statusText = `🕒 ${timeStr} · Sen lunch`;
    } else {
      statusText = `🕒 ${timeStr} · Planera morgondagen`;
    }
    clockEl.textContent = statusText;
  }

  // Determine active reference coordinate (GPS vs Stampgatan Office)
  function getReferenceCoords() {
    if (activeLocationMode === 'gps' && userCoords) {
      return userCoords;
    }
    return { lat: window.OFFICE_LOCATION.lat, lng: window.OFFICE_LOCATION.lng };
  }

  // Generate hyper-local Gothenburg landmark description
  function getLandmarkContext(distMeters, walkMin) {
    if (distMeters <= 220) return `👟 ${walkMin} min · Vid Stampbron (${distMeters}m)`;
    if (distMeters <= 450) return `🚶 ${walkMin} min · Odinsplatsen (${distMeters}m)`;
    if (distMeters <= 750) return `🚋 ${walkMin} min · Svingeln / Friggagatan (${distMeters}m)`;
    if (distMeters <= 1100) return `🏟️ ${walkMin} min · Ullevi / Fattighusån (${distMeters}m)`;
    return `🚶 ${walkMin} min · Centrum (${distMeters}m)`;
  }

  // Fetch live restaurants from backend
  async function loadRestaurants() {
    const ref = getReferenceCoords();
    const resultsCount = document.getElementById('results-count');
    isLoading = true;
    resultsCount.textContent = 'Hämtar live lunchställen...';

    try {
      const res = await fetch(`/api/restaurants?lat=${ref.lat}&lng=${ref.lng}&radius=1500`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data && Array.isArray(data.restaurants) && data.restaurants.length > 0) {
        allRestaurants = data.restaurants;
        const scopeCountEl = document.getElementById('scope-all-count');
        if (scopeCountEl) scopeCountEl.textContent = allRestaurants.length;
      } else {
        throw new Error('No places in response');
      }
    } catch (err) {
      console.warn('API error, falling back to local dataset:', err.message);
      if (Array.isArray(window.RESTAURANTS)) {
        allRestaurants = window.RESTAURANTS.map((r) => ({ ...r, isCurated: true }));
      }
    } finally {
      isLoading = false;
      renderAllViews();
      if (leafletMap) updateMap();
    }
  }

  // Geolocation handling
  function initGeolocation() {
    const locStatus = document.getElementById('location-status');
    const locText = document.getElementById('loc-text');
    const locBtn = document.getElementById('btn-toggle-location');

    if (!('geolocation' in navigator)) {
      locText.textContent = '📍 Stampgatan 20 (Kontoret)';
      return;
    }

    locText.textContent = '📍 Söker din position...';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };

        const distFromOffice = window.getDistanceMeters(
          userCoords.lat,
          userCoords.lng,
          window.OFFICE_LOCATION.lat,
          window.OFFICE_LOCATION.lng
        );

        if (distFromOffice < 45000) {
          activeLocationMode = 'gps';
          locText.textContent = `📍 Din GPS (~${Math.round(pos.coords.accuracy)}m)`;
          locBtn.classList.add('active');
          document.getElementById('office-hint').textContent = 'Avstånd beräknas från din GPS-position';
        } else {
          activeLocationMode = 'office';
          locText.textContent = '📍 Stampgatan 20 (Kontoret)';
          locBtn.classList.remove('active');
          document.getElementById('office-hint').textContent = 'Avstånd beräknas från Stampgatan 20';
        }

        loadRestaurants();
      },
      (err) => {
        console.log('GPS unavailable:', err.message);
        activeLocationMode = 'office';
        locText.textContent = '📍 Stampgatan 20 (Kontoret)';
        locBtn.classList.remove('active');
        document.getElementById('office-hint').textContent = 'Avstånd beräknas från Stampgatan 20';
        loadRestaurants();
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  // Filter and sort restaurants
  function getProcessedRestaurants() {
    const ref = getReferenceCoords();

    const mapped = allRestaurants.map((r) => {
      const dist = window.getDistanceMeters(ref.lat, ref.lng, r.lat, r.lng);
      const walkMin = window.getWalkMinutes(dist);
      return { ...r, distanceMeters: dist, walkMinutes: walkMin };
    });

    return mapped
      .filter((r) => {
        if (activeScope === 'curated' && !r.isCurated) return false;
        if (activeCategory !== 'all' && r.category !== activeCategory) return false;
        if (maxWalkFilter !== 999 && r.walkMinutes > maxWalkFilter) return false;

        if (activeSearch) {
          const q = activeSearch.toLowerCase();
          const match =
            (r.name && r.name.toLowerCase().includes(q)) ||
            (r.cuisine && r.cuisine.toLowerCase().includes(q)) ||
            (r.signature && r.signature.toLowerCase().includes(q)) ||
            (r.address && r.address.toLowerCase().includes(q));
          if (!match) return false;
        }

        return true;
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  // Render both Card Grid and Blackboard View
  function renderAllViews() {
    const spots = getProcessedRestaurants();
    const countBadge = document.getElementById('results-count');

    if (activeScope === 'curated') {
      countBadge.textContent = `${spots.length} kontorsfavoriter`;
    } else {
      countBadge.textContent = `${spots.length} ställen i närheten`;
    }

    renderCards(spots);
    renderBlackboard(spots);
  }

  // Render View 1: Matpass Card Grid
  function renderCards(spots) {
    const container = document.getElementById('restaurant-grid');

    if (spots.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 48px 20px; text-align: center;">
          <div style="font-size: 40px; margin-bottom: 12px;">🍽️</div>
          <h3 style="font-family: var(--font-serif); font-size: 22px; color: #fff;">Inga lunchställen matchade ditt val</h3>
          <p style="color: var(--text-muted); font-size: 14px; margin: 8px 0 16px 0;">Testa att öka gångavståndet eller välja "Alla ställen".</p>
          <button id="btn-reset-filters" class="primary-btn" style="max-width: 200px; margin: 0 auto;">Återställ filter</button>
        </div>
      `;
      document.getElementById('btn-reset-filters')?.addEventListener('click', resetFilters);
      return;
    }

    container.innerHTML = spots
      .map((r) => {
        const landmark = getLandmarkContext(r.distanceMeters, r.walkMinutes);
        return `
        <article class="spot-card ${r.isCurated ? 'curated' : ''}" data-id="${r.id}">
          ${r.isCurated ? '<div class="rubber-stamp">★ STAMPEN VALD ★</div>' : ''}
          
          <div class="spot-header">
            <div class="spot-emoji-token">${r.emoji || '🍽️'}</div>
            <div class="spot-title-area">
              <h3 class="spot-name">${r.name}</h3>
              <div class="spot-sub">${r.cuisine} · ${r.address}</div>
              <div class="spot-walk-landmark">${landmark}</div>
            </div>
          </div>

          <p class="spot-signature">“${r.signature || 'Dagens lunch och god mat nära Stampen'}”</p>

          <div class="spot-tags">
            <span class="tag price-tag">~${r.priceSEK || 135} kr</span>
            <span class="tag hours-tag">🕒 ${r.lunchHours || '11:00 - 14:00'}</span>
            ${(r.perks || []).slice(0, 2).map((p) => `<span class="tag">${p}</span>`).join('')}
          </div>

          <div class="spot-actions">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
              r.name + ' ' + r.address + ' Göteborg'
            )}" target="_blank" rel="noopener noreferrer" class="btn-card-action btn-primary-action">
              🚶 Hitta hit
            </a>
            <button class="btn-card-action btn-share-spot" data-id="${r.id}">
              💬 Föreslå
            </button>
            <a href="${r.website || `https://www.google.com/search?q=${encodeURIComponent(r.name + ' Göteborg lunch')}`}" target="_blank" rel="noopener noreferrer" class="btn-card-action">
              🔗 Info
            </a>
          </div>
        </article>
      `;
      })
      .join('');

    // Attach card event listeners
    document.querySelectorAll('.btn-share-spot').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const spot = allRestaurants.find((s) => s.id === id);
        if (spot) shareSpotWithTeam(spot);
      });
    });
  }

  // Render View 2: Svarta Tavlan (Bistro Blackboard List)
  function renderBlackboard(spots) {
    const listEl = document.getElementById('chalkboard-list');
    if (!listEl) return;

    if (spots.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-dim); font-family: var(--font-mono);">
          Tavlan är tom för det här filtret.
        </div>
      `;
      return;
    }

    listEl.innerHTML = spots
      .map(
        (r) => `
        <div class="chalkboard-row ${r.isCurated ? 'curated' : ''}">
          <div class="col-name">
            <span>${r.emoji || '🍴'}</span>
            <strong>${r.name}</strong>
            ${r.isCurated ? '<span style="color: var(--stamp-gold); font-size: 11px;">★</span>' : ''}
          </div>
          <div class="col-cuisine">${r.cuisine}</div>
          <div class="col-walk">🚶 ${r.walkMinutes} min (${r.distanceMeters}m)</div>
          <div class="col-price">~${r.priceSEK || 135} kr</div>
          <div class="col-actions">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
              r.name + ' ' + r.address + ' Göteborg'
            )}" target="_blank" class="chalk-btn">🚶 Gå</a>
            <button class="chalk-btn btn-share-chalk" data-id="${r.id}">💬 Dela</button>
          </div>
        </div>
      `
      )
      .join('');

    listEl.querySelectorAll('.btn-share-chalk').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const spot = allRestaurants.find((s) => s.id === id);
        if (spot) shareSpotWithTeam(spot);
      });
    });
  }

  // Share proposal for team via Slack / Teams / Clipboard
  function shareSpotWithTeam(spot) {
    playClick();
    const ref = getReferenceCoords();
    const dist = window.getDistanceMeters(ref.lat, ref.lng, spot.lat, spot.lng);
    const walk = window.getWalkMinutes(dist);

    const shareText = `🍽️ Lunchförslag från Stamplunch:\n✨ ${spot.emoji || '🍴'} *${spot.name}* (${spot.address})\n🚶 ${walk} minuters promenad (${dist}m)\n🍴 ${spot.signature || spot.cuisine} (~${spot.priceSEK || 135} kr)\n🕒 Öppet: ${spot.lunchHours || '11:00 - 14:00'}\n📍 Karta & väg: https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      spot.name + ' ' + spot.address + ' Göteborg'
    )}\n\nValt via Stamplunch: https://stamplunch.apps.harkco.se`;

    if (navigator.share) {
      navigator.share({
        title: `Lunch på ${spot.name}?`,
        text: shareText
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText).then(() => {
        showToast(`📋 Kopierade förslag för ${spot.name}! Klistra in i Slack.`);
      });
    }
  }

  // Toast notification
  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('visible');
    setTimeout(() => {
      toast.classList.remove('visible');
    }, 3200);
  }

  // Interactive Lunch Roulette Modal
  function openRouletteModal() {
    const candidates = getProcessedRestaurants();
    if (candidates.length === 0) {
      showToast('Inga ställen matchar dina filter just nu!');
      return;
    }

    const modal = document.getElementById('roulette-modal');
    const resultBox = document.getElementById('roulette-result');
    const spinBtn = document.getElementById('btn-spin-now');
    const spinnerSlot = document.getElementById('roulette-slot');

    modal.classList.add('open');
    resultBox.style.display = 'none';
    spinnerSlot.style.display = 'flex';
    spinnerSlot.innerHTML = `<span class="slot-idle-icon">🎲</span> <span>Tryck för att snurra!</span>`;
    spinBtn.disabled = false;

    spinBtn.onclick = () => {
      spinBtn.disabled = true;
      let counter = 0;
      const totalSteps = 24;
      let currentInterval = 40;

      function step() {
        const randomChoice = candidates[Math.floor(Math.random() * candidates.length)];
        spinnerSlot.innerHTML = `
          <span class="spin-emoji">${randomChoice.emoji || '🍽️'}</span>
          <span class="spin-name">${randomChoice.name}</span>
        `;
        playClick();
        if (navigator.vibrate) navigator.vibrate(20);

        counter++;
        if (counter < totalSteps) {
          currentInterval += 14;
          setTimeout(step, currentInterval);
        } else {
          // Final Winner Selected!
          const winner = candidates[Math.floor(Math.random() * candidates.length)];
          spinnerSlot.style.display = 'none';
          resultBox.style.display = 'block';
          playStampThump();
          playWinChime();
          if (navigator.vibrate) navigator.vibrate([80, 50, 120]);

          const landmark = getLandmarkContext(winner.distanceMeters, winner.walkMinutes);

          resultBox.innerHTML = `
            <div class="winner-card">
              <div class="winner-rubber-stamp">★ STÄMPLAD! ★</div>
              <div class="winner-emoji">${winner.emoji || '🍽️'}</div>
              <h2 class="winner-name">${winner.name}</h2>
              <div class="winner-meta">${winner.cuisine} · ${landmark}</div>
              <p class="winner-signature">“${winner.signature || 'Dagens utvalda lunch vid Stampen'}”</p>
              <div class="winner-tags">
                <span class="tag price-tag">~${winner.priceSEK || 135} kr</span>
                <span class="tag">${winner.address}</span>
              </div>
              <div class="winner-buttons">
                <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  winner.name + ' ' + winner.address + ' Göteborg'
                )}" target="_blank" class="primary-btn">🚶 Navigera dit</a>
                <button id="btn-share-winner" class="secondary-btn">💬 Slacka teamet</button>
              </div>
            </div>
          `;

          document.getElementById('btn-share-winner')?.addEventListener('click', () => {
            shareSpotWithTeam(winner);
          });

          spinBtn.innerHTML = `<span class="lever-knob">🔄</span> <span>SNURRA IGEN</span>`;
          spinBtn.disabled = false;
        }
      }

      step();
    };
  }

  // Interactive Leaflet Map Integration
  function initMap() {
    if (leafletMap) return;
    const ref = getReferenceCoords();

    leafletMap = L.map('map-container', {
      zoomControl: false,
      attributionControl: false
    }).setView([ref.lat, ref.lng], 15);

    L.control.zoom({ position: 'topright' }).addTo(leafletMap);

    // Dark Matter tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(leafletMap);

    updateMap();
  }

  function updateMap() {
    if (!leafletMap) return;

    mapMarkers.forEach((m) => leafletMap.removeLayer(m));
    mapMarkers = [];
    if (userMarker) leafletMap.removeLayer(userMarker);

    const ref = getReferenceCoords();

    // User / Office location pin
    const userIcon = L.divIcon({
      className: 'user-map-pin',
      html: `<div class="pulse-beacon" style="width: 16px; height: 16px; background: #38bdf8; box-shadow: 0 0 12px #38bdf8;"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    userMarker = L.marker([ref.lat, ref.lng], { icon: userIcon })
      .addTo(leafletMap)
      .bindPopup(`<b>${activeLocationMode === 'gps' ? 'Din GPS-position' : 'Stampgatan 20 (Kontoret)'}</b>`);

    const spots = getProcessedRestaurants();

    spots.forEach((r) => {
      const icon = L.divIcon({
        className: 'restaurant-map-pin',
        html: `<div class="map-emoji-marker ${r.isCurated ? 'curated' : ''}">${r.emoji || '🍽️'}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([r.lat, r.lng], { icon })
        .addTo(leafletMap)
        .bindPopup(`
          <div class="map-popup">
            <h4>${r.emoji || '🍽️'} ${r.name} ${r.isCurated ? '★' : ''}</h4>
            <div>${r.cuisine} · ${r.walkMinutes} min (${r.distanceMeters}m)</div>
            <p>“${r.signature || r.address}”</p>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
              r.name + ' ' + r.address + ' Göteborg'
            )}" target="_blank" class="popup-nav-link">🚶 Gå hit</a>
          </div>
        `);

      mapMarkers.push(marker);
    });
  }

  function resetFilters() {
    activeScope = 'all';
    activeCategory = 'all';
    maxWalkFilter = 999;
    activeSearch = '';
    document.querySelectorAll('.scope-pill').forEach((p) => p.classList.remove('active'));
    document.querySelector('.scope-pill[data-scope="all"]')?.classList.add('active');
    document.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
    document.querySelector('.filter-pill[data-category="all"]')?.classList.add('active');
    document.querySelectorAll('.walk-pill').forEach((p) => p.classList.remove('active'));
    document.querySelector('.walk-pill[data-max="999"]')?.classList.add('active');
    document.getElementById('search-input').value = '';
    document.getElementById('btn-clear-search').style.display = 'none';
    renderAllViews();
    if (leafletMap) updateMap();
  }

  // Event Listeners
  function setupEventListeners() {
    // Location toggle
    document.getElementById('btn-toggle-location').addEventListener('click', function () {
      playClick();
      if (activeLocationMode === 'office') {
        initGeolocation();
      } else {
        activeLocationMode = 'office';
        document.getElementById('loc-text').textContent = '📍 Stampgatan 20 (Kontoret)';
        document.getElementById('office-hint').textContent = 'Avstånd beräknas från Stampgatan 20';
        this.classList.remove('active');
        loadRestaurants();
      }
    });

    // Quick chips in hero
    document.querySelectorAll('.quick-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        playClick();
        const f = e.currentTarget.dataset.filter;
        if (f === 'urgent') {
          maxWalkFilter = 3;
          document.querySelectorAll('.walk-pill').forEach((p) => p.classList.remove('active'));
          document.querySelector('.walk-pill[data-max="3"]')?.classList.add('active');
        } else if (f === 'curated') {
          activeScope = 'curated';
          document.querySelectorAll('.scope-pill').forEach((p) => p.classList.remove('active'));
          document.querySelector('.scope-pill[data-scope="curated"]')?.classList.add('active');
        } else if (f === 'thai') {
          activeCategory = 'asian';
          document.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
          document.querySelector('.filter-pill[data-category="asian"]')?.classList.add('active');
        } else if (f === 'burgers') {
          activeCategory = 'burgers';
          document.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
          document.querySelector('.filter-pill[data-category="burgers"]')?.classList.add('active');
        }
        renderAllViews();
        if (leafletMap) updateMap();
      });
    });

    // Scope pills: All vs Curated
    document.querySelectorAll('.scope-pill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        playClick();
        document.querySelectorAll('.scope-pill').forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        activeScope = e.currentTarget.dataset.scope;
        renderAllViews();
        if (leafletMap) updateMap();
      });
    });

    // Category pills
    document.querySelectorAll('.filter-pill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        playClick();
        document.querySelectorAll('.filter-pill').forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        activeCategory = e.currentTarget.dataset.category;
        renderAllViews();
        if (leafletMap) updateMap();
      });
    });

    // Walk duration pills
    document.querySelectorAll('.walk-pill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        playClick();
        document.querySelectorAll('.walk-pill').forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        maxWalkFilter = parseInt(e.currentTarget.dataset.max);
        renderAllViews();
        if (leafletMap) updateMap();
      });
    });

    // Search input
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    searchInput.addEventListener('input', (e) => {
      activeSearch = e.target.value.trim();
      clearBtn.style.display = activeSearch ? 'block' : 'none';
      renderAllViews();
      if (leafletMap) updateMap();
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      activeSearch = '';
      clearBtn.style.display = 'none';
      renderAllViews();
      if (leafletMap) updateMap();
    });

    // View toggles: Cards (Matpass), Board (Svarta Tavlan), Map (Karta)
    const btnCards = document.getElementById('btn-view-cards');
    const btnBoard = document.getElementById('btn-view-board');
    const btnMap = document.getElementById('btn-view-map');
    const elGrid = document.getElementById('restaurant-grid');
    const elBoard = document.getElementById('board-wrapper');
    const elMap = document.getElementById('map-wrapper');

    function setActiveView(view) {
      playClick();
      currentView = view;
      btnCards.classList.toggle('active', view === 'cards');
      btnBoard.classList.toggle('active', view === 'board');
      btnMap.classList.toggle('active', view === 'map');

      elGrid.style.display = view === 'cards' ? 'grid' : 'none';
      elBoard.style.display = view === 'board' ? 'block' : 'none';
      elMap.style.display = view === 'map' ? 'block' : 'none';

      if (view === 'map') {
        initMap();
        setTimeout(() => leafletMap && leafletMap.invalidateSize(), 150);
      }
    }

    btnCards.addEventListener('click', () => setActiveView('cards'));
    btnBoard.addEventListener('click', () => setActiveView('board'));
    btnMap.addEventListener('click', () => setActiveView('map'));

    // Roulette modal triggers
    document.getElementById('btn-hero-roulette').addEventListener('click', () => {
      playClick();
      openRouletteModal();
    });

    document.getElementById('btn-close-modal').addEventListener('click', () => {
      document.getElementById('roulette-modal').classList.remove('open');
    });

    document.getElementById('roulette-modal').addEventListener('click', (e) => {
      if (e.target.id === 'roulette-modal') {
        e.target.classList.remove('open');
      }
    });
  }

  // App Initialization
  setupEventListeners();
  updateLiveClock();
  setInterval(updateLiveClock, 30000);
  loadRestaurants();
  if ('geolocation' in navigator) {
    initGeolocation();
  }
})();
