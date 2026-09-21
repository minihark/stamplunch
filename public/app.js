/**
 * Stamplunch — Application Controller
 * Handles live OpenStreetMap API data, GPS geolocation, distance calculations,
 * interactive filtering (scope, walk time, cuisine), the animated "Lunch Roulette",
 * Leaflet map visualization, and Slack/team proposal sharing.
 */

(function () {
  let userCoords = null; // { lat, lng }
  let activeLocationMode = 'office'; // 'gps' or 'office'
  let activeScope = 'all'; // 'all' or 'curated'
  let activeCategory = 'all';
  let maxWalkFilter = 999;
  let activeSearch = '';
  let currentView = 'cards'; // 'cards' or 'map'
  let allRestaurants = [];
  let isLoading = false;
  let leafletMap = null;
  let mapMarkers = [];
  let userMarker = null;

  // Sound effects using Web Audio API
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playClick() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
  }

  function playWin() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      gain.gain.setValueAtTime(0.001, now + i * 0.07);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.4);
    });
  }

  // Determine active reference coordinate (GPS vs Office)
  function getReferenceCoords() {
    if (activeLocationMode === 'gps' && userCoords) {
      return userCoords;
    }
    return { lat: window.OFFICE_LOCATION.lat, lng: window.OFFICE_LOCATION.lng };
  }

  // Fetch live restaurants from /api/restaurants
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
        console.log(`Loaded ${allRestaurants.length} places (source: ${data.source})`);
      } else {
        throw new Error('Empty restaurant array');
      }
    } catch (err) {
      console.warn('API error, falling back to local dataset:', err.message);
      // Fallback to local curated
      if (Array.isArray(window.RESTAURANTS)) {
        allRestaurants = window.RESTAURANTS.map((r) => ({ ...r, isCurated: true }));
      }
    } finally {
      isLoading = false;
      renderList();
      if (leafletMap) updateMap();
    }
  }

  // Geolocation handling
  function initGeolocation() {
    const locStatus = document.getElementById('location-status');
    const locBtn = document.getElementById('btn-toggle-location');

    if (!('geolocation' in navigator)) {
      locStatus.textContent = '📍 Stampgatan 20 (Kontoret)';
      return;
    }

    locStatus.textContent = '📍 Söker din GPS-position...';

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
          locStatus.textContent = `📍 Din GPS (~${Math.round(pos.coords.accuracy)}m)`;
          locBtn.classList.add('active');
          document.getElementById('office-hint').textContent = 'Avstånd beräknas från din GPS-position';
        } else {
          activeLocationMode = 'office';
          locStatus.textContent = '📍 Stampgatan 20 (Kontoret)';
          locBtn.classList.remove('active');
          document.getElementById('office-hint').textContent = 'Avstånd beräknas från Stampgatan 20';
        }

        loadRestaurants();
      },
      (err) => {
        console.log('GPS denied or unavailable:', err.message);
        activeLocationMode = 'office';
        locStatus.textContent = '📍 Stampgatan 20 (Kontoret)';
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
        // Scope filter: all vs curated
        if (activeScope === 'curated' && !r.isCurated) return false;

        // Category filter
        if (activeCategory !== 'all' && r.category !== activeCategory) return false;

        // Walk time filter
        if (maxWalkFilter !== 999 && r.walkMinutes > maxWalkFilter) return false;

        // Text search
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

  // Render the Restaurant Cards List
  function renderList() {
    const container = document.getElementById('restaurant-grid');
    const spots = getProcessedRestaurants();
    const countBadge = document.getElementById('results-count');

    if (activeScope === 'curated') {
      countBadge.textContent = `${spots.length} kontorsfavoriter`;
    } else {
      countBadge.textContent = `${spots.length} ställen (Live OSM)`;
    }

    if (spots.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-emoji">🍽️</div>
          <h3>Inga lunchställen matchade ditt filter</h3>
          <p>Testa att öka gångavståndet, välja "Alla ställen" eller byta kökskategori.</p>
          <button id="btn-reset-filters" class="primary-btn">Återställ filter</button>
        </div>
      `;
      document.getElementById('btn-reset-filters')?.addEventListener('click', resetFilters);
      return;
    }

    container.innerHTML = spots
      .map(
        (r) => `
        <article class="spot-card ${r.isCurated ? 'curated' : ''}" data-id="${r.id}">
          <div class="spot-header">
            <span class="spot-emoji">${r.emoji || '🍽️'}</span>
            <div class="spot-title-area">
              <h3 class="spot-name">${r.name}</h3>
              <div class="spot-sub">${r.cuisine} · ${r.address}</div>
            </div>
            <div class="spot-distance-badge">
              <span class="walk-min">${r.walkMinutes} min</span>
              <span class="walk-meters">${r.distanceMeters}m</span>
            </div>
          </div>

          <p class="spot-signature">“${r.signature || 'Dagens lunch och god mat nära Stampen'}”</p>

          <div class="spot-tags">
            ${r.isCurated ? '<span class="tag curated-tag">⭐ Kontorsfavorit</span>' : '<span class="tag osm-tag">📍 Live OSM</span>'}
            ${(r.perks || []).slice(0, 3).map((p) => `<span class="tag">${p}</span>`).join('')}
            <span class="tag price-tag">~${r.priceSEK || 135} kr</span>
            <span class="tag hours-tag">🕒 ${r.lunchHours || '11:00 - 14:00'}</span>
          </div>

          <div class="spot-actions">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
              r.name + ' ' + r.address + ' Göteborg'
            )}" target="_blank" rel="noopener noreferrer" class="btn-card-action">
              🚶 Hitta hit
            </a>
            <button class="btn-card-action btn-share-spot" data-id="${r.id}">
              💬 Föreslå
            </button>
            <a href="${r.website || `https://www.google.com/search?q=${encodeURIComponent(r.name + ' Göteborg lunch')}`}" target="_blank" rel="noopener noreferrer" class="btn-card-action btn-ghost">
              🔗 Info
            </a>
          </div>
        </article>
      `
      )
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

  // Share proposal for team via Slack / Clipboard / Web Share
  function shareSpotWithTeam(spot) {
    playClick();
    const ref = getReferenceCoords();
    const dist = window.getDistanceMeters(ref.lat, ref.lng, spot.lat, spot.lng);
    const walk = window.getWalkMinutes(dist);

    const shareText = `🍽️ Lunchförslag: ${spot.emoji || '🍴'} ${spot.name} (${spot.address})\n🚶 ${walk} minuters promenad (${dist}m)\n🍴 ${spot.signature || spot.cuisine}\n📍 Hitta hit: https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      spot.name + ' ' + spot.address + ' Göteborg'
    )}\n\nValt via Stamplunch: https://stamplunch.apps.harkco.se`;

    if (navigator.share) {
      navigator.share({
        title: `Lunch på ${spot.name}?`,
        text: shareText
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText).then(() => {
        showToast(`📋 Kopierade lunchförslag för ${spot.name}! Klistra in i Slack/Teams.`);
      });
    }
  }

  // Toast Notification
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
    spinnerSlot.textContent = '🎲 Tryck på Snurra!';
    spinBtn.disabled = false;

    // Spin animation logic
    spinBtn.onclick = () => {
      spinBtn.disabled = true;
      let counter = 0;
      const totalSteps = 24;
      let currentInterval = 40;

      function step() {
        const randomChoice = candidates[Math.floor(Math.random() * candidates.length)];
        spinnerSlot.innerHTML = `<span class="spin-emoji">${randomChoice.emoji || '🍽️'}</span> <span class="spin-name">${randomChoice.name}</span>`;
        playClick();
        if (navigator.vibrate) navigator.vibrate(20);

        counter++;
        if (counter < totalSteps) {
          currentInterval += 12; // Decelerate smoothly
          setTimeout(step, currentInterval);
        } else {
          // Final Winner Selected!
          const winner = candidates[Math.floor(Math.random() * candidates.length)];
          spinnerSlot.style.display = 'none';
          resultBox.style.display = 'block';
          playWin();
          if (navigator.vibrate) navigator.vibrate([60, 40, 100]);

          resultBox.innerHTML = `
            <div class="winner-card">
              <div class="winner-badge">✨ Dagens Utvalda Lunch! ✨</div>
              <div class="winner-emoji">${winner.emoji || '🍽️'}</div>
              <h2 class="winner-name">${winner.name}</h2>
              <div class="winner-meta">${winner.cuisine} · ${winner.walkMinutes} min (${winner.distanceMeters}m)</div>
              <p class="winner-signature">“${winner.signature || 'Dagens lunch nära Stampen'}”</p>
              <div class="winner-tags">
                ${winner.isCurated ? '<span class="tag curated-tag">⭐ Kontorsfavorit</span>' : '<span class="tag osm-tag">📍 Live OSM</span>'}
                <span class="tag price-tag">~${winner.priceSEK || 135} kr</span>
                <span class="tag">${winner.address}</span>
              </div>
              <div class="winner-buttons">
                <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  winner.name + ' ' + winner.address + ' Göteborg'
                )}" target="_blank" class="primary-btn">🚶 Navigera dit</a>
                <button id="btn-share-winner" class="secondary-btn">💬 Dela med kollegorna</button>
              </div>
            </div>
          `;

          document.getElementById('btn-share-winner')?.addEventListener('click', () => {
            shareSpotWithTeam(winner);
          });

          spinBtn.textContent = '🔄 Snurra igen';
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

    // Clear old markers
    mapMarkers.forEach((m) => leafletMap.removeLayer(m));
    mapMarkers = [];
    if (userMarker) leafletMap.removeLayer(userMarker);

    const ref = getReferenceCoords();

    // User / Office location pin
    const userIcon = L.divIcon({
      className: 'user-map-pin',
      html: `<div class="pulse-dot"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    userMarker = L.marker([ref.lat, ref.lng], { icon: userIcon })
      .addTo(leafletMap)
      .bindPopup(`<b>${activeLocationMode === 'gps' ? 'Din GPS-position' : 'Stampgatan 20 (Kontoret)'}</b>`);

    // Restaurant markers
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
            <h4>${r.emoji || '🍽️'} ${r.name} ${r.isCurated ? '⭐' : ''}</h4>
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
    renderList();
    if (leafletMap) updateMap();
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // Location toggle button
    document.getElementById('btn-toggle-location').addEventListener('click', function () {
      playClick();
      if (activeLocationMode === 'office') {
        initGeolocation();
      } else {
        activeLocationMode = 'office';
        document.getElementById('location-status').textContent = '📍 Stampgatan 20 (Kontoret)';
        document.getElementById('office-hint').textContent = 'Avstånd beräknas från Stampgatan 20';
        this.classList.remove('active');
        loadRestaurants();
      }
    });

    // Scope pills: All vs Curated
    document.querySelectorAll('.scope-pill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        playClick();
        document.querySelectorAll('.scope-pill').forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        activeScope = e.currentTarget.dataset.scope;
        renderList();
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
        renderList();
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
        renderList();
        if (leafletMap) updateMap();
      });
    });

    // Search input
    document.getElementById('search-input').addEventListener('input', (e) => {
      activeSearch = e.target.value.trim();
      renderList();
      if (leafletMap) updateMap();
    });

    // View toggle (List vs Map)
    document.getElementById('btn-view-cards').addEventListener('click', function () {
      playClick();
      currentView = 'cards';
      this.classList.add('active');
      document.getElementById('btn-view-map').classList.remove('active');
      document.getElementById('restaurant-grid').style.display = 'grid';
      document.getElementById('map-wrapper').style.display = 'none';
    });

    document.getElementById('btn-view-map').addEventListener('click', function () {
      playClick();
      currentView = 'map';
      this.classList.add('active');
      document.getElementById('btn-view-cards').classList.remove('active');
      document.getElementById('restaurant-grid').style.display = 'none';
      document.getElementById('map-wrapper').style.display = 'block';
      initMap();
      setTimeout(() => leafletMap.invalidateSize(), 150);
    });

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

    // Shake to Decide (Mobile Accelerometer)
    if (window.DeviceMotionEvent) {
      let lastX, lastY, lastZ;
      let lastTime = 0;
      window.addEventListener('devicemotion', (e) => {
        const acc = e.accelerationIncludingGravity;
        if (!acc) return;
        const curTime = Date.now();
        if (curTime - lastTime > 150) {
          const diffTime = curTime - lastTime;
          lastTime = curTime;
          const speed = Math.abs(acc.x + acc.y + acc.z - (lastX + lastY + lastZ)) / diffTime * 10000;
          if (speed > 1800) {
            openRouletteModal();
          }
          lastX = acc.x;
          lastY = acc.y;
          lastZ = acc.z;
        }
      });
    }
  }

  // App Initialization
  setupEventListeners();
  loadRestaurants();
  // Automatically check GPS location
  if ('geolocation' in navigator) {
    initGeolocation();
  }
})();
