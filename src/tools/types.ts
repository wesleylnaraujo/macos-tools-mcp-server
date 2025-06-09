export interface SystemPerformanceParams {
  action: "current" | "history" | "processes" | "optimize";
  timeRange?: string;
  metric?: "cpu" | "memory" | "disk" | "network" | "all";
}

export interface EnhancedSearchParams {
  action: "search" | "tag" | "untag";
  query?: string;
  searchType?: "content" | "filename" | "tags" | "regex";
  fileTypes?: string[];
  path?: string;
  maxResults?: number;
  tags?: string[];
}

export interface CPUMetrics {
  overall: number;
  perCore: number[];
  loadAverage: [number, number, number];
}

export interface MemoryMetrics {
  total: number;
  used: number;
  available: number;
  pressure: number;
  swapUsed: number;
  swapTotal: number;
}

export interface DiskMetrics {
  total: number;
  used: number;
  available: number;
  readBytesPerSec: number;
  writeBytesPerSec: number;
}

export interface NetworkMetrics {
  bytesSent: number;
  bytesReceived: number;
  packetsIn: number;
  packetsOut: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  memoryMB: number;
  user: string;
  state: string;
}

export interface SystemMetrics {
  timestamp: Date;
  cpu: CPUMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  temperature?: Record<string, number>;
}

export interface OptimizationSuggestion {
  type: "quit_app" | "clear_cache" | "disable_startup" | "reduce_memory";
  app?: string;
  reason: string;
  impact: "high" | "medium" | "low";
  command?: string;
}

export interface SearchResult {
  path: string;
  filename: string;
  size: number;
  modifiedDate: Date;
  matchedContent?: string;
  lineNumber?: number;
  score: number;
  tags?: string[];
}

export interface PerformanceResult {
  status: "success" | "error";
  data?: SystemMetrics | ProcessInfo[] | OptimizationSuggestion[] | SystemMetrics[];
  error?: string;
}

export interface SearchResultResponse {
  status: "success" | "error";
  results?: SearchResult[];
  totalFound?: number;
  searchTime?: number;
  error?: string;
}

export interface TagOperationResult {
  status: "success" | "error";
  filesTagged?: number;
  error?: string;
}