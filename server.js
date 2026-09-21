const express = require('express');
const path = require('path');
const fs = require('fs');
const { CURATED_RESTAURANTS } = require('./curated');

const app = express();
const PORT = process.env.PORT || 3000;

// Cache map: key -> { data, timestamp }
const memoryCache = new Map();
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

// Load pre-seeded places snapshot for fallback
let fallbackSnapshot = null;
try {
  const snapshotPath = path.join(__dirname, 'cached_places.json');
  if (fs.existsSync(snapshotPath)) {
    fallbackSnapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    console.log(`Loaded fallback snapshot with ${fallbackSnapshot.elements?.length || 0} elements`);
  }
} catch (e) {
  console.warn('Could not load cached_places.json:', e.message);
}

// Distance formula
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function getWalkMinutes(meters) {
  return Math.max(1, Math.round(meters / 80));
}

// Classify OpenStreetMap place into category, emoji, and cuisine
function classifyOSM(tags) {
  const c = (tags.cuisine || '').toLowerCase();
  const a = (tags.amenity || '').toLowerCase();
  const n = (tags.name || '').toLowerCase();

  // 1. Asian & Sushi
  if (
    c.includes('sushi') ||
    n.includes('sushi') ||
    c.includes('japanese') ||
    c.includes('ramen')
  ) {
    return { category: 'asian', emoji: '🍣', cuisine: 'Sushi & Japanskt' };
  }
  if (
    c.includes('thai') ||
    n.includes('thai') ||
    n.includes('wok') ||
    c.includes('asian') ||
    c.includes('vietnam') ||
    c.includes('chinese') ||
    c.includes('korean') ||
    c.includes('noodle') ||
    c.includes('dim_sum')
  ) {
    return { category: 'asian', emoji: '🥢', cuisine: c.includes('thai') ? 'Thai & Wok' : 'Asiatiskt & Streetfood' };
  }
  if (c.includes('indian') || n.includes('indisk') || n.includes('curry')) {
    return { category: 'asian', emoji: '🍛', cuisine: 'Indiskt & Curry' };
  }

  // 2. Burgers
  if (
    c.includes('burger') ||
    n.includes('burger') ||
    n.includes('bastard') ||
    n.includes('max') ||
    n.includes('mcdonald') ||
    n.includes('shack')
  ) {
    return { category: 'burgers', emoji: '🍔', cuisine: 'Gourmetburgare' };
  }

  // 3. Italian & Pizza
  if (
    c.includes('pizza') ||
    c.includes('italian') ||
    c.includes('pasta') ||
    n.includes('pizzeria') ||
    n.includes('trattoria') ||
    n.includes('italiano')
  ) {
    return { category: 'italian', emoji: '🍕', cuisine: 'Italienskt & Pizza' };
  }

  // 4. Street Food & Mexican
  if (
    c.includes('mexican') ||
    c.includes('taco') ||
    c.includes('burrito') ||
    c.includes('birria') ||
    n.includes('taco') ||
    n.includes('burrito')
  ) {
    return { category: 'streetfood', emoji: '🌮', cuisine: 'Tacos & Mexikanskt' };
  }
  if (
    c.includes('kebab') ||
    c.includes('falafel') ||
    c.includes('shawarma') ||
    c.includes('middle_eastern') ||
    c.includes('lebanese') ||
    n.includes('kebab') ||
    n.includes('falafel') ||
    n.includes('grill')
  ) {
    return { category: 'streetfood', emoji: '🥙', cuisine: 'Kebab, Grill & Falafel' };
  }
  if (c.includes('sandwich') || c.includes('subway') || n.includes('subway')) {
    return { category: 'streetfood', emoji: '🥪', cuisine: 'Smörgåsar & Wraps' };
  }

  // 5. Cafe & Fika
  if (
    a === 'cafe' ||
    c.includes('coffee') ||
    c.includes('bakery') ||
    c.includes('cake') ||
    n.includes('café') ||
    n.includes('kafé') ||
    n.includes('espresso') ||
    n.includes('konditori') ||
    n.includes('bageri')
  ) {
    return { category: 'cafe', emoji: '☕', cuisine: 'Kafé, Sallader & Fika' };
  }

  // 6. Pub & Husman
  if (
    a === 'pub' ||
    c.includes('pub') ||
    c.includes('beer') ||
    n.includes('pub') ||
    n.includes('bar') ||
    n.includes('ölhall') ||
    n.includes('tavern')
  ) {
    return { category: 'husman', emoji: '🍺', cuisine: 'Pub & Husmanskost' };
  }
  if (
    c.includes('regional') ||
    c.includes('swedish') ||
    c.includes('husman') ||
    c.includes('scandinavian') ||
    c.includes('traditional') ||
    c.includes('steak')
  ) {
    return { category: 'husman', emoji: '🥔', cuisine: 'Svensk Husmanskost' };
  }

  // 7. Nordic / Buffet / Modern
  if (c.includes('fish') || c.includes('seafood')) {
    return { category: 'nordic', emoji: '🐟', cuisine: 'Fisk & Skaldjur' };
  }

  return {
    category: 'nordic',
    emoji: '🍽️',
    cuisine: tags.cuisine ? tags.cuisine.charAt(0).toUpperCase() + tags.cuisine.slice(1) : 'Dagens Lunch & Kvarterskrog'
  };
}

// Generate a lively signature/description for OSM spots
function getSignature(name, category, cuisine) {
  switch (category) {
    case 'asian':
      return 'Wokade rätter, smakrika grytor, sushi & fräscha asiatiska bowls';
    case 'burgers':
      return 'Högrevsburgare, frasiga pommes & kalla drycker';
    case 'italian':
      return 'Stenbaksugnspizza, krämig pasta & fräsch sallad';
    case 'streetfood':
      return 'Snabb, smakrik street food, grillat & goda såser';
    case 'cafe':
      return 'Hälsosam lunchsallad, matiga mackor, gott fika & specialkaffe';
    case 'husman':
      return 'Klassisk svensk husmanskost, dagens fångst & trevlig miljö';
    default:
      return 'Vällagad lunch, dagens rätter & god stämning nära Stampen';
  }
}

// Fetch live spots from Overpass API
async function fetchOverpassPlaces(lat, lng, radius) {
  const query = `[out:json][timeout:12];
(
  node["amenity"~"^(restaurant|fast_food|cafe|bistro|pub)$"](around:${radius}, ${lat}, ${lng});
  way["amenity"~"^(restaurant|fast_food|cafe|bistro|pub)$"](around:${radius}, ${lat}, ${lng});
);
out center;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);

      const res = await fetch(endpoint + '?data=' + encodeURIComponent(query), {
        headers: { 'User-Agent': 'Stamplunch/1.0 (minihark@harkco.se)' },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim().startsWith('{')) continue;

      const data = JSON.parse(text);
      if (data && Array.isArray(data.elements)) {
        return { elements: data.elements, source: 'live-osm' };
      }
    } catch (err) {
      // try next endpoint
    }
  }

  // Fallback to local snapshot
  if (fallbackSnapshot && Array.isArray(fallbackSnapshot.elements)) {
    console.log('Using local cached_places.json snapshot as fallback');
    return { elements: fallbackSnapshot.elements, source: 'snapshot-osm' };
  }

  return { elements: [], source: 'empty' };
}

// Process and enrich places
function processElements(elements, refLat, refLng, maxRadius) {
  const list = [];
  const seen = new Set();

  // First: Add all curated spots that are within radius
  CURATED_RESTAURANTS.forEach((c) => {
    const dist = haversineMeters(refLat, refLng, c.lat, c.lng);
    if (dist <= maxRadius * 1.25) {
      list.push({
        ...c,
        distanceMeters: dist,
        walkMinutes: getWalkMinutes(dist)
      });
      seen.add(c.name.toLowerCase().trim());
    }
  });

  // Second: Add places from OSM
  for (const el of elements) {
    const tags = el.tags;
    if (!tags || !tags.name) continue;

    const rawName = tags.name.trim();
    const normName = rawName.toLowerCase();

    // Deduplicate against already added (including curated)
    if (seen.has(normName)) continue;

    const spotLat = el.lat || (el.center && el.center.lat);
    const spotLng = el.lon || (el.center && el.center.lon);
    if (!spotLat || !spotLng) continue;

    const dist = haversineMeters(refLat, refLng, spotLat, spotLng);
    if (dist > maxRadius) continue;

    // Check if close to a curated spot with similar name
    const matchCurated = CURATED_RESTAURANTS.find(
      (c) =>
        (c.name.toLowerCase().includes(normName) || normName.includes(c.name.toLowerCase())) &&
        haversineMeters(c.lat, c.lng, spotLat, spotLng) < 150
    );
    if (matchCurated) continue;

    seen.add(normName);

    const classification = classifyOSM(tags);

    // Build street address
    let address = 'Göteborg';
    if (tags['addr:street']) {
      address = `${tags['addr:street']} ${tags['addr:housenumber'] || ''}`.trim();
    } else if (tags['addr:place']) {
      address = tags['addr:place'];
    } else if (dist < 400) {
      address = 'Stampen / Stampgatan';
    } else if (dist < 800) {
      address = 'Centrum / Odinsplatsen';
    } else {
      address = 'Göteborg Centrum';
    }

    // Perks from tags
    const perks = [];
    if (tags.outdoor_seating === 'yes') perks.push('Uteservering');
    if (tags.takeaway === 'yes') perks.push('Takeaway');
    if (tags.wheelchair === 'yes') perks.push('Tillgängligt');
    if (tags.delivery === 'yes') perks.push('Hemleverans');
    if (tags['diet:vegetarian'] === 'yes' || tags['diet:vegan'] === 'yes') perks.push('Bra vego');
    if (perks.length === 0) perks.push('Sittplatser');

    // Estimate price
    let priceSEK = 135;
    if (tags.amenity === 'fast_food' || classification.category === 'streetfood') priceSEK = 115;
    if (classification.category === 'cafe') priceSEK = 110;
    if (classification.category === 'burgers') priceSEK = 139;
    if (classification.category === 'italian') priceSEK = 130;

    const website =
      tags.website ||
      tags['contact:website'] ||
      tags.facebook ||
      tags['contact:instagram'] ||
      `https://www.google.com/search?q=${encodeURIComponent(rawName + ' Göteborg')}`;

    list.push({
      id: `osm-${el.type || 'node'}-${el.id}`,
      name: rawName,
      address: address,
      lat: spotLat,
      lng: spotLng,
      cuisine: classification.cuisine,
      category: classification.category,
      priceSEK: priceSEK,
      lunchHours: tags.opening_hours || '11:00 - 14:30',
      signature: getSignature(rawName, classification.category, classification.cuisine),
      perks: perks,
      emoji: classification.emoji,
      website: website,
      distanceMeters: dist,
      walkMinutes: getWalkMinutes(dist),
      isCurated: false
    });
  }

  // Sort primarily by distance
  return list.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    app: 'Stamplunch',
    curatedCount: CURATED_RESTAURANTS.length,
    location: 'Stampgatan 20, Göteborg'
  });
});

// Dynamic restaurants API
app.get('/api/restaurants', async (req, res) => {
  const lat = parseFloat(req.query.lat) || 57.7077;
  const lng = parseFloat(req.query.lng) || 11.9840;
  const radius = Math.min(Math.max(parseInt(req.query.radius) || 1200, 300), 3000);

  const cacheKey = `${lat.toFixed(3)}_${lng.toFixed(3)}_${radius}`;
  const cached = memoryCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.json({
      status: 'ok',
      source: 'memory-cache',
      total: cached.data.length,
      curatedCount: cached.data.filter((r) => r.isCurated).length,
      restaurants: cached.data
    });
  }

  try {
    const { elements, source } = await fetchOverpassPlaces(lat, lng, radius);
    const restaurants = processElements(elements, lat, lng, radius);

    // Update cache
    memoryCache.set(cacheKey, { data: restaurants, timestamp: Date.now() });

    return res.json({
      status: 'ok',
      source: source,
      total: restaurants.length,
      curatedCount: restaurants.filter((r) => r.isCurated).length,
      restaurants: restaurants
    });
  } catch (err) {
    console.error('API Error in /api/restaurants:', err);
    // Fallback: Just return processed curated
    const fallbackList = CURATED_RESTAURANTS.map((c) => {
      const dist = haversineMeters(lat, lng, c.lat, c.lng);
      return { ...c, distanceMeters: dist, walkMinutes: getWalkMinutes(dist) };
    });

    return res.json({
      status: 'ok',
      source: 'fallback-curated',
      total: fallbackList.length,
      curatedCount: fallbackList.length,
      restaurants: fallbackList
    });
  }
});

// Fallback all other routes to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Stamplunch server running on port ${PORT}`);
});
