# ClusterLab

ClusterLab is a local-first workbench for experimenting with cognitive agent clusters:
small teams of specialized "hats" that plan, work, critique, verify, and preserve useful
memory around a task.

## Current Capabilities

- Define reusable hats such as Executive, Planner, Worker, Critic, Verifier, and Memory Curator.
- Arrange hats into typed topology graphs with delegation, context, review, escalation, state, and approval edges.
- Run a task through a staged cluster workflow.
- Persist hats, topologies, runs, and run events locally in SQLite.
- Inspect prompts, outputs, blackboard changes, decisions, objections, and verification checks.
- Route model calls through an OpenAI-compatible endpoint.

## Project Status

ClusterLab is a productizing prototype: useful as a local research and design tool, with
the codebase kept intentionally small and inspectable.

## Quickstart

Create and activate a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install the package with development dependencies:

```powershell
python -m pip install -e ".[dev]"
```

Alternatively, install only the runtime dependencies:

```powershell
python -m pip install -r requirements.txt
```

Copy the environment template:

```powershell
Copy-Item .env.example .env
```

Start the local server on `127.0.0.1:8765`:

```powershell
clusterlab
```

Or without the console script:

```powershell
python -m clusterlab
```

Open the app:

```text
http://127.0.0.1:8765
```

If the page never loads, a previous server instance may still be holding port `8765`
(common after using auto-reload or closing the terminal without stopping the server).
Start on another port:

```powershell
clusterlab --port 8766
```

Then open `http://127.0.0.1:8766`.

## LLM Configuration

ClusterLab runs against an OpenAI-compatible FreeRouter endpoint configured with:

- `FREEROUTER_BASE_URL`
- `FREEROUTER_API_KEY`
- `FREEROUTER_MODEL`

Local `.env` files are loaded automatically at startup. The default values point to a
local OpenAI-compatible server at `http://localhost:8000/v1`.

For local browser access, CORS origins can be configured with:

- `CLUSTERLAB_CORS_ORIGINS`

Use a comma-separated list, for example:

```text
CLUSTERLAB_CORS_ORIGINS=http://127.0.0.1:8765,http://localhost:8765
```

## Development

Run the test suite:

```powershell
python -m pytest
```

Run linting:

```powershell
python -m ruff check .
```

Format code:

```powershell
python -m ruff format .
```

## Architecture

Human-readable project docs:

- `docs/architecture.html`
- `docs/development.html`
- `docs/demo.html`
- `docs/roadmap.html`

## Roadmap

- Improve the topology editor UI and visual polish.
- Add import/export for cluster presets.
- Add richer run comparison and replay tools.
- Add schema migrations before changing persisted data structures.
- Add optional provider profiles for different OpenAI-compatible endpoints.
