// ===== APPLICATION STATE ===== //
const app = {
    charts: {
        impact: null,
        risk: null
    },
    map: null,
    markersLayer: null,
    routeLines: [],
    routeLine: null,
    roadRouteLine: null,
    routeViewMode: "direct",
    selectedRouteKey: "fastest",
    latestRouteResult: null,
    currentRoute: "home",
    monitorPollTimer: null
};

const THEME_STORAGE_KEY = "deliveryai-theme";
const PRIMARY_TIMEOUT_MS = 25000;
const ADVANCED_TIMEOUT_MS = 20000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 2;
// SECURITY: Use sessionStorage (not localStorage) for API key to prevent XSS attacks.
// sessionStorage is cleared when the browser tab/window closes.
const API_KEY_STORAGE_KEY = "deliveryai-api-key";

// ===== DOM ELEMENTS ===== //
const elements = {
    pageHome: document.getElementById("pageHome"),
    pageDashboard: document.getElementById("pageDashboard"),
    goDashboardBtn: document.getElementById("goDashboardBtn"),
    navLinks: document.querySelectorAll("[data-route]"),

    outputBox: document.getElementById("outputBox"),
    outputSummaryView: document.getElementById("outputSummaryView"),
    outputOrdersView: document.getElementById("outputOrdersView"),
    outputRawView: document.getElementById("outputRawView"),
    outputTabSummary: document.getElementById("outputTabSummary"),
    outputTabOrders: document.getElementById("outputTabOrders"),
    outputTabRaw: document.getElementById("outputTabRaw"),
    inputTabJson: document.getElementById("inputTabJson"),
    inputTabTable: document.getElementById("inputTabTable"),
    inputJsonView: document.getElementById("inputJsonView"),
    inputTableView: document.getElementById("inputTableView"),
    inputBox: document.getElementById("ordersInput"),
    processBtn: document.getElementById("processBtn"),
    
    metricTotalOrders: document.getElementById("metricTotalOrders"),
    metricHighRisk: document.getElementById("metricHighRisk"),
    metricBeforeRate: document.getElementById("metricBeforeRate"),
    metricAfterRate: document.getElementById("metricAfterRate"),
    metricImproveRate: document.getElementById("metricImproveRate"),
    monitorModelName: document.getElementById("monitorModelName"),
    monitorF1: document.getElementById("monitorF1"),
    monitorRocAuc: document.getElementById("monitorRocAuc"),
    monitorPredCount: document.getElementById("monitorPredCount"),
    monitorGeoQueue: document.getElementById("monitorGeoQueue"),
    monitorWindow: document.getElementById("monitorWindow"),
    monitorAvgProb: document.getElementById("monitorAvgProb"),
    monitorRiskMix: document.getElementById("monitorRiskMix"),
    monitorGeoCache: document.getElementById("monitorGeoCache"),
    
    loadingText: document.getElementById("loadingText"),
    copyOutputBtn: document.getElementById("copyOutputBtn"),
    copyExampleBtn: document.getElementById("copyExampleBtn"),
    mapStatus: document.getElementById("mapStatus"),
    routeModeDirect: document.getElementById("routeModeDirect"),
    routeModeRoad: document.getElementById("routeModeRoad"),
    roadRouteMeta: document.getElementById("roadRouteMeta"),
    routeChoiceBar: document.getElementById("routeChoiceBar"),
    uncertaintyBox: document.getElementById("uncertaintyBox"),
    causalBox: document.getElementById("causalBox"),
    twinBox: document.getElementById("twinBox"),
    uncertaintyRaw: document.getElementById("uncertaintyRaw"),
    causalRaw: document.getElementById("causalRaw"),
    twinRaw: document.getElementById("twinRaw"),
    uncertaintyWidth: document.getElementById("uncertaintyWidth"),
    uncertaintyMix: document.getElementById("uncertaintyMix"),
    causalBestAction: document.getElementById("causalBestAction"),
    causalAvgUplift: document.getElementById("causalAvgUplift"),
    twinImprove: document.getElementById("twinImprove"),
    twinProcessed: document.getElementById("twinProcessed"),
};

// ===== INITIALIZATION ===== //
document.addEventListener("DOMContentLoaded", () => {
    initializeRouter();
    initializeTheme();
    initializeExperienceShell();
    initializeAmbientCanvas();
    initializeUtilityFooter();
    initializeDepthEffects();
    attachEventListeners();
    try {
        addAnimations();
    } catch (err) {
        console.warn("Animation initialization skipped:", err);
    }

    // Keep the primary action available even if optional visual libs fail.
    try {
        initializeMap();
    } catch (err) {
        console.warn("Map initialization skipped:", err);
    }

    // Hero stat counters with staggered animation
    initHeroCounters();

    // Ripple effect on Run button
    initRunBtnRipple();

    refreshMonitoring();
    app.monitorPollTimer = setInterval(refreshMonitoring, 30000);
});

function initializeExperienceShell() {
    initIntroLoader();
    initOverlayMenu();
    initCustomCursor();
    initLaunchParallax();
}

function initLaunchParallax() {
    const home = elements.pageHome;
    if (!home) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    let rafId = 0;
    let px = 0;
    let py = 0;

    const apply = () => {
        rafId = 0;
        home.style.setProperty("--launch-parallax-x", px.toFixed(3));
        home.style.setProperty("--launch-parallax-y", py.toFixed(3));
    };

    home.addEventListener("mousemove", (event) => {
        const rect = home.getBoundingClientRect();
        const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2;

        px = Math.max(-1, Math.min(1, nx));
        py = Math.max(-1, Math.min(1, ny));

        if (!rafId) {
            rafId = requestAnimationFrame(apply);
        }
    });

    home.addEventListener("mouseleave", () => {
        px = 0;
        py = 0;
        if (!rafId) {
            rafId = requestAnimationFrame(apply);
        }
    });
}

function initializeRouter() {
    const syncFromHash = () => {
        const target = window.location.hash.toLowerCase().includes("dashboard") ? "dashboard" : "home";
        navigateTo(target, { updateHash: false, scrollTop: false });
    };

    window.addEventListener("hashchange", syncFromHash);

    elements.navLinks.forEach((link) => {
        link.addEventListener("click", (event) => {
            const targetRoute = link.getAttribute("data-route");
            if (!targetRoute) return;
            event.preventDefault();

            const scrollTarget = link.getAttribute("data-scroll-target");
            navigateTo(targetRoute);
            if (scrollTarget) {
                scrollToElement(scrollTarget);
            }
        });
    });

    if (elements.goDashboardBtn) {
        elements.goDashboardBtn.addEventListener("click", () => {
            navigateTo("dashboard");
            scrollToElement("ordersInput");
        });
    }

    syncFromHash();
}

function navigateTo(route, options = {}) {
    const targetRoute = route === "dashboard" ? "dashboard" : "home";
    const updateHash = options.updateHash !== false;
    const scrollTop = options.scrollTop !== false;

    app.currentRoute = targetRoute;
    document.body.classList.toggle("route-home", targetRoute === "home");
    document.body.classList.toggle("route-dashboard", targetRoute === "dashboard");

    if (elements.pageHome) {
        elements.pageHome.classList.toggle("is-active", targetRoute === "home");
    }
    if (elements.pageDashboard) {
        elements.pageDashboard.classList.toggle("is-active", targetRoute === "dashboard");
    }

    if (updateHash) {
        const nextHash = targetRoute === "dashboard" ? "#dashboard" : "#home";
        if (window.location.hash !== nextHash) {
            history.replaceState(null, "", nextHash);
        }
    }

    if (scrollTop) {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (targetRoute === "dashboard") {
        setTimeout(() => {
            if (app.map) {
                app.map.invalidateSize();
            }

            // Some dashboard sections are pre-tagged with animate-in.
            // Ensure they are revealed after route switch.
            const dashboardAnimated = document.querySelectorAll("#pageDashboard .animate-in");
            dashboardAnimated.forEach((el) => el.classList.add("is-visible"));
        }, 220);
    }
}

function scrollToElement(id) {
    const target = document.getElementById(id);
    if (!target) return;
    setTimeout(() => {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
}

function initIntroLoader() {
    const loader = document.getElementById("introLoader");
    const progress = document.getElementById("loaderProgress");
    const enterBtn = document.getElementById("enterBtn");

    if (!loader || !progress || !enterBtn) return;

    let value = 0;
    const timer = setInterval(() => {
        value = Math.min(100, value + 4);
        progress.style.width = `${value}%`;
        if (value >= 100) {
            clearInterval(timer);
        }
    }, 70);

    const closeLoader = () => {
        loader.classList.add("is-hidden");
        setTimeout(() => loader.remove(), 500);
        navigateTo("home");
    };

    enterBtn.addEventListener("click", closeLoader);
    setTimeout(closeLoader, 2200);
}

function initOverlayMenu() {
    const menu = document.getElementById("menuOverlay");
    const toggle = document.getElementById("menuToggle");
    if (!menu || !toggle) return;

    const setMenuState = (open) => {
        menu.classList.toggle("is-open", open);
        toggle.classList.toggle("is-open", open);
        document.body.classList.toggle("menu-open", open);
        menu.setAttribute("aria-hidden", open ? "false" : "true");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };

    toggle.addEventListener("click", () => {
        const open = !menu.classList.contains("is-open");
        setMenuState(open);
    });

    menu.addEventListener("click", (event) => {
        if (event.target === menu) {
            setMenuState(false);
        }
    });

    const overlayLinks = menu.querySelectorAll(".overlay-link[data-route]");
    overlayLinks.forEach((link) => {
        link.addEventListener("click", () => {
            setMenuState(false);
        });
    });

    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && menu.classList.contains("is-open")) {
            setMenuState(false);
            toggle.focus();
        }
    });
}

function initCustomCursor() {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cursor = document.getElementById("customCursor");
    if (!cursor) return;

    cursor.classList.add("is-active");

    window.addEventListener("mousemove", (event) => {
        cursor.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    });

    window.addEventListener("mousedown", () => cursor.classList.add("is-pressed"));
    window.addEventListener("mouseup", () => cursor.classList.remove("is-pressed"));
}

function initializeAmbientCanvas() {
    const canvas = document.getElementById("ambientCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const particles = [];
    const particleCount = 42;

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createParticle() {
        return {
            x: Math.random() * width,
            y: Math.random() * height,
            r: 1 + Math.random() * 2.4,
            vx: -0.25 + Math.random() * 0.5,
            vy: -0.25 + Math.random() * 0.5,
            alpha: 0.12 + Math.random() * 0.28
        };
    }

    function seedParticles() {
        particles.length = 0;
        for (let i = 0; i < particleCount; i += 1) {
            particles.push(createParticle());
        }
    }

    function tick() {
        ctx.clearRect(0, 0, width, height);
        for (let i = 0; i < particles.length; i += 1) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < -8) p.x = width + 8;
            if (p.x > width + 8) p.x = -8;
            if (p.y < -8) p.y = height + 8;
            if (p.y > height + 8) p.y = -8;

            ctx.beginPath();
            ctx.fillStyle = `rgba(199, 210, 254, ${p.alpha})`;
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        requestAnimationFrame(tick);
    }

    resize();
    seedParticles();
    tick();

    window.addEventListener("resize", () => {
        resize();
        seedParticles();
    });
}

function initializeUtilityFooter() {
    const themeToggle = document.getElementById("themeToggle");
    const soundToggle = document.getElementById("soundToggle");
    const worldToggle = document.getElementById("worldToggle");

    if (themeToggle) {
        refreshThemeToggleLabel(themeToggle);
        themeToggle.addEventListener("click", () => {
            const isAtlas = document.body.classList.contains("theme-atlas");
            const nextTheme = isAtlas ? "theme-nocturne" : "theme-atlas";
            document.body.classList.remove("theme-atlas", "theme-nocturne");
            document.body.classList.add(nextTheme);
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
            refreshThemeToggleLabel(themeToggle);
        });
    }

    if (soundToggle) {
        let isSoundOn = true;
        soundToggle.addEventListener("click", () => {
            isSoundOn = !isSoundOn;
            soundToggle.classList.toggle("is-off", !isSoundOn);
            const label = soundToggle.querySelector("span");
            if (label) {
                label.textContent = isSoundOn ? "Sound" : "Muted";
            }
        });
    }

    if (worldToggle) {
        worldToggle.addEventListener("click", () => {
            navigateTo("dashboard");
            scrollToElement("map");
        });
    }
}

function initializeTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const theme = savedTheme === "theme-nocturne" ? "theme-nocturne" : "theme-atlas";
    document.body.classList.remove("theme-atlas", "theme-nocturne");
    document.body.classList.add(theme);
}

function refreshThemeToggleLabel(toggle) {
    const isAtlas = document.body.classList.contains("theme-atlas");
    const icon = toggle.querySelector("i");
    const label = toggle.querySelector("span");
    if (icon) {
        icon.className = isAtlas ? "fas fa-moon" : "fas fa-sun";
    }
    if (label) {
        label.textContent = isAtlas ? "Night" : "Day";
    }
}

function initializeDepthEffects() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const root = document.documentElement;
    const shell = document.querySelector(".shell");
    if (!shell) return;

    let rafId = 0;
    let nextX = window.innerWidth / 2;
    let nextY = window.innerHeight / 2;

    const updateGlow = () => {
        rafId = 0;
        root.style.setProperty("--cursor-x", `${nextX}px`);
        root.style.setProperty("--cursor-y", `${nextY}px`);
    };

    window.addEventListener("mousemove", (event) => {
        nextX = event.clientX;
        nextY = event.clientY;
        if (!rafId) {
            rafId = requestAnimationFrame(updateGlow);
        }
    });

    const tiltTargets = document.querySelectorAll(".panel, .kpi-card, .cap-card");
    tiltTargets.forEach((item) => {
        item.addEventListener("mousemove", (event) => {
            const rect = item.getBoundingClientRect();
            const px = (event.clientX - rect.left) / rect.width;
            const py = (event.clientY - rect.top) / rect.height;
            const rotateY = (px - 0.5) * 6;
            const rotateX = (0.5 - py) * 6;

            item.style.setProperty("--tilt-x", `${rotateX.toFixed(2)}deg`);
            item.style.setProperty("--tilt-y", `${rotateY.toFixed(2)}deg`);
        });

        item.addEventListener("mouseleave", () => {
            item.style.setProperty("--tilt-x", "0deg");
            item.style.setProperty("--tilt-y", "0deg");
        });
    });
}

// ===== MAP INITIALIZATION ===== //
function initializeMap() {
    if (typeof L === "undefined") {
        console.warn("Leaflet is not available; map disabled.");
        setMapStatus("Interactive map library not available. Fallback route view will be used.", "warn");
        return;
    }

    const mapEl = document.getElementById("map");
    if (!mapEl) {
        console.warn("Map container not found; map disabled.");
        setMapStatus("Map container not found.", "warn");
        return;
    }

    app.map = L.map("map").setView([12.9716, 77.5946], 11);
    
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        className: "leaflet-custom"
    }).addTo(app.map);
    
    app.markersLayer = L.layerGroup().addTo(app.map);
    setMapStatus("Interactive map ready.", "ok");

    // Fix occasional blank map when container size is resolved after animations.
    setTimeout(() => {
        if (app.map) {
            app.map.invalidateSize();
        }
    }, 200);
    
    // Add map interactions
    app.map.on("click", () => console.log("Map clicked"));
}

// ===== EVENT LISTENERS ===== //
function attachEventListeners() {
    if (elements.processBtn) {
        elements.processBtn.addEventListener("click", handleProcessOrder);
    }
    if (elements.copyOutputBtn) {
        elements.copyOutputBtn.addEventListener("click", copyToClipboard);
    }
    if (elements.copyExampleBtn) {
        elements.copyExampleBtn.addEventListener("click", copyExample);
    }

    initializeOutputTabs();
    initializeInputTabs();
    initializeRouteModeControls();
    renderInputTablePreview();
    
    // Enter key to process
    if (elements.inputBox) {
        elements.inputBox.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                handleProcessOrder();
            }
        });

        elements.inputBox.addEventListener("input", () => {
            renderInputTablePreview();
        });
    }
}

function initializeRouteModeControls() {
    if (elements.routeModeDirect) {
        elements.routeModeDirect.addEventListener("click", () => {
            setRouteViewMode("direct");
        });
    }

    if (elements.routeModeRoad) {
        elements.routeModeRoad.addEventListener("click", () => {
            setRouteViewMode("road");
        });
    }

    setRouteViewMode("road", { rerender: false });
}

function setRouteViewMode(mode, options = {}) {
    const normalized = mode === "road" ? "road" : "direct";
    app.routeViewMode = normalized;

    if (elements.routeModeDirect) {
        const active = normalized === "direct";
        elements.routeModeDirect.classList.toggle("is-active", active);
        elements.routeModeDirect.setAttribute("aria-pressed", active ? "true" : "false");
    }
    if (elements.routeModeRoad) {
        const active = normalized === "road";
        elements.routeModeRoad.classList.toggle("is-active", active);
        elements.routeModeRoad.setAttribute("aria-pressed", active ? "true" : "false");
    }

    if (elements.roadRouteMeta) {
        elements.roadRouteMeta.textContent = normalized === "road"
            ? "Road route mode on"
            : "Direct mode on";
    }

    if (options.rerender !== false && app.latestRouteResult) {
        updateMap(app.latestRouteResult);
    } else if (options.rerender !== false && normalized === "road") {
        setMapStatus("Run analysis first, then Road (Exact) will render pathway.", "warn");
    }
}

function getRouteOptions(result) {
    const options = Array.isArray(result?.route_options) ? result.route_options : [];
    if (options.length > 0) return options;

    if (result?.route) {
        return [
            {
                key: "fastest",
                label: "Fastest",
                distance_km: result.route.distance_km,
                duration_min: result.route.duration_min ?? result.route.eta_minutes,
                eta_minutes: result.route.eta_minutes,
                sequence_order_ids: result.route.sequence_order_ids,
                polyline: result.route.polyline,
                source: result.route.source,
            },
        ];
    }

    return [];
}

function getSelectedRoute(result) {
    const options = getRouteOptions(result);
    if (options.length === 0) return null;

    const selected = options.find((opt) => String(opt.key) === String(app.selectedRouteKey));
    return selected || options[0];
}

function syncOutputRouteMetrics(result) {
    const selected = getSelectedRoute(result);
    if (!selected) return;

    const distanceEl = document.getElementById("summaryRouteDistanceValue");
    if (distanceEl) {
        const km = Number(selected?.distance_km);
        distanceEl.textContent = Number.isFinite(km) ? `${km.toFixed(2)} km` : "n/a";
    }

    const etaEl = document.getElementById("summaryRouteEtaValue");
    if (etaEl) {
        const mins = Number(selected?.duration_min ?? selected?.eta_minutes);
        etaEl.textContent = Number.isFinite(mins) ? `${Math.round(mins)} min` : "n/a";
    }
}

function renderRouteChoices(result) {
    if (!elements.routeChoiceBar) return;

    const options = getRouteOptions(result);
    if (options.length === 0) {
        elements.routeChoiceBar.innerHTML = "";
        return;
    }

    if (!options.some((opt) => String(opt.key) === String(app.selectedRouteKey))) {
        app.selectedRouteKey = String(result?.route_selected_key || options[0].key || "fastest");
    }

    elements.routeChoiceBar.innerHTML = options
        .map((opt, idx) => {
            const active = String(opt.key) === String(app.selectedRouteKey);
            const km = Number(opt?.distance_km);
            const mins = Number(opt?.duration_min ?? opt?.eta_minutes);
            const distanceText = Number.isFinite(km) ? `${km.toFixed(2)} km` : "n/a";
            const etaText = Number.isFinite(mins) ? `${Math.round(mins)} min` : "n/a";
            const rank = idx + 1;
            return `
                <button class="route-choice-btn ${active ? "is-active" : ""}" type="button" data-route-key="${escapeHtml(String(opt.key || ""))}">
                    <div class="route-choice-title">#${rank} ${escapeHtml(String(opt.label || opt.key || "Route"))}</div>
                    <div class="route-choice-meta">${escapeHtml(distanceText)} | ${escapeHtml(etaText)}</div>
                </button>
            `;
        })
        .join("");

    elements.routeChoiceBar.querySelectorAll(".route-choice-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const key = btn.getAttribute("data-route-key") || "fastest";
            app.selectedRouteKey = key;

            const selected = getSelectedRoute(result);
            const selectedSource = String(selected?.source || "").toLowerCase();
            setRouteViewMode(selectedSource.startsWith("road") ? "road" : "direct", { rerender: false });

            renderRouteChoices(app.latestRouteResult || result);
            syncOutputRouteMetrics(app.latestRouteResult || result);
            updateMap(app.latestRouteResult || result);
        });
    });
}

function initializeInputTabs() {
    const tabs = [
        { button: elements.inputTabJson, key: "json" },
        { button: elements.inputTabTable, key: "table" },
    ];

    tabs.forEach((tab) => {
        if (!tab.button) return;
        tab.button.addEventListener("click", () => setInputTab(tab.key));
    });

    // Fallback in case button references are re-rendered or detached.
    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const jsonBtn = target.closest("#inputTabJson");
        const tableBtn = target.closest("#inputTabTable");
        if (jsonBtn) {
            setInputTab("json");
        }
        if (tableBtn) {
            setInputTab("table");
        }
    });

    setInputTab("json");
}

function setInputTab(key) {
    const normalized = key === "table" ? "table" : "json";
    const tabs = [
        { button: elements.inputTabJson, view: elements.inputJsonView, key: "json" },
        { button: elements.inputTabTable, view: elements.inputTableView, key: "table" },
    ];

    tabs.forEach((tab) => {
        const active = tab.key === normalized;
        if (tab.button) {
            tab.button.classList.toggle("is-active", active);
            tab.button.setAttribute("aria-selected", active ? "true" : "false");
        }
        if (tab.view) {
            tab.view.classList.toggle("is-active", active);
            tab.view.style.display = active ? "block" : "none";
        }
    });

    if (normalized === "table") {
        renderInputTablePreview();
    }
}

function renderInputTablePreview() {
    if (!elements.inputTableView || !elements.inputBox) return;

    // Keep both input modes visible as a robust fallback.
    if (elements.inputJsonView) {
        elements.inputJsonView.style.display = "block";
    }
    elements.inputTableView.style.display = "block";

    const raw = elements.inputBox.value.trim();
    if (!raw) {
        elements.inputTableView.innerHTML = '<p class="advanced-empty">Paste JSON input to view table preview.</p>';
        return;
    }

    let orders;
    try {
        orders = JSON.parse(raw);
    } catch {
        elements.inputTableView.innerHTML = '<p class="advanced-empty">Invalid JSON. Fix the input to render table preview.</p>';
        return;
    }

    // Mode A: array of objects -> classic column table.
    if (Array.isArray(orders) && orders.length > 0 && orders.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
        const normalizedRows = orders;
        const columns = [];
        const seen = new Set();
        normalizedRows.forEach((row) => {
            Object.keys(row).forEach((key) => {
                if (!seen.has(key)) {
                    seen.add(key);
                    columns.push(key);
                }
            });
        });

        const header = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
        const body = normalizedRows
            .map((row) => {
                const cells = columns.map((col) => {
                    const value = row[col];
                    return `<td>${escapeHtml(formatPreviewValue(value))}</td>`;
                }).join("");
                return `<tr>${cells}</tr>`;
            })
            .join("");

        elements.inputTableView.innerHTML = `
            <div class="input-table-wrap">
                <table class="input-preview-table">
                    <thead><tr>${header}</tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        `;
        return;
    }

    // Mode B: any other valid JSON -> flattened path/value table.
    const flattened = flattenJsonForPreview(orders, "$", 0, [], 1200);
    const body = flattened
        .map((row) => {
            return `<tr><td>${escapeHtml(row.path)}</td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.value)}</td></tr>`;
        })
        .join("");

    elements.inputTableView.innerHTML = `
        <div class="input-table-wrap">
            <table class="input-preview-table">
                <thead><tr><th>Path</th><th>Type</th><th>Value</th></tr></thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function flattenJsonForPreview(value, path, depth, out, limit) {
    if (out.length >= limit) return out;

    if (value === null) {
        out.push({ path, type: "null", value: "null" });
        return out;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            out.push({ path, type: "array", value: "[]" });
            return out;
        }

        value.forEach((item, idx) => {
            if (out.length >= limit) return;
            flattenJsonForPreview(item, `${path}[${idx}]`, depth + 1, out, limit);
        });
        return out;
    }

    if (typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length === 0) {
            out.push({ path, type: "object", value: "{}" });
            return out;
        }

        keys.forEach((key) => {
            if (out.length >= limit) return;
            flattenJsonForPreview(value[key], `${path}.${key}`, depth + 1, out, limit);
        });
        return out;
    }

    out.push({ path, type: typeof value, value: formatPreviewValue(value) });
    return out;
}

function formatPreviewValue(value) {
    if (value === null || value === undefined) return "-";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value) || typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch {
            return "[unserializable]";
        }
    }
    return String(value);
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function initializeOutputTabs() {
    const tabMap = [
        { button: elements.outputTabSummary, key: "summary" },
        { button: elements.outputTabOrders, key: "orders" },
        { button: elements.outputTabRaw, key: "raw" },
    ];

    tabMap.forEach((tab) => {
        if (!tab.button) return;
        tab.button.addEventListener("click", () => setOutputTab(tab.key));
    });
}

function setOutputTab(key) {
    const normalized = key === "orders" || key === "raw" ? key : "summary";

    const tabs = [
        { button: elements.outputTabSummary, view: elements.outputSummaryView, key: "summary" },
        { button: elements.outputTabOrders, view: elements.outputOrdersView, key: "orders" },
        { button: elements.outputTabRaw, view: elements.outputRawView, key: "raw" },
    ];

    tabs.forEach((tab) => {
        const active = tab.key === normalized;
        if (tab.button) {
            tab.button.classList.toggle("is-active", active);
            tab.button.setAttribute("aria-selected", active ? "true" : "false");
        }
        if (tab.view) {
            tab.view.classList.toggle("is-active", active);
        }
    });
}

// ===== MAIN PROCESS HANDLER ===== //
async function handleProcessOrder() {
    try {
        navigateTo("dashboard", { scrollTop: false });

        // Validate input
        const inputText = elements.inputBox.value.trim();
        if (!inputText) {
            showError("Please paste order data in JSON format");
            return;
        }
        
        // Parse JSON
        let orders;
        try {
            orders = JSON.parse(inputText);
        } catch (err) {
            showError(`Invalid JSON: ${err.message}`);
            return;
        }
        
        if (!Array.isArray(orders)) {
            showError("Orders must be an array of objects");
            return;
        }
        
        // Show loading state
        setLoadingState(true);
        setAdvancedLoadingState(true);
        clearAdvancedSummary();
        elements.outputBox.textContent = "Processing orders...";
        if (elements.loadingText) {
            elements.loadingText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validating payload...';
        }
        
        // Call API
        if (elements.loadingText) {
            elements.loadingText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calling dispatch engine...';
        }
        const result = await fetchJson("/orders/process", { orders }, PRIMARY_TIMEOUT_MS);
        app.selectedRouteKey = String(result?.route_selected_key || "fastest");
        if (elements.loadingText) {
            elements.loadingText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rendering mission dashboard...';
        }
        
        // Display results
        displayResults(result, orders);
        renderRouteChoices(result);
        updateMetrics(result);
        updateCharts(result);
        updateMap(result);
        await refreshMonitoring();

        // Premium visual enhancements
        renderAllSparklines();
        updateRiskHeatmap(result);
        revealChartBlocks();

        // Particle burst on improvement metric
        setTimeout(() => {
            createParticleBurst(elements.metricImproveRate);
        }, 1300);

        // Pull advanced insights in parallel to enrich the mission view.
        const advanced = await loadAdvancedInsights(orders);
        displayAdvancedResults(advanced);
        
        // Scroll to results
        setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 100);
        
    } catch (error) {
        console.error("Error:", error);
        showError(error.message || "Unknown error occurred");
        elements.outputBox.textContent = `Error: ${error.message}`;
        setAdvancedError(`Advanced stream skipped: ${error.message}`);
    } finally {
        setAdvancedLoadingState(false);
        setLoadingState(false);
    }
}

async function postJson(url, payload) {
    return fetchJson(url, payload, ADVANCED_TIMEOUT_MS);
}

async function getJson(url, timeoutMs = ADVANCED_TIMEOUT_MS) {
    let apiKey = "";
    try {
        apiKey = (sessionStorage.getItem(API_KEY_STORAGE_KEY) || "").trim();
    } catch {
        apiKey = "";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const headers = {};
        if (apiKey) {
            headers["X-API-Key"] = apiKey;
        }

        const response = await fetch(url, {
            method: "GET",
            headers,
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`${url} failed (${response.status})`);
        }
        return await response.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchJson(url, payload, timeoutMs) {
    let lastError;
    let apiKey = "";
    try {
        apiKey = (sessionStorage.getItem(API_KEY_STORAGE_KEY) || "").trim();
    } catch {
        apiKey = "";
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const headers = { "Content-Type": "application/json" };
            if (apiKey) {
                headers["X-API-Key"] = apiKey;
            }

            const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!response.ok) {
                let detail = "unknown error";
                try {
                    const data = await response.json();
                    detail = data?.error?.message || data?.detail || JSON.stringify(data);
                } catch {
                    detail = await response.text();
                }

                if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
                    await sleepWithBackoff(attempt);
                    continue;
                }

                throw new Error(`${url} failed (${response.status}): ${detail || "unknown error"}`);
            }

            return response.json();
        } catch (err) {
            lastError = err;
            if (err?.name === "AbortError") {
                if (attempt < MAX_RETRIES) {
                    await sleepWithBackoff(attempt);
                    continue;
                }
                lastError = new Error(`${url} timed out after ${Math.round(timeoutMs / 1000)}s`);
            }

            if (attempt >= MAX_RETRIES) {
                reportClientTelemetry("error", "fetch_failure", {
                    url,
                    attempt,
                    message: String(lastError?.message || lastError || "unknown error")
                });
                throw lastError;
            }
            await sleepWithBackoff(attempt);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    throw lastError || new Error(`${url} failed`);
}

function sleepWithBackoff(attempt) {
    const jitterMs = Math.floor(Math.random() * 120);
    const delayMs = Math.min(1200, 250 * (2 ** attempt)) + jitterMs;
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function reportClientTelemetry(level, message, context = {}) {
    try {
        if (!navigator.sendBeacon) return;
        const payload = JSON.stringify({ level, message, context });
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/health/client-log", blob);
    } catch (err) {
        console.warn("Telemetry send failed:", err);
    }
}

async function loadAdvancedInsights(orders) {
    const payload = {
        orders,
        alpha: 0.1
    };

    const requests = [
        postJson("/advanced/uncertainty", payload),
        postJson("/advanced/causal-action", payload),
        postJson("/advanced/digital-twin", {
            ...payload,
            horizon_steps: 8,
            random_seed: 42
        })
    ];

    const [uncertainty, causal, twin] = await Promise.allSettled(requests);

    return {
        uncertainty,
        causal,
        twin
    };
}

function formatSettledResult(result) {
    if (!result) {
        return "No data";
    }
    if (result.status === "fulfilled") {
        return JSON.stringify(result.value, null, 2);
    }
    return `Advanced endpoint unavailable:\n${result.reason?.message || String(result.reason)}`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function firstRows(records, maxRows = 6) {
    if (!Array.isArray(records)) return [];
    return records.slice(0, maxRows);
}

function setRawJson(target, settledResult) {
    if (!target) return;
    target.textContent = formatSettledResult(settledResult);
}

function renderUncertaintyTable(settledResult) {
    if (!elements.uncertaintyBox) return;

    if (!settledResult || settledResult.status !== "fulfilled") {
        elements.uncertaintyBox.innerHTML = `<p class="advanced-empty">${escapeHtml(formatSettledResult(settledResult))}</p>`;
        return;
    }

    const records = settledResult.value?.predictions || settledResult.value?.records || [];
    const rows = firstRows(records);
    if (rows.length === 0) {
        elements.uncertaintyBox.innerHTML = '<p class="advanced-empty">No uncertainty rows available.</p>';
        return;
    }

    const body = rows.map((row) => {
        const band = row?.risk_band || {};
        return `
            <tr>
                <td>${escapeHtml(row?.order_id || "-")}</td>
                <td>${escapeHtml((Number(row?.failure_probability) || 0).toFixed(3))}</td>
                <td>${escapeHtml((Number(band.lower) || 0).toFixed(3))}</td>
                <td>${escapeHtml((Number(band.upper) || 0).toFixed(3))}</td>
                <td>${escapeHtml((Number(band.width) || 0).toFixed(3))}</td>
                <td>${escapeHtml(String(band.uncertainty_level || "-").toUpperCase())}</td>
            </tr>
        `;
    }).join("");

    elements.uncertaintyBox.innerHTML = `
        <div class="advanced-table-wrap">
            <table class="advanced-table">
                <thead>
                    <tr>
                        <th>Order</th>
                        <th>Risk</th>
                        <th>Lower</th>
                        <th>Upper</th>
                        <th>Width</th>
                        <th>Level</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function renderCausalTable(settledResult) {
    if (!elements.causalBox) return;

    if (!settledResult || settledResult.status !== "fulfilled") {
        elements.causalBox.innerHTML = `<p class="advanced-empty">${escapeHtml(formatSettledResult(settledResult))}</p>`;
        return;
    }

    const records = settledResult.value?.predictions || settledResult.value?.records || [];
    const rows = firstRows(records);
    if (rows.length === 0) {
        elements.causalBox.innerHTML = '<p class="advanced-empty">No causal recommendation rows available.</p>';
        return;
    }

    const body = rows.map((row) => {
        const best = row?.causal_policy?.best_action || {};
        return `
            <tr>
                <td>${escapeHtml(row?.order_id || "-")}</td>
                <td>${escapeHtml(best.action || "-")}</td>
                <td>${escapeHtml((Number(best.expected_risk_after) || 0).toFixed(3))}</td>
                <td>${escapeHtml((Number(best.uplift_abs) || 0).toFixed(3))}</td>
            </tr>
        `;
    }).join("");

    elements.causalBox.innerHTML = `
        <div class="advanced-table-wrap">
            <table class="advanced-table">
                <thead>
                    <tr>
                        <th>Order</th>
                        <th>Best Action</th>
                        <th>Risk After</th>
                        <th>Uplift</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function renderTwinTable(settledResult) {
    if (!elements.twinBox) return;

    if (!settledResult || settledResult.status !== "fulfilled") {
        elements.twinBox.innerHTML = `<p class="advanced-empty">${escapeHtml(formatSettledResult(settledResult))}</p>`;
        return;
    }

    const timeline = settledResult.value?.digital_twin?.timeline || [];
    const activeTimeline = timeline.filter((row) => {
        const processed = Number(row?.processed || 0);
        const pending = Number(row?.pending || 0);
        const delivered = Number(row?.delivered || 0);
        const riskAfter = Number(row?.avg_risk_after || 0);
        const riskBefore = Number(row?.avg_risk_before || 0);
        return processed > 0 || pending > 0 || delivered > 0 || riskAfter > 0 || riskBefore > 0;
    });

    const rows = firstRows(activeTimeline.length > 0 ? activeTimeline : timeline);
    if (rows.length === 0) {
        elements.twinBox.innerHTML = '<p class="advanced-empty">No digital twin timeline rows available.</p>';
        return;
    }

    const body = rows.map((row, idx) => `
        <tr>
            <td>${escapeHtml(row?.step ?? idx + 1)}</td>
            <td>${escapeHtml((Number(row?.avg_risk_after) || 0).toFixed(3))}</td>
            <td>${escapeHtml((Number(row?.processed) || 0).toString())}</td>
            <td>${escapeHtml((Number(row?.delivered) || 0).toString())}</td>
            <td>${escapeHtml((Number(row?.weather_shock) || 0).toFixed(3))}</td>
            <td>${escapeHtml((Number(row?.traffic_shock) || 0).toFixed(3))}</td>
        </tr>
    `).join("");

    elements.twinBox.innerHTML = `
        <p class="advanced-empty">Showing active simulation steps only.</p>
        <div class="advanced-table-wrap">
            <table class="advanced-table">
                <thead>
                    <tr>
                        <th>Step</th>
                        <th>Avg Risk After</th>
                        <th>Processed</th>
                        <th>Delivered</th>
                        <th>Weather Shock</th>
                        <th>Traffic Shock</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function displayAdvancedResults(advanced) {
    renderUncertaintyTable(advanced?.uncertainty);
    renderCausalTable(advanced?.causal);
    renderTwinTable(advanced?.twin);

    setRawJson(elements.uncertaintyRaw, advanced?.uncertainty);
    setRawJson(elements.causalRaw, advanced?.causal);
    setRawJson(elements.twinRaw, advanced?.twin);

    if (advanced?.twin?.status === "fulfilled") {
        const summary = advanced.twin.value?.digital_twin?.summary || {};
        if (Number.isFinite(summary.expected_failure_rate_before)) {
            elements.metricBeforeRate.textContent = formatPercent(summary.expected_failure_rate_before);
        }
        if (Number.isFinite(summary.expected_failure_rate_after)) {
            elements.metricAfterRate.textContent = formatPercent(summary.expected_failure_rate_after);
        }
        if (Number.isFinite(summary.expected_improvement)) {
            elements.metricImproveRate.textContent = formatPercent(summary.expected_improvement);
        }
    }

    updateAdvancedSummaries(advanced);
}

function setAdvancedLoadingState(isLoading) {
    const panels = document.querySelectorAll(".panel-advanced");
    panels.forEach((panel) => panel.classList.toggle("is-loading", isLoading));
    if (isLoading) {
        if (elements.uncertaintyBox) elements.uncertaintyBox.innerHTML = '<p class="advanced-empty">Loading uncertainty...</p>';
        if (elements.causalBox) elements.causalBox.innerHTML = '<p class="advanced-empty">Loading causal policy...</p>';
        if (elements.twinBox) elements.twinBox.innerHTML = '<p class="advanced-empty">Loading digital twin...</p>';
    }
}

function clearAdvancedSummary() {
    if (elements.uncertaintyWidth) elements.uncertaintyWidth.textContent = "-";
    if (elements.uncertaintyMix) elements.uncertaintyMix.textContent = "-";
    if (elements.causalBestAction) elements.causalBestAction.textContent = "-";
    if (elements.causalAvgUplift) elements.causalAvgUplift.textContent = "-";
    if (elements.twinImprove) elements.twinImprove.textContent = "-";
    if (elements.twinProcessed) elements.twinProcessed.textContent = "-";
}

function setAdvancedError(message) {
    const safe = `<p class="advanced-empty">${escapeHtml(message)}</p>`;
    if (elements.uncertaintyBox) elements.uncertaintyBox.innerHTML = safe;
    if (elements.causalBox) elements.causalBox.innerHTML = safe;
    if (elements.twinBox) elements.twinBox.innerHTML = safe;
}

function updateAdvancedSummaries(advanced) {
    const uncertaintyRecords = advanced?.uncertainty?.status === "fulfilled"
        ? (advanced.uncertainty.value?.predictions || [])
        : [];
    if (uncertaintyRecords.length > 0) {
        const widths = uncertaintyRecords
            .map((row) => Number(row?.risk_band?.width || 0))
            .filter((value) => Number.isFinite(value));
        const avgWidth = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 0;

        const levels = { low: 0, medium: 0, high: 0 };
        uncertaintyRecords.forEach((row) => {
            const level = String(row?.risk_band?.uncertainty_level || "").toLowerCase();
            if (level in levels) {
                levels[level] += 1;
            }
        });

        if (elements.uncertaintyWidth) elements.uncertaintyWidth.textContent = avgWidth.toFixed(3);
        if (elements.uncertaintyMix) {
            elements.uncertaintyMix.textContent = `L${levels.low}/M${levels.medium}/H${levels.high}`;
        }
    }

    const causalRecords = advanced?.causal?.status === "fulfilled"
        ? (advanced.causal.value?.predictions || [])
        : [];
    if (causalRecords.length > 0) {
        const actions = {};
        let upliftSum = 0;
        let upliftCount = 0;

        causalRecords.forEach((row) => {
            const best = row?.causal_policy?.best_action;
            const action = String(best?.action || "unknown");
            actions[action] = (actions[action] || 0) + 1;
            const uplift = Number(best?.uplift_abs);
            if (Number.isFinite(uplift)) {
                upliftSum += uplift;
                upliftCount += 1;
            }
        });

        const topAction = Object.entries(actions).sort((a, b) => b[1] - a[1])[0]?.[0] || "n/a";
        const avgUplift = upliftCount ? upliftSum / upliftCount : 0;

        if (elements.causalBestAction) elements.causalBestAction.textContent = topAction;
        if (elements.causalAvgUplift) elements.causalAvgUplift.textContent = avgUplift.toFixed(3);
    }

    const twinSummary = advanced?.twin?.status === "fulfilled"
        ? (advanced.twin.value?.digital_twin?.summary || {})
        : null;
    if (twinSummary) {
        if (elements.twinImprove) {
            const improve = Number(twinSummary.expected_improvement || 0);
            elements.twinImprove.textContent = formatPercent(improve);
        }
        if (elements.twinProcessed) {
            const processed = Number(twinSummary.orders_processed || 0);
            elements.twinProcessed.textContent = `${processed}`;
        }
    }
}

// ===== RESULT DISPLAY ===== //
function displayResults(result, sourceOrders = []) {
    const output = JSON.stringify(result, null, 2);
    elements.outputBox.textContent = output;
    
    // Add syntax highlighting class
    elements.outputBox.classList.add("language-json");
    
    // Make output selectable
    elements.outputBox.style.userSelect = "text";

    renderOutputSummary(result, sourceOrders);
    renderOutputOrdersTable(result);
}

function renderOutputSummary(result, sourceOrders = []) {
    if (!elements.outputSummaryView) return;

    const totalOrders = result?.orders?.length || 0;
    const low = result?.orders?.filter((o) => o.risk_label === "LOW").length || 0;
    const medium = result?.orders?.filter((o) => o.risk_label === "MEDIUM").length || 0;
    const high = result?.orders?.filter((o) => o.risk_label === "HIGH").length || 0;

    const impact = result?.impact_metrics || {};
    const safeImprovement = Math.max(0, Number(impact.failure_rate_improvement || 0));
    const selectedRoute = getSelectedRoute(result);
    const route = selectedRoute || result?.route || {};
    const routeDistanceKm = [
        route.total_distance_km,
        route.distance_km,
        impact.route_distance_after_km,
        impact.route_distance_before_km,
    ].find((value) => Number.isFinite(Number(value)));
    const routeEtaMin = [
        route.duration_min,
        route.eta_minutes,
    ].find((value) => Number.isFinite(Number(value)));

    const autoFilledHtml = renderAutoFilledFields(result, sourceOrders);

    elements.outputSummaryView.innerHTML = `
        <div class="output-summary-grid">
            <div class="insight-card"><p class="insight-label">Orders</p><p class="insight-value">${totalOrders}</p></div>
            <div class="insight-card"><p class="insight-label">Risk Mix</p><p class="insight-value">L${low}/M${medium}/H${high}</p></div>
            <div class="insight-card"><p class="insight-label">Failure Before</p><p class="insight-value">${formatPercent(impact.failure_rate_before || 0)}</p></div>
            <div class="insight-card"><p class="insight-label">Failure After</p><p class="insight-value">${formatPercent(impact.failure_rate_after || 0)}</p></div>
            <div class="insight-card"><p class="insight-label">Improvement</p><p class="insight-value">${formatPercent(safeImprovement)}</p></div>
            <div class="insight-card"><p class="insight-label">Route Distance</p><p id="summaryRouteDistanceValue" class="insight-value">${Number(routeDistanceKm || 0).toFixed(2)} km</p></div>
            <div class="insight-card"><p class="insight-label">Route ETA</p><p id="summaryRouteEtaValue" class="insight-value">${Number.isFinite(Number(routeEtaMin)) ? `${Math.round(Number(routeEtaMin))} min` : "n/a"}</p></div>
        </div>
        ${autoFilledHtml}
    `;
}

function renderAutoFilledFields(result, sourceOrders = []) {
    const processedOrders = Array.isArray(result?.orders) ? result.orders : [];
    if (!processedOrders.length || !Array.isArray(sourceOrders) || !sourceOrders.length) {
        return '<p class="advanced-empty output-autofill-empty">Auto-filled fields: not available for this run.</p>';
    }

    const byOrderId = new Map();
    sourceOrders.forEach((row) => {
        const id = row?.order_id;
        if (id) byOrderId.set(String(id), row);
    });

    const trackedFields = [
        "order_datetime",
        "address_raw",
        "city",
        "pincode",
        "customer_id",
        "past_failures",
        "distance_km",
        "time_slot",
        "area_risk_score",
    ];

    const rows = processedOrders
        .map((processed) => {
            const orderId = String(processed?.order_id || "");
            const original = byOrderId.get(orderId) || {};

            const filled = trackedFields.filter((field) => {
                if (!(field in original)) return true;
                const value = original[field];
                if (value === null || value === undefined) return true;
                if (typeof value === "string" && value.trim() === "") return true;
                return false;
            });

            return {
                orderId: orderId || "-",
                fields: filled,
            };
        })
        .filter((row) => row.fields.length > 0);

    if (rows.length === 0) {
        return '<p class="advanced-empty output-autofill-empty">Auto-filled fields: none detected.</p>';
    }

    const items = rows
        .map((row) => `<li><strong>${escapeHtml(row.orderId)}</strong>: ${escapeHtml(row.fields.join(", "))}</li>`)
        .join("");

    return `
        <div class="insight-card output-autofill-card">
            <p class="insight-label">Auto-filled Fields (Lenient Mode)</p>
            <ul class="output-autofill-list">${items}</ul>
        </div>
    `;
}

function renderOutputOrdersTable(result) {
    if (!elements.outputOrdersView) return;
    const rows = Array.isArray(result?.orders) ? result.orders : [];

    if (rows.length === 0) {
        elements.outputOrdersView.innerHTML = '<p class="advanced-empty">No order rows available.</p>';
        return;
    }

    const body = rows.map((row) => `
        <tr>
            <td>${escapeHtml(row.order_id || "-")}</td>
            <td>${escapeHtml(row.city || "-")}</td>
            <td>${escapeHtml(row.time_slot || "-")}</td>
            <td>${escapeHtml((Number(row.failure_probability) || 0).toFixed(3))}</td>
            <td>${getRiskBadgeHtml(row.risk_label)}</td>
            <td>${escapeHtml(row.recommended_action || row.recommended_action_rule_based || "-")}</td>
        </tr>
    `).join("");

    elements.outputOrdersView.innerHTML = `
        <div class="advanced-table-wrap">
            <table class="advanced-table">
                <thead>
                    <tr>
                        <th>Order</th>
                        <th>City</th>
                        <th>Slot</th>
                        <th>Failure Prob</th>
                        <th>Risk</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

// ===== METRICS UPDATE ===== //
function updateMetrics(result) {
    // Animate total orders
    const totalOrders = result.orders?.length || 0;
    animateNumber(elements.metricTotalOrders, totalOrders);
    
    // High risk orders
    const highRisk = result.orders?.filter(o => o.risk_label === "HIGH").length || 0;
    animateNumber(elements.metricHighRisk, highRisk);
    
    // Impact metrics
    const impact = result.impact_metrics || {};
    const beforeRate = impact.failure_rate_before || 0;
    const afterRate = impact.failure_rate_after || 0;
    const improvement = Math.max(0, Number(impact.failure_rate_improvement || 0));
    
    elements.metricBeforeRate.textContent = formatPercent(beforeRate);
    elements.metricAfterRate.textContent = formatPercent(afterRate);
    elements.metricImproveRate.textContent = formatPercent(improvement);
    
    // Add color indicators
    updateMetricColors(highRisk, totalOrders);
}

async function refreshMonitoring() {
    try {
        const data = await getJson("/monitoring/summary?window_hours=24", 10000);
        const model = data?.model || {};
        const predictions = data?.predictions || {};
        const mix = predictions?.risk_mix || {};
        const geocode = data?.geocode_enrichment || {};

        if (elements.monitorModelName) {
            elements.monitorModelName.textContent = String(model.name || "unknown");
        }
        if (elements.monitorF1) {
            elements.monitorF1.textContent = Number(model.f1 || 0).toFixed(3);
        }
        if (elements.monitorRocAuc) {
            elements.monitorRocAuc.textContent = Number(model.roc_auc || 0).toFixed(3);
        }
        if (elements.monitorPredCount) {
            elements.monitorPredCount.textContent = String(Number(predictions.total_predictions || 0));
        }
        if (elements.monitorGeoQueue) {
            elements.monitorGeoQueue.textContent = String(Number(geocode.queue_size || 0));
        }
        if (elements.monitorWindow) {
            elements.monitorWindow.textContent = `${Number(predictions.window_hours || 24)}h`;
        }
        if (elements.monitorAvgProb) {
            elements.monitorAvgProb.textContent = Number(predictions.avg_failure_probability || 0).toFixed(3);
        }
        if (elements.monitorRiskMix) {
            const low = Number(mix.LOW || 0);
            const medium = Number(mix.MEDIUM || 0);
            const high = Number(mix.HIGH || 0);
            elements.monitorRiskMix.textContent = `${low}/${medium}/${high}`;
        }
        if (elements.monitorGeoCache) {
            elements.monitorGeoCache.textContent = String(Number(geocode.runtime_cache_entries || 0));
        }
    } catch (err) {
        console.warn("Monitoring refresh failed:", err);
    }
}

// ===== ANIMATED NUMBER UPDATES ===== //
function animateNumber(element, target, suffix = "") {
    if (!element) return;
    const start = 0;
    const duration = 1200;
    const startTime = performance.now();

    // Spring ease-out cubic for premium feel
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const rawProgress = Math.min(elapsed / duration, 1);
        const progress = easeOutCubic(rawProgress);
        const current = Math.floor(start + (target - start) * progress);
        element.textContent = current + suffix;

        if (rawProgress < 1) {
            requestAnimationFrame(animate);
        }
    };

    requestAnimationFrame(animate);
}

// ===== CHART UPDATES ===== //
function updateCharts(result) {
    if (typeof Chart === "undefined") {
        console.warn("Chart.js is not available; charts skipped.");
        return;
    }

    const impact = result.impact_metrics || {};
    
    // Destroy old charts
    if (app.charts.impact) app.charts.impact.destroy();
    if (app.charts.risk) app.charts.risk.destroy();
    
    // Impact chart
    const impactCtx = document.getElementById("impactChart").getContext("2d");
    app.charts.impact = new Chart(impactCtx, {
        type: "bar",
        data: {
            labels: ["Before", "After"],
            datasets: [{
                label: "Failure Rate",
                data: [
                    (impact.failure_rate_before || 0) * 100,
                    (impact.failure_rate_after || 0) * 100
                ],
                backgroundColor: ["rgba(255, 85, 85, 0.7)", "rgba(80, 250, 123, 0.7)"],
                borderColor: ["#FF5555", "#50FA7B"],
                borderWidth: 2,
                borderRadius: 10,
                hoverBackgroundColor: ["rgba(255, 85, 85, 0.9)", "rgba(80, 250, 123, 0.9)"]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: (value) => value + "%",
                        color: "rgba(182, 206, 223, 0.6)",
                        font: {
                            family: "'Manrope', sans-serif"
                        }
                    },
                    grid: {
                        color: "rgba(142, 194, 220, 0.1)"
                    }
                },
                x: {
                    ticks: {
                        color: "rgba(182, 206, 223, 0.6)",
                        font: {
                            family: "'Manrope', sans-serif"
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
    
    // Risk distribution chart
    const riskCtx = document.getElementById("riskChart").getContext("2d");
    const riskCounts = {
        LOW: result.orders?.filter(o => o.risk_label === "LOW").length || 0,
        MEDIUM: result.orders?.filter(o => o.risk_label === "MEDIUM").length || 0,
        HIGH: result.orders?.filter(o => o.risk_label === "HIGH").length || 0
    };
    
    app.charts.risk = new Chart(riskCtx, {
        type: "doughnut",
        data: {
            labels: ["Low Risk", "Medium Risk", "High Risk"],
            datasets: [{
                data: [riskCounts.LOW, riskCounts.MEDIUM, riskCounts.HIGH],
                backgroundColor: ["rgba(80, 250, 123, 0.7)", "rgba(255, 184, 108, 0.7)", "rgba(255, 85, 85, 0.7)"],
                borderColor: "rgba(9, 15, 31, 0.8)",
                borderWidth: 3,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: "rgba(182, 206, 223, 0.8)",
                        padding: 16,
                        font: {
                            family: "'Manrope', sans-serif"
                        }
                    }
                }
            }
        }
    });
}

// ===== MAP UPDATE ===== //
async function updateMap(result) {
    if (!app.map || !app.markersLayer) {
        renderFallbackRoute(result);
        return;
    }

    app.latestRouteResult = result;

    // Clear old markers
    app.markersLayer.clearLayers();
    (app.routeLines || []).forEach((line) => {
        if (line && app.map.hasLayer(line)) {
            app.map.removeLayer(line);
        }
    });
    app.routeLines = [];
    if (app.routeLine) app.map.removeLayer(app.routeLine);
    if (app.roadRouteLine) app.map.removeLayer(app.roadRouteLine);
    app.routeLine = null;
    app.roadRouteLine = null;

    const options = getRouteOptions(result).slice(0, 3);
    const selectedRoute = getSelectedRoute(result);
    if (!selectedRoute || options.length === 0) {
        console.log("No route polyline available");
        setMapStatus("No route geometry returned for this request.", "warn");
        return;
    }
    
    try {
        const visiblePoints = [];
        const routePalette = ["#6dd7dc", "#f2b134", "#d4552d"];
        const pathUsage = new Map();

        options.forEach((option, idx) => {
            const key = String(option?.key || "");
            const isSelected = key === String(app.selectedRouteKey);
            const source = String(option?.source || "").toLowerCase();
            const roadCoords = normalizeRouteCoords(option?.polyline || []);
            const directCoords = buildDirectSequenceCoords(result, option);

            let coords = [];
            if (app.routeViewMode === "road" && source.startsWith("road") && roadCoords.length > 1) {
                coords = roadCoords;
            } else if (directCoords.length > 1) {
                coords = directCoords;
            } else {
                coords = roadCoords;
            }

            if (!coords || coords.length < 2) {
                return;
            }

            const signature = buildPathSignature(coords);
            const duplicateIndex = pathUsage.get(signature) || 0;
            pathUsage.set(signature, duplicateIndex + 1);
            const drawCoords = duplicateIndex > 0
                ? offsetRouteCoords(coords, duplicateIndex * 0.00035)
                : coords;

            const color = routePalette[idx % routePalette.length];
            const line = L.polyline(drawCoords, {
                color,
                weight: isSelected ? 5 : 3,
                opacity: isSelected ? 0.95 : 0.55,
                dashArray: app.routeViewMode === "direct" || !source.startsWith("road") ? "6, 6" : undefined,
            }).addTo(app.map);

            const km = Number(option?.distance_km);
            const mins = Number(option?.duration_min ?? option?.eta_minutes);
            line.bindTooltip(
                `#${idx + 1} ${String(option?.label || option?.key || "Route")} | ${Number.isFinite(km) ? `${km.toFixed(2)} km` : "n/a"} | ${Number.isFinite(mins) ? `${Math.round(mins)} min` : "n/a"}`,
                { sticky: true }
            );

            app.routeLines.push(line);
            visiblePoints.push(...drawCoords);
        });

        if (visiblePoints.length < 2) {
            setMapStatus("Route data returned but coordinates are invalid.", "warn");
            renderFallbackRoute(result);
            return;
        }
        
        // Add markers for each order
        result.orders?.forEach((order, idx) => {
            if (!order.latitude || !order.longitude) return;
            
            const riskLevel = order.risk_label || "MEDIUM";
            const color = getMarkerColor(riskLevel);
            
            const marker = L.circleMarker([order.latitude, order.longitude], {
                radius: 8,
                fillColor: color,
                color: "#A1C2BD",
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });
            
            marker.bindPopup(`
                <div style="font-family: Archivo, sans-serif; font-size: 12px; color:#1e1f2e;">
                    <strong>${order.order_id}</strong><br/>
                    Risk: ${riskLevel}<br/>
                    Distance: ${order.distance_km?.toFixed(1) || 'N/A'} km
                </div>
            `);
            
            app.markersLayer.addLayer(marker);
        });


        const selectedKm = Number(selectedRoute?.distance_km);
        const selectedMin = Number(selectedRoute?.duration_min ?? selectedRoute?.eta_minutes);
        if (elements.roadRouteMeta) {
            elements.roadRouteMeta.textContent = `Showing top ${options.length} routes | Selected ${Number.isFinite(selectedKm) ? `${selectedKm.toFixed(2)} km` : "n/a"} | ETA ${Number.isFinite(selectedMin) ? `${Math.round(selectedMin)} min` : "n/a"}`;
        }

        app.map.fitBounds(L.latLngBounds(visiblePoints), { padding: [50, 50] });
        setMapStatus(`Top ${options.length} route alternatives rendered.`, "ok");
        
    } catch (error) {
        console.error("Map error:", error);
        setMapStatus("Interactive map failed while rendering route. Showing fallback view.", "warn");
        renderFallbackRoute(result);
    }
}

function buildDirectSequenceCoords(result, selectedRoute = null) {
    const route = selectedRoute || result?.route || {};
    const orders = Array.isArray(result?.orders) ? result.orders : [];
    const sequence = Array.isArray(route.sequence_order_ids) ? route.sequence_order_ids : [];
    if (sequence.length === 0) return [];

    const byId = new Map();
    orders.forEach((row) => {
        const id = String(row?.order_id || "");
        const lat = Number(row?.latitude);
        const lon = Number(row?.longitude);
        if (id && Number.isFinite(lat) && Number.isFinite(lon)) {
            byId.set(id, [lat, lon]);
        }
    });

    const direct = sequence
        .map((orderId) => {
            if (orderId === "WAREHOUSE") return [12.9716, 77.5946];
            return byId.get(String(orderId)) || null;
        })
        .filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));

    return direct;
}

async function fetchRoadRoute(coords) {
    if (!Array.isArray(coords) || coords.length < 2) {
        return { coords: [], distanceKm: NaN, durationMin: NaN };
    }

    const sampled = sampleRouteCoords(coords, 24);
    const payload = {
        coordinates: sampled.map((pair) => ({ lat: Number(pair[0]), lon: Number(pair[1]) })),
    };

    try {
        const roadPayload = await fetchJson("/route/road-path", payload, 12000);
        if (!roadPayload?.available) {
            return { coords: [], distanceKm: NaN, durationMin: NaN };
        }

        const geometry = Array.isArray(roadPayload.geometry) ? roadPayload.geometry : [];
        const roadCoords = geometry
            .map((pair) => [Number(pair.lat), Number(pair.lon)])
            .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));

        return {
            coords: roadCoords,
            distanceKm: Number(roadPayload.distance_km ?? NaN),
            durationMin: Number(roadPayload.duration_min ?? NaN),
        };
    } catch (error) {
        console.warn("Road route fetch failed:", error);
        return { coords: [], distanceKm: NaN, durationMin: NaN };
    }
}

function sampleRouteCoords(coords, maxPoints = 24) {
    if (!Array.isArray(coords) || coords.length <= maxPoints) {
        return coords;
    }

    const out = [];
    const last = coords.length - 1;
    const step = last / (maxPoints - 1);

    for (let i = 0; i < maxPoints; i += 1) {
        const idx = Math.round(i * step);
        out.push(coords[Math.min(idx, last)]);
    }

    return out;
}

function setMapStatus(message, level = "warn") {
    if (!elements.mapStatus) return;
    elements.mapStatus.textContent = message;
    elements.mapStatus.classList.remove("ok", "warn");
    elements.mapStatus.classList.add(level === "ok" ? "ok" : "warn");
}

function renderFallbackRoute(result) {
    const mapEl = document.getElementById("map");
    if (!mapEl) return;

    const points = normalizeRouteCoords(result?.route?.polyline || [])
        .map((p) => ({ lat: Number(p[0]), lon: Number(p[1]) }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));

    if (points.length === 0) {
        setMapStatus("No map coordinates available for fallback preview.", "warn");
        mapEl.innerHTML = "";
        return;
    }

    const width = mapEl.clientWidth || 900;
    const height = mapEl.clientHeight || 350;
    const pad = 24;

    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const latRange = Math.max(maxLat - minLat, 0.0001);
    const lonRange = Math.max(maxLon - minLon, 0.0001);

    const toXY = (p) => {
        const x = pad + ((p.lon - minLon) / lonRange) * (width - pad * 2);
        const y = height - pad - ((p.lat - minLat) / latRange) * (height - pad * 2);
        return { x, y };
    };

    const pathData = points
        .map(toXY)
        .map((pt, idx) => `${idx === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
        .join(" ");

    const circles = points
        .map(toXY)
        .map(
            (pt, idx) =>
                `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4" fill="${idx === 0 ? "#A1C2BD" : "#E7F2EF"}" />`
        )
        .join("");

    mapEl.innerHTML = `
        <svg class="fallback-map" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Fallback route preview">
            <defs>
                <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#708993" />
                    <stop offset="100%" stop-color="#A1C2BD" />
                </linearGradient>
            </defs>
            <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(25,24,59,0.35)" />
            <path d="${pathData}" stroke="url(#routeGrad)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            ${circles}
        </svg>
    `;

    setMapStatus(`Fallback route preview rendered (${points.length} points).`, "ok");
}

function normalizeRouteCoords(polyline) {
    if (!Array.isArray(polyline)) return [];

    return polyline
        .map((p) => {
            if (Array.isArray(p) && p.length >= 2) {
                return [Number(p[0]), Number(p[1])];
            }
            if (p && typeof p === "object" && "lat" in p && "lon" in p) {
                return [Number(p.lat), Number(p.lon)];
            }
            return null;
        })
        .filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

function buildPathSignature(coords) {
    if (!Array.isArray(coords) || coords.length === 0) return "";
    return coords
        .map((pair) => `${Number(pair[0]).toFixed(4)},${Number(pair[1]).toFixed(4)}`)
        .join("|");
}

function offsetRouteCoords(coords, delta) {
    if (!Array.isArray(coords) || coords.length === 0) return [];
    return coords.map((pair) => [Number(pair[0]) + delta, Number(pair[1]) + delta]);
}

// ===== UTILITY FUNCTIONS ===== //
function getMarkerColor(risk) {
    switch (risk) {
        case "LOW": return "#0f8f95";
        case "MEDIUM": return "#f2b134";
        case "HIGH": return "#d4552d";
        default: return "#5fa7a8";
    }
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function updateMetricColors(highRisk, total) {
    const riskPercent = total > 0 ? (highRisk / total) * 100 : 0;
    const color = riskPercent > 50 ? "#c8421f" : riskPercent > 25 ? "#cc8a11" : "#0f8f95";
    
    elements.metricHighRisk.style.color = color;
}

function setLoadingState(isLoading) {
    elements.processBtn.style.pointerEvents = isLoading ? "none" : "auto";
    elements.processBtn.style.opacity = isLoading ? "0.6" : "1";
    elements.processBtn.disabled = isLoading;
    elements.loadingText.style.display = isLoading ? "inline-flex" : "none";
    document.body.classList.toggle("is-busy", isLoading);
}

function copyToClipboard() {
    const text = elements.outputBox.textContent;
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        showNotification("Clipboard API is not available in this browser.", "warning");
        return;
    }

    navigator.clipboard.writeText(text)
        .then(() => {
            showNotification("Output copied to clipboard!");
        })
        .catch(() => {
            showNotification("Unable to copy output. Please copy manually.", "warning");
        });
}

function copyExample() {
    const example = JSON.stringify([
        {
            "order_id": "ORD_001",
            "order_datetime": "2026-03-19 10:30:00",
            "address_raw": "Near temple 3rd cross BTM Layout Bengaluru",
            "city": "Bengaluru",
            "pincode": "560076",
            "customer_id": "CUST_001",
            "past_failures": 1,
            "distance_km": 5.4,
            "time_slot": "evening",
            "area_risk_score": 0.30
        }
    ], null, 2);
    
    elements.inputBox.value = example;
    renderInputTablePreview();
    showNotification("Example loaded!");
}

function showError(message) {
    console.error(message);
    showNotification(message, "error");
}

function showNotification(message, type = "success") {
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.setAttribute("role", "status");
    notification.setAttribute("aria-live", "polite");

    const useReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (useReducedMotion) {
        notification.classList.add("reduced-motion");
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (useReducedMotion) {
            notification.remove();
            return;
        }

        notification.classList.add("is-exit");
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== ANIMATIONS ===== //
function addAnimations() {
    // Add animation styles
    const style = document.createElement("style");
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
        
        .run-btn {
            position: relative;
            overflow: hidden;
        }
        
        .run-btn::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.3);
            transform: translate(-50%, -50%);
            transition: width 300ms, height 300ms;
        }
        
        .run-btn:active::before {
            width: 300px;
            height: 300px;
        }
    `;
    document.head.appendChild(style);

    // Wire reveal animations for key sections and cards.
    const revealTargets = [
        ".home-hero",
        ".home-panel",
        ".home-metrics .kpi-card",
        ".masthead",
        ".kpi-card",
        ".panel",
        ".chart-block",
        ".cap-card",
    ];
    const discoveredTargets = Array.from(document.querySelectorAll(revealTargets.join(",")));
    const preTaggedTargets = Array.from(document.querySelectorAll(".animate-in"));
    const targets = Array.from(new Set([...discoveredTargets, ...preTaggedTargets]));

    targets.forEach((el, idx) => {
        el.classList.add("animate-in");
        el.style.setProperty("--stagger-index", String(idx % 10));
    });

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.14, rootMargin: "0px 0px -30px 0px" }
        );

        targets.forEach((el) => observer.observe(el));
    } else {
        targets.forEach((el) => el.classList.add("is-visible"));
    }

    // Pulse the live status card subtly.
    const liveCard = document.querySelector(".status-pill.is-live");
    if (liveCard) {
        liveCard.classList.add("live-pulse");
    }
}

// ===== LOG INITIALIZATION ===== //
console.log("DeliveryAI Dashboard initialized");
console.log("Ready to process orders");

// ===== HERO STAT COUNTERS ===== //
function initHeroCounters() {
    const ordersEl = document.getElementById("heroStatOrders");
    const reductionEl = document.getElementById("heroStatReduction");
    const f1El = document.getElementById("heroStatF1");

    if (ordersEl) {
        setTimeout(() => {
            animateNumber(ordersEl, 12400);
        }, 800);
    }
    if (reductionEl) {
        setTimeout(() => {
            animateNumber(reductionEl, 28, "%");
        }, 1100);
    }
    if (f1El) {
        setTimeout(() => {
            const start = performance.now();
            const duration = 1400;
            const target = 0.82;
            const easeOut = (t) => 1 - Math.pow(1 - t, 3);
            const tick = (now) => {
                const rawProgress = Math.min((now - start) / duration, 1);
                const progress = easeOut(rawProgress);
                f1El.textContent = (target * progress).toFixed(2);
                if (rawProgress < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }, 1400);
    }
}

// ===== RUN BUTTON RIPPLE ===== //
function initRunBtnRipple() {
    const btn = document.getElementById("processBtn");
    if (!btn) return;

    btn.addEventListener("click", (e) => {
        const rect = btn.getBoundingClientRect();
        const ripple = document.createElement("span");
        ripple.classList.add("ripple");
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + "px";
        ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
        ripple.style.top = (e.clientY - rect.top - size / 2) + "px";
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    });
}

// ===== SPARKLINE RENDERING ===== //
function renderSparkline(containerId, dataPoints, color) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const points = dataPoints || generateRandomSparkData();
    const width = 120;
    const height = 28;
    const max = Math.max(...points);
    const min = Math.min(...points);
    const range = max - min || 1;

    const coords = points.map((val, i) => {
        const x = (i / (points.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 4) - 2;
        return { x, y };
    });

    let pathD = `M${coords[0].x},${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
        const prev = coords[i - 1];
        const curr = coords[i];
        const cpx = (prev.x + curr.x) / 2;
        pathD += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
    }

    const areaD = pathD + ` L${width},${height} L0,${height} Z`;
    const strokeColor = color || "var(--accent)";

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            <defs>
                <linearGradient id="sparkGrad_${containerId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.3" />
                    <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0" />
                </linearGradient>
            </defs>
            <path class="spark-area" d="${areaD}" fill="url(#sparkGrad_${containerId})" />
            <path d="${pathD}" style="stroke: ${strokeColor}" />
        </svg>
    `;
}

function generateRandomSparkData(count = 10) {
    const data = [];
    let val = 30 + Math.random() * 40;
    for (let i = 0; i < count; i++) {
        val += (Math.random() - 0.45) * 15;
        val = Math.max(5, Math.min(95, val));
        data.push(val);
    }
    return data;
}

function renderAllSparklines() {
    renderSparkline("sparkOrders", null, "#6dd7dc");
    renderSparkline("sparkRisk", null, "#FF5555");
    renderSparkline("sparkBefore", null, "#FFB86C");
    renderSparkline("sparkAfter", null, "#50FA7B");
    renderSparkline("sparkImprove", null, "#bd93f9");
}

// ===== RISK HEATMAP BAR ===== //
function updateRiskHeatmap(result) {
    const heatmap = document.getElementById("riskHeatmap");
    if (!heatmap) return;

    const orders = result?.orders || [];
    const total = orders.length || 1;
    const low = orders.filter((o) => o.risk_label === "LOW").length;
    const medium = orders.filter((o) => o.risk_label === "MEDIUM").length;
    const high = orders.filter((o) => o.risk_label === "HIGH").length;

    const segments = heatmap.querySelectorAll(".risk-heatmap__segment");
    if (segments.length >= 3) {
        segments[0].style.width = `${(low / total) * 100}%`;
        segments[1].style.width = `${(medium / total) * 100}%`;
        segments[2].style.width = `${(high / total) * 100}%`;
    }
}

// ===== RISK BADGE HTML ===== //
function getRiskBadgeHtml(label) {
    const normalized = String(label || "").toUpperCase();
    const classMap = { LOW: "risk-badge-low", MEDIUM: "risk-badge-medium", HIGH: "risk-badge-high" };
    const cls = classMap[normalized] || "risk-badge-low";
    return `<span class="risk-badge ${cls}">${escapeHtml(normalized || "-")}</span>`;
}

// ===== PARTICLE BURST ===== //
function createParticleBurst(element) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const container = document.createElement("div");
    container.classList.add("particle-container");
    container.style.left = (rect.left + rect.width / 2) + "px";
    container.style.top = (rect.top + rect.height / 2) + "px";
    document.body.appendChild(container);

    const colors = ["#6dd7dc", "#FFB86C", "#bd93f9", "#50FA7B", "#FF5555"];
    for (let i = 0; i < 12; i++) {
        const particle = document.createElement("div");
        particle.classList.add("particle");
        const angle = (Math.PI * 2 * i) / 12;
        const distance = 30 + Math.random() * 50;
        const px = Math.cos(angle) * distance;
        const py = Math.sin(angle) * distance;
        particle.style.setProperty("--px", px + "px");
        particle.style.setProperty("--py", py + "px");
        particle.style.background = colors[i % colors.length];
        container.appendChild(particle);
    }

    setTimeout(() => container.remove(), 1100);
}

// ===== CHART BLOCK REVEAL ===== //
function revealChartBlocks() {
    const blocks = document.querySelectorAll(".chart-block");
    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.2 }
        );
        blocks.forEach((block) => observer.observe(block));
    } else {
        blocks.forEach((block) => block.classList.add("is-visible"));
    }
}
