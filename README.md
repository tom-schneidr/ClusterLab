# ClusterLab

ClusterLab is a small local-first side project for designing and tracing multi-agent workflows.
It gives specialised roles (“hats”) a typed topology, shared blackboard state, review gates, and
an inspectable run history instead of treating an LLM call as a black box.

The project is intentionally scoped as a compact engineering experiment in AI orchestration and
developer tooling. It is not a hosted agent platform, a general-purpose workflow scheduler, or a
claim of autonomous production operation.

## What is implemented

- Reusable hats such as Executive, Planner, Worker, Critic, Verifier, and Memory Curator.
- A browser topology editor with typed context, delegation, review, state, escalation, and approval edges.
- Role-aware staged execution: orientation, context, planning, work, critique, revision, verification,
  approval, and memory capture.
- A structured blackboard for goals, plans, work products, objections, evidence, checks, decisions,
  and memory candidates.
- SQLite persistence for hats, topologies, runs, and chronological run events, with schema migrations.
- A provider boundary for any OpenAI-compatible `/chat/completions` endpoint.
- Run inspection in the UI: prompts, outputs, blackboard deltas, provider status, token usage, and cost fields.
- A deterministic offline demo that exercises the real orchestration and persistence path without a provider.

## Why the project is technically interesting

The strongest engineering evidence is in the boundaries between the small modules:

| Concern | Evidence in the repository |
| --- | --- |
| Typed graph model and validation | `clusterlab/api/schemas.py`, `clusterlab/topology.py` |
| Execution and review flow | `clusterlab/engine.py`, `clusterlab/defaults.py` |
| State routing and bounded prompts | `clusterlab/blackboard.py`, `clusterlab/engine.py` |
| Durable local state | `clusterlab/storage.py` and migration tests |
| Provider failure handling | `clusterlab/llm.py`, API worker diagnostics, LLM tests |
| Browser graph/editor behavior | `static/js/graph/`, `static/app.js`, static-asset tests |

The project deliberately keeps the frontend build-free and the backend small enough to inspect end
to end. CI checks Python 3.11 and 3.13, linting, formatting, tests, and package construction.

## Quickstart

Create and activate a virtual environment, then install the package with development dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
```

Copy the environment template and start the local server:

```powershell
Copy-Item .env.example .env
clusterlab
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765). FastAPI's generated API reference is available
at [http://127.0.0.1:8765/docs](http://127.0.0.1:8765/docs).

### Provider-free walkthrough

To see a successful end-to-end run without configuring an LLM, start the deterministic demo mode:

```powershell
clusterlab --offline-demo --port 8766
```

Then open [http://127.0.0.1:8766](http://127.0.0.1:8766), keep the default topology, run the task,
and open **Run Analysis**. The trace is labelled `offline-demo`, makes no network request, and is
intended to demonstrate orchestration, persistence, and UI inspection—not model quality.

If a previous server is holding a port, use another port as shown above. The default runtime database
is `data/clusterlab.db`; it is local state and is ignored by Git.

### Live provider configuration

Live runs use an OpenAI-compatible endpoint configured through `.env`:

```text
FREEROUTER_BASE_URL=http://localhost:8000/v1
FREEROUTER_API_KEY=local
FREEROUTER_MODEL=auto
CLUSTERLAB_LLM_MODE=live
CLUSTERLAB_LLM_TIMEOUT_SECONDS=60
```

The provider is not bundled. `FREEROUTER_*` is historical configuration naming for the compatible
gateway boundary; another compatible endpoint can be used by changing the base URL, key, and model.

## Architecture

1. `app.py` exposes the ASGI application and `clusterlab/cli.py` starts Uvicorn.
2. `clusterlab/app_factory.py` loads settings, initialises SQLite, mounts the static client, and
   registers the API router.
3. `clusterlab/api/` owns request validation, response models, CRUD routes, and run polling.
4. `clusterlab/engine.py` validates a topology, derives the recognised role stages, builds bounded
   prompts from typed edge context and compact blackboard state, and appends an event for every turn.
5. `clusterlab/storage.py` persists the blackboard snapshot and event trace so a run can be inspected
   after completion.
6. `static/` contains the build-free browser client and SVG graph editor.

The topology is a real persisted domain model, but the executor is intentionally role-aware rather
than a general arbitrary-DAG interpreter. Recognised Executive, Planner, Worker, Critic, Verifier,
and Memory roles drive the current staged plan; typed edges influence context and validation. A more
general durable scheduler remains future work.

## Verification

Run the same checks used by CI:

```powershell
python -m ruff check .
python -m ruff format --check .
python -m pip_audit
python -m build --sdist --wheel
python -m pytest
```

The tests cover API error responses, topology validation, blackboard updates, storage migrations and
seed behavior, provider failures, the offline end-to-end cluster path, and browser asset references.

## Operational boundaries

- The default bind address is loopback. There is no authentication or multi-user isolation; do not
  expose the development server to an untrusted network.
- Live mode sends task prompts and topology context to the configured provider. Offline demo mode
  sends nothing.
- Hat tool permissions are declarative workflow metadata in this repository. ClusterLab does not
  execute shell, filesystem, web, or other external tools itself.
- Runs use an in-process background thread. Completed runs are persisted, but in-flight work is not
  a durable job queue and can be lost if the process stops.
- The project contains no production-usage, scale, accuracy, or cost claims.

## Documentation

- [`docs/architecture.html`](docs/architecture.html) — runtime, frontend, storage, and run lifecycle.
- [`docs/development.html`](docs/development.html) — local development conventions and checks.
- [`docs/demo.html`](docs/demo.html) — short UI walkthrough.
- [`docs/roadmap.html`](docs/roadmap.html) — deliberately bounded future work.

## Status and roadmap

ClusterLab is a deliberately small side project with a compact and inspectable codebase. The next
meaningful increments are a shareable topology import/export format, richer run comparison/replay,
and a durable worker model before any multi-user deployment.
