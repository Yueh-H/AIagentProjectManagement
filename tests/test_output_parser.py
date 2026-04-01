import json
import pytest
from core.output_parser import parse_stream_line, StreamEvent


class TestParseStreamLine:
    def test_empty_line_returns_none(self):
        assert parse_stream_line("") is None
        assert parse_stream_line("   ") is None

    def test_invalid_json_returns_none(self):
        assert parse_stream_line("not json") is None
        assert parse_stream_line("{broken") is None

    def test_init_event(self):
        data = {
            "type": "system",
            "subtype": "init",
            "session_id": "sess-abc123",
            "model": "claude-opus-4-6",
            "tools": ["Read", "Edit"],
            "cwd": "/tmp/project",
        }
        event = parse_stream_line(json.dumps(data))
        assert event is not None
        assert event.event_type == "init"
        assert event.session_id == "sess-abc123"
        assert event.raw["model"] == "claude-opus-4-6"

    def test_system_non_init_is_unknown(self):
        data = {"type": "system", "subtype": "api_retry", "attempt": 1}
        event = parse_stream_line(json.dumps(data))
        assert event.event_type == "unknown"

    def test_assistant_text_event(self):
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "Hello world"},
                ]
            },
        }
        event = parse_stream_line(json.dumps(data))
        assert event.event_type == "assistant"
        assert event.text == "Hello world"

    def test_assistant_multiple_text_parts(self):
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "Part 1"},
                    {"type": "text", "text": "Part 2"},
                ]
            },
        }
        event = parse_stream_line(json.dumps(data))
        assert event.text == "Part 1\nPart 2"

    def test_assistant_tool_use(self):
        data = {
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "Let me check"},
                    {"type": "tool_use", "name": "Read", "input": {"path": "/tmp"}},
                ]
            },
        }
        event = parse_stream_line(json.dumps(data))
        assert event.event_type == "assistant"
        assert "Let me check" in event.text
        assert "[工具呼叫: Read]" in event.text

    def test_assistant_empty_content(self):
        data = {"type": "assistant", "message": {"content": []}}
        event = parse_stream_line(json.dumps(data))
        assert event.event_type == "assistant"
        assert event.text is None

    def test_assistant_string_content(self):
        data = {
            "type": "assistant",
            "message": {"content": ["raw string part"]},
        }
        event = parse_stream_line(json.dumps(data))
        assert event.text == "raw string part"

    def test_result_event_success(self):
        data = {
            "type": "result",
            "result": "Task completed successfully",
            "is_error": False,
            "session_id": "sess-xyz",
            "total_cost_usd": 0.0523,
            "duration_ms": 12345,
            "num_turns": 5,
        }
        event = parse_stream_line(json.dumps(data))
        assert event.event_type == "result"
        assert event.session_id == "sess-xyz"
        assert event.text == "Task completed successfully"
        assert event.is_error is False
        assert event.cost_usd == pytest.approx(0.0523)
        assert event.duration_ms == 12345
        assert event.num_turns == 5

    def test_result_event_error(self):
        data = {
            "type": "result",
            "result": "Something went wrong",
            "is_error": True,
            "total_cost_usd": 0.01,
            "duration_ms": 500,
            "num_turns": 1,
        }
        event = parse_stream_line(json.dumps(data))
        assert event.is_error is True
        assert event.text == "Something went wrong"

    def test_tool_result_event(self):
        data = {
            "type": "tool_result",
            "content": "file contents here",
        }
        event = parse_stream_line(json.dumps(data))
        assert event.event_type == "tool_result"
        assert event.text == "file contents here"

    def test_unknown_event_type(self):
        data = {"type": "something_new", "data": 123}
        event = parse_stream_line(json.dumps(data))
        assert event.event_type == "unknown"
        assert event.raw["data"] == 123

    def test_missing_type_field(self):
        data = {"foo": "bar"}
        event = parse_stream_line(json.dumps(data))
        assert event.event_type == "unknown"

    def test_result_missing_optional_fields(self):
        data = {"type": "result", "result": "done"}
        event = parse_stream_line(json.dumps(data))
        assert event.event_type == "result"
        assert event.session_id is None
        assert event.cost_usd == 0.0
        assert event.duration_ms == 0
        assert event.num_turns == 0
        assert event.is_error is False


class TestStreamEventDefaults:
    def test_defaults(self):
        e = StreamEvent(event_type="test")
        assert e.session_id is None
        assert e.text is None
        assert e.is_error is False
        assert e.cost_usd == 0.0
        assert e.duration_ms == 0
        assert e.num_turns == 0
        assert e.raw == {}
