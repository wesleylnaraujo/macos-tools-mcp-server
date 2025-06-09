#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { performanceMonitor } from "./tools/performance-monitor.js";
import { spotlightEnhanced } from "./tools/spotlight-enhanced.js";

const server = new Server(
  {
    name: "macos-tools-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const SystemPerformanceSchema = z.object({
  action: z.enum(["current", "history", "processes", "optimize"]),
  timeRange: z.string().optional(),
  metric: z.enum(["cpu", "memory", "disk", "network", "all"]).optional(),
});

const EnhancedSearchSchema = z.object({
  action: z.enum(["search", "tag", "untag"]),
  query: z.string().optional(),
  searchType: z.enum(["content", "filename", "tags", "regex"]).optional(),
  fileTypes: z.array(z.string()).optional(),
  path: z.string().optional(),
  maxResults: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

const tools = [
  {
    name: "system_performance",
    description: "Monitor system performance and analyze resource usage",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["current", "history", "processes", "optimize"],
          description: "Type of performance analysis",
        },
        timeRange: {
          type: "string",
          description: "Time range for historical data (e.g., '1h', '24h', '7d')",
        },
        metric: {
          type: "string",
          enum: ["cpu", "memory", "disk", "network", "all"],
          description: "Specific metric to analyze",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "enhanced_search",
    description: "Advanced file search with content analysis and tagging",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search", "tag", "untag"],
          description: "Search or manage tags",
        },
        query: {
          type: "string",
          description: "Search query (supports regex)",
        },
        searchType: {
          type: "string",
          enum: ["content", "filename", "tags", "regex"],
          description: "Type of search to perform",
        },
        fileTypes: {
          type: "array",
          items: { type: "string" },
          description: "File extensions to include",
        },
        path: {
          type: "string",
          description: "Root directory for search",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to search for or apply",
        },
      },
      required: ["action"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "system_performance": {
        const params = SystemPerformanceSchema.parse(args);
        const result = await performanceMonitor(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "enhanced_search": {
        const params = EnhancedSearchSchema.parse(args);
        const result = await spotlightEnhanced(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid parameters: ${error.message}`);
    }
    throw error;
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("macOS Tools MCP Server started");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});