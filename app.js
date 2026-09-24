const request = document.getElementById("request");
const planBtn = document.getElementById("planBtn");
const result = document.getElementById("result");
const routeTitle = document.getElementById("routeTitle");
const routeLine = document.getElementById("routeLine");
const routeInfo = document.getElementById("routeInfo");
const mapsBtn = document.getElementById("mapsBtn");
const statusEl = document.getElementById("status");
const errorBox = document.getElementById("errorBox");
const voiceStatus = document.getElementById("voiceStatus");
const micBtn = document.getElementById("micBtn");
const newBtn = document.getElementById("newBtn");

const NOM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const OSRM = "https://router.project-osrm.org/route/v1/driving";

// Quick examples
for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => {
    request.value = chip.dataset.prompt || "";
    request.focus();
  });
}

function parseIntent(text) {
  const l = text.toLowerCase().trim();

  // Keep the common destinations explicit, then use a more general parser.
  const known = [
    ["dublin", "Dublin, Ireland"],
    ["belfast", "Belfast, UK"],
    ["monaghan", "Monaghan, Ireland"],
    ["cork", "Cork, Ireland"],
    ["galway", "Galway, Ireland"],
    ["limerick", "Limerick, Ireland"],
    ["waterford", "Waterford, Ireland"]
  ];

  let destination = "";
  for (const [word, value] of known) {
    if (l.includes(word)) {
      destination = value;
      break;
    }
  }

  if (!destination) {
    const patterns = [
      /(?:go|going|drive|driving|travel|travelling|traveling|head|heading|route)\s+(?:to\s+)?([^,.!?]+?)(?=\s+(?:tomorrow|today|at|on the way|and|with|for|please)\b|[,.!?]|$)/i,
      /\bto\s+([^,.!?]+?)(?=\s+(?:tomorrow|today|at|on the way|and|with|for)\b|[,.!?]|$)/i
    ];
    for (const pattern of patterns) {
      const match = l.match(pattern);
      if (match?.[1]) {
        destination = match[1].trim();
        break;
      }
    }
  }

  const coffee = /\bcoffee|café|cafe\b/.test(l);
  const lunch = /\blunch|restaurant|food|eat|meal|dinner|hungry|breakfast\b/.test(l);
  const fuel = /\bfuel|petrol|diesel|gas station|service station|refuel\b/.test(l);

  return { destination: destination || "Dublin, Ireland", coffee, lunch, fuel };
}

async function geocode(query) {
  const url = NOM + "?format=jsonv2&limit=1&addressdetails=1&q=" + encodeURIComponent(query);
  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error("The map search service is unavailable right now.");

  const places = await response.json();
  if (!places.length) throw new Error(`I couldn't find “${query}”. Try a town or city name.`);

  return {
    lat: Number(places[0].lat),
    lon: Number(places[0].lon),
    name: places[0].display_name
  };
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not available in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => resolve({
        lat: position.coords.latitude,
        lon: position.coords.longitude
      }),
      error => {
        const messages = {
          1: "Location permission was denied. On iPhone, allow Location Access for the browser and try again.",
          2: "Your location could not be determined. Check your GPS/location settings and try again.",
          3: "Location lookup timed out. Please try again."
        };
        reject(new Error(messages[error.code] || "Could not get your current location."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

async function route(coords) {
  const coordinates = coords.map(point => `${point.lon},${point.lat}`).join(";");
  const response = await fetch(`${OSRM}/${coordinates}?overview=full&geometries=geojson`);
  if (!response.ok) throw new Error("The routing service is unavailable right now.");

  const data = await response.json();
  if (data.code !== "Ok" || !data.routes?.[0]) {
    throw new Error("I couldn't calculate that route.");
  }
  return data.routes[0];
}

function haversine(a, b) {
  const earth = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(x));
}

async function findPlace(point, type) {
  const tag = type === "coffee" ? "amenity=cafe" : "amenity=restaurant";
  const query = `[out:json][timeout:15];(node[${tag}](around:7000,${point.lat},${point.lon});way[${tag}](around:7000,${point.lat},${point.lon}););out center tags;`;

  const response = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: query
  });
  if (!response.ok) throw new Error("The places search service is unavailable right now.");

  const data = await response.json();
  const places = data.elements
    .map(element => ({
      lat: element.lat ?? element.center?.lat,
      lon: element.lon ?? element.center?.lon,
      name: element.tags?.name
    }))
    .filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lon) && place.name);

  places.sort((a, b) => haversine(point, a) - haversine(point, b));
  return places[0] || null;
}

function samplePoint(routeData, fraction) {
  const coordinates = routeData.geometry.coordinates;
  const index = Math.max(0, Math.min(coordinates.length - 1, Math.floor((coordinates.length - 1) * fraction)));
  return { lon: coordinates[index][0], lat: coordinates[index][1] };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function renderPlan(start, destination, stops) {
  const items = [
    { name: "Your location", kind: "Start" },
    ...stops.map(stop => ({
      name: stop.name,
      kind: stop.kind === "coffee" ? "Coffee stop" : "Lunch / food stop"
    })),
    { name: destination.name.split(",")[0], kind: "Destination" }
  ];

  routeLine.innerHTML = "";
  routeInfo.innerHTML = "";

  items.forEach((item, index) => {
    const node = document.createElement("div");
    node.className = "node " + (
      index === items.length - 1 ? "end" : index > 0 ? "stop" : ""
    );
    routeLine.appendChild(node);

    const row = document.createElement("div");
    row.className = "route-stop";
    row.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.kind)}</span>`;
    routeInfo.appendChild(row);

    if (index < items.length - 1) {
      const connector = document.createElement("div");
      connector.className = "connector";
      routeLine.appendChild(connector);
    }
  });
}

async function planRoute() {
  const text = request.value.trim();
  if (!text) {
    request.focus();
    return;
  }

  result.classList.remove("hidden");
  errorBox.classList.add("hidden");
  mapsBtn.classList.add("disabled");
  mapsBtn.removeAttribute("href");
  statusEl.className = "status loading";
  statusEl.textContent = "Planning…";
  routeTitle.textContent = "Finding your route…";

  try {
    const intent = parseIntent(text);
    const start = await getCurrentPosition();
    const destination = await geocode(intent.destination);
    const baseRoute = await route([start, destination]);
    const stops = [];

    if (intent.coffee) {
      const coffee = await findPlace(samplePoint(baseRoute, 0.32), "coffee");
      if (coffee) stops.push({ ...coffee, kind: "coffee" });
    }

    if (intent.lunch) {
      const lunch = await findPlace(samplePoint(baseRoute, intent.coffee ? 0.58 : 0.50), "lunch");
      if (lunch && (!stops.length || haversine(lunch, stops[0]) > 1500)) {
        stops.push({ ...lunch, kind: "lunch" });
      }
    }

    if (intent.fuel) {
      // Fuel search is not implemented in the current open-data prototype.
      // Do not invent a petrol station; keep the route valid and explain the limitation.
    }

    const points = [start, ...stops, destination];
    await route(points);
    renderPlan(start, destination, stops);

    const waypoints = stops.map(stop => `${stop.lat},${stop.lon}`).join("|");
    let mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${start.lat},${start.lon}`)}&destination=${encodeURIComponent(`${destination.lat},${destination.lon}`)}&travelmode=driving`;
    if (waypoints) mapsUrl += `&waypoints=${encodeURIComponent(waypoints)}`;

    mapsBtn.href = mapsUrl;
    mapsBtn.classList.remove("disabled");
    routeTitle.textContent = `Route to ${destination.name.split(",")[0]}`;
    statusEl.className = "status";
    statusEl.textContent = stops.length
      ? `${stops.length} stop${stops.length === 1 ? "" : "s"} added`
      : "Route ready";

    if (intent.fuel) {
      const note = document.createElement("div");
      note.className = "route-note";
      note.textContent = "Fuel-stop search will be added in the next build.";
      routeInfo.appendChild(note);
    }
  } catch (error) {
    statusEl.className = "status error";
    statusEl.textContent = "Needs attention";
    routeTitle.textContent = "We couldn't finish the route";
    errorBox.textContent = error?.message || "Something went wrong. Please try again.";
    errorBox.classList.remove("hidden");
  }

  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

planBtn.addEventListener("click", planRoute);
request.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") planRoute();
});

newBtn.addEventListener("click", () => {
  result.classList.add("hidden");
  errorBox.classList.add("hidden");
  mapsBtn.classList.add("disabled");
  mapsBtn.removeAttribute("href");
  request.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Voice input
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let voiceHadError = false;

function setVoiceStatus(message, isError = false) {
  voiceStatus.textContent = message;
  voiceStatus.classList.toggle("voice-error", isError);
}

if (!SpeechRecognition) {
  setVoiceStatus("Voice input is not supported by this browser. Try Safari on iPhone.", true);
} else {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  // Match the user's browser language when possible; otherwise use Irish English.
  const browserLanguage = navigator.language || "en-IE";
  recognition.lang = /^pt/i.test(browserLanguage) ? "pt-BR" : "en-IE";

  recognition.onstart = () => {
    voiceHadError = false;
    micBtn.classList.add("listening");
    micBtn.setAttribute("aria-pressed", "true");
    setVoiceStatus("Listening… speak now.");
  };

  recognition.onresult = event => {
    let transcript = "";
    for (const result of event.results) transcript += result[0].transcript;
    request.value = transcript.trim();
  };

  recognition.onerror = event => {
    voiceHadError = true;
    const messages = {
      "not-allowed": "Microphone permission was denied. Allow microphone access for this site in your iPhone browser settings.",
      "service-not-allowed": "Speech recognition is blocked by the browser. Try opening RouteAI directly in Safari.",
      "no-speech": "I didn't hear anything. Tap the microphone and try again.",
      "audio-capture": "The microphone could not be accessed. Check that another app is not using it.",
      "network": "Speech recognition needs an internet connection. Check your connection and try again."
    };
    setVoiceStatus(messages[event.error] || `Voice input error: ${event.error}.`, true);
  };

  recognition.onend = () => {
    micBtn.classList.remove("listening");
    micBtn.setAttribute("aria-pressed", "false");
    if (!voiceHadError && request.value.trim()) {
      setVoiceStatus("Voice captured. Tap Plan my route.");
    }
  };

  micBtn.addEventListener("click", () => {
    if (!recognition) return;
    if (micBtn.classList.contains("listening")) {
      recognition.stop();
      return;
    }

    try {
      setVoiceStatus("Starting microphone…");
      recognition.start();
    } catch (error) {
      setVoiceStatus("The microphone is already starting. Please try again.", true);
    }
  });
}
