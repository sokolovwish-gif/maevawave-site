const telegramUrl = "https://t.me/captainmaeva";

async function applySiteMode() {
  try {
    const response = await fetch("/api/site-settings", { cache: "no-store" });
    if (!response.ok) return;
    const settings = await response.json();
    const placeholder = document.querySelector("#site-placeholder");
    placeholder.hidden = !settings.placeholderEnabled;
    document.body.classList.toggle("placeholder-mode", settings.placeholderEnabled);
  } catch (error) {
    console.warn("Could not load site mode:", error);
  } finally {
    document.body.classList.remove("mode-loading");
  }
}

applySiteMode();
setInterval(applySiteMode, 30_000);

const catalogSnapshot = [
  {
    id: "TUR-220826",
    country: "Турция",
    title: "Турция | 22 августа – 29 августа",
    cardTitle: "Яхтенная неделя в Турции",
    description: "7 дней на парусной яхте в камерной компании",
    badge: "Доступно к оплате",
    priceLabel: "198 000 ₽",
    startDate: "2026-08-22T00:00:00.000Z",
    endDate: "2026-08-29T00:00:00.000Z",
    image: "images/turkey-bay.jpg",
    featured: false,
  },
  {
    id: "TUR-290826",
    country: "Турция",
    title: "Турция | 29 августа – 5 сентября",
    cardTitle: "Яхтенная неделя в Турции",
    description: "7 дней на парусной яхте в камерной компании",
    badge: "Доступно к оплате",
    priceLabel: "198 000 ₽",
    startDate: "2026-08-29T00:00:00.000Z",
    endDate: "2026-09-05T00:00:00.000Z",
    image: "images/flamingo-sea.jpg",
    featured: false,
  },
];

async function loadTrips() {
  try {
    const response = await fetch("/api/trips", { cache: "no-store" });
    if (!response.ok) throw new Error(`Catalog API HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.trips)) throw new Error("Catalog API returned invalid data");
    return payload.trips;
  } catch (error) {
    console.warn("Using the latest catalog snapshot:", error);
    return catalogSnapshot;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function datesFromTitle(trip) {
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const separator = trip.title.indexOf("|");
    return separator >= 0 ? trip.title.slice(separator + 1).trim() : trip.title;
  }

  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric" });
  const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
  const dayMonthYear = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return sameMonth
    ? `${day.format(start)}–${dayMonthYear.format(end)}`
    : `${dayMonth.format(start)} – ${dayMonthYear.format(end)}`;
}

function titleWithLineBreak(title) {
  return escapeHtml(title).replace(/\s+в\s+/i, "<br />в ");
}

function renderTrips(trips) {
  const tripGrid = document.querySelector("#trip-grid");

  if (!trips.length) {
    tripGrid.innerHTML = `
      <div class="trip-empty">
        <h3>Новые даты скоро появятся</h3>
        <a href="${telegramUrl}" target="_blank" rel="noreferrer">Написать Маше ↗</a>
      </div>
    `;
    return;
  }

  tripGrid.innerHTML = trips
    .map(
      (trip) => `
        <a
          class="trip-card${trip.featured ? " featured" : ""}"
          href="${escapeHtml(trip.pageUrl || `/trip.html?id=${encodeURIComponent(trip.id)}`)}"
        >
          <img src="${escapeHtml(trip.image)}" alt="${escapeHtml(trip.title)}" loading="lazy" />
          <div class="trip-top">
            <span class="trip-status">${escapeHtml(trip.badge)}</span>
            <span class="trip-country">${escapeHtml(trip.country)}</span>
          </div>
          <div class="trip-body">
            <p class="trip-date">${escapeHtml(datesFromTitle(trip))}</p>
            <h3>${titleWithLineBreak(trip.cardTitle)}</h3>
            <p class="trip-route">${escapeHtml(trip.description)}</p>
            <div class="trip-footer">
              <span class="trip-price">Стоимость<strong>${escapeHtml(trip.priceLabel)}</strong></span>
              <div class="trip-actions">
                <span class="trip-details-link">Подробнее <span aria-hidden="true">→</span></span>
              </div>
            </div>
          </div>
        </a>
      `,
    )
    .join("");
}

loadTrips().then(renderTrips);
setInterval(() => loadTrips().then(renderTrips), 60_000);

const menuButton = document.querySelector(".menu-button");
const nav = document.querySelector("#nav");

menuButton.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  menuButton.classList.toggle("active", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("menu-open", isOpen);
});

nav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    menuButton.classList.remove("active");
    menuButton.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  });
});
