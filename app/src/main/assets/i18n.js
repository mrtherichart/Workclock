/* WorkClock localisation. Bundled dictionaries: no network, no translated user data.
 * Source: tools/translation-strings.tsv -> tools/build-i18n.py.
 * Future UI code should use I18n.t(messageId, params); the legacy translator
 * handles existing English/Dutch UI text while it is migrated to message IDs.
 */
(function () {
  "use strict";
  const languages = ["en", "nl", "de", "fr", "es"];
  const catalog = window.__WorkClockCatalog || {};
  const en = catalog.en || {};
  const enToId = new Map(Object.entries(en).map(([key, value]) => [value, key]));
  const STORAGE_KEY = "workclock-language-v1";
  const rendered = new WeakMap();
  const attributes = new WeakMap();
  let preference = "auto";
  let active = "en";
  let observer;
  let processing = false;

  function normalize(locale) {
    const code = String(locale || "").toLowerCase().split(/[-_]/)[0];
    return languages.includes(code) ? code : null;
  }
  function readNative(method) {
    try {
      const bridge = window.WorkClockAndroid;
      return typeof bridge?.[method] === "function" ? bridge[method]() : null;
    } catch (_) { return null; }
  }
  function deviceLanguage() {
    const native = readNative("deviceLanguage");
    const preferred = native ? [native] : (navigator.languages || [navigator.language]);
    for (const locale of preferred) {
      const supported = normalize(locale);
      if (supported) return supported;
    }
    return "en";
  }
  function preferred() {
    const native = readNative("languagePreference");
    let saved = native || null;
    if (!saved) {
      try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) { /* storage restricted */ }
    }
    return saved === "auto" || normalize(saved) ? (saved === "auto" ? "auto" : normalize(saved)) : "auto";
  }
  const prefixSource = [
    "Start set to ", "Finish changed to ", "Finish set to ",
    "At ", "Last detected ", "Editing ", "Added ", "Saved ",
    "Deleted ", "Location found · accuracy about ",
    "Background detection: ", "Background detection failed: ",
    "Background setup: ", "Installed: WorkClock ",
    "Show older workdays (", "Project ",
    "Work was already started."
  ];
  const prefixPhrases = {
    nl: ["Begin ingesteld op ", "Einde gewijzigd naar ", "Einde ingesteld op ", "Bij ", "Laatst gedetecteerd ", "Bewerken: ", "Toegevoegd: ", "Opgeslagen: ", "Verwijderd: ", "Locatie gevonden · nauwkeurigheid ongeveer ", "Achtergronddetectie: ", "Achtergronddetectie mislukt: ", "Achtergrondinstelling: ", "Geïnstalleerd: WorkClock ", "Oudere werkdagen tonen (", "Project ", "Werk was al gestart."],
    de: ["Beginn auf ", "Ende geändert auf ", "Ende auf ", "Bei ", "Zuletzt erkannt ", "Bearbeite ", "Hinzugefügt: ", "Gespeichert: ", "Gelöscht: ", "Standort gefunden · Genauigkeit ca. ", "Hintergrunderkennung: ", "Hintergrunderkennung fehlgeschlagen: ", "Hintergrund-Einrichtung: ", "Installiert: WorkClock ", "Ältere Arbeitstage anzeigen (", "Projekt ", "Arbeit wurde bereits begonnen."],
    fr: ["Début fixé à ", "Fin modifiée à ", "Fin fixée à ", "À ", "Dernière détection ", "Modification de ", "Ajouté : ", "Enregistré : ", "Supprimé : ", "Position trouvée · précision environ ", "Détection en arrière-plan : ", "Échec de la détection : ", "Configuration en arrière-plan : ", "Installé : WorkClock ", "Afficher les anciennes journées (", "Projet ", "Le travail avait déjà commencé."],
    es: ["Inicio establecido a las ", "Fin cambiada a las ", "Fin establecida a las ", "En ", "Última detección ", "Editando ", "Añadido: ", "Guardado: ", "Eliminado: ", "Ubicación encontrada · precisión aprox. ", "Detección en segundo plano: ", "Error de detección: ", "Configuración en segundo plano: ", "Instalado: WorkClock ", "Mostrar jornadas anteriores (", "Proyecto ", "El trabajo ya estaba iniciado."]
  };
  // Patterns are deliberately limited to app-owned messages, never project names.
  const dynamicPatterns = [
    {
      re: /^Project (\d+) needs a name\.$/,
      nl: n => `Project ${n} heeft een naam nodig.`,
      de: n => `Projekt ${n} braucht einen Namen.`,
      fr: n => `Le projet ${n} doit avoir un nom.`,
      es: n => `El proyecto ${n} necesita un nombre.`
    }, {
      re: /^Project (\d+) needs an end time\.$/,
      nl: n => `Project ${n} heeft een eindtijd nodig.`,
      de: n => `Projekt ${n} braucht eine Endzeit.`,
      fr: n => `Le projet ${n} nécessite une heure de fin.`,
      es: n => `El proyecto ${n} necesita una hora de fin.`
    }, {
      re: /^Project (\d+) must end after it starts\.$/,
      nl: n => `Project ${n} moet eindigen na het begin.`,
      de: n => `Projekt ${n} muss nach dem Beginn enden.`,
      fr: n => `Le projet ${n} doit se terminer après son début.`,
      es: n => `El proyecto ${n} debe terminar después de empezar.`
    }, {
      re: /^Project (\d+) must end before the workday finish\.$/,
      nl: n => `Project ${n} moet eindigen vóór het einde van de werkdag.`,
      de: n => `Projekt ${n} muss vor Ende des Arbeitstags enden.`,
      fr: n => `Le projet ${n} doit se terminer avant la fin de la journée.`,
      es: n => `El proyecto ${n} debe terminar antes de finalizar la jornada.`
    }, {
      re: /^Show older workdays \(\d+ remaining\)\)?$/,
      nl: n => `Oudere werkdagen tonen (${n} resterend)`,
      de: n => `Ältere Arbeitstage anzeigen (${n} verbleibend)`,
      fr: n => `Afficher les anciennes journées (${n} restantes)`,
      es: n => `Mostrar jornadas anteriores (${n} restantes)`
    }, {
      re: /^WorkClock ([\d.]+) is up to date\.$/,
      nl: n => `WorkClock ${n} is bijgewerkt.`,
      de: n => `WorkClock ${n} ist aktuell.`,
      fr: n => `WorkClock ${n} est à jour.`,
      es: n => `WorkClock ${n} está actualizado.`
    }, {
      re: /^WorkClock ([\d.]+) is available\.$/,
      nl: n => `WorkClock ${n} is beschikbaar.`,
      de: n => `WorkClock ${n} ist verfügbar.`,
      fr: n => `WorkClock ${n} est disponible.`,
      es: n => `WorkClock ${n} está disponible.`
    }, {
      re: /^Downloading WorkClock ([\d.]+)…$/,
      nl: n => `WorkClock ${n} downloaden…`,
      de: n => `WorkClock ${n} wird heruntergeladen…`,
      fr: n => `Téléchargement de WorkClock ${n}…`,
      es: n => `Descargando WorkClock ${n}…`
    }
  ];
  function translateText(value) {
    if (active === "en" || typeof value !== "string") return value;
    if (!value.trim()) return value;
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(value);
    const core = match?.[2] || value;
    // The icon is decorative; localise the text without losing the globe glyph.
    if (core.startsWith("🌐 ")) {
      const translated = translateText(core.slice(3));
      return match[1] + "🌐 " + translated + match[3];
    }
    const key = enToId.get(core) || (Object.hasOwn(en, core) ? core : null);
    if (key) return match[1] + (catalog[active]?.[key] || core) + match[3];
    for (const pattern of dynamicPatterns) {
      const matchValue = pattern.re.exec(core);
      if (matchValue) return match[1] + pattern[active](...matchValue.slice(1)) + match[3];
    }
    // Older messages include dynamic values. Translate only the fixed prefix.
    for (let i = 0; i < prefixSource.length - 1; i++) {
      const src = prefixSource[i];
      if (core.startsWith(src) && core.length > src.length) {
        return match[1] + prefixPhrases[active][i] + core.slice(src.length) + match[3];
      }
    }
    return value;
  }
  function textNode(node) {
    const value = node.nodeValue;
    if (!value || !value.trim()) return;
    const previous = rendered.get(node);
    const source = previous && previous.translated === value ? previous.source : value;
    const replacement = translateText(source);
    rendered.set(node, { source, translated: replacement });
    if (value !== replacement) node.nodeValue = replacement;
  }
  function translateAttribute(node, name) {
    const value = node.getAttribute(name);
    if (value == null || !value.trim()) return;
    let cache = attributes.get(node);
    if (!cache) { cache = {}; attributes.set(node, cache); }
    const previous = cache[name];
    const source = previous && previous.translated === value ? previous.source : value;
    const replacement = translateText(source);
    cache[name] = { source, translated: replacement };
    if (value !== replacement) node.setAttribute(name, replacement);
  }
  function skip(node) {
    return node.nodeType === Node.ELEMENT_NODE &&
      (node.matches("script, style, [data-i18n-ignore], .i18n-user-data") || node.closest("[data-i18n-ignore]"));
  }
  function translateTree(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement || !skip(node.parentElement)) textNode(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || skip(node)) return;
    for (const attr of ["placeholder", "aria-label", "title"]) translateAttribute(node, attr);
    for (const child of node.childNodes) translateTree(child);
  }
  function apply() {
    document.documentElement.lang = active;
    document.documentElement.setAttribute("data-language", active);
    if (document.body) translateTree(document.body);
    const select = document.getElementById("languageSelect");
    if (select && select.value !== preference) select.value = preference;
    const actual = document.getElementById("languageActual");
    if (actual) {
      const display = {en:"English",nl:"Nederlands",de:"Deutsch",fr:"Français",es:"Español"};
      actual.textContent = preference === "auto" ? display[active] : "";
    }
  }
  function setLanguage(code, fromUser = false) {
    if (code !== "auto" && !normalize(code)) return;
    preference = code;
    active = code === "auto" ? deviceLanguage() : normalize(code);
    if (fromUser) {
      try { localStorage.setItem(STORAGE_KEY, preference); } catch (_) { /* no storage */ }
      try { window.WorkClockAndroid?.setLanguagePreference?.(preference); } catch (_) { /* browser preview */ }
    }
    apply();
    window.dispatchEvent(new CustomEvent("workclock-language-change", { detail: { language: active, preference } }));
  }
  function syncNative() {
    const fromAndroid = readNative("languagePreference");
    if (fromAndroid && fromAndroid !== preference) {
      setLanguage(fromAndroid, false);
    } else if (preference === "auto" && deviceLanguage() !== active) {
      setLanguage("auto", false);
    }
  }
  function init() {
    preference = preferred();
    active = preference === "auto" ? deviceLanguage() : normalize(preference);
    apply();
    observer = new MutationObserver(records => {
      if (processing) return;
      processing = true;
      try {
        for (const record of records) {
          if (record.type === "characterData") translateTree(record.target);
          if (record.type === "childList") for (const node of record.addedNodes) translateTree(node);
          if (record.type === "attributes") translateAttribute(record.target, record.attributeName);
        }
      } finally { processing = false; }
    });
    observer.observe(document.body, {subtree:true,childList:true,characterData:true,
      attributes:true,attributeFilter:["placeholder","title","aria-label"]});
    window.addEventListener("pageshow", () => {
      if (preference === "auto") setLanguage("auto");
    });
  }
  const api = {
    init, setLanguage, syncNative, apply,
    attentionCount(n) {
      const count = Number(n) || 0;
      switch (active) {
        case "nl": return `${count} ${count === 1 ? "werkdag vraagt" : "werkdagen vragen"} aandacht`;
        case "de": return `${count} ${count === 1 ? "Arbeitstag benötigt" : "Arbeitstage benötigen"} Aufmerksamkeit`;
        case "fr": return `${count} ${count === 1 ? "journée à vérifier" : "journées à vérifier"}`;
        case "es": return `${count} ${count === 1 ? "jornada pendiente" : "jornadas pendientes"} de revisión`;
        default: return `${count} workday${count === 1 ? "" : "s"} need attention`;
      }
    },
    t(messageId, vars) {
      const key = en[messageId] ? messageId : enToId.get(messageId);
      const phrase = key ? (catalog[active]?.[key] || en[key]) : messageId;
      return String(phrase).replace(/\{([\w-]+)\}/g, (_, name) => vars?.[name] ?? `{${name}}`);
    },
    get locale() { return active; },
    get preference() { return preference; },
    get catalog() { return catalog; },
    _translateText: translateText
  };
  window.WorkClockI18n = api;
  init();
})();
