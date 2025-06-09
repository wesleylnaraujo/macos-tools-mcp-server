import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";
import {
  SystemPerformanceParams,
  SystemMetrics,
  OptimizationSuggestion,
  PerformanceResult,
} from "./types.js";
import {
  getCPUMetrics,
  getMemoryMetrics,
  getDiskMetrics,
  getNetworkMetrics,
  getTopProcesses,
  getTemperatures,
} from "../utils/system-info.js";
import { systemMetricsCache, processListCache, createCacheKey } from "../utils/cache.js";

const DB_PATH = join(homedir(), ".macos-tools-mcp", "performance.db");

function initDatabase(): Database.Database {
  mkdirSync(join(homedir(), ".macos-tools-mcp"), { recursive: true });
  
  const db = new Database(DB_PATH);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      cpu_overall REAL,
      cpu_load_1 REAL,
      cpu_load_5 REAL,
      cpu_load_15 REAL,
      memory_used INTEGER,
      memory_total INTEGER,
      memory_pressure INTEGER,
      swap_used INTEGER,
      swap_total INTEGER,
      disk_used INTEGER,
      disk_total INTEGER,
      disk_read_bps INTEGER,
      disk_write_bps INTEGER,
      network_bytes_sent INTEGER,
      network_bytes_received INTEGER,
      network_packets_in INTEGER,
      network_packets_out INTEGER
    );
    
    CREATE INDEX IF NOT EXISTS idx_timestamp ON metrics(timestamp);
  `);
  
  return db;
}

async function getCurrentMetrics(): Promise<SystemMetrics> {
  const cacheKey = createCacheKey("metrics", { type: "current" });
  
  return systemMetricsCache.get(cacheKey, async () => {
    const [cpu, memory, disk, network] = await Promise.all([
      getCPUMetrics(),
      getMemoryMetrics(),
      getDiskMetrics(),
      getNetworkMetrics(),
    ]);
    
    let temperature: Record<string, number> | undefined;
    try {
      temperature = await getTemperatures();
    } catch {
      // Temperature reading might require sudo
    }
    
    return {
      timestamp: new Date(),
      cpu,
      memory,
      disk,
      network,
      temperature,
    };
  });
}

function storeMetrics(db: Database.Database, metrics: SystemMetrics): void {
  const stmt = db.prepare(`
    INSERT INTO metrics (
      timestamp, cpu_overall, cpu_load_1, cpu_load_5, cpu_load_15,
      memory_used, memory_total, memory_pressure, swap_used, swap_total,
      disk_used, disk_total, disk_read_bps, disk_write_bps,
      network_bytes_sent, network_bytes_received, network_packets_in, network_packets_out
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    metrics.timestamp.getTime(),
    metrics.cpu.overall,
    metrics.cpu.loadAverage[0],
    metrics.cpu.loadAverage[1],
    metrics.cpu.loadAverage[2],
    metrics.memory.used,
    metrics.memory.total,
    metrics.memory.pressure,
    metrics.memory.swapUsed,
    metrics.memory.swapTotal,
    metrics.disk.used,
    metrics.disk.total,
    metrics.disk.readBytesPerSec,
    metrics.disk.writeBytesPerSec,
    metrics.network.bytesSent,
    metrics.network.bytesReceived,
    metrics.network.packetsIn,
    metrics.network.packetsOut
  );
}

function getHistoricalMetrics(
  db: Database.Database,
  timeRange: string
): SystemMetrics[] {
  const now = Date.now();
  let startTime: number;
  
  switch (timeRange) {
    case "1h":
      startTime = now - 3600000;
      break;
    case "24h":
      startTime = now - 86400000;
      break;
    case "7d":
      startTime = now - 604800000;
      break;
    default:
      startTime = now - 3600000;
  }
  
  const rows = db.prepare(`
    SELECT * FROM metrics
    WHERE timestamp >= ?
    ORDER BY timestamp DESC
  `).all(startTime);
  
  return rows.map((row: any) => ({
    timestamp: new Date(row.timestamp),
    cpu: {
      overall: row.cpu_overall,
      perCore: [],
      loadAverage: [row.cpu_load_1, row.cpu_load_5, row.cpu_load_15],
    },
    memory: {
      total: row.memory_total,
      used: row.memory_used,
      available: row.memory_total - row.memory_used,
      pressure: row.memory_pressure,
      swapUsed: row.swap_used,
      swapTotal: row.swap_total,
    },
    disk: {
      total: row.disk_total,
      used: row.disk_used,
      available: row.disk_total - row.disk_used,
      readBytesPerSec: row.disk_read_bps,
      writeBytesPerSec: row.disk_write_bps,
    },
    network: {
      bytesSent: row.network_bytes_sent,
      bytesReceived: row.network_bytes_received,
      packetsIn: row.network_packets_in,
      packetsOut: row.network_packets_out,
    },
  }));
}

async function analyzeForOptimizations(): Promise<OptimizationSuggestion[]> {
  const suggestions: OptimizationSuggestion[] = [];
  const [metrics, processes] = await Promise.all([
    getCurrentMetrics(),
    getTopProcesses(20),
  ]);
  
  // Memory optimization suggestions
  if (metrics.memory.pressure > 70) {
    const memoryHogs = processes
      .filter(p => p.memory > 5)
      .sort((a, b) => b.memory - a.memory)
      .slice(0, 3);
    
    memoryHogs.forEach(process => {
      suggestions.push({
        type: "quit_app",
        app: process.name,
        reason: `Using ${process.memory.toFixed(1)}% of memory while system is under pressure`,
        impact: process.memory > 10 ? "high" : "medium",
        command: `kill -TERM ${process.pid}`,
      });
    });
  }
  
  // CPU optimization suggestions
  const cpuIntensive = processes.filter(p => p.cpu > 50);
  cpuIntensive.forEach(process => {
    suggestions.push({
      type: "reduce_memory",
      app: process.name,
      reason: `Consuming ${process.cpu.toFixed(1)}% CPU continuously`,
      impact: process.cpu > 80 ? "high" : "medium",
    });
  });
  
  // Disk space suggestions
  if (metrics.disk.available < metrics.disk.total * 0.1) {
    suggestions.push({
      type: "clear_cache",
      reason: "Less than 10% disk space remaining",
      impact: "high",
      command: "rm -rf ~/Library/Caches/*",
    });
  }
  
  // Swap usage suggestions
  if (metrics.memory.swapUsed > metrics.memory.swapTotal * 0.5) {
    suggestions.push({
      type: "reduce_memory",
      reason: "High swap usage indicates memory pressure",
      impact: "high",
    });
  }
  
  return suggestions;
}

export async function performanceMonitor(
  params: SystemPerformanceParams
): Promise<PerformanceResult> {
  try {
    const db = initDatabase();
    
    switch (params.action) {
      case "current": {
        const metrics = await getCurrentMetrics();
        storeMetrics(db, metrics);
        
        if (!params.metric || params.metric === "all") {
          return { status: "success", data: metrics };
        }
        
        // Return specific metric
        const filteredMetrics: SystemMetrics = {
          ...metrics,
          cpu: params.metric === "cpu" ? metrics.cpu : {} as any,
          memory: params.metric === "memory" ? metrics.memory : {} as any,
          disk: params.metric === "disk" ? metrics.disk : {} as any,
          network: params.metric === "network" ? metrics.network : {} as any,
        };
        
        return { status: "success", data: filteredMetrics };
      }
      
      case "history": {
        const timeRange = params.timeRange || "1h";
        const historicalData = getHistoricalMetrics(db, timeRange);
        
        if (params.metric && params.metric !== "all") {
          // Filter historical data by metric
          const filtered = historicalData;
          
          return { status: "success", data: filtered };
        }
        
        return { status: "success", data: historicalData };
      }
      
      case "processes": {
        const cacheKey = createCacheKey("processes", { metric: params.metric });
        
        const processes = await processListCache.get(cacheKey, async () => {
          const procs = await getTopProcesses();
          
          if (params.metric && params.metric !== "all") {
            // Sort by specific metric
            return procs.sort((a, b) => {
              switch (params.metric) {
                case "cpu":
                  return b.cpu - a.cpu;
                case "memory":
                  return b.memory - a.memory;
                default:
                  return 0;
              }
            });
          }
          
          return procs;
        });
        
        return { status: "success", data: processes };
      }
      
      case "optimize": {
        const suggestions = await analyzeForOptimizations();
        return { status: "success", data: suggestions };
      }
      
      default:
        return { status: "error", error: "Invalid action" };
    }
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}