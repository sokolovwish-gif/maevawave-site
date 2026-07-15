const telegramUrl = "https://t.me/captainmaeva";

function formatDates(trip) {
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
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

function fillList(name, value) {
  const list = document.querySelector(`[data-page-list="${name}"]`);
  list.replaceChildren(
    ...String(value || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        return li;
      }),
  );
}

function titleWithLineBreak(title) {
  return String(title || "").replace(/\s+в\s+/i, "\nв ");
}

function fillGallery(trip) {
  const gallery = document.querySelector("[data-trip-gallery]");
  const images = Array.isArray(trip.gallery) ? trip.gallery.filter(Boolean).slice(0, 6) : [];
  gallery.replaceChildren(
    ...images.map((image, index) => {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = image.startsWith("/") ? image : `/${image}`;
      img.alt = `${trip.cardTitle}, фото ${index + 1}`;
      img.loading = "lazy";
      figure.append(img);
      return figure;
    }),
  );
  gallery.closest(".trip-gallery-section").hidden = images.length === 0;
}

function renderTrip(trip) {
  document.title = `${trip.cardTitle} | MAEVAWAVE`;
  const canonical = `https://maevawave.ru/trip.html?id=${encodeURIComponent(trip.id)}`;
  const description = `${trip.cardTitle}. ${trip.pageLead}`.slice(0, 200);
  document.querySelector('link[rel="canonical"]').href = canonical;
  document.querySelector('meta[name="description"]').content = description;
  document.querySelector('meta[property="og:title"]').content = `${trip.cardTitle} | MAEVAWAVE`;
  document.querySelector('meta[property="og:description"]').content = description;
  document.querySelector('meta[property="og:url"]').content = canonical;
  document.querySelector('meta[property="og:image"]').content = new URL(`/${trip.image}`, window.location.origin).href;
  document.querySelector(".trip-hero-image").src = `/${trip.image}`;
  document.querySelector(".trip-hero-image").alt = trip.title;
  document.querySelector(".trip-country-label").textContent = trip.country;
  document.querySelector(".trip-page-title").textContent = titleWithLineBreak(trip.cardTitle);
  document.querySelector(".trip-page-lead").textContent = trip.pageLead;
  document.querySelector(".trip-page-dates").textContent = formatDates(trip);
  document.querySelector(".trip-page-price").textContent = trip.priceLabel;
  document.querySelectorAll('[data-page-field="routeText"]').forEach((node) => { node.textContent = trip.routeText; });
  document.querySelectorAll('[data-page-field="accommodationText"]').forEach((node) => { node.textContent = trip.accommodationText; });
  document.querySelectorAll('[data-page-field="importantText"]').forEach((node) => { node.textContent = trip.importantText; });
  fillList("includedText", trip.includedText);
  fillList("excludedText", trip.excludedText);
  fillGallery(trip);
  document.querySelectorAll('a[href*="t.me"]').forEach((link) => { link.href = telegramUrl; });
  document.querySelectorAll(".trip-lead-button").forEach((button) => {
    button.addEventListener("click", () => window.MaevaLeadForm.open(trip));
  });
  document.querySelector("#trip-content").hidden = false;
}

async function init() {
  const id = new URLSearchParams(window.location.search).get("id");
  const preview = new URLSearchParams(window.location.search).get("preview") === "1";
  if (!id) return showNotFound();

  try {
    const [settingsResponse, tripResponse] = await Promise.all([
      fetch("/api/site-settings", { cache: "no-store" }),
      fetch(`${preview ? "/api/admin/trips/" : "/api/trips/"}${encodeURIComponent(id)}`, { cache: "no-store" }),
    ]);
    if (settingsResponse.ok && (await settingsResponse.json()).placeholderEnabled) {
      window.location.replace("/");
      return;
    }
    if (!tripResponse.ok) return showNotFound();
    renderTrip((await tripResponse.json()).trip);
  } catch {
    showNotFound();
  } finally {
    document.body.classList.remove("is-loading");
  }
}

function showNotFound() {
  document.querySelector("#trip-not-found").hidden = false;
}

init();
