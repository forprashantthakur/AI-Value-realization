/**
 * Modular integration layer. Each connector maps a source system to the platform's canonical
 * import contracts (MeasurementRow, AgentTelemetry, CostRow). Connectors are registered here and
 * implemented as adapters; none ships with credentials.
 */
export type ImportContract = "measurements" | "agent-telemetry" | "costs" | "benchmarks";

export interface ConnectorDefinition {
  id: string;
  name: string;
  category: "ERP" | "HRMS" | "ITSM" | "CRM" | "Procurement" | "Process mining" | "Agent observability" | "Generic";
  provides: ImportContract[];
  description: string;
  auth: "OAuth2" | "API key" | "Basic" | "Service account";
  status: "available" | "planned";
}

export interface ConnectorAdapter<Config = Record<string, string>> {
  id: string;
  validateConfig(config: Config): string[];
  /** Pull records for a contract and period; must return canonical rows (validated by Zod before import). */
  pull(contract: ImportContract, config: Config, period: { from: string; to: string }): Promise<Record<string, unknown>[]>;
}

export const CONNECTORS: ConnectorDefinition[] = [
  { id: "csv", name: "CSV / Excel upload", category: "Generic", provides: ["measurements", "costs", "benchmarks"], description: "Template-based file upload with row-level validation.", auth: "Service account", status: "available" },
  { id: "rest", name: "REST ingestion API", category: "Generic", provides: ["measurements"], description: "POST /api/ingest/measurements with a bearer API key.", auth: "API key", status: "available" },
  { id: "sap", name: "SAP S/4HANA", category: "ERP", provides: ["measurements", "costs"], description: "OData extraction of document volumes, cycle times and cost-centre actuals.", auth: "OAuth2", status: "planned" },
  { id: "oracle", name: "Oracle Fusion ERP", category: "ERP", provides: ["measurements", "costs"], description: "REST/BI Publisher extracts for AP, AR and GL.", auth: "OAuth2", status: "planned" },
  { id: "workday", name: "Workday HCM", category: "HRMS", provides: ["measurements"], description: "Recruiting and HR case volumes and cycle times via RaaS.", auth: "OAuth2", status: "planned" },
  { id: "servicenow", name: "ServiceNow", category: "ITSM", provides: ["measurements"], description: "Case/ticket volumes, handling and resolution times (HRSD, CSM).", auth: "OAuth2", status: "planned" },
  { id: "salesforce", name: "Salesforce", category: "CRM", provides: ["measurements"], description: "Service Cloud case metrics.", auth: "OAuth2", status: "planned" },
  { id: "coupa", name: "Procurement suite (e.g. Coupa, Ariba)", category: "Procurement", provides: ["measurements", "costs"], description: "Requisition, PO and invoice throughput and exception rates.", auth: "API key", status: "planned" },
  { id: "process-mining", name: "Process mining platform", category: "Process mining", provides: ["measurements"], description: "Event-log KPIs: throughput time, rework loops, variants.", auth: "API key", status: "planned" },
  { id: "agent-obs", name: "Agent observability (OpenTelemetry)", category: "Agent observability", provides: ["agent-telemetry"], description: "Task outcomes, escalations, token usage and latency from agent traces.", auth: "API key", status: "planned" },
];

export const MEASUREMENT_TEMPLATE_COLUMNS = [
  "initiative",
  "month",
  "phase",
  "volume",
  "adoptionRate",
  "automationRate",
  "avgHandlingMinutes",
  "cycleTimeHours",
  "errorRate",
  "reworkRate",
  "aiRunCost",
  "activeUsers",
  "eligibleUsers",
] as const;
