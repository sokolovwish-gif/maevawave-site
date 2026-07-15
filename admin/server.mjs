import { createServer } from "node:http";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const SHEET_ID = process.env.GOOGLE_SHEET_ID || "15d9vQdv7AmafsoLuZsSPs0up9uXP_lR1SS7I-YQU5ig";
const SHEET_GID = process.env.GOOGLE_SHEET_GID || "0";
const DATA_FILE = process.env.DATA_FILE || "/data/site-overrides.json";
const SETTINGS_FILE = process.env.SETTINGS_FILE || "/data/site-settings.json";
const LEADS_FILE = process.env.LEADS_FILE || join(dirname(DATA_FILE), "site-leads.jsonl");
const LEAD_RELAY_URL = process.env.SITE_LEAD_RELAY_URL || "";
const LEAD_RELAY_SECRET = process.env.SITE_LEAD_RELAY_SECRET || "";
const CACHE_TTL_MS = 30_000;
const UPLOAD_DIR = join(dirname(DATA_FILE), "uploads");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const ALLOWED_IMAGES = new Set([
  "",
  "images/turkey-bay.jpg",
  "images/flamingo-sea.jpg",
  "images/hammock-sea.jpg",
  "images/hammock-sea.webp",
  "images/thailand-aerial.jpg",
  "images/hero-deck.jpg",
  "images/hero-deck.webp",
  "images/turkey-poster.jpg",
  "images/turkey-poster.webp",
]);
const GALLERY_DEFAULTS = {
  turkey: ["images/turkey-bay.jpg", "images/turkey-poster.webp", "images/hero-deck.webp", "images/hammock-sea.webp"],
  thailand: ["images/thailand-aerial.jpg", "images/flamingo-sea.jpg", "images/hammock-sea.webp", "images/hero-deck.webp"],
  default: ["images/hero-deck.webp", "images/flamingo-sea.jpg", "images/hammock-sea.webp"],
};
const PAGE_DEFAULTS = {
  pageLead: "Неделя под парусом, новые бухты каждый день и камерная компания. Можно приехать без опыта яхтинга.",
  routeText: "Точный маршрут зависит от погоды и состояния моря. Перед поездкой мы расскажем о точках старта и финиша, бухтах и остановках.",
  accommodationText: "Живём на современной парусной яхте. Размещение — в двухместных каютах, общие зоны и кухня находятся на борту.",
  includedText: "Место в каюте\nАренда яхты\nРабота капитана\nМаршрут и организация путешествия\nОбучение основам яхтинга",
  excludedText: "Перелёт до места старта\nТрансфер до марины\nСудовая касса и питание\nСтраховка и личные расходы",
  importantText: "После заявки мы свяжемся, расскажем детали и ответим на вопросы.\nМесто фиксируется после согласования условий и предоплаты.",
};
const LEAD_FIELD_DEFAULTS = {
  people_count: { enabled: true, label: "Сколько вас будет?" },
  is_adult: { enabled: true, label: "Вам уже исполнилось 18 лет?" },
  cabin_fit: { enabled: true, label: "Готовы жить в двухместной каюте?" },
  budget: { enabled: true, label: "Какой бюджет на путешествие вам комфортен?" },
  prepayment_ready: { enabled: true, label: "Готовы внести предоплату после согласования деталей?" },
  main_interest: { enabled: true, label: "Что для вас важнее всего в этой поездке?" },
  comment: { enabled: true, label: "Что ещё нам важно знать?", hint: "Необязательно" },
  name: { enabled: true, label: "Как вас зовут?", hint: "Можно только имя" },
  phone: { enabled: true, label: "Номер телефона", hint: "Например, +7 999 123-45-67" },
  telegram: { enabled: true, label: "Ник в Telegram", hint: "username" },
  discover_source: { enabled: true, label: "Откуда вы о нас узнали?" },
};
const LEAD_FORM_DEFAULTS = {
  enabled: true,
  title: "Заявка на экспедицию",
  intro: "Ответьте на несколько коротких вопросов. Это займёт около двух минут.",
  submitLabel: "Отправить анкету",
  successTitle: "Анкета отправлена",
  successText: "Мы посмотрим ответы и свяжемся с вами.",
  telegramUrl: "https://t.me/captainmaeva",
  fields: LEAD_FIELD_DEFAULTS,
};
const LEAD_ENUMS = {
  people_count: new Set(["1", "2", "3_plus"]),
  is_adult: new Set(["yes", "no"]),
  cabin_fit: new Set(["yes", "single_if_possible", "no"]),
  budget: new Set(["under_1000", "1000_2000", "2000_3000", "3000_plus", "not_sure"]),
  prepayment_ready: new Set(["ready_now", "need_details", "just_looking"]),
  main_interest: new Set(["sea", "company", "sailing", "rest", "masha"]),
  discover_source: new Set(["instagram", "telegram", "friends", "search", "repeat", "other"]),
};
const LEAD_LABELS = {
  people_count: { "1": "1 человек", "2": "2 человека", "3_plus": "3 и более" },
  is_adult: { yes: "Да", no: "Нет" },
  cabin_fit: { yes: "Да", single_if_possible: "Нет, хочу жить один (доп. оплата)", no: "Нет, хочу жить один (доп. оплата)" },
  budget: {
    under_1000: "До 100 000 ₽",
    "1000_2000": "100 000–200 000 ₽",
    "2000_3000": "200 000–300 000 ₽",
    "3000_plus": "От 300 000 ₽",
    not_sure: "Пока не уверен(а)",
  },
  prepayment_ready: {
    ready_now: "Да, готов(а)",
    need_details: "После уточнения деталей",
    just_looking: "Пока присматриваюсь",
  },
  main_interest: {
    sea: "Море и красивые места",
    company: "Новые знакомства",
    sailing: "Яхтинг и паруса",
    rest: "Перезагрузка и отдых",
    masha: "Поехать именно с Машей",
  },
  discover_source: {
    instagram: "Instagram",
    telegram: "Telegram",
    friends: "От друзей",
    search: "Поиск",
    repeat: "Уже путешествовал(а) с нами",
    other: "Другое",
  },
};

let sheetCache = { fetchedAt: 0, trips: [] };
let overridesCache = null;
let settingsCache = null;
let writeQueue = Promise.resolve();
const leadRateLimit = new Map();

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function rawCell(cell) {
  if (!cell) return "";
  return cell.v ?? cell.f ?? "";
}

function isYes(value) {
  return ["ДА", "TRUE", "1", "YES"].includes(String(value).trim().toUpperCase());
}

function parseDate(value) {
  if (!value) return null;
  const gviz = /^Date\((\d+),(\d+),(\d+)\)$/.exec(String(value));
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value));
  const date = gviz
    ? new Date(Date.UTC(Number(gviz[1]), Number(gviz[2]), Number(gviz[3])))
    : ru
      ? new Date(Date.UTC(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1])))
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseMoney(value) {
  if (typeof value === "number") return value;
  const digits = String(value || "").replace(/[^\d.,-]/g, "").replace(",", ".");
  return digits ? Number(digits) : null;
}

function parseGviz(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Google Sheets returned an unexpected response");

  const payload = JSON.parse(text.slice(start, end + 1));
  if (payload.status !== "ok") throw new Error("Google Sheets query failed");

  const columns = new Map(payload.table.cols.map((column, index) => [String(column.label).trim(), index]));
  const get = (row, name) => rawCell(row.c[columns.get(name)]);

  return payload.table.rows
    .map((row) => ({
      id: String(get(row, "ID")).trim(),
      botVisible: isYes(get(row, "Показывать в боте")),
      country: String(get(row, "Страна")).trim(),
      title: String(get(row, "Название для клиента")).trim(),
      startDate: parseDate(get(row, "Дата начала")),
      endDate: parseDate(get(row, "Дата окончания")),
      priceRub: parseMoney(get(row, "Цена, ₽")),
      receiptName: String(get(row, "Название услуги в чеке")).trim(),
      prepaymentEnabled: isYes(get(row, "Возможность предоплаты")),
      prepaymentUntil: parseDate(get(row, "Предоплата возможна до")),
    }))
    .filter((trip) => trip.id)
    .sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0));
}

async function fetchSheetTrips({ force = false } = {}) {
  if (!force && sheetCache.trips.length && Date.now() - sheetCache.fetchedAt < CACHE_TTL_MS) {
    return sheetCache.trips;
  }

  const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
  url.searchParams.set("tqx", "out:json");
  url.searchParams.set("gid", SHEET_GID);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}`);

  const trips = parseGviz(await response.text());
  sheetCache = { fetchedAt: Date.now(), trips };
  return trips;
}

async function loadOverrides() {
  if (overridesCache) return overridesCache;
  try {
    const parsed = JSON.parse(await readFile(DATA_FILE, "utf8"));
    overridesCache = parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    overridesCache = {};
  }
  return overridesCache;
}

async function persistOverrides(next) {
  overridesCache = next;
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(DATA_FILE), { recursive: true });
    const temporary = `${DATA_FILE}.tmp`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, DATA_FILE);
  });
  return writeQueue;
}

async function loadSettings() {
  if (settingsCache) return settingsCache;
  try {
    const parsed = JSON.parse(await readFile(SETTINGS_FILE, "utf8"));
    settingsCache = {
      placeholderEnabled: Boolean(parsed?.placeholderEnabled),
      leadForm: normalizeLeadForm(parsed?.leadForm),
      updatedAt: parsed?.updatedAt || null,
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    settingsCache = { placeholderEnabled: false, leadForm: normalizeLeadForm(), updatedAt: null };
  }
  return settingsCache;
}

async function persistSettings(input) {
  const current = await loadSettings();
  const next = {
    placeholderEnabled: Boolean(input.placeholderEnabled),
    leadForm: normalizeLeadForm(input.leadForm || current.leadForm),
    updatedAt: new Date().toISOString(),
  };
  settingsCache = next;
  await mkdir(dirname(SETTINGS_FILE), { recursive: true });
  const temporary = `${SETTINGS_FILE}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, SETTINGS_FILE);
  return next;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeLeadForm(input = {}) {
  const textOrDefault = (value, fallback, maxLength) => typeof value === "string"
    ? cleanText(value, maxLength)
    : cleanText(fallback, maxLength);
  const legacySuccessText = "Мы посмотрим ответы и свяжемся с вами в Telegram.";
  const legacyFieldLabels = new Map([
    ["Подойдёт размещение в двухместной каюте?", LEAD_FIELD_DEFAULTS.cabin_fit.label],
  ]);
  const legacyFieldHints = new Map();
  return {
    enabled: input.enabled !== false,
    title: cleanText(input.title || LEAD_FORM_DEFAULTS.title, 90),
    intro: cleanText(input.intro || LEAD_FORM_DEFAULTS.intro, 240),
    submitLabel: cleanText(input.submitLabel || LEAD_FORM_DEFAULTS.submitLabel, 50),
    successTitle: cleanText(input.successTitle || LEAD_FORM_DEFAULTS.successTitle, 90),
    successText: cleanText(
      !input.successText
        || input.successText === legacySuccessText
        || input.successText === "Мы посмотрим ответы и свяжемся с вами по телефону."
        ? LEAD_FORM_DEFAULTS.successText
        : input.successText,
      240,
    ),
    telegramUrl: /^https:\/\/t\.me\/[A-Za-z0-9_?=&-]+$/.test(String(input.telegramUrl || ""))
      ? String(input.telegramUrl)
      : LEAD_FORM_DEFAULTS.telegramUrl,
    fields: Object.fromEntries(Object.entries(LEAD_FIELD_DEFAULTS).map(([name, defaults]) => {
      const field = input.fields?.[name] || {};
      const label = legacyFieldLabels.get(field.label) || field.label;
      const hint = legacyFieldHints.get(field.hint) || field.hint;
      return [name, {
        enabled: ["name", "phone"].includes(name) ? true : field.enabled !== false,
        label: textOrDefault(label, defaults.label, 140),
        hint: textOrDefault(hint, defaults.hint || "", 160),
      }];
    })),
  };
}

function normalizePhone(value) {
  const raw = cleanText(value, 40);
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length < 10 || digits.length > 15) return "";
  return `+${digits}`;
}

function enumValue(body, name, required = true) {
  const value = cleanText(body[name], 40);
  if (!value && !required) return "";
  if (!LEAD_ENUMS[name].has(value)) throw new Error(`Invalid ${name}`);
  return value;
}

function qualifyLead(lead) {
  let score = 2;
  const flags = [];
  if (lead.is_adult === "no") return { status: "needs_review", score: 0, flags: ["minor"] };
  if (lead.cabin_fit === "no") {
    flags.push("single_cabin_requested");
  }
  if (lead.budget === "under_1000") {
    score -= 2;
    flags.push("budget_under_1000");
  } else if (lead.budget === "2000_3000") score += 1;
  else if (lead.budget === "3000_plus") score += 2;
  if (lead.prepayment_ready === "ready_now") score += 2;
  if (lead.prepayment_ready === "just_looking") score -= 1;
  if (lead.main_interest.includes("masha")) {
    score += 1;
    flags.push("priority_boost");
  }
  return { status: score >= 5 ? "hot" : score >= 2 ? "warm" : "cold", score, flags };
}

function normalizeTelegram(value) {
  const username = cleanText(value, 100).replace(/^@+/, "").replace(/[^A-Za-z0-9_]/g, "");
  return username ? `@${username}` : "";
}

function normalizeLead(body, trip) {
  const settings = settingsCache?.leadForm || LEAD_FORM_DEFAULTS;
  const enabled = (name) => settings.fields?.[name]?.enabled !== false;
  const phone = normalizePhone(body.phone);
  if (!phone) throw new Error("Invalid phone");
  const name = cleanText(body.name, 100);
  if (!name) throw new Error("Invalid name");
  if (body.website) throw new Error("Spam rejected");
  if (body.personal_data_consent !== true) throw new Error("Consent required");

  const lead = {
    id: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(body.submission_id || ""))
      ? String(body.submission_id)
      : randomUUID(),
    createdAt: new Date().toISOString(),
    source: "maevawave.ru",
    tour_id: trip.id,
    tour_title: trip.cardTitle,
    tour_country: trip.country,
    tour_start_date: trip.startDate,
    tour_end_date: trip.endDate,
    tour_dates: `${trip.startDate} — ${trip.endDate}`,
    tour_price: trip.priceLabel,
    name,
    phone,
    people_count: enabled("people_count") ? enumValue(body, "people_count") : "",
    is_adult: enabled("is_adult") ? enumValue(body, "is_adult") : "yes",
    cabin_fit: enabled("cabin_fit") ? enumValue(body, "cabin_fit") : "yes",
    budget: enabled("budget") ? enumValue(body, "budget") : "not_sure",
    prepayment_ready: enabled("prepayment_ready") ? enumValue(body, "prepayment_ready") : "need_details",
    main_interest: enabled("main_interest")
      ? [...new Set(Array.isArray(body.main_interest) ? body.main_interest : [])].filter((value) => LEAD_ENUMS.main_interest.has(value)).slice(0, 6)
      : [],
    comment: enabled("comment") ? cleanText(body.comment, 1000) : "",
    telegram: enabled("telegram") ? normalizeTelegram(body.telegram) : "",
    discover_source: enabled("discover_source") ? enumValue(body, "discover_source") : "",
    personal_data_consent: true,
    consentVersion: "2026-06-15",
  };
  if (enabled("main_interest") && !lead.main_interest.length) throw new Error("Choose at least one interest");
  lead.qualification = qualifyLead(lead);
  lead.labels = {
    people_count: LEAD_LABELS.people_count[lead.people_count] || "",
    is_adult: LEAD_LABELS.is_adult[lead.is_adult] || "",
    cabin_fit: LEAD_LABELS.cabin_fit[lead.cabin_fit] || "",
    budget: LEAD_LABELS.budget[lead.budget] || "",
    prepayment_ready: LEAD_LABELS.prepayment_ready[lead.prepayment_ready] || "",
    main_interest: lead.main_interest.map((value) => LEAD_LABELS.main_interest[value]).join(", "),
    discover_source: LEAD_LABELS.discover_source[lead.discover_source] || "",
  };
  return lead;
}

function leadLine(label, value) {
  return value ? `${label}: ${value}` : "";
}

function leadStatusLabel(status) {
  return {
    new: "Новая",
    hot: "Горячая",
    warm: "Тёплая",
    cold: "Холодная",
    needs_review: "Нужна проверка",
    low_priority: "Низкий приоритет",
  }[status] || "Новая";
}

function leadShortId(id) {
  const compact = String(id || "").replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
  return compact ? `MW-${compact}` : "MW";
}

function leadTripDates(lead) {
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  const parse = (value) => {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
  };
  const start = parse(lead.tour_start_date);
  const end = parse(lead.tour_end_date);
  if (!start || !end) return lead.tour_dates;
  if (start.year === end.year && start.month === end.month) {
    return `${start.day}–${end.day} ${months[end.month - 1]} ${end.year}`;
  }
  if (start.year === end.year) {
    return `${start.day} ${months[start.month - 1]} – ${end.day} ${months[end.month - 1]} ${end.year}`;
  }
  return `${start.day} ${months[start.month - 1]} ${start.year} – ${end.day} ${months[end.month - 1]} ${end.year}`;
}

function formatLeadMessage(lead) {
  const values = [
    `Новая заявка с maevawave.ru`,
    `Статус: ${leadStatusLabel(lead.qualification.status)}${lead.qualification.flags.includes("priority_boost") ? " · Хочет к Маше" : ""}`,
    leadLine("Заявка", leadShortId(lead.id)),
    leadLine("Поездка", lead.tour_title),
    leadLine("Даты", leadTripDates(lead)),
    leadLine("Имя", lead.name),
    leadLine("Телефон", lead.phone),
    leadLine("Telegram", lead.telegram),
    leadLine("Людей", LEAD_LABELS.people_count[lead.people_count]),
    leadLine("18+", LEAD_LABELS.is_adult[lead.is_adult]),
    leadLine("Каюта", LEAD_LABELS.cabin_fit[lead.cabin_fit]),
    leadLine("Бюджет", LEAD_LABELS.budget[lead.budget]),
    leadLine("Предоплата", LEAD_LABELS.prepayment_ready[lead.prepayment_ready]),
    leadLine("Интерес", lead.main_interest.map((value) => LEAD_LABELS.main_interest[value]).join(", ")),
    leadLine("Откуда узнали", LEAD_LABELS.discover_source[lead.discover_source]),
    leadLine("Комментарий", lead.comment),
  ];
  return values.filter(Boolean).join("\n");
}

async function persistLead(lead) {
  await mkdir(dirname(LEADS_FILE), { recursive: true });
  await appendFile(LEADS_FILE, `${JSON.stringify(lead)}\n`, { mode: 0o600 });
}

async function relayLead(lead) {
  if (!LEAD_RELAY_URL) {
    console.log("Website lead saved without relay", formatLeadMessage(lead));
    return { localOnly: true };
  }
  const result = await fetch(LEAD_RELAY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": LEAD_RELAY_SECRET,
    },
    body: JSON.stringify(lead),
    signal: AbortSignal.timeout(10_000),
  });
  if (!result.ok) {
    const details = (await result.text()).slice(0, 200);
    console.error("Website lead relay failed", {
      leadId: lead.id,
      status: result.status,
      details,
    });
    throw new Error(`Lead storage returned ${result.status}`);
  }
  return result.json();
}

async function relayRequest(path, options = {}) {
  if (!LEAD_RELAY_URL) return null;
  const result = await fetch(`${LEAD_RELAY_URL}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), "x-internal-secret": LEAD_RELAY_SECRET },
    signal: AbortSignal.timeout(10_000),
  });
  if (!result.ok) throw new Error(`Lead relay returned ${result.status}`);
  return result.json();
}

function rateLimitLead(request) {
  const ip = String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now();
  const recent = (leadRateLimit.get(ip) || []).filter((time) => now - time < 15 * 60_000);
  if (recent.length >= 5) return false;
  recent.push(now);
  leadRateLimit.set(ip, recent);
  return true;
}

function normalizeOverride(input) {
  const visibility = ["inherit", "show", "hide"].includes(input.visibility) ? input.visibility : "inherit";
  const order = Number.isFinite(Number(input.order)) ? Math.max(-9999, Math.min(9999, Number(input.order))) : 100;
  const requestedImage = String(input.image || "");
  const image = ALLOWED_IMAGES.has(requestedImage) || /^api\/media\/[a-f0-9-]+\.(?:jpg|png|webp)$/.test(requestedImage)
    ? requestedImage
    : "";
  const gallery = Array.isArray(input.gallery)
    ? [...new Set(input.gallery)]
      .filter((item) => ALLOWED_IMAGES.has(item) && item)
      .slice(0, 6)
    : [];

  return {
    visibility,
    order,
    featured: Boolean(input.featured),
    cardTitle: String(input.cardTitle || "").trim().slice(0, 100),
    description: String(input.description || "").trim().slice(0, 180),
    badge: String(input.badge || "").trim().slice(0, 40),
    priceLabel: String(input.priceLabel || "").trim().slice(0, 50),
    image,
    gallery,
    pageLead: String(input.pageLead || "").trim().slice(0, 600),
    routeText: String(input.routeText || "").trim().slice(0, 1500),
    accommodationText: String(input.accommodationText || "").trim().slice(0, 1500),
    includedText: String(input.includedText || "").trim().slice(0, 2000),
    excludedText: String(input.excludedText || "").trim().slice(0, 2000),
    importantText: String(input.importantText || "").trim().slice(0, 1500),
    updatedAt: new Date().toISOString(),
  };
}

function defaultImage(country) {
  if (/тай/i.test(country)) return "images/thailand-aerial.jpg";
  if (/турц/i.test(country)) return "images/turkey-bay.jpg";
  return "images/hero-deck.webp";
}

function defaultGallery(country) {
  if (/тай/i.test(country)) return GALLERY_DEFAULTS.thailand;
  if (/турц/i.test(country)) return GALLERY_DEFAULTS.turkey;
  return GALLERY_DEFAULTS.default;
}

function countryCase(country) {
  return { Турция: "Турции", Тайланд: "Таиланде", Таиланд: "Таиланде" }[country] || country;
}

function mergeTrip(trip, override = {}, index = 0) {
  const displayCountry = trip.country.replace(/Тайланд/g, "Таиланд");
  const displayTitle = trip.title.replace(/Тайланд/g, "Таиланд");
  const sourceValid = Boolean(trip.title && trip.country && trip.startDate && trip.endDate);
  const payable = sourceValid && Number.isFinite(trip.priceRub) && trip.priceRub > 0 && Boolean(trip.receiptName);
  const defaultVisible = trip.botVisible && payable;
  const visible = override.visibility === "show"
    ? true
    : override.visibility === "hide"
      ? false
      : defaultVisible;

  return {
    ...trip,
    country: displayCountry,
    title: displayTitle,
    payable,
    sourceValid,
    defaultVisible,
    visible,
    visibility: override.visibility || "inherit",
    order: Number.isFinite(override.order) ? override.order : 100 + index,
    featured: Boolean(override.featured),
    cardTitle: (override.cardTitle || `Яхтенная неделя в ${countryCase(displayCountry)}`).replace(/Тайланд/g, "Таиланд"),
    description: override.description || "7 дней на парусной яхте в камерной компании",
    badge: override.badge || (payable ? "Доступно к оплате" : "Скоро"),
    priceLabel: override.priceLabel || (payable ? `${new Intl.NumberFormat("ru-RU").format(trip.priceRub)} ₽` : "По запросу"),
    image: override.image || defaultImage(trip.country),
    overrideImage: override.image || "",
    gallery: override.gallery?.length ? override.gallery : defaultGallery(displayCountry),
    overrideGallery: override.gallery || [],
    pageLead: override.pageLead || PAGE_DEFAULTS.pageLead,
    routeText: override.routeText || PAGE_DEFAULTS.routeText,
    accommodationText: override.accommodationText || PAGE_DEFAULTS.accommodationText,
    includedText: override.includedText || PAGE_DEFAULTS.includedText,
    excludedText: override.excludedText || PAGE_DEFAULTS.excludedText,
    importantText: override.importantText || PAGE_DEFAULTS.importantText,
    pageOverrides: {
      pageLead: Boolean(override.pageLead),
      routeText: Boolean(override.routeText),
      accommodationText: Boolean(override.accommodationText),
      includedText: Boolean(override.includedText),
      excludedText: Boolean(override.excludedText),
      importantText: Boolean(override.importantText),
      gallery: Boolean(override.gallery?.length),
    },
    pageUrl: `/trip.html?id=${encodeURIComponent(trip.id)}`,
    overrideUpdatedAt: override.updatedAt || null,
  };
}

async function mergedTrips({ force = false } = {}) {
  const [trips, overrides] = await Promise.all([fetchSheetTrips({ force }), loadOverrides()]);
  return trips
    .map((trip, index) => mergeTrip(trip, overrides[trip.id], index))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.order - b.order || new Date(a.startDate) - new Date(b.startDate));
}

async function requestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_000) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function requestBytes(request, limit = MAX_UPLOAD_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Uploaded image is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, { ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/trips") {
      const trips = (await mergedTrips()).filter((trip) => trip.visible);
      return json(response, 200, { trips, updatedAt: new Date().toISOString() });
    }

    const publicTripMatch = /^\/api\/trips\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && publicTripMatch) {
      const tripId = decodeURIComponent(publicTripMatch[1]);
      const trip = (await mergedTrips()).find((item) => item.id === tripId && item.visible);
      if (!trip) return json(response, 404, { error: "Trip not found" });
      return json(response, 200, { trip, updatedAt: new Date().toISOString() });
    }

    if (request.method === "GET" && url.pathname === "/api/site-settings") {
      return json(response, 200, await loadSettings());
    }

    if (request.method === "GET" && url.pathname === "/api/lead-form-settings") {
      return json(response, 200, (await loadSettings()).leadForm);
    }

    if (request.method === "POST" && url.pathname === "/api/leads") {
      const settings = await loadSettings();
      if (!settings.leadForm.enabled) return json(response, 503, { error: "Lead form is disabled" });
      const body = await requestBody(request);
      const trip = (await mergedTrips()).find((item) => item.id === cleanText(body.tour_id, 100) && item.visible);
      if (!trip) return json(response, 404, { error: "Trip not found" });
      try {
        const lead = normalizeLead(body, trip);
        if (!rateLimitLead(request)) return json(response, 429, { error: "Too many requests" });
        await persistLead(lead);
        await relayLead(lead);
        return json(response, 201, { ok: true, id: lead.id, qualification: lead.qualification.status });
      } catch (error) {
        const clientError = [
          "Invalid phone",
          "Invalid name",
          "Spam rejected",
          "Consent required",
          "Choose at least one interest",
        ].includes(error.message) || error.message.startsWith("Invalid ");
        return json(response, clientError ? 400 : 503, { error: error.message });
      }
    }

    const mediaMatch = /^\/api\/media\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && mediaMatch) {
      const fileName = basename(decodeURIComponent(mediaMatch[1]));
      const extension = extname(fileName).toLowerCase();
      const contentType = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extension];
      if (!contentType || !/^[a-f0-9-]+\.(?:jpg|png|webp)$/.test(fileName)) {
        return json(response, 404, { error: "Image not found" });
      }
      try {
        const body = await readFile(join(UPLOAD_DIR, fileName));
        response.writeHead(200, {
          "content-type": contentType,
          "content-length": body.length,
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        });
        return response.end(body);
      } catch (error) {
        if (error.code === "ENOENT") return json(response, 404, { error: "Image not found" });
        throw error;
      }
    }

    if (request.method === "GET" && url.pathname === "/api/admin/trips") {
      const force = url.searchParams.get("refresh") === "1";
      const trips = await mergedTrips({ force });
      return json(response, 200, {
        trips,
        summary: {
          total: trips.length,
          siteVisible: trips.filter((trip) => trip.visible).length,
          botVisible: trips.filter((trip) => trip.botVisible).length,
          payable: trips.filter((trip) => trip.payable).length,
        },
        sheetFetchedAt: sheetCache.fetchedAt ? new Date(sheetCache.fetchedAt).toISOString() : null,
      });
    }

    if (request.method === "GET" && url.pathname === "/api/admin/site-settings") {
      return json(response, 200, await loadSettings());
    }

    if (request.method === "GET" && url.pathname === "/api/admin/lead-form-settings") {
      return json(response, 200, (await loadSettings()).leadForm);
    }

    if (request.method === "GET" && url.pathname === "/api/admin/leads") {
      const data = await relayRequest(`?limit=${encodeURIComponent(url.searchParams.get("limit") || "100")}`);
      return json(response, 200, data || { leads: [] });
    }

    const adminLeadRetryMatch = /^\/api\/admin\/leads\/([0-9a-f-]+)\/retry$/.exec(url.pathname);
    if (request.method === "POST" && adminLeadRetryMatch) {
      if (request.headers["x-maeva-admin"] !== "1") {
        return json(response, 403, { error: "Missing admin request header" });
      }
      const data = await relayRequest(`/${adminLeadRetryMatch[1]}/retry`, { method: "POST" });
      return json(response, 200, data || { ok: false });
    }

    const adminTripMatch = /^\/api\/admin\/trips\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && adminTripMatch) {
      const tripId = decodeURIComponent(adminTripMatch[1]);
      const trip = (await mergedTrips()).find((item) => item.id === tripId);
      if (!trip) return json(response, 404, { error: "Trip not found" });
      return json(response, 200, { trip, updatedAt: new Date().toISOString() });
    }

    if (request.method === "PUT" && url.pathname === "/api/admin/site-settings") {
      if (request.headers["x-maeva-admin"] !== "1") {
        return json(response, 403, { error: "Missing admin request header" });
      }
      return json(response, 200, await persistSettings(await requestBody(request)));
    }

    if (request.method === "PUT" && url.pathname === "/api/admin/lead-form-settings") {
      if (request.headers["x-maeva-admin"] !== "1") {
        return json(response, 403, { error: "Missing admin request header" });
      }
      const current = await loadSettings();
      const next = await persistSettings({ ...current, leadForm: await requestBody(request) });
      return json(response, 200, next.leadForm);
    }

    if (request.method === "POST" && url.pathname === "/api/admin/uploads") {
      if (request.headers["x-maeva-admin"] !== "1") {
        return json(response, 403, { error: "Missing admin request header" });
      }
      const contentType = String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const extension = IMAGE_TYPES.get(contentType);
      if (!extension) return json(response, 415, { error: "Use JPG, PNG or WebP" });

      const body = await requestBytes(request);
      if (!body.length) return json(response, 400, { error: "Image is empty" });

      await mkdir(UPLOAD_DIR, { recursive: true });
      const fileName = `${randomUUID()}${extension}`;
      await writeFile(join(UPLOAD_DIR, fileName), body, { mode: 0o600 });
      return json(response, 201, { image: `api/media/${fileName}` });
    }

    const match = adminTripMatch;
    if (match && request.method === "PUT") {
      if (request.headers["x-maeva-admin"] !== "1") {
        return json(response, 403, { error: "Missing admin request header" });
      }
      const tripId = decodeURIComponent(match[1]);
      const trips = await fetchSheetTrips();
      if (!trips.some((trip) => trip.id === tripId)) return json(response, 404, { error: "Trip not found" });

      const body = await requestBody(request);
      const overrides = { ...(await loadOverrides()) };
      overrides[tripId] = normalizeOverride(body);
      await persistOverrides(overrides);
      const trip = (await mergedTrips()).find((item) => item.id === tripId);
      return json(response, 200, { trip });
    }

    if (match && request.method === "DELETE") {
      if (request.headers["x-maeva-admin"] !== "1") {
        return json(response, 403, { error: "Missing admin request header" });
      }
      const tripId = decodeURIComponent(match[1]);
      const overrides = { ...(await loadOverrides()) };
      delete overrides[tripId];
      await persistOverrides(overrides);
      const trip = (await mergedTrips()).find((item) => item.id === tripId);
      return json(response, 200, { trip });
    }

    return json(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MAEVAWAVE admin API listening on ${PORT}`);
});
