# ClusterLab

ClusterLab is a minimal local playground for experimenting with cognitive agent clusters.

One human role can be modeled as several hats:

- Executive
- Planner
- Context Keeper
- Worker
- Critic
- Verifier
- Memory Curator
- Custom hats

## Run

Install the Python dependencies:

```powershell
pip install -r requirements.txt
```

Start the local server:

```powershell
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8765
```

Open:

```text
http://127.0.0.1:8765
```

## LLM Configuration

Mock mode works without credentials.

Live mode uses an OpenAI-compatible FreeRouter endpoint configured with:

- `FREEROUTER_BASE_URL`
- `FREEROUTER_API_KEY`
- `FREEROUTER_MODEL`

Copy `.env.example` to `.env` and fill in the values needed for live mode.
