const state = {
  trips: [],
  filter: "all",
  query: "",
  editingTrip: null,
};

const pageFields = [
  "pageLead",
  "routeText",
  "accommodationText",
  "includedText",
  "excludedText",
  "importantText",
];

const list = document.querySelector("#trip-list");
const summary = document.querySelector("#summary");
const notice = document.querySelector("#notice");
const template = document.querySelector("#trip-template");
const refreshButton = document.querySelector("#refresh-button");
const placeholderToggle = document.querySelector("#placeholder-toggle");
const modeStatus = document.querySelector("#mode-status");
const titleDialog = document.querySelector("#title-dialog");
const imageDialog = document.querySelector("#image-dialog");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsForm = document.querySelector("#settings-form");
const leadFormSettingsButton = document.querySelector("#lead-form-settings-button");
const leadFormDialog = document.querySelector("#lead-form-dialog");
const leadFormSettingsForm = document.querySelector("#lead-form-settings-form");
const leadFieldsEditor = document.querySelector("#lead-fields-editor");
const leadFieldNames = [
  ["people_count", "Количество участников"],
  ["is_adult", "Возраст 18+"],
  ["cabin_fit", "Размещение в каюте"],
  ["budget", "Бюджет"],
  ["prepayment_ready", "Готовность к предоплате"],
  ["main_interest", "Главный интерес"],
  ["comment", "Комментарий"],
  ["name", "Имя"],
  ["phone", "Телефон"],
  ["telegram", "Telegram"],
  ["discover_source", "Откуда узнали"],
];
const leadsButton = document.querySelector("#leads-button");
const leadsDialog = document.querySelector("#leads-dialog");
const leadsList = document.querySelector("#leads-list");

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatDates(trip) {
  return `${formatDate(trip.startDate)} — ${formatDate(trip.endDate)}`;
}

function formatMoney(value) {
  return Number.isFinite(value) ? `${new Intl.NumberFormat("ru-RU").format(value)} ₽` : "Не задана";
}

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle("error", isError);
  notice.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => { notice.hidden = true; }, 3500);
}

function badgesFor(trip) {
  const badges = [];
  if (trip.visible) badges.push('<span class="badge published">На сайте</span>');
  badges.push(`<span class="badge ${trip.botVisible ? "" : "off"}">${trip.botVisible ? "Активна в таблице" : "Неактивна в таблице"}</span>`);
  badges.push(`<span class="badge ${trip.payable ? "" : "warn"}">${trip.payable ? "Можно оплатить" : "Без оплаты"}</span>`);
  if (trip.featured) badges.push('<span class="badge override">Важная</span>');
  return badges.join("");
}

function matchesFilter(trip) {
  if (state.filter === "site") return trip.visible;
  if (state.filter === "hidden") return !trip.visible;
  if (state.filter === "payable") return trip.payable;
  if (state.filter === "future") return new Date(trip.startDate) > new Date();
  return true;
}

function payloadFor(trip, patch = {}) {
  const pagePayload = Object.fromEntries(
    pageFields.map((field) => [field, trip.pageOverrides?.[field] ? trip[field] : ""]),
  );
  return {
    visibility: trip.visibility,
    order: trip.order,
    featured: trip.featured,
    cardTitle: trip.cardTitle,
    description: trip.description,
    badge: trip.badge,
    priceLabel: trip.priceLabel,
    image: trip.overrideImage || "",
    gallery: trip.overrideGallery || [],
    ...pagePayload,
    ...patch,
  };
}

async function updateTrip(trip, patch, successMessage) {
  const response = await fetch(`/api/admin/trips/${encodeURIComponent(trip.id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-maeva-admin": "1" },
    body: JSON.stringify(payloadFor(trip, patch)),
  });
  if (!response.ok) throw new Error("Не удалось сохранить изменение");
  const data = await response.json();
  const index = state.trips.findIndex((item) => item.id === trip.id);
  if (index >= 0) state.trips[index] = data.trip;
  state.editingTrip = data.trip;
  render();
  if (successMessage) showNotice(successMessage);
  return data.trip;
}

function setQuickControlBusy(card, busy) {
  card.classList.toggle("saving", busy);
  card.querySelectorAll(".quick-controls input, .quick-controls button, .quick-title, .quick-image")
    .forEach((control) => { control.disabled = busy; });
}

function ensureImageOption(select, image) {
  if (image && !select.querySelector(`option[value="${CSS.escape(image)}"]`)) {
    select.add(new Option("Загруженная фотография", image));
  }
}

function openTitleDialog(trip) {
  state.editingTrip = trip;
  titleDialog.querySelector('[name="title"]').value = trip.cardTitle;
  titleDialog.showModal();
}

function openImageDialog(trip) {
  state.editingTrip = trip;
  const select = imageDialog.querySelector('[name="image"]');
  ensureImageOption(select, trip.overrideImage);
  select.value = trip.overrideImage || "";
  imageDialog.querySelector('[name="imageFile"]').value = "";
  imageDialog.showModal();
}

function openSettingsDialog(trip) {
  state.editingTrip = trip;
  document.querySelector("#settings-title").textContent = trip.cardTitle;
  document.querySelector("#settings-subtitle").textContent = `${formatDates(trip)} · ${trip.id}`;
  settingsDialog.querySelector(".settings-preview").href = `${trip.pageUrl}&preview=1`;

  settingsForm.elements.cardTitle.value = trip.cardTitle;
  settingsForm.elements.description.value = trip.description;
  settingsForm.elements.badge.value = trip.badge;
  settingsForm.elements.priceLabel.value = trip.priceLabel;
  settingsForm.elements.order.value = trip.order;
  settingsForm.elements.featured.checked = trip.featured;

  ensureImageOption(settingsForm.elements.image, trip.overrideImage);
  settingsForm.elements.image.value = trip.overrideImage || "";
  settingsForm.elements.imageFile.value = "";
  settingsForm.querySelectorAll('[name="gallery"]').forEach((input) => {
    input.checked = (trip.overrideGallery || []).includes(input.value);
  });

  pageFields.forEach((field) => {
    const inherited = !trip.pageOverrides?.[field];
    const input = settingsForm.elements[field];
    input.value = inherited ? "" : trip[field];
    input.placeholder = inherited ? trip[field] : "";
    const hint = settingsForm.querySelector(`[data-inherit="${field}"]`);
    hint.textContent = inherited ? "Сейчас используется общий текст. Начни вводить, чтобы изменить только эту поездку." : "Индивидуальный текст для этой поездки.";
    hint.classList.toggle("is-inherited", inherited);
  });

  settingsDialog.showModal();
}

function render() {
  const query = state.query.trim().toLowerCase();
  const trips = state.trips.filter((trip) => {
    const haystack = `${trip.id} ${trip.country} ${trip.title} ${trip.cardTitle} ${formatDates(trip)}`.toLowerCase();
    return matchesFilter(trip) && (!query || haystack.includes(query));
  });

  list.replaceChildren();
  if (!trips.length) {
    list.innerHTML = '<div class="empty">По этому фильтру поездок нет.</div>';
    return;
  }

  trips.forEach((trip) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".admin-card");
    const manualMode = fragment.querySelector('[name="manualMode"]');
    const siteVisible = fragment.querySelector('[name="siteVisible"]');
    const visibilityState = fragment.querySelector(".visibility-state");
    const preview = fragment.querySelector(".page-preview");

    card.dataset.id = trip.id;
    card.classList.toggle("is-visible", trip.visible);
    card.classList.toggle("is-hidden", !trip.visible);
    fragment.querySelector(".card-image img").src = `/${trip.image}`;
    fragment.querySelector(".card-image img").alt = trip.cardTitle;
    fragment.querySelector(".badges").innerHTML = badgesFor(trip);
    fragment.querySelector(".trip-dates").textContent = formatDates(trip);
    fragment.querySelector("h2").textContent = trip.cardTitle;
    fragment.querySelector(".source-title").textContent = trip.title;
    fragment.querySelector('[data-field="id"]').textContent = trip.id;
    fragment.querySelector('[data-field="source-price"]').textContent = formatMoney(trip.priceRub);
    preview.href = `${trip.pageUrl}&preview=1`;

    manualMode.checked = trip.visibility !== "inherit";
    siteVisible.checked = trip.visible;
    siteVisible.disabled = !manualMode.checked;
    visibilityState.textContent = manualMode.checked
      ? (trip.visible ? "Включена вручную" : "Выключена вручную")
      : `Авто: ${trip.visible ? "показывается" : "скрыта"}`;

    fragment.querySelector(".quick-title").addEventListener("click", () => openTitleDialog(trip));
    fragment.querySelector(".quick-image").addEventListener("click", () => openImageDialog(trip));
    fragment.querySelector(".settings-button").addEventListener("click", () => openSettingsDialog(trip));

    manualMode.addEventListener("change", async () => {
      setQuickControlBusy(card, true);
      try {
        const visibility = manualMode.checked ? (trip.visible ? "show" : "hide") : "inherit";
        await updateTrip(trip, { visibility }, manualMode.checked ? "Ручной режим включён." : "Поездка снова следует таблице.");
      } catch (error) {
        showNotice(error.message, true);
        render();
      }
    });

    siteVisible.addEventListener("change", async () => {
      setQuickControlBusy(card, true);
      try {
        await updateTrip(trip, { visibility: siteVisible.checked ? "show" : "hide" }, siteVisible.checked ? "Поездка включена на сайте." : "Поездка скрыта с сайта.");
      } catch (error) {
        showNotice(error.message, true);
        render();
      }
    });

    list.append(fragment);
  });
}

async function uploadImage(file, button) {
  if (!file) throw new Error("Сначала выбери фотографию.");
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Загружаю…";
  try {
    const response = await fetch("/api/admin/uploads", {
      method: "POST",
      headers: { "content-type": file.type, "x-maeva-admin": "1" },
      body: file,
    });
    if (!response.ok) throw new Error("Не удалось загрузить фотографию");
    return (await response.json()).image;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

titleDialog.addEventListener("close", async () => {
  if (titleDialog.returnValue !== "save" || !state.editingTrip) return;
  const title = titleDialog.querySelector('[name="title"]').value.trim();
  if (!title) return showNotice("Заголовок не может быть пустым.", true);
  try {
    await updateTrip(state.editingTrip, { cardTitle: title }, "Заголовок изменён.");
  } catch (error) {
    showNotice(error.message, true);
  }
});

imageDialog.querySelector(".upload").addEventListener("click", async (event) => {
  event.preventDefault();
  try {
    const image = await uploadImage(
      imageDialog.querySelector('[name="imageFile"]').files[0],
      imageDialog.querySelector(".upload"),
    );
    const select = imageDialog.querySelector('[name="image"]');
    ensureImageOption(select, image);
    select.value = image;
    showNotice("Фотография загружена. Нажми «Применить».");
  } catch (error) {
    showNotice(error.message, true);
  }
});

imageDialog.addEventListener("close", async () => {
  if (imageDialog.returnValue !== "save" || !state.editingTrip) return;
  try {
    const image = imageDialog.querySelector('[name="image"]').value;
    await updateTrip(state.editingTrip, { image }, image ? "Фотография изменена." : "Вернул автоматическую фотографию.");
  } catch (error) {
    showNotice(error.message, true);
  }
});

settingsForm.querySelector(".settings-upload-button").addEventListener("click", async () => {
  try {
    const image = await uploadImage(
      settingsForm.elements.imageFile.files[0],
      settingsForm.querySelector(".settings-upload-button"),
    );
    ensureImageOption(settingsForm.elements.image, image);
    settingsForm.elements.image.value = image;
    showNotice("Фотография загружена и выбрана.");
  } catch (error) {
    showNotice(error.message, true);
  }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.editingTrip) return;
  const saveButton = settingsForm.querySelector(".settings-save");
  saveButton.disabled = true;
  saveButton.textContent = "Сохраняю…";
  try {
    const patch = {
      cardTitle: settingsForm.elements.cardTitle.value,
      description: settingsForm.elements.description.value,
      badge: settingsForm.elements.badge.value,
      priceLabel: settingsForm.elements.priceLabel.value,
      order: Number(settingsForm.elements.order.value),
      featured: settingsForm.elements.featured.checked,
      image: settingsForm.elements.image.value,
      gallery: [...settingsForm.querySelectorAll('[name="gallery"]:checked')].map((input) => input.value),
      ...Object.fromEntries(pageFields.map((field) => [field, settingsForm.elements[field].value])),
    };
    await updateTrip(state.editingTrip, patch, "Настройки поездки сохранены.");
    settingsDialog.close();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Сохранить";
  }
});

settingsForm.querySelector(".settings-reset").addEventListener("click", async () => {
  if (!state.editingTrip || !confirm(`Сбросить все настройки сайта для ${state.editingTrip.id}?`)) return;
  try {
    const response = await fetch(`/api/admin/trips/${encodeURIComponent(state.editingTrip.id)}`, {
      method: "DELETE",
      headers: { "x-maeva-admin": "1" },
    });
    if (!response.ok) throw new Error("Не удалось сбросить настройки");
    settingsDialog.close();
    showNotice(`Поездка ${state.editingTrip.id} снова использует данные таблицы и общие тексты.`);
    await loadTrips();
  } catch (error) {
    showNotice(error.message, true);
  }
});

settingsForm.querySelector(".settings-close").addEventListener("click", () => settingsDialog.close());
settingsForm.querySelector(".settings-cancel").addEventListener("click", () => settingsDialog.close());

async function loadTrips(force = false) {
  refreshButton.disabled = true;
  try {
    const response = await fetch(`/api/admin/trips${force ? "?refresh=1" : ""}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить каталог");
    const data = await response.json();
    state.trips = data.trips;
    const values = summary.querySelectorAll("strong");
    values[0].textContent = data.summary.total;
    values[1].textContent = data.summary.siteVisible;
    values[2].textContent = data.summary.payable;
    render();
    if (force) showNotice("Данные заново загружены из Google Sheets.");
  } catch (error) {
    showNotice(error.message, true);
    list.innerHTML = '<div class="empty">Не удалось загрузить данные. Попробуй обновить страницу.</div>';
  } finally {
    refreshButton.disabled = false;
  }
}

async function loadSiteSettings() {
  try {
    const response = await fetch("/api/admin/site-settings", { cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось узнать режим сайта");
    const settings = await response.json();
    placeholderToggle.checked = settings.placeholderEnabled;
    modeStatus.textContent = settings.placeholderEnabled ? "Сейчас посетители видят заглушку" : "Сейчас открыт полный лендинг";
    modeStatus.classList.toggle("active", settings.placeholderEnabled);
  } catch (error) {
    showNotice(error.message, true);
  }
}

function renderLeadFields(fields = {}) {
  leadFieldsEditor.innerHTML = leadFieldNames.map(([name, title]) => {
    const field = fields[name] || {};
    const locked = ["name", "phone"].includes(name);
    return `
      <article class="lead-field-card" data-lead-field="${name}">
        <div class="lead-field-heading">
          <div>
            <strong>${title}</strong>
            <small>${locked ? "Обязательный контактный вопрос" : "Можно скрыть из анкеты"}</small>
          </div>
          <label class="quick-switch">
            <span><strong>${field.enabled !== false ? "Включён" : "Выключен"}</strong></span>
            <input name="${name}.enabled" type="checkbox" ${field.enabled !== false ? "checked" : ""} ${locked ? "disabled" : ""} />
            <i></i>
          </label>
        </div>
        <label>
          <span>Формулировка вопроса</span>
          <input name="${name}.label" maxlength="140" value="${String(field.label || "").replaceAll("&", "&amp;").replaceAll('"', "&quot;")}" required />
        </label>
        <label>
          <span>Подсказка</span>
          <input name="${name}.hint" maxlength="160" value="${String(field.hint || "").replaceAll("&", "&amp;").replaceAll('"', "&quot;")}" />
        </label>
      </article>
    `;
  }).join("");

  leadFieldsEditor.querySelectorAll(".quick-switch input").forEach((input) => {
    input.addEventListener("change", () => {
      input.closest(".quick-switch").querySelector("strong").textContent = input.checked ? "Включён" : "Выключен";
    });
  });
}

async function openLeadFormSettings() {
  leadFormSettingsButton.disabled = true;
  try {
    const response = await fetch("/api/admin/lead-form-settings", { cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить настройки анкеты");
    const settings = await response.json();
    ["title", "intro", "submitLabel", "successTitle", "successText", "telegramUrl"].forEach((name) => {
      leadFormSettingsForm.elements[name].value = settings[name] || "";
    });
    leadFormSettingsForm.elements.enabled.checked = settings.enabled !== false;
    renderLeadFields(settings.fields);
    leadFormDialog.showModal();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    leadFormSettingsButton.disabled = false;
  }
}

leadFormSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveButton = leadFormSettingsForm.querySelector(".lead-form-save");
  saveButton.disabled = true;
  saveButton.textContent = "Сохраняю…";
  const fields = Object.fromEntries(leadFieldNames.map(([name]) => {
    const enabledInput = leadFormSettingsForm.elements[`${name}.enabled`];
    return [name, {
      enabled: ["name", "phone"].includes(name) ? true : enabledInput.checked,
      label: leadFormSettingsForm.elements[`${name}.label`].value,
      hint: leadFormSettingsForm.elements[`${name}.hint`].value,
    }];
  }));
  try {
    const response = await fetch("/api/admin/lead-form-settings", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-maeva-admin": "1" },
      body: JSON.stringify({
        enabled: leadFormSettingsForm.elements.enabled.checked,
        title: leadFormSettingsForm.elements.title.value,
        intro: leadFormSettingsForm.elements.intro.value,
        submitLabel: leadFormSettingsForm.elements.submitLabel.value,
        successTitle: leadFormSettingsForm.elements.successTitle.value,
        successText: leadFormSettingsForm.elements.successText.value,
        telegramUrl: leadFormSettingsForm.elements.telegramUrl.value,
        fields,
      }),
    });
    if (!response.ok) throw new Error("Не удалось сохранить настройки анкеты");
    leadFormDialog.close();
    showNotice("Анкета обновлена на всех страницах поездок.");
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Сохранить анкету";
  }
});

leadFormSettingsButton.addEventListener("click", openLeadFormSettings);
leadFormSettingsForm.querySelector(".lead-form-close").addEventListener("click", () => leadFormDialog.close());
leadFormSettingsForm.querySelector(".lead-form-cancel").addEventListener("click", () => leadFormDialog.close());

function deliveryBadge(label, delivery = {}) {
  const text = {
    delivered: "доставлено",
    processing: "отправляется",
    failed: "ошибка",
    pending: "в очереди",
  }[delivery.status] || "неизвестно";
  return `<span class="delivery-badge ${delivery.status || ""}">${label}: ${text}</span>`;
}

function renderLeads(leads) {
  if (!leads.length) {
    leadsList.innerHTML = '<div class="empty">Заявок с сайта пока нет.</div>';
    return;
  }
  leadsList.innerHTML = leads.map((lead) => {
    const hasFailure = [lead.delivery?.telegram?.status, lead.delivery?.sheets?.status].includes("failed");
    const priority = {
      new: "Новая",
      hot: "Горячая",
      warm: "Тёплая",
      cold: "Холодная",
      needs_review: "Нужна проверка",
      low_priority: "Низкий приоритет",
    }[lead.qualification?.status] || "Новая";
    return `
      <article class="lead-record">
        <div class="lead-record-head">
          <div>
            <p>${formatDate(lead.createdAt)} · ${lead.tour_country || ""}</p>
            <h3>${lead.name || "Без имени"} · <a href="tel:${lead.phone || ""}">${lead.phone || "Без телефона"}</a></h3>
          </div>
          <span class="lead-priority ${lead.qualification?.status || ""}">${priority}</span>
        </div>
        <p class="lead-trip">${lead.tour_title || lead.tour_id || "Поездка не указана"}</p>
        <div class="lead-record-meta">
          <span>${lead.labels?.people_count || ""}</span>
          <span>${lead.labels?.budget || ""}</span>
          <span>${lead.labels?.prepayment_ready || ""}</span>
        </div>
        ${lead.comment ? `<p class="lead-comment">${lead.comment}</p>` : ""}
        <div class="lead-delivery">
          ${deliveryBadge("Google Sheets", lead.delivery?.sheets)}
          ${deliveryBadge("Telegram", lead.delivery?.telegram)}
          ${hasFailure ? `<button class="button secondary lead-retry" data-id="${lead.id}" type="button">Повторить доставку</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
  leadsList.querySelectorAll(".lead-retry").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const response = await fetch(`/api/admin/leads/${button.dataset.id}/retry`, {
          method: "POST",
          headers: { "x-maeva-admin": "1" },
        });
        if (!response.ok) throw new Error("Не удалось поставить доставку в очередь");
        await loadLeads();
      } catch (error) {
        showNotice(error.message, true);
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function loadLeads() {
  leadsList.innerHTML = '<div class="empty">Загружаю заявки…</div>';
  const response = await fetch("/api/admin/leads?limit=200", { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить заявки");
  renderLeads((await response.json()).leads || []);
}

leadsButton.addEventListener("click", async () => {
  leadsDialog.showModal();
  try {
    await loadLeads();
  } catch (error) {
    leadsList.innerHTML = `<div class="empty">${error.message}</div>`;
  }
});
document.querySelector("#leads-refresh").addEventListener("click", () => loadLeads().catch((error) => showNotice(error.message, true)));
document.querySelector(".leads-close").addEventListener("click", () => leadsDialog.close());

placeholderToggle.addEventListener("change", async () => {
  placeholderToggle.disabled = true;
  try {
    const response = await fetch("/api/admin/site-settings", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-maeva-admin": "1" },
      body: JSON.stringify({ placeholderEnabled: placeholderToggle.checked }),
    });
    if (!response.ok) throw new Error("Не удалось переключить режим сайта");
    await loadSiteSettings();
    showNotice(placeholderToggle.checked ? "Заглушка включена." : "Полный лендинг снова открыт.");
  } catch (error) {
    placeholderToggle.checked = !placeholderToggle.checked;
    showNotice(error.message, true);
  } finally {
    placeholderToggle.disabled = false;
  }
});

document.querySelector("#search").addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

document.querySelector("#filter").addEventListener("change", (event) => {
  state.filter = event.target.value;
  render();
});

refreshButton.addEventListener("click", () => loadTrips(true));
loadTrips();
loadSiteSettings();
