const request = document.getElementById("request");
const planBtn = document.getElementById("planBtn");
const result = document.getElementById("result");
const routeTitle = document.getElementById("routeTitle");
const to = document.getElementById("to");
const time = document.getElementById("time");
const stopCard = document.getElementById("stopCard");
const stopName = document.getElementById("stopName");
const stopText = document.getElementById("stopText");
const mapsBtn = document.getElementById("mapsBtn");

document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    request.value = chip.dataset.prompt;
    request.focus();
  });
});

function planRoute() {
  const text = request.value.trim();
  if (!text) {
    request.focus();
    return;
  }

  const lower = text.toLowerCase();
  const destination = lower.includes("dublin") ? "Dublin" :
    lower.includes("monaghan") ? "Monaghan" :
    lower.includes("belfast") ? "Belfast" :
    "Your destination";

  to.textContent = destination;
  routeTitle.textContent = `Route to ${destination}`;
  time.textContent = lower.includes("tomorrow") ? "Planned for tomorrow" : "Ready to navigate";

  const wantsFood = /lunch|dinner|eat|food|restaurant|meal|hungry|coffee|café|cafe/.test(lower);
  if (wantsFood) {
    stopCard.classList.remove("hidden");
    stopName.textContent = destination === "Dublin" ? "Smart food stop" : "Nearby food stop";
    stopText.textContent = "A convenient stop can be added to your journey.";
  } else {
    stopCard.classList.add("hidden");
  }

  mapsBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  result.classList.remove("hidden");
  result.scrollIntoView({behavior:"smooth", block:"start"});
}

planBtn.addEventListener("click", planRoute);
request.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") planRoute();
});
document.getElementById("newBtn").addEventListener("click", () => {
  result.classList.add("hidden");
  request.focus();
  window.scrollTo({top:0,behavior:"smooth"});
});

document.getElementById("micBtn").addEventListener("click", () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Voice input is not supported by this browser yet.");
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-IE";
  recognition.interimResults = false;
  recognition.onresult = e => request.value = e.results[0][0].transcript;
  recognition.start();
});
