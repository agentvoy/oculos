"""Quickstart example — register an agent and report cost."""

from oculos_sdk import Oculos

# Connect to OculOS server
ax = Oculos(server="http://localhost:9090")
ax.register(name="my-agent", framework="custom", model="gpt-4o")

# Track a task with budget
with ax.task("summarize-report", budget="$2.00") as task:
    # Your agent logic here
    result = "This is a summary of the report..."
    task.report_cost(0.045, model="gpt-4o", provider="openai", tokens_in=500, tokens_out=200)
    task.complete(result)

print("Done! Check http://localhost:9090 for your agent.")
