import json
from dataclasses import dataclass, field


@dataclass
class StreamEvent:
    event_type: str  # "init", "assistant", "tool_use", "tool_result", "result", "unknown"
    session_id: str | None = None
    text: str | None = None
    is_error: bool = False
    cost_usd: float = 0.0
    duration_ms: int = 0
    num_turns: int = 0
    raw: dict = field(default_factory=dict)


def parse_stream_line(line: str) -> StreamEvent | None:
    line = line.strip()
    if not line:
        return None
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        return None

    event_type = data.get("type", "unknown")

    # System init event
    if event_type == "system" and data.get("subtype") == "init":
        return StreamEvent(
            event_type="init",
            session_id=data.get("session_id"),
            raw=data,
        )

    # Assistant message
    if event_type == "assistant":
        message = data.get("message", {})
        content_parts = message.get("content", [])
        text_parts = []
        for part in content_parts:
            if isinstance(part, dict):
                if part.get("type") == "text":
                    text_parts.append(part.get("text", ""))
                elif part.get("type") == "tool_use":
                    text_parts.append(f"[工具呼叫: {part.get('name', '?')}]")
            elif isinstance(part, str):
                text_parts.append(part)
        return StreamEvent(
            event_type="assistant",
            text="\n".join(text_parts) if text_parts else None,
            raw=data,
        )

    # Result event
    if event_type == "result":
        return StreamEvent(
            event_type="result",
            session_id=data.get("session_id"),
            text=data.get("result", ""),
            is_error=data.get("is_error", False),
            cost_usd=data.get("total_cost_usd", 0.0),
            duration_ms=data.get("duration_ms", 0),
            num_turns=data.get("num_turns", 0),
            raw=data,
        )

    # Tool result
    if event_type == "tool_result":
        return StreamEvent(
            event_type="tool_result",
            text=str(data.get("content", "")),
            raw=data,
        )

    return StreamEvent(event_type="unknown", raw=data)
