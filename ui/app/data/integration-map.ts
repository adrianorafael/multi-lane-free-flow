/**
 * Data map to run Multi-lane Free Flow on real data instead of the simulator.
 * Conventions: metrics `mlff.*`, Business Events `event.provider = "mlff"` / `event.type = mlff.*`,
 * common dimensions `gantry.id`, `direction`, `lane`, `device.id`, `device.type`.
 */

export interface Layer {
  name: string;
  items: string;
  collection: string;
}

/** Path of the data, from the road to Dynatrace. */
export const LAYERS: Layer[] = [
  {
    name: "Roadside equipment",
    items: "Front and rear LPR cameras, IR illuminator, tag reader, laser scanner (classifier)",
    collection: "Read events to the lane controller; status via SNMP / vendor API",
  },
  {
    name: "Lane controller",
    items: "One per direction: correlates laser + tag + image into one transaction",
    collection: "Emits the transaction Business Event; local buffer (store-and-forward); logs via syslog",
  },
  {
    name: "Gantry cabinet",
    items: "Switch/PoE, sensor RTU/gateway, UPS, temperature, humidity and door sensors",
    collection: "SNMP v3 and Modbus TCP read by the extension on the edge ActiveGate",
  },
  {
    name: "Backhaul",
    items: "10G fiber gantry → edge data center, backup radio, SD-WAN / firewall",
    collection: "SNMP (IF-MIB, radio) + network monitor (latency and loss)",
  },
  {
    name: "Edge data center",
    items: "Hosts / hypervisor, OCR GPU, image storage, message broker, services",
    collection: "OneAgent on hosts; Environment ActiveGate for extensions and as ingest proxy",
  },
  {
    name: "Dynatrace",
    items: "OpenPipeline, Grail, Smartscape, Dynatrace Intelligence, dashboards and this app",
    collection: "Business Events, metrics, logs, traces and events; partners via Synthetic",
  },
];

export interface Field {
  field: string;
  type: string;
  example: string;
  producer: string;
  usage: string;
}

export interface Metric {
  metric: string;
  unit: string;
  dimensions: string;
  collection: string;
  interval: string;
  usage: string;
}

export interface Section {
  id: string;
  title: string;
  priority: "Business" | "Integrations" | "Systems" | "Infrastructure" | "Reference";
  summary: string;
  fields?: Field[];
  metrics?: Metric[];
  notes?: string[];
}

const DEV_DIMS = "gantry.id, direction, lane, device.id";

export const SECTIONS: Section[] = [
  {
    id: "transaction",
    title: "Transaction event · bizevent mlff.transaction",
    priority: "Business",
    summary:
      "One event per vehicle, emitted by the lane controller after correlating laser, tag and image, and enriched by the ocr-engine. It drives the scene, the KPIs and the latest-transactions list.",
    fields: [
      { field: "event.provider", type: "string", example: "mlff", producer: "Lane controller", usage: "Filter in every query" },
      { field: "event.type", type: "string", example: "mlff.transaction", producer: "Lane controller", usage: "Filter in every query" },
      { field: "timestamp", type: "timestamp (ms, UTC)", example: "2026-09-29T21:42:07.312Z", producer: "Lane controller (NTP/PTP clock)", usage: "Scene, flow/min, journey" },
      { field: "transaction.id", type: "string", example: "G05-20260929184207312-INB3", producer: "Lane controller", usage: "Key for journey and charge" },
      { field: "trace_id", type: "string (W3C)", example: "4bf92f3577b34da6…", producer: "Lane controller (propagated to services)", usage: "Transaction journey (trace)" },
      { field: "gantry.id / gantry.name", type: "string", example: "G-05 / Coastal Highway km 38", producer: "Controller configuration", usage: "Every view" },
      { field: "direction", type: "string", example: "INB | OUT", producer: "Lane controller", usage: "Scene, matrix, camera" },
      { field: "lane", type: "int", example: "3", producer: "Lane controller", usage: "Scene, matrix, camera" },
      { field: "vehicle.class_group", type: "string", example: "light | heavy", producer: "Laser scanner", usage: "Scene (silhouette), revenue" },
      { field: "vehicle.class", type: "int", example: "7", producer: "Laser scanner + tariff table", usage: "Tariff, transaction list" },
      { field: "vehicle.axles", type: "int", example: "5", producer: "Laser scanner", usage: "Scene (axles), journey" },
      { field: "laser.match", type: "boolean", example: "true", producer: "Controller (laser × tag / registry)", usage: "Matrix (laser), journey" },
      { field: "tag.present / tag.read", type: "boolean", example: "true / true", producer: "Tag reader", usage: "Automatic identification" },
      { field: "tag.issuer", type: "string", example: "AlphaTag", producer: "Tag reader (tag issuer)", usage: "Pipeline, charge" },
      { field: "ocr.confidence", type: "double (%)", example: "97.8", producer: "ocr-engine", usage: "Confidence KPI, camera, vehicle badge" },
      { field: "ocr.char_confidence", type: "array<double>", example: "[99.1, 98.7, …]", producer: "ocr-engine", usage: "OCR camera bars" },
      { field: "ocr.camera_id", type: "string", example: "CAM-LPR-INB-L3", producer: "ocr-engine", usage: "OCR camera, device correlation" },
      { field: "ocr.latency_ms", type: "long", example: "180", producer: "ocr-engine", usage: "Journey (tag read + OCR)" },
      { field: "method", type: "string", example: "TAG | OCR | REVIEW | UNREAD", producer: "ocr-engine / rating-service", usage: "Halo, badge, KPIs, pipeline" },
      { field: "plate.masked", type: "string", example: "ABC-12••", producer: "OpenPipeline (masking at ingest)", usage: "Transaction list, camera" },
      { field: "plate.hash", type: "string", example: "sha256…", producer: "OpenPipeline", usage: "Correlation without exposing the plate" },
      { field: "plate.format / plate.commercial", type: "string / boolean", example: "standard / false", producer: "ocr-engine", usage: "Plate rendering" },
      { field: "tariff.amount", type: "double", example: "22.50", producer: "rating-service", usage: "Revenue, revenue without automatic ID" },
      { field: "condition", type: "string", example: "day | night | fog", producer: "Enrichment (weather station + time)", usage: "OCR camera" },
    ],
    notes: [
      "The lane controller clock must be synchronized (NTP/PTP). Without it, the transaction journey and the p95 to charge are wrong.",
      "Never store the full plate in Grail: mask it and compute the hash in OpenPipeline, before storage.",
      "Send through the Business Events endpoint via the edge ActiveGate; the controller keeps a local buffer for link outages.",
    ],
  },
  {
    id: "charge",
    title: "Charge and review events · bizevents mlff.charge and mlff.review",
    priority: "Business",
    summary:
      "Charge state changes for each transaction, emitted by the billing services and by the human review system. They drive the list status, the coins, the settled revenue and the p95.",
    fields: [
      { field: "transaction.id", type: "string", example: "G05-…-INB3", producer: "billing-service / tag-gateway", usage: "Links the state to the transaction" },
      { field: "charge.status", type: "string", example: "SETTLED | AUTOPAY | AWAITING_PAYMENT | DELAYED | POTENTIAL_EVASION", producer: "billing-service", usage: "List status, coins" },
      { field: "charge.channel", type: "string", example: "TAG | card | instant payment | app", producer: "billing-service", usage: "Settled revenue" },
      { field: "charge.issuer", type: "string", example: "BetaPass", producer: "tag-gateway", usage: "Pipeline (partners)" },
      { field: "charge.latency_ms", type: "long", example: "8420", producer: "billing-service (settled − passage)", usage: "Passage → charge p95 KPI" },
      { field: "charge.amount", type: "double", example: "4.50", producer: "billing-service", usage: "Settled revenue" },
      { field: "charge.delay_reason", type: "string", example: "circuit_breaker | store_and_forward", producer: "tag-gateway / controller", usage: "Hourglasses, Intelligence card" },
      { field: "charge.payment_due", type: "date", example: "2026-10-29", producer: "billing-service (30-day rule)", usage: "\"Pay-by-plate\" status" },
      { field: "review.start / review.end", type: "timestamp", example: "…", producer: "Review system (operations center)", usage: "Journey (human review)" },
      { field: "review.result", type: "string", example: "IDENTIFIED | ILLEGIBLE", producer: "Review system", usage: "List status, potential evasion" },
      { field: "review.reviewer_id", type: "string (pseudonym)", example: "rv-017", producer: "Review system", usage: "Review team capacity" },
    ],
  },
  {
    id: "partners",
    title: "Partners and third parties · tag issuers, payments, vehicle registry, toll authority",
    priority: "Integrations",
    summary:
      "Latency, errors and availability of each external integration. They come from traces of outbound calls (tag-gateway, billing-service, authority-connector) and from Synthetic monitors on the APIs.",
    metrics: [
      { metric: "Response time of external calls (client spans)", unit: "ms (p50/p95)", dimensions: "partner, operation, http.status", collection: "OneAgent / OpenTelemetry → spans", interval: "continuous", usage: "Partner p95 in the pipeline (1.5 s / 5 s)" },
      { metric: "Error rate per partner", unit: "%", dimensions: "partner, operation, error", collection: "Spans + tag-gateway logs", interval: "continuous", usage: "Partner color, Intelligence card" },
      { metric: "mlff.integration.circuit_breaker", unit: "0 closed / 1 open", dimensions: "partner", collection: "Metric exposed by tag-gateway (OTLP / Prometheus)", interval: "10 s", usage: "\"breaker open\" badge" },
      { metric: "mlff.integration.retries", unit: "count", dimensions: "partner", collection: "OTLP / Prometheus", interval: "1 min", usage: "Issuer card (messages held)" },
      { metric: "Partner API availability", unit: "%", dimensions: "partner, endpoint", collection: "Synthetic HTTP (private location in the edge DC)", interval: "1–5 min", usage: "Partner health, SLA" },
      { metric: "mlff.authority.pending_reports", unit: "transactions", dimensions: "gantry.id", collection: "authority-connector (OTLP)", interval: "1 min", usage: "Authority node" },
    ],
  },
  {
    id: "systems",
    title: "Systems · services and messaging",
    priority: "Systems",
    summary:
      "Services in the edge data center and in the cloud (trip-ingest, ocr-engine, rating-service, billing-service, tag-gateway, authority-connector) and the mlff.* queues on the message broker.",
    metrics: [
      { metric: "Response time, throughput and failures per service", unit: "ms, req/min, %", dimensions: "service.name, endpoint", collection: "OneAgent / OpenTelemetry (spans)", interval: "continuous", usage: "Pipeline node color, journey" },
      { metric: "Queue depth", unit: "messages", dimensions: "queue (mlff.trip.raw, mlff.ocr.review, mlff.charge.tag, mlff.charge.plate, mlff.dlq)", collection: "Message broker extension (IBM MQ, Kafka or RabbitMQ)", interval: "1 min", usage: "Pipeline tanks (5K / 20K)" },
      { metric: "Consumer lag / age of oldest message", unit: "messages / s", dimensions: "queue, consumer group", collection: "Broker extension", interval: "1 min", usage: "\"wait ~N min\" on the tanks" },
      { metric: "Queue in / out rate", unit: "msg/s", dimensions: "queue", collection: "Broker extension", interval: "1 min", usage: "Consumption capacity" },
      { metric: "Messaging spans (publish / consume)", unit: "—", dimensions: "queue, service.name", collection: "OneAgent / OpenTelemetry", interval: "continuous", usage: "Journey steps (queue wait)" },
      { metric: "Service logs", unit: "—", dimensions: "service.name, loglevel", collection: "OneAgent log module / OpenPipeline", interval: "continuous", usage: "Root cause in the cards" },
    ],
  },
  {
    id: "roadside",
    title: "Roadside equipment · by type",
    priority: "Infrastructure",
    summary: "Each lane has 5 devices on the gantry (the \"Gantry health\" matrix). Status data comes from the device itself or from the lane controller.",
    metrics: [
      { metric: "mlff.lpr.online", unit: "0/1", dimensions: `${DEV_DIMS}, position (front/rear)`, collection: "SNMP or camera REST/ONVIF API → extension on the ActiveGate", interval: "30 s", usage: "Matrix: LPR·F / LPR·R" },
      { metric: "mlff.lpr.fps / dropped_frames", unit: "frames/s, count", dimensions: DEV_DIMS, collection: "Camera API", interval: "1 min", usage: "Device details" },
      { metric: "mlff.lpr.mean_confidence", unit: "%", dimensions: DEV_DIMS, collection: "Derived from the transaction bizevent (ocr.camera_id)", interval: "1 min", usage: "Matrix, IR illuminator card" },
      { metric: "mlff.lpr.temperature", unit: "°C", dimensions: DEV_DIMS, collection: "Camera SNMP / API", interval: "1 min", usage: "Device details" },
      { metric: "mlff.ir.current", unit: "A", dimensions: DEV_DIMS, collection: "Camera API (built-in illuminator) or cabinet RTU", interval: "30 s", usage: "Matrix: IR (failure = 0 A at night)" },
      { metric: "mlff.ir.state", unit: "on / off / failed", dimensions: DEV_DIMS, collection: "Same as above", interval: "30 s", usage: "IR cones in the scene, scenario 3" },
      { metric: "mlff.tag.read_rate", unit: "%", dimensions: DEV_DIMS, collection: "Tag reader (SNMP / API) or derived from the bizevent (tag.present × tag.read)", interval: "1 min", usage: "Matrix: TAG (target ≥ 99.7%)" },
      { metric: "mlff.tag.rssi / reflected_power", unit: "dBm", dimensions: DEV_DIMS, collection: "Tag reader (SNMP / API)", interval: "1 min", usage: "Details (degraded antenna)" },
      { metric: "mlff.laser.agreement", unit: "%", dimensions: DEV_DIMS, collection: "Derived from the bizevent (laser.match)", interval: "5 min", usage: "Matrix: Laser (target ≥ 99.5%)" },
      { metric: "mlff.laser.online / dirty_window", unit: "0/1", dimensions: DEV_DIMS, collection: "Laser scanner API", interval: "30 s", usage: "Matrix: Laser" },
    ],
    notes: [
      "Register every device in the equipment inventory (reference data) with lane, direction and type: that is what lets Dynatrace point to \"IR illuminator INB L3\" as the root cause.",
      "Model devices as entities (Smartscape) linked lane → gantry → controller → edge data center, for Dynatrace Intelligence's topology-aware correlation.",
    ],
  },
  {
    id: "controllers",
    title: "Controllers, power, network and backhaul",
    priority: "Infrastructure",
    summary: "Lane controller and gantry cabinet. They are single points of failure for the plaza: if they go down, the whole lane stops producing transactions.",
    metrics: [
      { metric: "mlff.controller.online / uptime", unit: "0/1, s", dimensions: "gantry.id, direction, controller.id", collection: "SNMP (HOST-RESOURCES-MIB) or a lightweight agent", interval: "30 s", usage: "\"Cabinet\" node in the pipeline" },
      { metric: "mlff.controller.cpu / memory", unit: "%", dimensions: "controller.id", collection: "SNMP or OneAgent (on a supported OS)", interval: "1 min", usage: "Cabinet details" },
      { metric: "mlff.controller.buffered_transactions", unit: "transactions", dimensions: "controller.id", collection: "Lane controller metric (OTLP / Prometheus)", interval: "30 s", usage: "Store-and-forward (fiber scenario)" },
      { metric: "mlff.controller.ntp_offset", unit: "ms", dimensions: "controller.id", collection: "SNMP / NTP", interval: "5 min", usage: "Quality of journey timings" },
      { metric: "mlff.controller.dropped_events", unit: "count", dimensions: "controller.id, reason", collection: "Lane controller logs / metric", interval: "1 min", usage: "Transactions without a read" },
      { metric: "Cabinet switch ports, errors and PoE", unit: "state, errors/s, W", dimensions: "switch.id, port", collection: "SNMP (IF-MIB, POWER-ETHERNET-MIB)", interval: "1 min", usage: "Camera offline ↔ port correlation" },
      { metric: "mlff.cabinet.temperature / humidity / door_open", unit: "°C, %, 0/1", dimensions: "gantry.id", collection: "RTU / gateway (Modbus TCP or SNMP)", interval: "1 min", usage: "Infrastructure: Cabinet" },
      { metric: "UPS: runtime, load, battery, mains present", unit: "min, %, %, 0/1", dimensions: "ups.id", collection: "SNMP (UPS-MIB, RFC 1628)", interval: "1 min", usage: "Infrastructure: UPS" },
      { metric: "10G fiber: state, utilization, errors", unit: "0/1, %, errors/s", dimensions: "link.id", collection: "SNMP (IF-MIB) on the switch / SD-WAN", interval: "1 min", usage: "Fiber line in the scene, scenario 5" },
      { metric: "Backup radio: state, utilization, signal", unit: "0/1, %, dBm", dimensions: "radio.id", collection: "Radio SNMP", interval: "1 min", usage: "Backup radio in the scene" },
      { metric: "Gantry ↔ edge DC latency and loss", unit: "ms, %", dimensions: "link.id", collection: "Network monitor (ActiveGate / Synthetic)", interval: "1 min", usage: "Fiber card" },
    ],
  },
  {
    id: "edge",
    title: "Edge data center · hosts, OCR GPU and storage",
    priority: "Infrastructure",
    summary: "The small data center serving the gantry: hypervisor, ingest / rating hosts, OCR GPU, broker, image storage and the ActiveGate.",
    metrics: [
      { metric: "Host CPU, memory, disk and network", unit: "%", dimensions: "host", collection: "OneAgent (full-stack or infrastructure)", interval: "1 min", usage: "Infrastructure: Edge DC CPU" },
      { metric: "GPU: temperature, utilization, memory, clock throttle", unit: "°C, %, MB, reason", dimensions: "host, gpu.id", collection: "NVIDIA extension (DCGM exporter / Prometheus) on the ActiveGate", interval: "1 min", usage: "Infrastructure: OCR GPU; 85 °C forecast" },
      { metric: "Image storage: capacity, latency, IOPS", unit: "%, ms, IOPS", dimensions: "storage.id, volume", collection: "Storage SNMP / REST extension", interval: "5 min", usage: "Infrastructure: Storage" },
      { metric: "Hypervisor (VMware)", unit: "%", dimensions: "cluster, host", collection: "VMware extension via ActiveGate", interval: "1 min", usage: "Root-cause correlation" },
      { metric: "Firewall / SD-WAN", unit: "sessions, %", dimensions: "device.id", collection: "SNMP", interval: "1 min", usage: "Root-cause correlation" },
    ],
  },
  {
    id: "weather",
    title: "Environment · weather station km 42",
    priority: "Infrastructure",
    summary: "Explains OCR confidence drops that are not equipment failures (mountain fog).",
    metrics: [
      { metric: "mlff.weather.visibility", unit: "m", dimensions: "station.id (km 42)", collection: "Station Modbus TCP / REST → extension, or the operations center API", interval: "1 min", usage: "Fog in the scene and camera; scenario 2" },
      { metric: "mlff.weather.rain / humidity / wind", unit: "mm/h, %, km/h", dimensions: "station.id", collection: "Same as above", interval: "1 min", usage: "Context in the cards" },
    ],
  },
  {
    id: "reference",
    title: "Reference data (lookup tables in Grail)",
    priority: "Reference",
    summary: "Registries that enrich events and metrics in DQL queries.",
    fields: [
      { field: "device_inventory", type: "lookup", example: "device.id, type, vendor, model, gantry.id, direction, lane, position, ip, serial", producer: "CMDB / field engineering", usage: "Matrix, per-device root cause" },
      { field: "class_tariffs", type: "lookup", example: "gantry.id, class, axles, multiplier, tariff, valid_from", producer: "Tariff team / authority", usage: "Revenue, revenue without automatic ID" },
      { field: "tag_issuers", type: "lookup", example: "issuer.id, name, endpoint, sla_ms", producer: "Integrations team", usage: "Pipeline (partners), thresholds" },
      { field: "slo_thresholds", type: "lookup", example: "indicator, green, yellow (e.g. identification 97 / 95)", producer: "Operations", usage: "Color of every KPI" },
      { field: "expected_curve", type: "lookup or baseline", example: "gantry.id, weekday, hour, expected_transactions", producer: "History (or Dynatrace Intelligence automatic baseline)", usage: "Flow vs expected" },
    ],
  },
];

export interface ScreenMap {
  element: string;
  data: string;
  source: string;
}

/** What each element on screen consumes. */
export const SCREEN_MAP: ScreenMap[] = [
  { element: "Plaza health", data: "Identification, OCR confidence, p95, queues, partners, equipment state", source: "All blocks below (composite SLOs)" },
  { element: "Transactions today / Flow now", data: "Count of mlff.transaction; expected curve", source: "Business Events + expected_curve lookup" },
  { element: "Revenue billed and settled", data: "tariff.amount (transaction) and charge.amount / status", source: "Business Events" },
  { element: "Automatic identification / OCR confidence", data: "method, ocr.confidence", source: "Business Events" },
  { element: "Passage → charge (p95)", data: "charge.latency_ms (settled tag)", source: "Charge Business Events" },
  { element: "Revenue without automatic ID", data: "tariff.amount where method is REVIEW / UNREAD", source: "Business Events" },
  { element: "Gantry scene (vehicles, halos, badges)", data: "Real-time transactions per direction and lane, with class, axles, method and issuer", source: "Business Events (polled every few seconds)" },
  { element: "Gantry LEDs / Gantry health", data: "LPR, IR, tag and laser status per lane; cabinet, UPS, fiber, radio, GPU, storage, CPU", source: "Extensions (SNMP / API / Modbus) + OneAgent + inventory" },
  { element: "OCR view", data: "ocr.confidence, ocr.char_confidence, ocr.camera_id, plate.masked, condition", source: "Business Events + weather station" },
  { element: "Road to revenue (pipeline)", data: "Service health, queue depth, partner p95 and errors, circuit breaker", source: "Traces, broker extension, Synthetic" },
  { element: "Latest transactions", data: "Transaction + latest charge / review state", source: "Business Events (joined by transaction.id)" },
  { element: "Transaction journey", data: "Spans of the trace_id + queue and review timings", source: "Distributed Tracing + Business Events" },
  { element: "Dynatrace Intelligence", data: "Problems, root cause, affected entities, forecasts", source: "Dynatrace Intelligence over everything above" },
];

export interface Step {
  order: string;
  track: string;
  delivery: string;
}

/** Rollout order: business → integrations → systems → infrastructure. */
export const ROLLOUT: Step[] = [
  { order: "1", track: "Business", delivery: "mlff.transaction Business Event from the lane controller + plate masking in OpenPipeline" },
  { order: "2", track: "Business", delivery: "Charge and review Business Events from the services; tariff and threshold lookups" },
  { order: "3", track: "Integrations", delivery: "Traces of calls to tag issuers, payments, registry and authority; Synthetic on the APIs; circuit breaker metric" },
  { order: "4", track: "Systems", delivery: "OneAgent / OpenTelemetry on services; message broker extension" },
  { order: "5", track: "Infrastructure", delivery: "ActiveGate in the edge DC; OneAgent on hosts; GPU, storage and VMware extensions" },
  { order: "6", track: "Infrastructure", delivery: "SNMP / Modbus / API for roadside devices, controllers, cabinet, UPS, backhaul and weather station; device inventory" },
  { order: "7", track: "App", delivery: "Swap the simulator for a Grail data source (DQL) while keeping the same screen" },
];
