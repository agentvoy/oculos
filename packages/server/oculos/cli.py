"""OculOS CLI — `oculos up`, `oculos status`, `oculos agents`."""

from __future__ import annotations

import asyncio
import sys

import click
import httpx
import uvicorn
from rich.console import Console
from rich.table import Table

console = Console()

DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 9090
DEFAULT_URL = f"http://localhost:{DEFAULT_PORT}"


@click.group()
def cli():
    """OculOS — The control plane for AI agents."""
    pass


@cli.command()
@click.option("--host", default=DEFAULT_HOST, help="Bind host")
@click.option("--port", "-p", default=DEFAULT_PORT, type=int, help="Bind port")
@click.option("--db", default=None, help="Database file path")
@click.option("--reload", is_flag=True, help="Enable auto-reload (dev mode)")
def up(host: str, port: int, db: str | None, reload: bool):
    """Start the OculOS server."""
    from oculos.app import create_app

    console.print(f"\n[bold blue]  OculOS[/bold blue] v0.1.0", highlight=False)
    console.print(f"  Dashboard: [link]http://localhost:{port}[/link]")
    console.print(f"  API:       [link]http://localhost:{port}/api/status[/link]")
    console.print()

    app = create_app(db_path=db)
    uvicorn.run(app, host=host, port=port, log_level="info", reload=reload)


@cli.command()
@click.option("--url", default=DEFAULT_URL, help="OculOS server URL")
def status(url: str):
    """Show server status."""
    try:
        resp = httpx.get(f"{url}/api/status", timeout=5)
        data = resp.json()
        console.print(f"\n[bold green]  OculOS is running[/bold green]")
        console.print(f"  Version:  {data['version']}")
        console.print(f"  Agents:   {data['agents_count']}")
        console.print(f"  Cost:     ${data['total_cost']:.4f}")
        console.print()
    except httpx.ConnectError:
        console.print("\n[bold red]  OculOS is not running[/bold red]")
        console.print(f"  Tried: {url}")
        console.print("  Start with: [bold]oculos up[/bold]\n")
        sys.exit(1)


@cli.group()
def agents():
    """Manage agents."""
    pass


@agents.command("list")
@click.option("--url", default=DEFAULT_URL, help="OculOS server URL")
def agents_list(url: str):
    """List all registered agents."""
    try:
        resp = httpx.get(f"{url}/api/agents", timeout=5)
        data = resp.json()

        if not data["agents"]:
            console.print("\n  No agents registered yet.\n")
            return

        table = Table(title="Agents")
        table.add_column("Name", style="bold")
        table.add_column("Status")
        table.add_column("Framework")
        table.add_column("Model")
        table.add_column("Cost", justify="right")
        table.add_column("Invocations", justify="right")

        status_colors = {
            "healthy": "green",
            "degraded": "yellow",
            "offline": "red",
            "unknown": "dim",
        }

        for agent in data["agents"]:
            color = status_colors.get(agent["status"], "dim")
            table.add_row(
                agent["name"],
                f"[{color}]{agent['status']}[/{color}]",
                agent.get("framework") or "-",
                agent.get("model") or "-",
                f"${agent['total_cost']:.4f}",
                str(agent["total_invocations"]),
            )

        console.print()
        console.print(table)
        console.print()

    except httpx.ConnectError:
        console.print("\n[bold red]  OculOS is not running[/bold red]\n")
        sys.exit(1)


@agents.command("add")
@click.argument("name")
@click.option("--health-url", default=None, help="Health check URL")
@click.option("--framework", default=None, help="Agent framework")
@click.option("--model", default=None, help="Model name")
@click.option("--url", default=DEFAULT_URL, help="OculOS server URL")
def agents_add(name: str, health_url: str | None, framework: str | None, model: str | None, url: str):
    """Register a new agent."""
    try:
        payload = {"name": name}
        if health_url:
            payload["health_url"] = health_url
        if framework:
            payload["framework"] = framework
        if model:
            payload["model"] = model

        resp = httpx.post(f"{url}/api/agents", json=payload, timeout=5)
        if resp.status_code == 201:
            agent = resp.json()
            console.print(f"\n[bold green]  Agent '{name}' registered[/bold green]")
            console.print(f"  ID: {agent['id']}\n")
        elif resp.status_code == 409:
            console.print(f"\n[bold yellow]  Agent '{name}' already exists[/bold yellow]\n")
        else:
            console.print(f"\n[bold red]  Error: {resp.text}[/bold red]\n")

    except httpx.ConnectError:
        console.print("\n[bold red]  OculOS is not running[/bold red]\n")
        sys.exit(1)


@agents.command("remove")
@click.argument("agent_id")
@click.option("--url", default=DEFAULT_URL, help="OculOS server URL")
def agents_remove(agent_id: str, url: str):
    """Remove an agent by ID."""
    try:
        resp = httpx.delete(f"{url}/api/agents/{agent_id}", timeout=5)
        if resp.status_code == 204:
            console.print(f"\n[bold green]  Agent removed[/bold green]\n")
        else:
            console.print(f"\n[bold red]  Agent not found[/bold red]\n")

    except httpx.ConnectError:
        console.print("\n[bold red]  OculOS is not running[/bold red]\n")
        sys.exit(1)


if __name__ == "__main__":
    cli()
