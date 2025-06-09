# macOS Tools MCP Server Development Prompt

Create a comprehensive MCP (Model Context Protocol) server for macOS that provides advanced system monitoring and file search capabilities. The server should be built using TypeScript/Node.js and follow MCP server best practices.

## Project Structure
```
macos-tools-mcp/
├── src/
│   ├── index.ts              # Main MCP server entry point
│   ├── tools/
│   │   ├── performance-monitor.ts
│   │   ├── spotlight-enhanced.ts
│   │   └── types.ts
│   ├── utils/
│   │   ├── system-info.ts
│   │   ├── file-search.ts
│   │   └── cache.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Core Requirements

### 1. System Performance Monitor Tool
Implement a tool named `system_performance` with the following capabilities:

**Real-time Monitoring:**
- CPU usage (overall and per-core)
- Memory usage (used, available, pressure)
- Disk I/O statistics
- Network activity
- GPU usage (if available)
- Temperature sensors

**Process Analysis:**
- List top 10 resource-consuming processes
- CPU usage per process
- Memory usage per process
- Process hierarchy and dependencies
- Ability to identify suspicious or unusual process behavior

**Historical Tracking:**
- Store performance metrics in a local SQLite database
- Track patterns over time (hourly, daily, weekly)
- Identify performance degradation trends
- Generate performance reports

**Optimization Suggestions:**
- Analyze usage patterns and suggest:
  - Apps to quit based on inactivity
  - Memory optimization opportunities
  - Startup item recommendations
  - Cache cleaning suggestions
  - Background process optimizations

### 2. Spotlight Enhanced Search Tool
Implement a tool named `enhanced_search` with the following capabilities:

**Deep Content Search:**
- Search within file contents, not just metadata
- Support for various file types:
  - Code files (.js, .ts, .py, .swift, .m, .java, etc.)
  - Documents (.txt, .md, .pdf, .docx)
  - Configuration files (.json, .yaml, .plist)
  - Log files
- Binary file analysis (strings extraction)

**Advanced Search Features:**
- Full regex pattern matching
- Boolean operators (AND, OR, NOT)
- Proximity search (words within N distance)
- Fuzzy matching for typos
- Search by file attributes (size, date, permissions)

**Tag-Based Organization:**
- Create custom tags for files and folders
- Store tags in extended attributes (xattr)
- Search by single or multiple tags
- Tag inheritance from parent directories
- Bulk tagging operations

**Search Optimization:**
- Build and maintain search index
- Incremental indexing for new/modified files
- Exclude patterns (.gitignore style)
- Multi-threaded search operations
- Results ranking by relevance

## Implementation Details

### MCP Server Configuration
```typescript
// Define tools with proper schemas
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
          description: "Type of performance analysis"
        },
        timeRange: {
          type: "string",
          description: "Time range for historical data (e.g., '1h', '24h', '7d')"
        },
        metric: {
          type: "string",
          enum: ["cpu", "memory", "disk", "network", "all"],
          description: "Specific metric to analyze"
        }
      },
      required: ["action"]
    }
  },
  {
    name: "enhanced_search",
    description: "Advanced file search with content analysis and tagging",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (supports regex)"
        },
        searchType: {
          type: "string",
          enum: ["content", "filename", "tags", "regex"],
          description: "Type of search to perform"
        },
        fileTypes: {
          type: "array",
          items: { type: "string" },
          description: "File extensions to include"
        },
        path: {
          type: "string",
          description: "Root directory for search"
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to search for or apply"
        },
        action: {
          type: "string",
          enum: ["search", "tag", "untag"],
          description: "Search or manage tags"
        }
      },
      required: ["action"]
    }
  }
];
```

### Key Technical Requirements

1. **Use Native macOS APIs:**
   - Use `child_process` to execute system commands (ps, top, iostat)
   - Leverage `mdfind` for Spotlight integration
   - Use `xattr` commands for extended attributes
   - Access system information via sysctl

2. **Performance Considerations:**
   - Implement caching for frequently accessed data
   - Use streaming for large file processing
   - Implement request debouncing
   - Add configurable performance limits

3. **Security & Permissions:**
   - Request appropriate permissions (Full Disk Access)
   - Sanitize all inputs for shell commands
   - Implement rate limiting
   - Add option to exclude sensitive directories

4. **Error Handling:**
   - Graceful degradation when permissions are missing
   - Comprehensive error messages
   - Fallback strategies for unsupported operations
   - Logging for debugging

5. **Configuration:**
   - Support .env configuration
   - Allow customization of:
     - Search index location
     - Performance data retention
     - Excluded paths
     - Update intervals

### Example Usage Patterns

```typescript
// Performance monitoring examples
await callTool("system_performance", {
  action: "current",
  metric: "all"
});

await callTool("system_performance", {
  action: "history",
  timeRange: "24h",
  metric: "memory"
});

await callTool("system_performance", {
  action: "processes",
  metric: "cpu"
});

await callTool("system_performance", {
  action: "optimize"
});

// Enhanced search examples
await callTool("enhanced_search", {
  action: "search",
  query: "TODO|FIXME",
  searchType: "regex",
  fileTypes: ["js", "ts", "py"],
  path: "~/Projects"
});

await callTool("enhanced_search", {
  action: "tag",
  path: "~/Documents/important.pdf",
  tags: ["urgent", "project-x"]
});

await callTool("enhanced_search", {
  action: "search",
  searchType: "tags",
  tags: ["urgent", "review"],
  path: "~/Documents"
});
```

## Additional Features to Implement

1. **Smart Notifications:**
   - Alert when CPU/memory usage exceeds thresholds
   - Notify about disk space issues
   - Performance anomaly detection

2. **Integration Features:**
   - Export performance data to CSV/JSON
   - Search results as structured data
   - Webhook support for monitoring alerts

3. **CLI Interface:**
   - Provide command-line tools for both features
   - Support for scripting and automation

Build this as a production-ready MCP server with comprehensive error handling, logging, and documentation. Include installation instructions for both the server and any required system dependencies.
```

