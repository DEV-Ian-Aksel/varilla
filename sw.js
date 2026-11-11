const C = "varilla-v6";
const WIDGET_CACHE = "varilla-widget-data";
const WIDGET_TAG = "varilla-resumen";
const WIDGET_DATA_URL = new URL(
  "./widgets/resumen-data.json",
  self.registration.scope
).href

const F = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./widgets/resumen-template.json",
  "./widgets/resumen-data.json",
  "./widgets/screenshot.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(C)
      .then(cache => cache.addAll(F))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== C && key !== WIDGET_CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
      .then(() => updateWidgets())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});

self.addEventListener("widgetinstall", event => {
  event.waitUntil(onWidgetInstall(event.widget));
});

self.addEventListener("widgetuninstall", event => {
  event.waitUntil(onWidgetUninstall(event.widget));
});

self.addEventListener("widgetresume", event => {
  event.waitUntil(renderWidget(event.widget));
});

self.addEventListener("widgetclick", event => {
  if (event.action === "open-app") {
    event.waitUntil(openApp());
  }
});

self.addEventListener("periodicsync", event => {
  if (event.tag !== WIDGET_TAG) return;

  event.waitUntil((async () => {
    if (!self.widgets) return;

    const widget = await self.widgets.getByTag(event.tag);
    if (widget && "update" in widget.definition) {
      await renderWidget(widget);
    }
  })());
});

self.addEventListener("message", event => {
  const message = event.data;
  if (!message || message.type !== "widget-data" || !isWidgetData(message.data)) {
    return;
  }

  event.waitUntil(
    saveWidgetData(message.data).then(() => updateWidgets())
  );
});

function isWidgetData(data) {
  return Boolean(
    data &&
    typeof data.seccion === "string" &&
    typeof data.cuantia === "string" &&
    typeof data.barrasLong === "string" &&
    typeof data.barrasEst === "string" &&
    typeof data.estado === "string"
  );
}


async function saveWidgetData(data) {
  const cache = await caches.open(WIDGET_CACHE);

  await cache.put(
    WIDGET_DATA_URL,
    new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json"
      }
    })
  );
}

async function loadWidgetData(dataUrl) {
  const cache = await caches.open(WIDGET_CACHE);
  const url = new URL(dataUrl, self.registration.scope).href;
  const cached = await cache.match(url);

  if (cached) {
    return await cached.text();
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("No se pudieron cargar los datos del widget.");
  }

  return await response.text();
}


async function onWidgetInstall(widget) {
  if (
    self.registration.periodicSync &&
    widget &&
    widget.definition &&
    "update" in widget.definition
  ) {
    try {
      const tags = await self.registration.periodicSync.getTags();
      if (!tags.includes(widget.definition.tag)) {
        await self.registration.periodicSync.register(widget.definition.tag, {
          minInterval: Number(widget.definition.update) * 1000
        });
      }
    } catch {
      // La sincronización periódica puede no estar disponible.
    }
  }

  await renderWidget(widget);
}

async function onWidgetUninstall(widget) {
  if (
    widget &&
    widget.instances &&
    widget.instances.length === 1 &&
    widget.definition &&
    "update" in widget.definition &&
    self.registration.periodicSync
  ) {
    try {
      await self.registration.periodicSync.unregister(widget.definition.tag);
    } catch {
      // No hay una sincronización registrada.
    }
  }
}

async function updateWidgets() {
  if (!self.widgets) return;

  const widget = await self.widgets.getByTag(WIDGET_TAG);
  if (!widget) return;

  await renderWidget(widget);
}

async function renderWidget(widget) {
  if (!self.widgets || !widget || !widget.definition) return;

  const templateUrl = widget.definition.msAcTemplate;
  const dataUrl = widget.definition.data;
  if (!templateUrl || !dataUrl) return;

  const template = await (await fetch(templateUrl)).text();
  const data = await loadWidgetData(dataUrl);

  await self.widgets.updateByTag(widget.definition.tag, { template, data });
}

async function openApp() {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });

  for (const client of windows) {
    if ("focus" in client) return client.focus();
  }

  return self.clients.openWindow("./index.html");
}
