import { exec } from "child_process";
import { promisify } from "util";
import { CPUMetrics, MemoryMetrics, DiskMetrics, NetworkMetrics, ProcessInfo } from "../tools/types.js";

const execAsync = promisify(exec);

export async function getCPUMetrics(): Promise<CPUMetrics> {
  try {
    const { stdout: cpuUsage } = await execAsync(
      "ps -A -o %cpu | awk '{s+=$1} END {print s}'"
    );
    
    const { stdout: coreCount } = await execAsync(
      "sysctl -n hw.ncpu"
    );
    
    const { stdout: loadAvg } = await execAsync(
      "sysctl -n vm.loadavg"
    );
    
    const loadNumbers = loadAvg.match(/[\d.]+/g) || ["0", "0", "0"];
    const cores = parseInt(coreCount.trim());
    const overall = parseFloat(cpuUsage.trim()) / cores;
    
    const perCore: number[] = [];
    for (let i = 0; i < cores; i++) {
      perCore.push(overall);
    }
    
    return {
      overall: Math.min(100, overall),
      perCore,
      loadAverage: [
        parseFloat(loadNumbers[0]),
        parseFloat(loadNumbers[1]),
        parseFloat(loadNumbers[2])
      ] as [number, number, number]
    };
  } catch (error) {
    throw new Error(`Failed to get CPU metrics: ${error}`);
  }
}

export async function getMemoryMetrics(): Promise<MemoryMetrics> {
  try {
    const { stdout: memInfo } = await execAsync(
      "vm_stat"
    );
    
    const pageSize = 4096;
    const stats: Record<string, number> = {};
    
    memInfo.split("\n").forEach(line => {
      const match = line.match(/^(.+?):\s+(\d+)/);
      if (match) {
        stats[match[1].trim()] = parseInt(match[2]) * pageSize;
      }
    });
    
    const { stdout: totalMem } = await execAsync(
      "sysctl -n hw.memsize"
    );
    
    const { stdout: pressure } = await execAsync(
      "memory_pressure"
    );
    
    const total = parseInt(totalMem.trim());
    const free = stats["Pages free"] || 0;
    const inactive = stats["Pages inactive"] || 0;
    const speculative = stats["Pages speculative"] || 0;
    const available = free + inactive + speculative;
    const used = total - available;
    
    let pressureLevel = 0;
    if (pressure.includes("critical")) pressureLevel = 90;
    else if (pressure.includes("warning")) pressureLevel = 70;
    else if (pressure.includes("normal")) pressureLevel = 30;
    
    const swapStats = await getSwapInfo();
    
    return {
      total,
      used,
      available,
      pressure: pressureLevel,
      swapUsed: swapStats.used,
      swapTotal: swapStats.total
    };
  } catch (error) {
    throw new Error(`Failed to get memory metrics: ${error}`);
  }
}

async function getSwapInfo(): Promise<{ used: number; total: number }> {
  try {
    const { stdout } = await execAsync("sysctl vm.swapusage");
    const match = stdout.match(/total = ([\d.]+)M.*used = ([\d.]+)M/);
    
    if (match) {
      return {
        total: parseFloat(match[1]) * 1024 * 1024,
        used: parseFloat(match[2]) * 1024 * 1024
      };
    }
    
    return { used: 0, total: 0 };
  } catch {
    return { used: 0, total: 0 };
  }
}

export async function getDiskMetrics(): Promise<DiskMetrics> {
  try {
    const { stdout: dfOutput } = await execAsync(
      "df -b /"
    );
    
    const lines = dfOutput.trim().split("\n");
    const stats = lines[1].split(/\s+/);
    
    const total = parseInt(stats[1]);
    const used = parseInt(stats[2]);
    const available = parseInt(stats[3]);
    
    const ioStats = await getDiskIOStats();
    
    return {
      total,
      used,
      available,
      readBytesPerSec: ioStats.read,
      writeBytesPerSec: ioStats.write
    };
  } catch (error) {
    throw new Error(`Failed to get disk metrics: ${error}`);
  }
}

async function getDiskIOStats(): Promise<{ read: number; write: number }> {
  try {
    const { stdout: iostat1 } = await execAsync("iostat -Id");
    await new Promise(resolve => setTimeout(resolve, 1000));
    const { stdout: iostat2 } = await execAsync("iostat -Id");
    
    const parseIOStat = (output: string) => {
      const lines = output.trim().split("\n");
      const dataLine = lines[lines.length - 1];
      const values = dataLine.trim().split(/\s+/);
      return {
        read: parseFloat(values[0]) || 0,
        write: parseFloat(values[1]) || 0
      };
    };
    
    const stats1 = parseIOStat(iostat1);
    const stats2 = parseIOStat(iostat2);
    
    return {
      read: Math.max(0, stats2.read - stats1.read) * 1024,
      write: Math.max(0, stats2.write - stats1.write) * 1024
    };
  } catch {
    return { read: 0, write: 0 };
  }
}

export async function getNetworkMetrics(): Promise<NetworkMetrics> {
  try {
    const { stdout } = await execAsync(
      "netstat -ibn | grep -E '^en[0-9]' | awk '{print $7, $10}'"
    );
    
    let bytesReceived = 0;
    let bytesSent = 0;
    
    stdout.trim().split("\n").forEach(line => {
      const [recv, sent] = line.split(" ").map(v => parseInt(v) || 0);
      bytesReceived += recv;
      bytesSent += sent;
    });
    
    const { stdout: packets } = await execAsync(
      "netstat -s -p ip | grep -E 'packets (received|sent)' | awk '{print $1}'"
    );
    
    const packetValues = packets.trim().split("\n").map(v => parseInt(v) || 0);
    
    return {
      bytesReceived,
      bytesSent,
      packetsIn: packetValues[0] || 0,
      packetsOut: packetValues[1] || 0
    };
  } catch (error) {
    throw new Error(`Failed to get network metrics: ${error}`);
  }
}

export async function getTopProcesses(limit: number = 10): Promise<ProcessInfo[]> {
  try {
    const { stdout } = await execAsync(
      `ps aux | sort -k3 -r | head -${limit + 1} | tail -${limit}`
    );
    
    const processes: ProcessInfo[] = [];
    const lines = stdout.trim().split("\n");
    
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 11) {
        processes.push({
          user: parts[0],
          pid: parseInt(parts[1]),
          cpu: parseFloat(parts[2]),
          memory: parseFloat(parts[3]),
          memoryMB: parseInt(parts[5]) / 1024,
          state: parts[7],
          name: parts.slice(10).join(" ")
        });
      }
    }
    
    return processes;
  } catch (error) {
    throw new Error(`Failed to get top processes: ${error}`);
  }
}

export async function getTemperatures(): Promise<Record<string, number>> {
  try {
    const { stdout } = await execAsync(
      "sudo powermetrics --samplers smc -i 1 -n 1 | grep -E 'temperature|temp'"
    );
    
    const temps: Record<string, number> = {};
    const lines = stdout.split("\n");
    
    lines.forEach(line => {
      const match = line.match(/^(.+?):\s+([\d.]+)/);
      if (match) {
        temps[match[1].trim()] = parseFloat(match[2]);
      }
    });
    
    return temps;
  } catch {
    return {};
  }
}