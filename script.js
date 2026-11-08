const telegramUrl = "https://t.me/captainmaeva";
const PROMO_STORAGE_KEY = "maevawave:promo-dismissed-at";
const PROMO_INTENT_KEY = "promoIntent";

let currentSiteSettings = null;
let promoInitialized = false;
let leadFormOpened = false;

const catalogSnapshot = [
  {
    id: "THA-261226",
    country: "Таиланд",
    title: "Таиланд | 26 декабря – 2 января",
    cardTitle: "Новый год в Таиланде",
    description: "Семь дней на парусной яхте в небольшой команде",
    badge: "Есть места",
    priceLabel: "249 000 ₽",
    startDate: "2026-12-26T00:00:00.000Z",
    endDate: "2027-01-02T00:00:00.000Z",
    image: "images/hero-deck.webp",
    featured: false,
    order: 100,
  },
  {
    id: "THA-230127",
    country: "Таиланд",
    title: "Таиланд | 23 января – 30 января",
    cardTitle: "Яхтенная неделя в Таиланде",
    description: "Переходы под парусом, острова и жизнь на борту",
    badge: "Есть места",
    priceLabel: "229 000 ₽",
    startDate: "2027-01-23T00:00:00.000Z",
    endDate: "2027-01-30T00:00:00.000Z",
    image: "images/thailand-aerial.jpg",
    featured: false,
    order: 101,
  },
];

async function loadSiteSettings() {
  try {
    const response = await fetch("/api/site-settings", { cache: "no-store" });
    if (!response.ok) throw new Error(`Site settings HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    console.warn("Could not load site settings:", error);
    return { placeholderEnabled: false, promo: { enabled: false } };
  }
}

async function applySiteMode() {
  const settings = await loadSiteSettings();
  currentSiteSettings = settings;
  const placeholder = document.querySelector("#site-placeholder");
  placeholder.hidden = !settings.placeholderEnabled;
  document.body.classList.toggle("placeholder-mode", settings.placeholderEnabled);
  document.body.classList.remove("mode-loading");

  if (!promoInitialized && !settings.placeholderEnabled) {
    promoInitialized = true;
    initPromo(settings.promo || {});
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

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function datesFromTitle(trip) {
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const separator = String(trip.title || "").indexOf("|");
    return separator >= 0 ? trip.title.slice(separator + 1).trim() : String(trip.title || "Даты уточняются");
  }

  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric" });
  const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
  const dayMonthYear = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return sameMonth
    ? `${day.format(start)}–${dayMonthYear.format(end)}`
    : `${dayMonth.format(start)} – ${dayMonthYear.format(end)}`;
}

function titleWithLineBreak(title) {
  return escapeHtml(title).replace(/\s+в\s+/i, "<br />в ");
}

function availabilityLabel(trip) {
  const seatsLeft = safeNumber(trip.seats_left ?? trip.seatsLeft);
  const capacity = safeNumber(trip.capacity);
  if (seatsLeft !== null) {
    if (seatsLeft === 0) return "Мест нет";
    if (seatsLeft === 1) return "Осталось 1 место";
    if (seatsLeft < 5) return `Осталось ${seatsLeft} места`;
    return `Осталось ${seatsLeft} мест`;
  }
  return capacity !== null ? `До ${capacity} участников` : "Места уточняются";
}

function sortTrips(trips) {
  return [...trips].sort((a, b) => {
    const featured = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    if (featured) return featured;
    const order = Number(a.order ?? 100) - Number(b.order ?? 100);
    if (order) return order;
    return new Date(a.startDate || 0) - new Date(b.startDate || 0);
  });
}

function isCurrentOrUpcoming(trip) {
  const end = new Date(trip.endDate || trip.startDate || 0);
  if (Number.isNaN(end.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return end >= today;
}

async function loadTrips() {
  try {
    const response = await fetch("/api/trips", { cache: "no-store" });
    if (!response.ok) throw new Error(`Catalog API HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.trips)) throw new Error("Catalog API returned invalid data");
    return sortTrips(payload.trips.filter(isCurrentOrUpcoming));
  } catch (error) {
    console.warn("Using the latest catalog snapshot:", error);
    return sortTrips(catalogSnapshot.filter(isCurrentOrUpcoming));
  }
}

function renderTrips(trips) {
  const tripGrid = document.querySelector("#trip-grid");
  tripGrid.setAttribute("aria-busy", "false");

  if (!trips.length) {
    tripGrid.innerHTML = `
      <div class="trip-empty">
        <h3>Новые даты скоро появятся</h3>
        <p>Напишите нам — подскажем, когда откроется следующая поездка.</p>
        <a href="${telegramUrl}" target="_blank" rel="noreferrer">Спросить в Telegram ↗</a>
      </div>
    `;
    return;
  }

  tripGrid.innerHTML = trips.map((trip, index) => {
    const seatsLeft = safeNumber(trip.seats_left ?? trip.seatsLeft);
    const capacity = safeNumber(trip.capacity);
    const duration = String(trip.durationLabel || "").trim();
    const availability = seatsLeft !== null || capacity !== null ? availabilityLabel(trip) : "";
    const meta = [duration, availability].filter(Boolean);
    const href = trip.pageUrl || `/trip.html?id=${encodeURIComponent(trip.id)}`;
    const image = trip.image || "images/hero-deck.webp";
    return `
      <a
        class="trip-card${trip.featured ? " featured" : ""}${seatsLeft !== null && seatsLeft <= 2 ? " few" : ""}"
        href="${escapeHtml(href)}"
        aria-label="Подробнее: ${escapeHtml(trip.cardTitle || trip.title)}"
      >
        <div class="trip-card-media">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(trip.cardTitle || trip.title)}" loading="lazy" />
          <span class="trip-card-number">${String(index + 1).padStart(2, "0")}</span>
          <span class="trip-status">${escapeHtml(trip.badge || "Есть места")}</span>
        </div>
        <div class="trip-body">
          <p class="trip-country">${escapeHtml(trip.country)}</p>
          <h3>${escapeHtml(trip.cardTitle || trip.title)}</h3>
          <p class="trip-date">${escapeHtml(datesFromTitle(trip))}</p>
          <p class="trip-route">${escapeHtml(trip.description || "Маршрут, детали и жизнь на борту — на странице поездки.")}</p>
          <div class="trip-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
          <div class="trip-footer">
            <span class="trip-price">Стоимость<strong>${escapeHtml(trip.priceLabel || "По запросу")}</strong>${trip.approxEuroPrice ? `<em>${escapeHtml(trip.approxEuroPrice)}</em>` : ""}</span>
            <span class="trip-details-link">Подробнее <span aria-hidden="true">→</span></span>
          </div>
        </div>
      </a>
    `;
  }).join("");

  registerRevealNodes(tripGrid.querySelectorAll(".trip-card"));
}

function initPromo(settings) {
  const promo = {
    enabled: false,
    title: "Специальное условие на бронь",
    text: "Оставьте заявку сегодня — и мы закрепим за вами скидку 5% на выбранное путешествие.",
    discountPercent: 5,
    buttonLabel: "Выбрать путешествие",
    secondaryButtonLabel: "Не сейчас",
    showDelaySeconds: 10,
    showOnScrollPercent: 20,
    showOnMouseMove: false,
    showOncePerHours: 24,
    ...settings,
  };
  if (!promo.enabled) return;

  const lastDismissed = Number(localStorage.getItem(PROMO_STORAGE_KEY) || 0);
  const waitHours = Math.max(1, Number(promo.showOncePerHours) || 24);
  if (Date.now() - lastDismissed < waitHours * 60 * 60 * 1000) return;

  document.body.insertAdjacentHTML("beforeend", `
    <dialog class="promo-dialog" id="promo-dialog" aria-labelledby="promo-title">
      <div class="promo-card">
        <button class="promo-close" type="button" aria-label="Закрыть предложение">×</button>
        <p class="promo-kicker">Специальное предложение · скидка ${escapeHtml(promo.discountPercent)}%</p>
        <h2 id="promo-title">${escapeHtml(promo.title)}</h2>
        <p>${escapeHtml(promo.text)}</p>
        <div class="promo-actions">
          <button class="button button-primary promo-accept" type="button">${escapeHtml(promo.buttonLabel)}</button>
          <button class="button promo-secondary" type="button">${escapeHtml(promo.secondaryButtonLabel)}</button>
        </div>
      </div>
    </dialog>
  `);

  const dialog = document.querySelector("#promo-dialog");
  let shown = false;
  const dismiss = () => {
    localStorage.setItem(PROMO_STORAGE_KEY, String(Date.now()));
    if (dialog.open) dialog.close();
  };
  const show = () => {
    if (shown || leadFormOpened || currentSiteSettings?.placeholderEnabled || document.querySelector("#lead-dialog[open]")) return;
    shown = true;
    dialog.showModal();
  };

  dialog.querySelector(".promo-close").addEventListener("click", dismiss);
  dialog.querySelector(".promo-secondary").addEventListener("click", dismiss);
  dialog.querySelector(".promo-accept").addEventListener("click", () => {
    localStorage.setItem(PROMO_INTENT_KEY, "true");
    dismiss();
    document.querySelector("#trips")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dismiss(); });
  document.addEventListener("maevawave:lead-open", () => {
    leadFormOpened = true;
    if (dialog.open) dialog.close();
  });

  const delay = Math.max(8, Math.min(60, Number(promo.showDelaySeconds) || 10)) * 1000;
  window.setTimeout(show, delay);

  const scrollTarget = Math.max(1, Math.min(95, Number(promo.showOnScrollPercent) || 20));
  const onScroll = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const percent = maxScroll > 0 ? (window.scrollY / maxScroll) * 100 : 0;
    if (percent >= scrollTarget) {
      window.removeEventListener("scroll", onScroll);
      show();
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  if (promo.showOnMouseMove) {
    const onMouseMove = (event) => {
      if (event.clientY <= 12 && event.movementY < 0) {
        document.removeEventListener("mousemove", onMouseMove);
        show();
      }
    };
    document.addEventListener("mousemove", onMouseMove);
  }
}

const revealObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 })
  : null;

function registerRevealNodes(nodes) {
  [...nodes].forEach((node, index) => {
    node.setAttribute("data-reveal", "");
    node.style.transitionDelay = `${Math.min(index * 65, 260)}ms`;
    if (revealObserver) revealObserver.observe(node);
    else node.classList.add("is-visible");
  });
}

registerRevealNodes(document.querySelectorAll("[data-reveal]"));

const header = document.querySelector("[data-header]");
const updateHeader = () => header?.classList.toggle("scrolled", window.scrollY > 18);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

document.querySelectorAll("[data-current-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});

const menuButton = document.querySelector(".menu-button");
const nav = document.querySelector("#nav");

if (menuButton && nav) {
  menuButton.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    menuButton.classList.toggle("active", isOpen);
    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
    document.body.classList.toggle("menu-open", isOpen);
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuButton.classList.remove("active");
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Открыть меню");
      document.body.classList.remove("menu-open");
    });
  });
}

applySiteMode();
window.setInterval(applySiteMode, 30_000);
loadTrips().then(renderTrips);
window.setInterval(() => loadTrips().then(renderTrips), 60_000);
