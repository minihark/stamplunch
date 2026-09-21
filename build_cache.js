const fs = require('fs');
const path = require('path');

const query = `[out:json][timeout:25];
(
  node["amenity"~"^(restaurant|fast_food|cafe|bistro|pub)$"](around:1200, 57.7077, 11.9840);
  way["amenity"~"^(restaurant|fast_food|cafe|bistro|pub)$"](around:1200, 57.7077, 11.9840);
);
out center;`;

async function fetchSnapshot() {
  const urls = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  for (const baseUrl of urls) {
    try {
      console.log('Fetching from:', baseUrl);
      const res = await fetch(baseUrl + '?data=' + encodeURIComponent(query), {
        headers: { 'User-Agent': 'Stamplunch/1.0 (minihark@harkco.se)' }
      });
      const text = await res.text();
      if (!text.trim().startsWith('{')) {
        console.warn('Non-JSON response, trying next...');
        continue;
      }
      const data = JSON.parse(text);
      const named = (data.elements || []).filter(e => e.tags && e.tags.name);
      console.log(`Successfully fetched ${named.length} named places.`);
      const target = path.join(__dirname, 'cached_places.json');
      fs.writeFileSync(target, JSON.stringify(data, null, 2));
      console.log('Written to:', target);
      return;
    } catch (err) {
      console.warn(`Failed with ${baseUrl}:`, err.message);
    }
  }
  console.error('All mirrors failed to fetch snapshot');
}

fetchSnapshot();
