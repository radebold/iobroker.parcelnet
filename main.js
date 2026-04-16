"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const utils = __importStar(require("@iobroker/adapter-core"));
const STATUS_TEXT = {
    0: "Zugestellt",
    1: "Eingefroren / keine Updates",
    2: "Unterwegs",
    3: "Zur Abholung bereit",
    4: "In Zustellung",
    5: "Nicht gefunden",
    6: "Zustellversuch fehlgeschlagen",
    7: "Ausnahme / Aufmerksamkeit nötig",
    8: "Elektronisch angekündigt",
};

const CARRIER_META = {
    parcel: { key: "parcel", name: "Parcel", icon: "/adapter/parcelnet/carriers/parcel.svg" },
    dhl: { key: "dhl", name: "DHL", icon: "/adapter/parcelnet/carriers/dhl.svg" },
    hermes: { key: "hermes", name: "Hermes", icon: "/adapter/parcelnet/carriers/hermes.svg" },
    dpd: { key: "dpd", name: "DPD", icon: "/adapter/parcelnet/carriers/dpd.svg" },
    ups: { key: "ups", name: "UPS", icon: "/adapter/parcelnet/carriers/ups.svg" },
    amazon: { key: "amazon", name: "Amazon", icon: "/adapter/parcelnet/carriers/amazon.svg" },
    gls: { key: "gls", name: "GLS", icon: "/adapter/parcelnet/carriers/gls.svg" },
    deutschepost: { key: "deutschepost", name: "Deutsche Post", icon: "/adapter/parcelnet/carriers/deutschepost.svg" },
    fedex: { key: "fedex", name: "FedEx", icon: "/adapter/parcelnet/carriers/fedex.svg" },
};

const CARRIER_ALIASES = {
    dhlde: "dhl",
    dhlparcel: "dhl",
    dhlpaket: "dhl",
    dp: "deutschepost",
    post: "deutschepost",
    deutschepost: "deutschepost",
    germanpost: "deutschepost",
    hermesworld: "hermes",
    myhermes: "hermes",
    dpdde: "dpd",
    dpdgroup: "dpd",
    unitedparcelservice: "ups",
    amazonlogistics: "amazon",
    amazonshipping: "amazon",
    amz: "amazon",
    amzlde: "amazon",
    amzl: "amazon",
    amazonde: "amazon",
    glsgermany: "gls",
};

class ParcelNet extends utils.Adapter {
    pollTimer = null;
    refreshInProgress = false;
    previousCount = 0;
    constructor(options = {}) {
        super({
            ...options,
            name: "parcelnet",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    async onReady() {
        await this.createObjects();
        this.subscribeStates("tools.refreshNow");
        const previousCountState = await this.getStateAsync("deliveries.count");
        this.previousCount = Number(previousCountState?.val || 0);
        await this.setStateAsync("info.connection", { val: false, ack: true });
        await this.setStateAsync("tools.refreshNow", { val: false, ack: true });
        this.normalizeConfig();
        await this.updateDeliveries("startup");
        this.startPolling();
    }
    onUnload(callback) {
        try {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
            callback();
        }
        catch {
            callback();
        }
    }
    async onStateChange(id, state) {
        if (!state || state.ack) {
            return;
        }
        if (id === `${this.namespace}.tools.refreshNow` && Boolean(state.val)) {
            await this.setStateAsync("tools.refreshNow", { val: false, ack: true });
            await this.updateDeliveries("manual");
        }
    }
    normalizeConfig() {
        const rawPollMinutes = Number(this.config.pollIntervalMinutes);
        const rawTimeoutMs = Number(this.config.requestTimeoutMs);
        const rawMaxItems = Number(this.config.maxItemsInHtml);
        if (this.config.filterMode !== "active" && this.config.filterMode !== "recent") {
            this.config.filterMode = "active";
        }
        this.config.pollIntervalMinutes =
            Number.isFinite(rawPollMinutes) && rawPollMinutes >= 3 ? rawPollMinutes : 15;
        this.config.requestTimeoutMs =
            Number.isFinite(rawTimeoutMs) && rawTimeoutMs >= 5000 ? rawTimeoutMs : 15000;
        this.config.maxItemsInHtml =
            Number.isFinite(rawMaxItems) && rawMaxItems >= 1 ? rawMaxItems : 10;
        if (rawPollMinutes < 3) {
            this.log.warn("Parcel erlaubt laut Doku maximal 20 Requests pro Stunde. Das Polling wurde daher auf mindestens 3 Minuten begrenzt.");
        }
    }
    startPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        const intervalMs = Number(this.config.pollIntervalMinutes) * 60 * 1000;
        this.pollTimer = setInterval(() => {
            void this.updateDeliveries("timer");
        }, intervalMs);
        this.log.info(`Nächstes automatisches Polling alle ${this.config.pollIntervalMinutes} Minute(n).`);
    }
    async createObjects() {
        await this.extendObjectAsync("info.lastUpdate", {
            type: "state",
            common: {
                name: "Last successful update",
                type: "string",
                role: "date",
                read: true,
                write: false,
                def: "",
            },
            native: {},
        });
        await this.extendObjectAsync("info.lastUpdateTs", {
            type: "state",
            common: {
                name: "Last successful update timestamp",
                type: "number",
                role: "value.time",
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });
        await this.extendObjectAsync("info.lastSource", {
            type: "state",
            common: {
                name: "Last update source",
                type: "string",
                role: "text",
                read: true,
                write: false,
                def: "",
            },
            native: {},
        });
        await this.extendObjectAsync("info.lastError", {
            type: "state",
            common: {
                name: "Last error",
                type: "string",
                role: "text",
                read: true,
                write: false,
                def: "",
            },
            native: {},
        });
        await this.extendObjectAsync("deliveries", {
            type: "channel",
            common: {
                name: "Deliveries",
            },
            native: {},
        });
        await this.extendObjectAsync("deliveries.count", {
            type: "state",
            common: {
                name: "Anzahl Lieferungen",
                type: "number",
                role: "value",
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });
        await this.extendObjectAsync("deliveries.json", {
            type: "state",
            common: {
                name: "Rohdaten JSON",
                type: "string",
                role: "json",
                read: true,
                write: false,
                def: "[]",
            },
            native: {},
        });
        await this.extendObjectAsync("deliveries.formatted", {
            type: "state",
            common: {
                name: "Formatierte Lieferliste",
                type: "string",
                role: "text",
                read: true,
                write: false,
                def: "",
            },
            native: {},
        });
        await this.extendObjectAsync("deliveries.nextEta", {
            type: "state",
            common: {
                name: "Nächste ETA",
                type: "string",
                role: "text",
                read: true,
                write: false,
                def: "",
            },
            native: {},
        });
        await this.extendObjectAsync("deliveries.arrivingToday", {
            type: "state",
            common: {
                name: "Heute erwartete Lieferungen",
                type: "number",
                role: "value",
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });
        await this.extendObjectAsync("deliveries.list", {
            type: "channel",
            common: {
                name: "Einzellieferungen",
            },
            native: {},
        });
        await this.extendObjectAsync("tools", {
            type: "channel",
            common: {
                name: "Tools",
            },
            native: {},
        });
        await this.extendObjectAsync("tools.refreshNow", {
            type: "state",
            common: {
                name: "Refresh now",
                type: "boolean",
                role: "button",
                read: false,
                write: true,
                def: false,
            },
            native: {},
        });
        await this.extendObjectAsync("vis", {
            type: "channel",
            common: {
                name: "VIS",
            },
            native: {},
        });
        await this.extendObjectAsync("vis.html", {
            type: "state",
            common: {
                name: "VIS HTML",
                type: "string",
                role: "html",
                read: true,
                write: false,
                def: "",
            },
            native: {},
        });
        await this.extendObjectAsync("vis.htmlCompact", {
            type: "state",
            common: {
                name: "VIS HTML compact",
                type: "string",
                role: "html",
                read: true,
                write: false,
                def: "",
            },
            native: {},
        });
    }
    async updateDeliveries(source) {
        if (this.refreshInProgress) {
            this.log.debug(`Refresh (${source}) übersprungen, weil bereits ein Lauf aktiv ist.`);
            return;
        }
        this.refreshInProgress = true;
        try {
            const deliveries = await this.fetchDeliveries();
            const formatted = this.buildFormattedList(deliveries);
            const nextEta = this.getNextEta(deliveries);
            const arrivingToday = this.countArrivingToday(deliveries);
            await this.setStateAsync("deliveries.count", { val: deliveries.length, ack: true });
            await this.setStateAsync("deliveries.json", { val: JSON.stringify(deliveries, null, 2), ack: true });
            await this.setStateAsync("deliveries.formatted", { val: formatted, ack: true });
            await this.setStateAsync("deliveries.nextEta", { val: nextEta, ack: true });
            await this.setStateAsync("deliveries.arrivingToday", { val: arrivingToday, ack: true });
            await this.writeDeliveryChannels(deliveries);
            await this.writeHtml(deliveries);
            const now = new Date();
            await this.setStateAsync("info.connection", { val: true, ack: true });
            await this.setStateAsync("info.lastUpdate", { val: now.toISOString(), ack: true });
            await this.setStateAsync("info.lastUpdateTs", { val: now.getTime(), ack: true });
            await this.setStateAsync("info.lastSource", { val: source, ack: true });
            await this.setStateAsync("info.lastError", { val: "", ack: true });
            if (deliveries.length === 0) {
                this.log.info("Keine aktiven/kürzlichen Lieferungen gefunden.");
            }
            else {
                this.log.info(`${deliveries.length} Lieferung(en) erfolgreich aktualisiert.`);
                if (formatted) {
                    this.log.debug(`Lieferungen:\n${formatted}`);
                }
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.setStateAsync("info.connection", { val: false, ack: true });
            await this.setStateAsync("info.lastError", { val: message, ack: true });
            this.log.error(`Fehler beim Abrufen der Parcel-Daten: ${message}`);
        }
        finally {
            this.refreshInProgress = false;
        }
    }
    async fetchDeliveries() {
        const apiKey = String(this.config.apiKey || "").trim();
        if (!apiKey) {
            throw new Error("Kein Parcel API-Key in der Adapter-Konfiguration hinterlegt.");
        }
        const filterMode = this.config.filterMode === "recent" ? "recent" : "active";
        const url = `https://api.parcel.app/external/deliveries/?filter_mode=${filterMode}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Number(this.config.requestTimeoutMs) || 15000);
        try {
            this.log.debug(`Hole Parcel-Daten von ${url}`);
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "api-key": apiKey,
                    Accept: "application/json",
                },
                signal: controller.signal,
            });
            const text = await response.text();
            if (this.config.logRawResponse) {
                this.log.debug(`RAW Parcel Response: ${text}`);
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${text}`);
            }
            let parsed;
            try {
                parsed = JSON.parse(text);
            }
            catch (error) {
                throw new Error(`JSON-Parse-Fehler: ${error instanceof Error ? error.message : String(error)}`);
            }
            if (Array.isArray(parsed)) {
                return parsed;
            }
            if (!parsed || typeof parsed !== "object") {
                throw new Error("Antwort ist kein gültiges JSON-Objekt.");
            }
            const data = parsed;
            if (data.success === false) {
                throw new Error(data.error_message || "Parcel API meldet success=false.");
            }
            if (!Array.isArray(data.deliveries)) {
                return [];
            }
            return data.deliveries;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    buildFormattedList(deliveries) {
        return deliveries.map((delivery, index) => `${index + 1}. ${this.formatDelivery(delivery)}`).join("\n");
    }
    formatDelivery(delivery) {
        const latestEvent = this.getLatestEvent(delivery);
        const parts = [];
        if (delivery.description) {
            parts.push(delivery.description);
        }
        if (typeof delivery.status_code === "number") {
            parts.push(this.statusText(delivery.status_code));
        }
        if (delivery.carrier_code) {
            parts.push(`Carrier: ${delivery.carrier_code}`);
        }
        if (delivery.tracking_number) {
            parts.push(`Tracking: ${delivery.tracking_number}`);
        }
        const eta = this.formatEta(delivery);
        if (eta) {
            parts.push(`ETA: ${eta}`);
        }
        if (latestEvent?.event) {
            parts.push(`Event: ${latestEvent.event}`);
        }
        if (latestEvent?.location) {
            parts.push(`Ort: ${latestEvent.location}`);
        }
        return parts.filter(Boolean).join(" | ");
    }
    statusText(statusCode) {
        if (typeof statusCode !== "number") {
            return "Unbekannt";
        }
        return `${STATUS_TEXT[statusCode] || "Unbekannter Status"} (${statusCode})`;
    }
    getLatestEvent(delivery) {
        if (!Array.isArray(delivery.events) || delivery.events.length === 0) {
            return null;
        }
        const withDate = [...delivery.events].map((event) => ({
            event,
            ts: Date.parse(event.date || ""),
        }));
        const dated = withDate.filter(entry => Number.isFinite(entry.ts));
        if (dated.length > 0) {
            dated.sort((a, b) => b.ts - a.ts);
            return dated[0].event;
        }
        return delivery.events[0] || null;
    }
    getExpectedTimestamp(delivery) {
        if (typeof delivery.timestamp_expected === "number" && Number.isFinite(delivery.timestamp_expected)) {
            return delivery.timestamp_expected < 1_000_000_000_000
                ? delivery.timestamp_expected * 1000
                : delivery.timestamp_expected;
        }
        if (delivery.date_expected) {
            const parsed = Date.parse(delivery.date_expected);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return null;
    }
    formatEta(delivery) {
        const ts = this.getExpectedTimestamp(delivery);
        if (ts) {
            return new Date(ts).toLocaleString("de-DE");
        }
        return delivery.date_expected || "";
    }
    getNextEta(deliveries) {
        const timestamps = deliveries
            .map(delivery => this.getExpectedTimestamp(delivery))
            .filter((value) => typeof value === "number" && Number.isFinite(value))
            .sort((a, b) => a - b);
        return timestamps.length > 0 ? new Date(timestamps[0]).toLocaleString("de-DE") : "";
    }
    countArrivingToday(deliveries) {
        const today = new Date();
        const y = today.getFullYear();
        const m = today.getMonth();
        const d = today.getDate();
        return deliveries.filter(delivery => {
            const ts = this.getExpectedTimestamp(delivery);
            if (!ts) {
                return false;
            }
            const eta = new Date(ts);
            return eta.getFullYear() === y && eta.getMonth() === m && eta.getDate() === d;
        }).length;
    }
    async writeDeliveryChannels(deliveries) {
        for (let index = 0; index < deliveries.length; index++) {
            const slot = String(index + 1).padStart(2, "0");
            const base = `deliveries.list.${slot}`;
            const delivery = deliveries[index];
            const latestEvent = this.getLatestEvent(delivery);
            await this.ensureDeliveryChannel(base);
            await this.setStateAsync(`${base}.active`, { val: true, ack: true });
            await this.setStateAsync(`${base}.description`, { val: String(delivery.description || ""), ack: true });
            await this.setStateAsync(`${base}.carrierCode`, { val: String(delivery.carrier_code || ""), ack: true });
            await this.setStateAsync(`${base}.trackingNumber`, {
                val: String(delivery.tracking_number || ""),
                ack: true,
            });
            await this.setStateAsync(`${base}.statusCode`, {
                val: typeof delivery.status_code === "number" ? delivery.status_code : -1,
                ack: true,
            });
            await this.setStateAsync(`${base}.statusText`, {
                val: this.statusText(delivery.status_code),
                ack: true,
            });
            await this.setStateAsync(`${base}.eta`, { val: this.formatEta(delivery), ack: true });
            await this.setStateAsync(`${base}.etaRaw`, { val: String(delivery.date_expected || ""), ack: true });
            await this.setStateAsync(`${base}.event`, { val: String(latestEvent?.event || ""), ack: true });
            await this.setStateAsync(`${base}.eventDate`, { val: String(latestEvent?.date || ""), ack: true });
            await this.setStateAsync(`${base}.eventLocation`, {
                val: String(latestEvent?.location || ""),
                ack: true,
            });
            await this.setStateAsync(`${base}.eventAdditional`, {
                val: String(latestEvent?.additional || ""),
                ack: true,
            });
            await this.setStateAsync(`${base}.json`, { val: JSON.stringify(delivery, null, 2), ack: true });
        }
        for (let index = deliveries.length; index < this.previousCount; index++) {
            const slot = String(index + 1).padStart(2, "0");
            const base = `deliveries.list.${slot}`;
            await this.ensureDeliveryChannel(base);
            await this.setStateAsync(`${base}.active`, { val: false, ack: true });
            await this.setStateAsync(`${base}.description`, { val: "", ack: true });
            await this.setStateAsync(`${base}.carrierCode`, { val: "", ack: true });
            await this.setStateAsync(`${base}.trackingNumber`, { val: "", ack: true });
            await this.setStateAsync(`${base}.statusCode`, { val: -1, ack: true });
            await this.setStateAsync(`${base}.statusText`, { val: "", ack: true });
            await this.setStateAsync(`${base}.eta`, { val: "", ack: true });
            await this.setStateAsync(`${base}.etaRaw`, { val: "", ack: true });
            await this.setStateAsync(`${base}.event`, { val: "", ack: true });
            await this.setStateAsync(`${base}.eventDate`, { val: "", ack: true });
            await this.setStateAsync(`${base}.eventLocation`, { val: "", ack: true });
            await this.setStateAsync(`${base}.eventAdditional`, { val: "", ack: true });
            await this.setStateAsync(`${base}.json`, { val: "", ack: true });
        }
        this.previousCount = deliveries.length;
    }
    async ensureDeliveryChannel(base) {
        await this.extendObjectAsync(base, {
            type: "channel",
            common: {
                name: base.split(".").pop() || base,
            },
            native: {},
        });
        const states = [
            { id: "active", type: "boolean", role: "indicator", def: false },
            { id: "description", type: "string", role: "text", def: "" },
            { id: "carrierCode", type: "string", role: "text", def: "" },
            { id: "trackingNumber", type: "string", role: "text", def: "" },
            { id: "statusCode", type: "number", role: "value", def: -1 },
            { id: "statusText", type: "string", role: "text", def: "" },
            { id: "eta", type: "string", role: "text", def: "" },
            { id: "etaRaw", type: "string", role: "text", def: "" },
            { id: "event", type: "string", role: "text", def: "" },
            { id: "eventDate", type: "string", role: "text", def: "" },
            { id: "eventLocation", type: "string", role: "text", def: "" },
            { id: "eventAdditional", type: "string", role: "text", def: "" },
            { id: "json", type: "string", role: "json", def: "" }
        ];
        for (const state of states) {
            await this.extendObjectAsync(`${base}.${state.id}`, {
                type: "state",
                common: {
                    name: state.id,
                    type: state.type,
                    role: state.role,
                    read: true,
                    write: false,
                    def: state.def,
                },
                native: {},
            });
        }
    }
    async writeHtml(deliveries) {
        const normal = this.renderHtml(deliveries, false);
        const compact = this.renderHtml(deliveries, true);
        await this.setStateAsync("vis.html", { val: normal, ack: true });
        await this.setStateAsync("vis.htmlCompact", { val: compact, ack: true });
    }

    getCarrierMeta(delivery) {
        const code = String(delivery?.carrier_code || "").toLowerCase().trim();
        if (["amzlde", "amzl", "amazonde", "amazon", "amazon-logistics"].includes(code)) return { key: "amazon", name: "Amazon" };
        if (code.includes("dhl")) return { key: "dhl", name: "DHL" };
        if (code.includes("hermes")) return { key: "hermes", name: "Hermes" };
        if (code.includes("dpd")) return { key: "dpd", name: "DPD" };
        if (code.includes("ups")) return { key: "ups", name: "UPS" };
        if (code.includes("gls")) return { key: "gls", name: "GLS" };
        if (code.includes("fedex")) return { key: "fedex", name: "FedEx" };
        if (code.includes("post")) return { key: "deutschepost", name: "Deutsche Post" };
        return { key: code || "parcel", name: code || "Parcel" };
    }

    getCarrierIcon(delivery) {
        const carrier = this.getCarrierMeta(delivery);
        const configured = String(this.config?.[`carrierLogo_${carrier.key}`] || "").trim();
        if (configured) return configured;
        return `/adapter/parcelnet/carriers/${carrier.key}.svg`;
    }


    statusColor(code) {
        switch (code) {
            case 0:
                return "#16a34a";
            case 1:
            case 2:
            case 3:
                return "#3b82f6";
            case 4:
                return "#f97316";
            case 5:
                return "#7c3aed";
            case 6:
            case 7:
                return "#ef4444";
            case 8:
                return "#14b8a6";
            default:
                return "#64748b";
        }
    }

    renderHtml(deliveries, compact) {
        const maxItems = Math.max(1, Number(this.config.maxItemsInHtml) || 10);
        const showTracking = Boolean(this.config.showTrackingNumberInHtml);
        const items = deliveries.slice(0, maxItems);

        const cardPadding = compact ? "8px 10px" : "12px 14px";
        const titleSize = compact ? "14px" : "16px";
        const textSize = compact ? "11px" : "13px";
        const gap = compact ? "8px" : "10px";
        const iconSize = compact ? 38 : 52;

        const rows = items.length === 0
            ? `<div style="padding:${cardPadding};border-radius:12px;background:#1f2937;color:#fff;">Keine Lieferungen vorhanden</div>`
            : items.map((delivery) => {
                const latestEvent = this.getLatestEvent(delivery);
                const statusCode = typeof delivery.status_code === "number" ? delivery.status_code : -1;
                const statusText = this.statusText(delivery.status_code).replace(/\s*\(\d+\)$/, "");
                const eta = this.formatEta(delivery);
                const badgeColor = this.statusColor(statusCode);
                const carrier = this.getCarrierMeta(delivery);
                const icon = this.getCarrierIcon(delivery);

                return `
<div style="padding:${cardPadding};border-radius:14px;background:#1f2937;color:#fff;border:1px solid rgba(255,255,255,.08);box-shadow:0 2px 10px rgba(0,0,0,.15);">
  <div style="display:grid;grid-template-columns:${iconSize}px minmax(0,1fr) auto;gap:${compact ? "8px" : "10px"};align-items:start;">
    <div style="width:${iconSize}px;height:${iconSize}px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:rgba(255,255,255,.96);border-radius:${compact ? "10px" : "14px"};padding:${compact ? "4px" : "6px"};box-shadow:0 1px 4px rgba(0,0,0,.18);">
      <img src="${this.escapeHtml(icon)}" alt="${this.escapeHtml(carrier.name)}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;background:transparent;"/>
    </div>
    <div style="min-width:0;padding-left:${compact ? "4px" : "0"};">
      <div style="font-size:${titleSize};font-weight:700;line-height:${compact ? "1.1" : "1.3"};white-space:normal;word-break:break-word;">${this.escapeHtml(String(delivery.description || "Unbenannte Lieferung"))}</div>
      <div style="margin-top:${compact ? "1px" : "6px"};font-size:${textSize};opacity:.92;line-height:1.45;">
        <div>Carrier: <b>${this.escapeHtml(carrier.name)}</b></div>
        ${showTracking ? `<div>Tracking: <b>${this.escapeHtml(String(delivery.tracking_number || "-"))}</b></div>` : ""}
        ${eta ? `<div>ETA: <b>${this.escapeHtml(eta)}</b></div>` : ""}
        ${latestEvent?.event ? `<div>Letztes Event: <b>${this.escapeHtml(latestEvent.event)}</b></div>` : ""}
        ${latestEvent?.location && !compact ? `<div>Ort: <b>${this.escapeHtml(latestEvent.location)}</b></div>` : ""}
      </div>
    </div>
    <div style="font-size:${compact ? "11px" : textSize};padding:${compact ? "4px 8px" : "3px 8px"};border-radius:999px;background:${badgeColor};white-space:nowrap;align-self:start;">${this.escapeHtml(statusText)}</div>
  </div>
</div>`;
            }).join("");

        return `
<div style="font-family:Arial,sans-serif;background:#111827;color:#fff;padding:${compact ? "10px" : "14px"};border-radius:16px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
    <div style="font-size:${compact ? "18px" : "20px"};font-weight:700;">Parcel Lieferungen</div>
    <div style="font-size:${textSize};opacity:.9;">${deliveries.length} aktiv</div>
  </div>
  <div style="display:flex;flex-direction:column;gap:${gap};">
    ${rows}
  </div>
</div>`;
    }
    escapeHtml(input) {
        return input
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
}
if (require.main !== module) {
    module.exports = (options) => new ParcelNet(options);
}
else {
    (() => new ParcelNet())();
}
//# sourceMappingURL=main.js.map