import * as utils from "@iobroker/adapter-core";

type FilterMode = "active" | "recent";

interface ParcelEvent {
    event: string;
    date: string;
    location?: string;
    additional?: string;
}

interface ParcelDelivery {
    id?: string | number;
    carrier_code?: string;
    carrier?: string;
    carrier_name?: string;
    provider?: string;
    description?: string;
    status_code?: number;
    tracking_number?: string;
    extra_information?: string;
    date_expected?: string;
    date_expected_end?: string;
    timestamp_expected?: number;
    timestamp_expected_end?: number;
    events?: ParcelEvent[];
    tracking?: {
        carrier?: string;
    };
    [key: string]: unknown;
}

interface ParcelApiResponse {
    success?: boolean;
    error_message?: string;
    deliveries?: ParcelDelivery[];
    [key: string]: unknown;
}

interface CarrierMeta {
    key: string;
    name: string;
    icon: string;
}

interface JsonRow {
    pos: number;
    id: string | number;
    name: string;
    title: string;
    provider: string;
    providerCode: string;
    carrier: string;
    carrierCode: string;
    trackingNumber: string;
    statusCode: number;
    statusText: string;
    eta: string;
    etaTs: number;
    event: string;
    eventDate: string;
    eventLocation: string;
    eventAdditional: string;
    isInDelivery: boolean;
    isDelivered: boolean;
}

const STATUS_TEXT: Record<number, string> = {
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

const CARRIER_META: Record<string, CarrierMeta> = {
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

const CARRIER_ALIASES: Record<string, string> = {
    dhlde: "dhl",
    dhlparcel: "dhl",
    dhlpaket: "dhl",
    hermesworld: "hermes",
    myhermes: "hermes",
    dpdde: "dpd",
    dpdgroup: "dpd",
    unitedparcelservice: "ups",
    amazonlogistics: "amazon",
    amazonshipping: "amazon",
    amz: "amazon",
    glsgermany: "gls",
    deutschepost: "deutschepost",
    post: "deutschepost",
    germanpost: "deutschepost",
};

class ParcelNet extends utils.Adapter {
    private pollTimer: any = null;
    private refreshInProgress = false;
    private previousCount = 0;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: "parcelnet",
        });

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
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

    private onUnload(callback: () => void): void {
        try {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
            callback();
        } catch {
            callback();
        }
    }

    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state || state.ack) {
            return;
        }

        if (id === `${this.namespace}.tools.refreshNow` && Boolean(state.val)) {
            await this.setStateAsync("tools.refreshNow", { val: false, ack: true });
            await this.updateDeliveries("manual");
        }
    }

    private normalizeConfig(): void {
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
            this.log.warn(
                "Parcel erlaubt laut Doku maximal 20 Requests pro Stunde. Das Polling wurde daher auf mindestens 3 Minuten begrenzt.",
            );
        }
    }

    private startPolling(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }

        const intervalMs = Number(this.config.pollIntervalMinutes) * 60 * 1000;
        this.pollTimer = setInterval(() => {
            void this.updateDeliveries("timer");
        }, intervalMs);

        this.log.info(`Nächstes automatisches Polling alle ${this.config.pollIntervalMinutes} Minute(n).`);
    }

    private async createObjects(): Promise<void> {
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

        await this.extendObjectAsync("allProviderJson", {
            type: "state",
            common: {
                name: "JSON für VIS json-Widget (alle Lieferungen)",
                type: "string",
                role: "json",
                read: true,
                write: false,
                def: "[]",
            },
            native: {},
        });

        await this.extendObjectAsync("inDelivery", {
            type: "state",
            common: {
                name: "JSON für VIS json-Widget (in Zustellung)",
                type: "string",
                role: "json",
                read: true,
                write: false,
                def: "[]",
            },
            native: {},
        });

        await this.extendObjectAsync("inDeliveryCount", {
            type: "state",
            common: {
                name: "Anzahl Lieferungen in Zustellung",
                type: "number",
                role: "value",
                read: true,
                write: false,
                def: 0,
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

    private async updateDeliveries(source: string): Promise<void> {
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
            const jsonRows = this.buildJsonRows(deliveries);
            const inDeliveryRows = jsonRows.filter(row => row.isInDelivery);

            await this.setStateAsync("deliveries.count", { val: deliveries.length, ack: true });
            await this.setStateAsync("deliveries.json", { val: JSON.stringify(deliveries, null, 2), ack: true });
            await this.setStateAsync("deliveries.formatted", { val: formatted, ack: true });
            await this.setStateAsync("deliveries.nextEta", { val: nextEta, ack: true });
            await this.setStateAsync("deliveries.arrivingToday", { val: arrivingToday, ack: true });
            await this.setStateAsync("allProviderJson", { val: JSON.stringify(jsonRows), ack: true });
            await this.setStateAsync("inDelivery", { val: JSON.stringify(inDeliveryRows), ack: true });
            await this.setStateAsync("inDeliveryCount", { val: inDeliveryRows.length, ack: true });

            await this.writeDeliveryChannels(deliveries);
            await this.writeHtml(deliveries);

            const now = new Date();
            await this.setStateAsync("info.connection", { val: true, ack: true });
            await this.setStateAsync("info.lastUpdate", { val: now.toISOString(), ack: true });
            await this.setStateAsync("info.lastUpdateTs", { val: now.getTime(), ack: true });
            await this.setStateAsync("info.lastSource", { val: source, ack: true });
            await this.setStateAsync("info.lastError", { val: "", ack: true });

            if (deliveries.length === 0) {
                this.log.info("Keine aktiven/kürzlichen Lieferungen gefunden. VIS zeigt Demo-Carrier an.");
            } else {
                this.log.info(`${deliveries.length} Lieferung(en) erfolgreich aktualisiert.`);
                if (formatted) {
                    this.log.debug(`Lieferungen:\n${formatted}`);
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.setStateAsync("info.connection", { val: false, ack: true });
            await this.setStateAsync("info.lastError", { val: message, ack: true });
            this.log.error(`Fehler beim Abrufen der Parcel-Daten: ${message}`);
        } finally {
            this.refreshInProgress = false;
        }
    }

    private async fetchDeliveries(): Promise<ParcelDelivery[]> {
        const apiKey = String(this.config.apiKey || "").trim();
        if (!apiKey) {
            throw new Error("Kein Parcel API-Key in der Adapter-Konfiguration hinterlegt.");
        }

        const filterMode: FilterMode = this.config.filterMode === "recent" ? "recent" : "active";
        const url = `https://api.parcel.app/external/deliveries/?filter_mode=${filterMode}`;

        const controller = new AbortController();
        const timeout: any = setTimeout(() => controller.abort(), Number(this.config.requestTimeoutMs) || 15000);

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

            let parsed: ParcelApiResponse | ParcelDelivery[] | unknown;
            try {
                parsed = JSON.parse(text);
            } catch (error) {
                throw new Error(
                    `JSON-Parse-Fehler: ${error instanceof Error ? error.message : String(error)}`,
                );
            }

            if (Array.isArray(parsed)) {
                return parsed as ParcelDelivery[];
            }

            if (!parsed || typeof parsed !== "object") {
                throw new Error("Antwort ist kein gültiges JSON-Objekt.");
            }

            const data = parsed as ParcelApiResponse;
            if (data.success === false) {
                throw new Error(data.error_message || "Parcel API meldet success=false.");
            }

            if (!Array.isArray(data.deliveries)) {
                return [];
            }

            return data.deliveries;
        } finally {
            clearTimeout(timeout);
        }
    }

    private normalizeCarrierKey(input: unknown): string {
        const normalized = String(input || "")
            .toLowerCase()
            .replace(/ä/g, "ae")
            .replace(/ö/g, "oe")
            .replace(/ü/g, "ue")
            .replace(/ß/g, "ss")
            .replace(/[^a-z0-9]/g, "");

        return CARRIER_ALIASES[normalized] || normalized;
    }

    private getConfiguredCarrierIcon(key: string, fallback: string): string {
        const map: Record<string, string> = {
            dhl: String(this.config.iconDhl || "").trim(),
            hermes: String(this.config.iconHermes || "").trim(),
            dpd: String(this.config.iconDpd || "").trim(),
            ups: String(this.config.iconUps || "").trim(),
            amazon: String(this.config.iconAmazon || "").trim(),
            gls: String(this.config.iconGls || "").trim(),
            deutschepost: String(this.config.iconDeutschePost || "").trim(),
            fedex: String(this.config.iconFedex || "").trim(),
            parcel: String(this.config.iconParcel || "").trim(),
        };

        return map[key] || fallback;
    }

    private getCarrierMeta(delivery: ParcelDelivery): CarrierMeta {
        const candidates = [
            delivery?.carrier_code,
            delivery?.carrier,
            delivery?.provider,
            delivery?.carrier_name,
            delivery?.tracking?.carrier,
        ];

        for (const candidate of candidates) {
            const key = this.normalizeCarrierKey(candidate);
            if (key && CARRIER_META[key]) {
                const meta = CARRIER_META[key];
                return { ...meta, icon: this.getConfiguredCarrierIcon(meta.key, meta.icon) };
            }
        }

        const meta = CARRIER_META.parcel;
        return { ...meta, icon: this.getConfiguredCarrierIcon(meta.key, meta.icon) };
    }

    private buildJsonRows(deliveries: ParcelDelivery[]): JsonRow[] {
        return deliveries.map((delivery, index) => {
            const latestEvent = this.getLatestEvent(delivery);
            const carrier = this.getCarrierMeta(delivery);
            const etaTs = this.getExpectedTimestamp(delivery);
            const statusCode = typeof delivery.status_code === "number" ? delivery.status_code : -1;

            return {
                pos: index + 1,
                id: delivery?.id || "",
                name: delivery?.description || "",
                title: delivery?.description || "",
                provider: carrier.name,
                providerCode: carrier.key,
                carrier: carrier.name,
                carrierCode: String(delivery?.carrier_code || carrier.key || ""),
                trackingNumber: String(delivery?.tracking_number || ""),
                statusCode,
                statusText: this.statusText(delivery?.status_code),
                eta: this.formatEta(delivery),
                etaTs: etaTs || 0,
                event: String(latestEvent?.event || ""),
                eventDate: String(latestEvent?.date || ""),
                eventLocation: String(latestEvent?.location || ""),
                eventAdditional: String(latestEvent?.additional || ""),
                isInDelivery: statusCode === 4,
                isDelivered: statusCode === 0,
            };
        });
    }

    private buildFormattedList(deliveries: ParcelDelivery[]): string {
        return deliveries.map((delivery, index) => `${index + 1}. ${this.formatDelivery(delivery)}`).join("\n");
    }

    private formatDelivery(delivery: ParcelDelivery): string {
        const parts: string[] = [];

        if (delivery.description) {
            parts.push(delivery.description);
        }

        if (typeof delivery.status_code === "number") {
            parts.push(this.statusText(delivery.status_code));
        }

        const carrier = this.getCarrierMeta(delivery);
        if (carrier?.name) {
            parts.push(`Carrier: ${carrier.name}`);
        }

        if (delivery.tracking_number) {
            parts.push(`Tracking: ${delivery.tracking_number}`);
        }

        const planned = this.formatExpectedWindow(delivery);
        if (planned) {
            parts.push(`Geplant: ${planned}`);
        }

        const additional = this.getAdditionalInfo(delivery);
        if (additional) {
            parts.push(`Info: ${additional}`);
        }

        return parts.filter(Boolean).join(" | ");
    }

    private statusText(statusCode?: number): string {
        if (typeof statusCode !== "number") {
            return "Unbekannt";
        }
        return `${STATUS_TEXT[statusCode] || "Unbekannter Status"} (${statusCode})`;
    }

    private getLatestEvent(delivery: ParcelDelivery): ParcelEvent | null {
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

    private getExpectedTimestamp(delivery: ParcelDelivery): number | null {
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

    private formatEta(delivery: ParcelDelivery): string {
        const ts = this.getExpectedTimestamp(delivery);
        if (ts) {
            return new Date(ts).toLocaleString("de-DE");
        }

        return delivery.date_expected || "";
    }

    private getExpectedEndTimestamp(delivery: ParcelDelivery): number | null {
        if (typeof delivery.timestamp_expected_end === "number" && Number.isFinite(delivery.timestamp_expected_end)) {
            return delivery.timestamp_expected_end < 1_000_000_000_000
                ? delivery.timestamp_expected_end * 1000
                : delivery.timestamp_expected_end;
        }

        if (delivery.date_expected_end) {
            const parsed = Date.parse(delivery.date_expected_end);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        return null;
    }

    private formatExpectedWindow(delivery: ParcelDelivery): string {
        const startTs = this.getExpectedTimestamp(delivery);
        const endTs = this.getExpectedEndTimestamp(delivery);

        if (startTs && endTs) {
            const start = new Date(startTs);
            const end = new Date(endTs);
            const sameDay = start.toLocaleDateString("de-DE") === end.toLocaleDateString("de-DE");
            if (sameDay) {
                return `${start.toLocaleDateString("de-DE")}, ${start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
            }
            return `${start.toLocaleString("de-DE")} - ${end.toLocaleString("de-DE")}`;
        }

        return this.formatEta(delivery);
    }

    private getAdditionalInfo(delivery: ParcelDelivery): string {
        const latestEvent = this.getLatestEvent(delivery);
        const candidates = [
            latestEvent?.additional,
            typeof delivery.extra_information === "string" ? delivery.extra_information : "",
            latestEvent?.event,
        ];

        for (const candidate of candidates) {
            const text = String(candidate || "").trim();
            if (text) {
                return text;
            }
        }

        return "";
    }

    private statusLabel(statusCode?: number): string {
        if (typeof statusCode !== "number") {
            return "Unbekannt";
        }
        return STATUS_TEXT[statusCode] || "Unbekannter Status";
    }

    private getNextEta(deliveries: ParcelDelivery[]): string {
        const timestamps = deliveries
            .map(delivery => this.getExpectedTimestamp(delivery))
            .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
            .sort((a, b) => a - b);

        return timestamps.length > 0 ? new Date(timestamps[0]).toLocaleString("de-DE") : "";
    }

    private countArrivingToday(deliveries: ParcelDelivery[]): number {
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

    private async writeDeliveryChannels(deliveries: ParcelDelivery[]): Promise<void> {
        for (let index = 0; index < deliveries.length; index++) {
            const slot = String(index + 1).padStart(2, "0");
            const base = `deliveries.list.${slot}`;
            const delivery = deliveries[index];
            const latestEvent = this.getLatestEvent(delivery);
            const carrier = this.getCarrierMeta(delivery);

            await this.ensureDeliveryChannel(base);

            await this.setStateAsync(`${base}.active`, { val: true, ack: true });
            await this.setStateAsync(`${base}.description`, { val: String(delivery.description || ""), ack: true });
            await this.setStateAsync(`${base}.carrierName`, { val: String(carrier.name || ""), ack: true });
            await this.setStateAsync(`${base}.carrierCode`, { val: String(delivery.carrier_code || carrier.key || ""), ack: true });
            await this.setStateAsync(`${base}.carrierIcon`, { val: String(carrier.icon || ""), ack: true });
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
            await this.setStateAsync(`${base}.etaEndRaw`, { val: String(delivery.date_expected_end || ""), ack: true });
            await this.setStateAsync(`${base}.expectedWindow`, { val: this.formatExpectedWindow(delivery), ack: true });
            await this.setStateAsync(`${base}.additionalInfo`, { val: this.getAdditionalInfo(delivery), ack: true });
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
            await this.setStateAsync(`${base}.carrierName`, { val: "", ack: true });
            await this.setStateAsync(`${base}.carrierCode`, { val: "", ack: true });
            await this.setStateAsync(`${base}.carrierIcon`, { val: "", ack: true });
            await this.setStateAsync(`${base}.trackingNumber`, { val: "", ack: true });
            await this.setStateAsync(`${base}.statusCode`, { val: -1, ack: true });
            await this.setStateAsync(`${base}.statusText`, { val: "", ack: true });
            await this.setStateAsync(`${base}.eta`, { val: "", ack: true });
            await this.setStateAsync(`${base}.etaRaw`, { val: "", ack: true });
            await this.setStateAsync(`${base}.etaEndRaw`, { val: "", ack: true });
            await this.setStateAsync(`${base}.expectedWindow`, { val: "", ack: true });
            await this.setStateAsync(`${base}.additionalInfo`, { val: "", ack: true });
            await this.setStateAsync(`${base}.event`, { val: "", ack: true });
            await this.setStateAsync(`${base}.eventDate`, { val: "", ack: true });
            await this.setStateAsync(`${base}.eventLocation`, { val: "", ack: true });
            await this.setStateAsync(`${base}.eventAdditional`, { val: "", ack: true });
            await this.setStateAsync(`${base}.json`, { val: "", ack: true });
        }

        this.previousCount = deliveries.length;
    }

    private async ensureDeliveryChannel(base: string): Promise<void> {
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
            { id: "carrierName", type: "string", role: "text", def: "" },
            { id: "carrierCode", type: "string", role: "text", def: "" },
            { id: "carrierIcon", type: "string", role: "text", def: "" },
            { id: "trackingNumber", type: "string", role: "text", def: "" },
            { id: "statusCode", type: "number", role: "value", def: -1 },
            { id: "statusText", type: "string", role: "text", def: "" },
            { id: "eta", type: "string", role: "text", def: "" },
            { id: "etaRaw", type: "string", role: "text", def: "" },
            { id: "etaEndRaw", type: "string", role: "text", def: "" },
            { id: "expectedWindow", type: "string", role: "text", def: "" },
            { id: "additionalInfo", type: "string", role: "text", def: "" },
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

    private async writeHtml(deliveries: ParcelDelivery[]): Promise<void> {
        const normal = this.renderHtml(deliveries, false);
        const compact = this.renderHtml(deliveries, true);

        await this.setStateAsync("vis.html", { val: normal, ack: true });
        await this.setStateAsync("vis.htmlCompact", { val: compact, ack: true });
    }

    private getDummyDeliveries(): ParcelDelivery[] {
        return [
            { carrier_code: "dhl", description: "Demo DHL Sendung", status_code: 2, tracking_number: "DHL-DEMO-001", date_expected: new Date(Date.now() + 86400000).toISOString(), date_expected_end: new Date(Date.now() + 86400000 + 4 * 3600000).toISOString(), extra_information: "Voraussichtliche Zustellung morgen zwischen 10:00 und 14:00 Uhr", events: [{ event: "Unterwegs", date: new Date().toISOString(), additional: "Voraussichtliche Zustellung morgen zwischen 10:00 und 14:00 Uhr" }] },
            { carrier_code: "hermes", description: "Demo Hermes Sendung", status_code: 4, tracking_number: "HERMES-DEMO-001", date_expected: new Date(Date.now() + 3600000 * 6).toISOString(), date_expected_end: new Date(Date.now() + 3600000 * 10).toISOString(), extra_information: "Heute in Zustellung", events: [{ event: "In Zustellung", date: new Date().toISOString(), additional: "Zustellung heute 14:00–18:00 Uhr" }] },
            { carrier_code: "dpd", description: "Demo DPD Sendung", status_code: 3, tracking_number: "DPD-DEMO-001", date_expected: new Date(Date.now() + 86400000 * 2).toISOString(), extra_information: "Ab morgen im Pickup Paketshop", events: [{ event: "Zur Abholung bereit", date: new Date().toISOString(), additional: "Ab morgen im Pickup Paketshop" }] },
            { carrier_code: "ups", description: "Demo UPS Sendung", status_code: 2, tracking_number: "UPS-DEMO-001", date_expected: new Date(Date.now() + 86400000).toISOString(), date_expected_end: new Date(Date.now() + 86400000 + 2 * 3600000).toISOString(), extra_information: "Geplante Lieferung bis 12:00 Uhr", events: [{ event: "Unterwegs", date: new Date().toISOString(), additional: "Geplante Lieferung bis 12:00 Uhr" }] },
            { carrier_code: "amazon", description: "Demo Amazon Sendung", status_code: 4, tracking_number: "AMZ-DEMO-001", date_expected: new Date(Date.now() + 3600000 * 3).toISOString(), extra_information: "Noch 3 Stopps entfernt", events: [{ event: "In Zustellung", date: new Date().toISOString(), additional: "Noch 3 Stopps entfernt" }] },
            { carrier_code: "gls", description: "Demo GLS Sendung", status_code: 2, tracking_number: "GLS-DEMO-001", date_expected: new Date(Date.now() + 86400000 * 3).toISOString(), extra_information: "Lieferung in 2–3 Werktagen", events: [{ event: "Unterwegs", date: new Date().toISOString(), additional: "Lieferung in 2–3 Werktagen" }] },
            { carrier_code: "deutschepost", description: "Demo Deutsche Post Sendung", status_code: 8, tracking_number: "POST-DEMO-001", date_expected: new Date(Date.now() + 86400000).toISOString(), extra_information: "Sendung elektronisch angekündigt", events: [{ event: "Elektronisch angekündigt", date: new Date().toISOString(), additional: "Sendung elektronisch angekündigt" }] },
            { carrier_code: "fedex", description: "Demo FedEx Sendung", status_code: 2, tracking_number: "FEDEX-DEMO-001", date_expected: new Date(Date.now() + 86400000 * 4).toISOString(), extra_information: "Internationaler Versand", events: [{ event: "Unterwegs", date: new Date().toISOString(), additional: "Internationaler Versand" }] },
        ];
    }

    private renderHtml(deliveries: ParcelDelivery[], compact: boolean): string {

        const maxItems = Math.max(1, Number(this.config.maxItemsInHtml) || 10);
        const showTracking = Boolean(this.config.showTrackingNumberInHtml);
        const useDummies = deliveries.length === 0;
        const items = (useDummies ? this.getDummyDeliveries() : deliveries).slice(0, maxItems);

        const containerPadding = compact ? "6px" : "8px";
        const cardPadding = compact ? "8px 10px" : "10px 12px";
        const titleSize = compact ? "14px" : "16px";
        const textSize = compact ? "11px" : "13px";
        const metaSize = compact ? "10px" : "11px";
        const gap = compact ? "6px" : "8px";
        const iconSize = compact ? 68 : 84;
        const badgePad = compact ? "3px 8px" : "4px 10px";
        const chipFont = compact ? "10px" : "11px";

        const rows = items.map((delivery) => {
            const planned = this.formatExpectedWindow(delivery);
            const additional = this.getAdditionalInfo(delivery);
            const statusCode = typeof delivery.status_code === "number" ? delivery.status_code : -1;
            const statusLabel = this.statusLabel(delivery.status_code);
            const badgeColor = this.statusColor(statusCode);
            const carrier = this.getCarrierMeta(delivery);

            const chips: string[] = [];
            if (showTracking && delivery.tracking_number) {
                chips.push(`<div style="padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.08);font-size:${chipFont};line-height:1.2;">Tracking: <b>${this.escapeHtml(String(delivery.tracking_number))}</b></div>`);
            }
            chips.push(`<div style="padding:4px 8px;border-radius:999px;background:${badgeColor};font-size:${chipFont};line-height:1.2;color:#fff;">${this.escapeHtml(statusLabel)}</div>`);
            if (carrier.name) {
                chips.push(`<div style="padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.08);font-size:${chipFont};line-height:1.2;">${this.escapeHtml(carrier.name)}</div>`);
            }

            return `
<div style="padding:${cardPadding};border-radius:14px;background:rgba(255,255,255,.04);color:#fff;border:1px solid rgba(255,255,255,.10);box-sizing:border-box;">
  <div style="display:grid;grid-template-columns:${iconSize}px minmax(0,1fr);gap:${gap};align-items:start;">
    <div style="width:${iconSize}px;height:${iconSize}px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
      <img src="${this.escapeHtml(carrier.icon)}" alt="${this.escapeHtml(carrier.name)}" style="width:100%;height:100%;object-fit:contain;display:block;background:transparent;" />
    </div>
    <div style="min-width:0;display:grid;gap:6px;">
      <div style="font-size:${titleSize};font-weight:700;line-height:1.2;word-break:break-word;">${this.escapeHtml(String(delivery.description || "Unbenannte Lieferung"))}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">${chips.join("")}</div>
      ${planned ? `<div style="font-size:${textSize};line-height:1.35;"><span style="opacity:.72;">Geplante Lieferung:</span> <b>${this.escapeHtml(planned)}</b></div>` : ""}
      ${additional ? `<div style="font-size:${textSize};line-height:1.35;"><span style="opacity:.72;">Zusatzinfo:</span> <b>${this.escapeHtml(additional)}</b></div>` : ""}
    </div>
  </div>
</div>`;
        }).join("");

        const subtitle = useDummies
            ? `Keine aktiven Sendungen · Demoansicht mit ${items.length} Carriern`
            : `${deliveries.length} aktive Sendung${deliveries.length === 1 ? "" : "en"}`;

        const infoBanner = useDummies
            ? `<div style="margin-bottom:${gap};padding:${compact ? "6px 8px" : "8px 10px"};border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:${textSize};opacity:.92;line-height:1.25;">Aktuell liefert die Parcel-API keine Sendungen. Zur VIS-Vorschau werden Demo-Carrier eingeblendet.</div>`
            : "";

        return `
<div style="font-family:Arial,sans-serif;background:transparent;color:#fff;padding:${containerPadding};box-sizing:border-box;height:100%;min-height:100%;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${gap};gap:${gap};position:sticky;top:0;background:rgba(0,0,0,.0);backdrop-filter:blur(0px);padding-bottom:${gap};z-index:2;">
    <div style="font-size:${compact ? "15px" : "18px"};font-weight:700;line-height:1.1;">Parcel Lieferungen</div>
    <div style="font-size:${metaSize};opacity:.82;text-align:right;">${this.escapeHtml(subtitle)}</div>
  </div>
  ${infoBanner}
  <div style="display:grid;gap:${gap};padding-right:2px;">
    ${rows}
  </div>
</div>`.trim();
    }

    private statusColor(statusCode: number): string {
        switch (statusCode) {
            case 0:
                return "#15803d";
            case 2:
                return "#2563eb";
            case 3:
                return "#7c3aed";
            case 4:
                return "#ea580c";
            case 6:
            case 7:
                return "#dc2626";
            case 8:
                return "#0f766e";
            default:
                return "#4b5563";
        }
    }

    private escapeHtml(input: string): string {
        return input
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new ParcelNet(options);
} else {
    (() => new ParcelNet())();
}
