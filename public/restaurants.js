/**
 * Stamplunch — Gothenburg Stampgatan Lunch Restaurant Directory
 * Verified local spots around Stampgatan, Odinsplatsen, Friggagatan, and Ullevi.
 */

const OFFICE_LOCATION = {
  name: "Stampgatan Office",
  address: "Stampgatan 20, 411 01 Göteborg",
  lat: 57.7077,
  lng: 11.9840
};

const RESTAURANTS = [
  {
    id: "jinx-empire",
    name: "Jinx Empire",
    address: "Folkungagatan 20 / Stampgatan",
    lat: 57.7072,
    lng: 11.9860,
    cuisine: "Asian Fusion",
    category: "asian",
    priceSEK: 135,
    lunchHours: "11:00 - 13:30",
    signature: "Pork belly bao buns, bibimbap & Asian street bowls",
    perks: ["Snabb servering", "Kultstatus", "Uteservering"],
    emoji: "🥢",
    website: "https://jinxempire.com"
  },
  {
    id: "bruk",
    name: "Bruk",
    address: "Friggagatan 4",
    lat: 57.7102,
    lng: 11.9880,
    cuisine: "Nordic Modern",
    category: "nordic",
    priceSEK: 145,
    lunchHours: "11:30 - 14:00",
    signature: "Säsongsbetonad dagens med salladsbord, surdeg & kaffe",
    perks: ["Salladsbuffé", "Hembakt bröd", "Mysig atmosfär"],
    emoji: "🌿",
    website: "https://brukgbg.se"
  },
  {
    id: "birria-seoul",
    name: "Birria Seoul",
    address: "Stampgatan 48",
    lat: 57.7082,
    lng: 11.9875,
    cuisine: "Korean-Mexican",
    category: "streetfood",
    priceSEK: 135,
    lunchHours: "11:00 - 14:30",
    signature: "Birria tacos med dippbuljong & koreanska BBQ-skålar",
    perks: ["Direkt på Stampgatan", "Unika smaker", "Takeaway"],
    emoji: "🌮",
    website: "https://www.instagram.com/birriaseoul/"
  },
  {
    id: "ullevi-thaikok",
    name: "Ullevi Thaikök",
    address: "Stampgatan 46",
    lat: 57.7080,
    lng: 11.9870,
    cuisine: "Thai & Wok",
    category: "asian",
    priceSEK: 125,
    lunchHours: "11:00 - 15:00",
    signature: "Klassisk röd curry, pad thai, krispig anka & vårrullar",
    perks: ["Snabbt", "Generösa portioner", "Prisvärt"],
    emoji: "🍲",
    website: "https://ullevithaikok.se"
  },
  {
    id: "tomtoms-burritos",
    name: "TomToms Burritos",
    address: "Odinsplatsen 5",
    lat: 57.7092,
    lng: 11.9845,
    cuisine: "Mexican",
    category: "streetfood",
    priceSEK: 130,
    lunchHours: "11:00 - 15:00",
    signature: "Långbakad carnitas burrito, chipotle bowls & guacamole",
    perks: ["Fräscha råvaror", "Bra vegoalternativ", "Odinsplatsen"],
    emoji: "🌯",
    website: "https://tomtoms.se"
  },
  {
    id: "zenviet",
    name: "ZenViet",
    address: "Odinsgatan 5",
    lat: 57.7090,
    lng: 11.9835,
    cuisine: "Vietnamese",
    category: "asian",
    priceSEK: 135,
    lunchHours: "11:00 - 14:30",
    signature: "Rykande Phở bo, Bún Chả, fräscha rispappersrullar & sushi",
    perks: ["Hälsosamt", "Färska örter", "Bra soppor"],
    emoji: "🍜",
    website: "https://zenviet.se"
  },
  {
    id: "burgersson",
    name: "Burgersson",
    address: "Friggagatan 14B",
    lat: 57.7110,
    lng: 11.9900,
    cuisine: "Burgers",
    category: "burgers",
    priceSEK: 145,
    lunchHours: "11:30 - 14:00",
    signature: "Ekologiska premiumburgare, tryffelmajo & handskurna fries",
    perks: ["Svenskt ekokött", "Egenbakat bröd", "Högsta kvalitet"],
    emoji: "🍔",
    website: "https://burgersson.se"
  },
  {
    id: "restaurang-pylonen",
    name: "Restaurang Pylonen",
    address: "Ullevi (Paradentrén)",
    lat: 57.7060,
    lng: 11.9885,
    cuisine: "Swedish Husmanskost",
    category: "husman",
    priceSEK: 140,
    lunchHours: "11:00 - 13:30",
    signature: "Klassisk lunchbuffé med köttbullar, dagens fångst & soppa",
    perks: ["Klassisk buffé", "Gott om plats", "Mycket mat"],
    emoji: "🥔",
    website: "https://ullevikonferens.se"
  },
  {
    id: "leir-mat-moten",
    name: "Leir Mat & Möten",
    address: "Ullevigatan 17-19",
    lat: 57.7065,
    lng: 11.9845,
    cuisine: "Scandinavian Buffet",
    category: "nordic",
    priceSEK: 145,
    lunchHours: "11:00 - 14:00",
    signature: "Dagens kött, fisk & vego med stort fräscht salladsbord",
    perks: ["Affärslunch", "Ljust & luftigt", "Hälsosam buffé"],
    emoji: "🥗",
    website: "https://leirmatmoten.se"
  },
  {
    id: "kalle-glader",
    name: "Kalle Glader",
    address: "Friggagatan 10",
    lat: 57.7106,
    lng: 11.9890,
    cuisine: "Bistro & Pub",
    category: "husman",
    priceSEK: 135,
    lunchHours: "11:30 - 14:30",
    signature: "Krispig schnitzel, raggmunk med stekt fläsk & god husman",
    perks: ["Hemtrevligt", "Rejäla portioner", "Kvarterskrog"],
    emoji: "🍺",
    website: "https://kalleglader.se"
  },
  {
    id: "odins-parkgrill",
    name: "Odins Parkgrill",
    address: "Odinsplatsen 11",
    lat: 57.7095,
    lng: 11.9850,
    cuisine: "Street Food & Grill",
    category: "streetfood",
    priceSEK: 110,
    lunchHours: "11:00 - 20:00",
    signature: "Gourmet tunnbrödsrulle, smashburgare & mos med räksallad",
    perks: ["Snabbast", "Klassiskt göteborskt", "Prisvärt"],
    emoji: "🌭",
    website: "https://odinsparkgrill.se"
  },
  {
    id: "snack-shack",
    name: "Snack Shack",
    address: "Friggagatan 9",
    lat: 57.7105,
    lng: 11.9885,
    cuisine: "Smashburgers",
    category: "burgers",
    priceSEK: 125,
    lunchHours: "11:30 - 15:00",
    signature: "Oklahoma smashburgare med karamelliserad lök & cheddar",
    perks: ["Krispiga kanter", "Fast casual", "Streetkänsla"],
    emoji: "🍟",
    website: "https://happydaysgbg.se"
  },
  {
    id: "glenn-sportsbar",
    name: "Glenn Sportsbar",
    address: "Skånegatan 1 / Ullevi",
    lat: 57.7050,
    lng: 11.9870,
    cuisine: "Pub & Grill",
    category: "husman",
    priceSEK: 135,
    lunchHours: "11:30 - 14:00",
    signature: "Glenns högrevsburgare, fish & chips & dagens kött",
    perks: ["Gôtt tjöt", "Generöst", "Ullevikänsla"],
    emoji: "⚽",
    website: "https://glennsportsbar.se"
  },
  {
    id: "sushi-odins",
    name: "Sushi Odins",
    address: "Odinsgatan 13",
    lat: 57.7095,
    lng: 11.9825,
    cuisine: "Sushi & Japanese",
    category: "asian",
    priceSEK: 130,
    lunchHours: "11:00 - 14:30",
    signature: "Nigiri & maki kombo, flamberad lax & yakiniku",
    perks: ["Fräsch fisk", "Snabb take-out", "Misosoppa ingår"],
    emoji: "🍣",
    website: "https://goteborg.com"
  },
  {
    id: "trattoria-stampen",
    name: "Trattoria Stampen",
    address: "Stampgatan 28",
    lat: 57.7075,
    lng: 11.9852,
    cuisine: "Italian & Pizza",
    category: "italian",
    priceSEK: 125,
    lunchHours: "11:00 - 14:30",
    signature: "Stenbaksugnspizza, krämig carbonara & pizzasallad",
    perks: ["Precis vid kontoret", "Stenugn", "Klassiker"],
    emoji: "🍕",
    website: "https://thatsup.se"
  }
];

// Great-circle Haversine distance formula (in meters)
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
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

// Convert meters to approximate walking time (assuming 80 meters per minute / 4.8 km/h)
function getWalkMinutes(meters) {
  return Math.max(1, Math.round(meters / 80));
}

window.OFFICE_LOCATION = OFFICE_LOCATION;
window.RESTAURANTS = RESTAURANTS;
window.getDistanceMeters = getDistanceMeters;
window.getWalkMinutes = getWalkMinutes;
