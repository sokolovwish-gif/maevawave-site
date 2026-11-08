const telegramUrl = "https://t.me/captainmaeva";

function formatDates(trip) {
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const separator = String(trip.title || "").indexOf("|");
    return separator >= 0 ? trip.title.slice(separator + 1).trim() : "Даты уточняются";
  }
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric" });
  const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
  const dayMonthYear = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return sameMonth
    ? `${day.format(start)}–${dayMonthYear.format(end)}`
    : `${dayMonth.format(start)} – ${dayMonthYear.format(end)}`;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
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
  return capacity !== null ? `До ${capacity} участников` : String(trip.badge || "Уточним после заявки");
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

function assetUrl(path) {
  const normalized = String(path || "/images/hero-deck.webp");
  return new URL(normalized.startsWith("/") ? normalized : `/${normalized}`, window.location.origin).href;
}

function fillGallery(trip) {
  const gallery = document.querySelector("[data-trip-gallery]");
  const images = Array.isArray(trip.gallery) ? trip.gallery.filter(Boolean).slice(0, 6) : [];
  gallery.replaceChildren(
    ...images.map((image, index) => {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = assetUrl(image);
      img.alt = `${trip.cardTitle || trip.title}, фото ${index + 1}`;
      img.loading = index === 0 ? "eager" : "lazy";
      figure.append(img);
      return figure;
    }),
  );
  gallery.closest(".trip-gallery-section").hidden = images.length === 0;
}

function roomTourEmbed(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(parsed.hostname)) {
      const id = parsed.searchParams.get("v");
      return id && /^[A-Za-z0-9_-]+$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.slice(1);
      return /^[A-Za-z0-9_-]+$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (["vimeo.com", "www.vimeo.com"].includes(parsed.hostname)) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function fillRoomTour(trip) {
  const section = document.querySelector(".trip-room-tour");
  const container = document.querySelector("[data-room-tour]");
  const url = String(trip.roomTourUrl || "").trim();
  if (!url) {
    section.hidden = true;
    return;
  }

  const embed = roomTourEmbed(url);
  container.replaceChildren();
  if (embed) {
    const iframe = document.createElement("iframe");
    iframe.src = embed;
    iframe.title = `Рум-тур по яхте: ${trip.cardTitle || trip.title}`;
    iframe.loading = "lazy";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    container.append(iframe);
  } else {
    const link = document.createElement("a");
    link.className = "room-tour-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Открыть рум-тур ↗";
    container.append(link);
  }
  section.hidden = false;
}

function updateSeo(trip) {
  const title = `${trip.cardTitle || trip.title} | MaevaWave`;
  const description = `${trip.cardTitle || trip.title}: даты, маршрут, стоимость, проживание на яхте, что входит и анкета участника.`;
  const canonical = `https://maevawave.ru/trip.html?id=${encodeURIComponent(trip.id)}`;
  const image = assetUrl(trip.image);
  document.title = title;
  document.querySelector('link[rel="canonical"]').href = canonical;
  document.querySelector('meta[name="description"]').content = description;
  document.querySelector('meta[property="og:title"]').content = title;
  document.querySelector('meta[property="og:description"]').content = description;
  document.querySelector('meta[property="og:url"]').content = canonical;
  document.querySelector('meta[property="og:image"]').content = image;
  document.querySelector('meta[property="og:image:alt"]').content = trip.cardTitle || trip.title;
  document.querySelector('meta[name="twitter:title"]').content = title;
  document.querySelector('meta[name="twitter:description"]').content = description;
  document.querySelector('meta[name="twitter:image"]').content = image;

  const price = safeNumber(trip.priceRub);
  const seatsLeft = safeNumber(trip.seats_left ?? trip.seatsLeft);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: trip.cardTitle || trip.title,
    description,
    image: [image],
    url: canonical,
    touristType: "Яхтенные путешествия",
    provider: {
      "@type": "TravelAgency",
      name: "MaevaWave",
      url: "https://maevawave.ru/",
    },
  };
  if (price !== null) {
    structuredData.offers = {
      "@type": "Offer",
      price,
      priceCurrency: "RUB",
      availability: seatsLeft === 0 ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      url: canonical,
    };
  }
  document.querySelector("#trip-jsonld").textContent = JSON.stringify(structuredData);
}

function showPrepayment(trip) {
  const node = document.querySelector(".trip-prepayment");
  const deadline = trip.prepaymentUntil ? new Date(trip.prepaymentUntil) : null;
  const deadlinePassed = deadline && !Number.isNaN(deadline.getTime()) && deadline < new Date();
  const enabled = trip.prepaymentEnabled === true && !deadlinePassed;
  node.hidden = !enabled;
  if (enabled) node.textContent = "Место фиксируется предоплатой 30%";
}

function renderTrip(trip) {
  updateSeo(trip);
  document.querySelector(".trip-hero-image").src = assetUrl(trip.image);
  document.querySelector(".trip-hero-image").alt = trip.cardTitle || trip.title;
  document.querySelector(".trip-country-label").textContent = trip.country;
  document.querySelector(".trip-page-title").textContent = titleWithLineBreak(trip.cardTitle || trip.title);
  document.querySelector(".trip-page-lead").textContent = trip.pageLead;
  document.querySelector(".trip-page-dates").textContent = formatDates(trip);
  document.querySelector(".trip-page-price").textContent = [trip.priceLabel || "По запросу", trip.approxEuroPrice || ""].filter(Boolean).join(" · ");
  document.querySelector(".trip-page-seats").textContent = availabilityLabel(trip);

  const duration = String(trip.durationLabel || "").trim();
  const durationFact = document.querySelector('[data-trip-fact="duration"]');
  durationFact.hidden = !duration;
  if (duration) durationFact.querySelector("strong").textContent = duration;

  document.querySelectorAll('[data-page-field="routeText"]').forEach((node) => { node.textContent = trip.routeText; });
  document.querySelectorAll('[data-page-field="accommodationText"]').forEach((node) => { node.textContent = trip.accommodationText; });
  document.querySelectorAll('[data-page-field="importantText"]').forEach((node) => { node.textContent = trip.importantText; });
  fillList("includedText", trip.includedText);
  fillList("excludedText", trip.excludedText);
  fillGallery(trip);
  fillRoomTour(trip);
  showPrepayment(trip);

  document.querySelectorAll('a[href*="t.me"]').forEach((link) => { link.href = telegramUrl; });
  document.querySelectorAll(".trip-lead-button").forEach((button) => {
    button.addEventListener("click", () => window.MaevaLeadForm.open(trip));
  });
  document.querySelector("#trip-content").hidden = false;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const preview = params.get("preview") === "1";
  if (!id) return showNotFound();

  try {
    const [settingsResponse, tripResponse] = await Promise.all([
      fetch("/api/site-settings", { cache: "no-store" }),
      fetch(`${preview ? "/api/admin/trips/" : "/api/trips/"}${encodeURIComponent(id)}`, { cache: "no-store" }),
    ]);
    if (settingsResponse.ok && (await settingsResponse.json()).placeholderEnabled && !preview) {
      window.location.replace("/");
      return;
    }
    if (!tripResponse.ok) return showNotFound();
    renderTrip((await tripResponse.json()).trip);
  } catch (error) {
    console.error("Could not load trip:", error);
    showNotFound();
  } finally {
    document.body.classList.remove("is-loading");
  }
}

function showNotFound() {
  document.querySelector("#trip-not-found").hidden = false;
}

init();
