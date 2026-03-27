import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import { join } from "path";

const WEAI_API_URL = "http://127.0.0.1:42069/api";

const userHome = process.env.USERPROFILE || process.env.HOME || process.cwd();
const settingsPath = fs.existsSync("F:\\AzWorkspace\\weservices_settings.json") 
  ? "F:\\AzWorkspace\\weservices_settings.json" 
  : join(userHome, ".weservices", "settings.json");

function isMcpEnabled() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      if (data.enableMcp === false) return false;
    }
  } catch(e) {}
  return true;
}

const server = new Server(
  {
    name: "weservices-mcp",
    version: "0.1.21",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 1. List tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_services",
        description: "Fetch the list of all registered WeServices and their current statuses (running/stopped).",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_metrics",
        description: "Get the current system metrics tracking (CPU %, VRAM, RAM, GPU %) for all running WeServices.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "start_service",
        description: "Start a specific WeService cleanly using its ID. Use 'all' as the ID to start all registered services at once.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique ID of the service to start (or 'all')",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "stop_service",
        description: "Stop a specific WeService nicely using its ID. Use 'all' as the ID to stop every running service.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique ID of the service to stop (or 'all')",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "restart_service",
        description: "Restart a running WeService. Gracefully stops then starts it. Use 'all' to restart everything.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique ID of the service to restart (or 'all')",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "cleanup_zombies",
        description: "Force kill all known ghost or zombie processes completely (Node, Python, Pwsh, Cargo). USE WITH CAUTION.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  };
});

// 2. Call tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!isMcpEnabled()) {
    return {
      content: [{ type: "text", text: "[MCP Bridge Error] The WeServices MCP Bridge is strictly DISABLED in WeServices settings. Please enable it in the UI." }],
      isError: true,
    };
  }
  try {
    const { name, arguments: args } = request.params;
    
    // GET Actions
    if (name === "get_services") {
      const res = await fetch(`${WEAI_API_URL}/services`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to reach WeServices Hub on 42069`);
      const data = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    
    if (name === "get_metrics") {
      const res = await fetch(`${WEAI_API_URL}/metrics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to reach WeServices Hub on 42069`);
      const data = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    if (name === "cleanup_zombies") {
      const res = await fetch(`${WEAI_API_URL}/cleanup`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to reach WeServices Hub on 42069`);
      const data = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    
    // Actions requiring an ID
    if (name === "start_service" || name === "stop_service" || name === "restart_service") {
      if (!args || typeof args.id !== "string") {
        throw new Error("Missing or invalid argument: 'id' must be a string");
      }
      const action = name.split("_")[0]; // start, stop, restart
      const res = await fetch(`${WEAI_API_URL}/services/${args.id}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to execute '${action}' on service '${args.id}'`);
      const data = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `[MCP Bridge Error] ${error.message} (Is WeServices running? The API at ${WEAI_API_URL} must be active)`,
        },
      ],
      isError: true,
    };
  }
});

// 3. Keep running / Stdio transport
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("WeServices MCP Bridge is running on stdio");
}

run().catch((error) => {
  console.error("Fatal error running WeServices MCP Server:", error);
  process.exit(1);
});
