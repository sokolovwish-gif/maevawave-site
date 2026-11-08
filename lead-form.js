(() => {
  const defaults = {
    enabled: true,
    title: "Анкета участника",
    intro: "Расскажите немного о себе — это займёт около двух минут и поможет менеджеру подготовиться к разговору.",
    submitLabel: "Отправить анкету",
    successTitle: "Анкета отправлена",
    successText: "Менеджер MaevaWave напишет вам в Telegram или свяжется по указанному контакту и поможет с бронью места.",
    telegramUrl: "https://t.me/captainmaeva",
    fields: {},
  };
  const fieldDefaults = {
    people_count: ["Сколько вас будет?", ""],
    is_adult: ["Вам уже исполнилось 18 лет?", ""],
    cabin_fit: ["Подходит размещение по 2 человека в каюте?", ""],
    budget: ["Какой бюджет на путешествие вам комфортен?", ""],
    prepayment_ready: ["Готовы внести предоплату после согласования деталей?", ""],
    main_interest: ["Что для вас важнее всего в этой поездке?", ""],
    comment: ["Что ещё нам важно знать?", "Необязательно"],
    name: ["Как вас зовут?", "Можно только имя"],
    phone: ["Номер телефона", "Например, +7 999 123-45-67"],
    telegram: ["Telegram для связи", "username — менеджер напишет сюда"],
    discover_source: ["Откуда вы о нас узнали?", ""],
  };
  const options = {
    people_count: [["1", "1"], ["2", "2"], ["3_plus", "3+"]],
    is_adult: [["yes", "Да"], ["no", "Нет"]],
    cabin_fit: [["yes", "Да"], ["no", "Нет, хочу жить один (доп. оплата)"]],
    budget: [["under_1000", "До 100 000 ₽"], ["1000_2000", "100 000–200 000 ₽"], ["2000_3000", "200 000–300 000 ₽"], ["3000_plus", "От 300 000 ₽"], ["not_sure", "Пока не уверен(а)"]],
    prepayment_ready: [["ready_now", "Да, готов(а)"], ["need_details", "После уточнения деталей"], ["just_looking", "Пока присматриваюсь"]],
    main_interest: [["sea", "Море и красивые места"], ["company", "Новые знакомства"], ["sailing", "Яхтинг и паруса"], ["rest", "Перезагрузка и отдых"], ["masha", "Поехать именно с Машей"]],
    discover_source: [["instagram", "Instagram"], ["telegram", "Telegram"], ["friends", "От друзей"], ["search", "Поиск"], ["repeat", "Уже путешествовал(а) с нами"], ["other", "Другое"]],
  };

  let settingsPromise;
  let currentTrip;
  let step = 0;
  let dialog;
  let submissionId;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (symbol) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[symbol]);

  function draftKey() {
    return currentTrip ? `maevawave-lead:${currentTrip.id}` : "";
  }

  async function loadSettings() {
    if (!settingsPromise) {
      settingsPromise = fetch("/api/lead-form-settings", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : defaults)
        .catch(() => defaults);
    }
    return settingsPromise;
  }

  function field(settings, name) {
    const configured = settings.fields?.[name] || {};
    return {
      enabled: ["name", "phone"].includes(name) || configured.enabled !== false,
      label: configured.label || fieldDefaults[name][0],
      hint: configured.hint || fieldDefaults[name][1],
    };
  }

  function choices(settings, name, multiple = false) {
    const meta = field(settings, name);
    if (!meta.enabled) return "";
    return `
      <fieldset class="lead-question" data-question="${name}">
        <legend>${escapeHtml(meta.label)}</legend>
        ${meta.hint ? `<p>${escapeHtml(meta.hint)}</p>` : ""}
        <div class="lead-options">
          ${options[name].map(([value, label]) => `
            <label>
              <input type="${multiple ? "checkbox" : "radio"}" name="${name}${multiple ? "[]" : ""}" value="${value}" ${multiple ? "" : "required"} />
              <span>${escapeHtml(label)}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
    `;
  }

  function textField(settings, name, type = "text") {
    const meta = field(settings, name);
    if (!meta.enabled) return "";
    const phone = name === "phone";
    const telegram = name === "telegram";
    return `
      <label class="lead-question" data-question="${name}">
        <span>${escapeHtml(meta.label)}</span>
        ${telegram ? `<span class="telegram-input-prefix">@</span>` : ""}
        <input
          type="${type}"
          name="${name}"
          ${["name", "phone"].includes(name) ? "required" : ""}
          maxlength="${phone ? 40 : 100}"
          autocomplete="${phone ? "tel" : telegram ? "username" : "name"}"
          inputmode="${phone ? "tel" : "text"}"
          placeholder="${escapeHtml(meta.hint)}"
        />
      </label>
    `;
  }

  async function ensureDialog() {
    if (dialog) return dialog;
    const settings = { ...defaults, ...(await loadSettings()) };
    document.body.insertAdjacentHTML("beforeend", `
      <dialog class="lead-dialog" id="lead-dialog">
        <form class="lead-form" novalidate>
          <button class="lead-close" type="button" aria-label="Закрыть">×</button>
          <div class="lead-form-head">
          <p class="lead-kicker">Анкета · <span data-lead-trip></span></p>
            <h2>${escapeHtml(settings.title)}</h2>
            <p>${escapeHtml(settings.intro)}</p>
            <div class="lead-progress"><i></i><span>Шаг 1 из 3</span></div>
          </div>
          <div class="lead-form-body">
            <section class="lead-step is-active" data-step="0">
              ${choices(settings, "people_count")}
              ${choices(settings, "is_adult")}
              ${choices(settings, "cabin_fit")}
            </section>
            <section class="lead-step" data-step="1">
              ${choices(settings, "budget")}
              ${choices(settings, "prepayment_ready")}
              ${choices(settings, "main_interest", true)}
              ${choices(settings, "discover_source")}
            </section>
            <section class="lead-step" data-step="2">
              ${field(settings, "comment").enabled ? `
                <label class="lead-question" data-question="comment">
                  <span>${escapeHtml(field(settings, "comment").label)}</span>
                  <textarea name="comment" rows="3" maxlength="1000" placeholder="${escapeHtml(field(settings, "comment").hint)}"></textarea>
                </label>
              ` : ""}
              ${textField(settings, "name")}
              ${textField(settings, "phone", "tel")}
              ${textField(settings, "telegram")}
              <label class="lead-consent">
                <input type="checkbox" name="personal_data_consent" required />
                <span>Соглашаюсь на обработку персональных данных согласно <a href="/privacy.html" target="_blank">политике конфиденциальности</a>.</span>
              </label>
              <input class="lead-honeypot" name="website" tabindex="-1" autocomplete="off" />
            </section>
            <section class="lead-result" hidden>
              <div class="lead-result-icon">✓</div>
              <h2>${escapeHtml(settings.successTitle)}</h2>
              <p>${escapeHtml(settings.successText)}</p>
            </section>
          </div>
          <p class="lead-error" role="alert" hidden></p>
          <footer class="lead-form-actions">
            <button class="lead-back" type="button" hidden>Назад</button>
            <button class="lead-next" type="button">Продолжить</button>
            <button class="lead-submit" type="submit" hidden>${escapeHtml(settings.submitLabel)}</button>
          </footer>
        </form>
      </dialog>
    `);
    dialog = document.querySelector("#lead-dialog");
    dialog.querySelector(".lead-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.querySelector(".lead-next").addEventListener("click", () => {
      if (validateStep()) setStep(step + 1);
    });
    dialog.querySelector(".lead-back").addEventListener("click", () => setStep(step - 1));
    dialog.querySelector("form").addEventListener("input", saveDraft);
    dialog.querySelector("form").addEventListener("change", saveDraft);
    dialog.querySelector("form").addEventListener("submit", submit);
    return dialog;
  }

  function enabledFieldsInStep() {
    return [...dialog.querySelectorAll(`.lead-step[data-step="${step}"] input:not(.lead-honeypot), .lead-step[data-step="${step}"] textarea`)];
  }

  function validPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  }

  function validateStep() {
    const error = dialog.querySelector(".lead-error");
    error.hidden = true;
    for (const input of enabledFieldsInStep()) {
      if (!input.checkValidity()) {
        input.reportValidity();
        return false;
      }
    }
    if (dialog.querySelector(`.lead-step[data-step="${step}"] [data-question="main_interest"]`)) {
      const checked = dialog.querySelectorAll('input[name="main_interest[]"]:checked').length;
      if (!checked) {
        error.textContent = "Выберите хотя бы один важный для вас пункт.";
        error.hidden = false;
        return false;
      }
    }
    const phone = dialog.querySelector(`.lead-step[data-step="${step}"] input[name="phone"]`);
    if (phone && !validPhone(phone.value)) {
      error.textContent = "Проверьте номер телефона: нужно от 10 до 15 цифр.";
      error.hidden = false;
      phone.focus();
      return false;
    }
    return true;
  }

  function setStep(next) {
    step = Math.max(0, Math.min(2, next));
    dialog.querySelectorAll(".lead-step").forEach((node) => node.classList.toggle("is-active", Number(node.dataset.step) === step));
    dialog.querySelector(".lead-progress i").style.width = `${((step + 1) / 3) * 100}%`;
    dialog.querySelector(".lead-progress span").textContent = `Шаг ${step + 1} из 3`;
    dialog.querySelector(".lead-back").hidden = step === 0;
    dialog.querySelector(".lead-next").hidden = step === 2;
    dialog.querySelector(".lead-submit").hidden = step !== 2;
    dialog.querySelector(".lead-form-body").scrollTop = 0;
    saveDraft();
  }

  function saveDraft() {
    if (!dialog || !currentTrip) return;
    const form = dialog.querySelector("form");
    const values = {};
    for (const element of form.elements) {
      if (!element.name || element.name === "website") continue;
      if (element.type === "checkbox" || element.type === "radio") {
        if (!element.checked) continue;
        if (element.name.endsWith("[]")) {
          (values[element.name] ||= []).push(element.value);
        } else {
          values[element.name] = element.value || true;
        }
      } else {
        values[element.name] = element.value;
      }
    }
    sessionStorage.setItem(draftKey(), JSON.stringify({ values, step, submissionId }));
  }

  function restoreDraft() {
    let draft;
    try {
      draft = JSON.parse(sessionStorage.getItem(draftKey()) || "null");
    } catch {
      draft = null;
    }
    submissionId = draft?.submissionId || crypto.randomUUID();
    if (!draft?.values) return 0;
    const form = dialog.querySelector("form");
    for (const [name, value] of Object.entries(draft.values)) {
      const inputs = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
      inputs.forEach((input) => {
        if (input.type === "checkbox" || input.type === "radio") {
          input.checked = Array.isArray(value) ? value.includes(input.value) : String(value) === String(input.value) || value === true;
        } else {
          input.value = value;
        }
      });
    }
    return Number.isInteger(draft.step) ? draft.step : 0;
  }

  async function submit(event) {
    event.preventDefault();
    if (!validateStep()) return;
    const form = event.currentTarget;
    const submitButton = dialog.querySelector(".lead-submit");
    const error = dialog.querySelector(".lead-error");
    const data = Object.fromEntries(new FormData(form));
    data.main_interest = [...form.querySelectorAll('input[name="main_interest[]"]:checked')].map((input) => input.value);
    if (data.telegram) data.telegram = `@${String(data.telegram).replace(/^@+/, "").trim()}`;
    data.personal_data_consent = form.elements.personal_data_consent.checked;
    data.tour_id = currentTrip.id;
    data.submission_id = submissionId;
    if (localStorage.getItem("promoIntent") === "true") {
      data.promo_interest = true;
      data.promo_label = "5%";
    }
    submitButton.disabled = true;
    submitButton.textContent = "Отправляем…";
    error.hidden = true;
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Request failed");
      sessionStorage.removeItem(draftKey());
      localStorage.removeItem("promoIntent");
      form.reset();
      form.classList.add("is-success");
      dialog.querySelector(".lead-result").hidden = false;
    } catch (requestError) {
      error.textContent = requestError.message === "Invalid phone"
        ? "Проверьте номер телефона."
        : "Не получилось отправить анкету. Ответы сохранены: попробуйте ещё раз через минуту.";
      error.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = (await loadSettings()).submitLabel || defaults.submitLabel;
    }
  }

  async function open(trip) {
    currentTrip = trip;
    document.dispatchEvent(new CustomEvent("maevawave:lead-open", { detail: { tripId: trip.id } }));
    const modal = await ensureDialog();
    const settings = await loadSettings();
    if (!settings.enabled) {
      window.open(settings.telegramUrl || defaults.telegramUrl, "_blank", "noopener");
      return;
    }
    const form = modal.querySelector("form");
    form.classList.remove("is-success");
    form.reset();
    form.querySelectorAll("input, textarea").forEach((input) => {
      if (input.type === "checkbox" || input.type === "radio") input.checked = false;
      else input.value = "";
    });
    modal.querySelector(".lead-result").hidden = true;
    modal.querySelector("[data-lead-trip]").textContent = trip.cardTitle || trip.title;
    modal.querySelector(".lead-error").hidden = true;
    setStep(restoreDraft());
    modal.showModal();
  }

  window.MaevaLeadForm = { open };
})();
