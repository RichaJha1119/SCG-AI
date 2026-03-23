# SCG-AI

SCG-AI is a workspace with:
- `client/` (React + TypeScript + Vite UI)
- `server/` (Express API + AI generation + Salesforce + MCP server)

## Prerequisites

- Node.js 18+
- npm 10+
- OpenAI API key for generation features (`OPENAI_API_KEY` in server env)

## Install

From the workspace root:

```bash
npm install
```

## Run app (client + server)

```bash
npm run dev
```

- Client: `http://localhost:5173`
- Server API: `http://localhost:3001/api`

## Run server only

```bash
npm run start --workspace=server
```

## Run MCP server (stdio)

```bash
npm run mcp:start --workspace=server
```

The MCP process is long-running on stdio; stopping with Ctrl+C is expected.

## MCP client config example

```json
{
  "mcpServers": {
    "scg-ai": {
      "command": "npm",
      "args": ["run", "mcp:start", "--workspace=server"],
      "cwd": "C:/Users/rvash/Salesforce AI/SCG-AI"
    }
  }
}
```

## Additional docs

- Client README: `client/README.md`
- MCP orchestration blueprint: `docs/mcp-orchestration.md`

## Intent orchestration workflow

Use these commands from the workspace root:

```bash
npm run intent:eval
```

Runs the intent regression suite from `client/scripts/intent-eval-cases.json`.

```bash
npm run intent:docs
```

Regenerates:

- `docs/intent-eval-cases.md`
- `docs/intent-eval-cases-grouped.md`

```bash
npm run intent:refresh
```

Runs eval + docs generation together.

Equivalent workspace-scoped commands:

- `npm run intent:eval --workspace=client`
- `npm run intent:docs --workspace=client`
- `npm run intent:refresh --workspace=client`

CI note:

- `.github/workflows/intent-eval.yml` runs intent eval and docs generation.
- CI fails if generated docs are out of sync with `client/scripts/intent-eval-cases.json`.
