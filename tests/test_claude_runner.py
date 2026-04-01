import json
import pytest
from unittest.mock import MagicMock, patch
from core.claude_runner import ClaudeRunner
from core.output_parser import StreamEvent


class TestClaudeRunnerArgs:
    """Test that ClaudeRunner builds correct command arguments."""

    @pytest.fixture
    def runner(self, qapp):
        return ClaudeRunner()

    def test_basic_prompt_args(self, runner):
        with patch.object(runner, "_process", create=True) as mock_proc:
            mock_proc = MagicMock()
            with patch("core.claude_runner.QProcess", return_value=mock_proc):
                runner.run_prompt("hello", "/tmp/proj")
                mock_proc.start.assert_called_once()
                args = mock_proc.start.call_args
                cmd = args[0][0]
                cmd_args = args[0][1]
                assert cmd == "claude"
                assert "-p" in cmd_args
                assert "hello" in cmd_args
                assert "--output-format" in cmd_args
                assert "stream-json" in cmd_args
                assert "--verbose" in cmd_args
                mock_proc.setWorkingDirectory.assert_called_with("/tmp/proj")

    def test_resume_session_arg(self, runner):
        with patch("core.claude_runner.QProcess") as MockQProcess:
            mock_proc = MagicMock()
            MockQProcess.return_value = mock_proc
            runner.run_prompt("hello", "/tmp", session_id="sess-abc")
            cmd_args = mock_proc.start.call_args[0][1]
            assert "--resume" in cmd_args
            assert "sess-abc" in cmd_args

    def test_allowed_tools_arg(self, runner):
        with patch("core.claude_runner.QProcess") as MockQProcess:
            mock_proc = MagicMock()
            MockQProcess.return_value = mock_proc
            runner.run_prompt("hello", "/tmp", allowed_tools=["Read", "Edit"])
            cmd_args = mock_proc.start.call_args[0][1]
            assert "--allowedTools" in cmd_args
            assert "Read,Edit" in cmd_args

    def test_max_turns_arg(self, runner):
        with patch("core.claude_runner.QProcess") as MockQProcess:
            mock_proc = MagicMock()
            MockQProcess.return_value = mock_proc
            runner.run_prompt("hello", "/tmp", max_turns=5)
            cmd_args = mock_proc.start.call_args[0][1]
            assert "--max-turns" in cmd_args
            assert "5" in cmd_args

    def test_no_optional_args_when_none(self, runner):
        with patch("core.claude_runner.QProcess") as MockQProcess:
            mock_proc = MagicMock()
            MockQProcess.return_value = mock_proc
            runner.run_prompt("hello", "/tmp")
            cmd_args = mock_proc.start.call_args[0][1]
            assert "--resume" not in cmd_args
            assert "--allowedTools" not in cmd_args
            assert "--max-turns" not in cmd_args


class TestClaudeRunnerEventHandling:
    """Test internal event handling logic."""

    @pytest.fixture
    def runner(self, qapp):
        return ClaudeRunner()

    def test_handle_init_event(self, runner):
        event = StreamEvent(event_type="init", session_id="sess-123")
        started_signals = []
        runner.started.connect(lambda sid: started_signals.append(sid))
        runner._handle_event(event)
        assert runner._session_id == "sess-123"
        assert started_signals == ["sess-123"]

    def test_handle_result_event_success(self, runner):
        event = StreamEvent(
            event_type="result",
            session_id="sess-456",
            text="All done",
            is_error=False,
        )
        runner._handle_event(event)
        assert runner._session_id == "sess-456"
        assert runner._result_text == "All done"
        assert runner._success is True

    def test_handle_result_event_error(self, runner):
        event = StreamEvent(
            event_type="result",
            text="Failed",
            is_error=True,
        )
        runner._handle_event(event)
        assert runner._result_text == "Failed"
        assert runner._success is False

    def test_handle_result_without_session_id_keeps_existing(self, runner):
        runner._session_id = "existing-sess"
        event = StreamEvent(event_type="result", text="ok")
        runner._handle_event(event)
        assert runner._session_id == "existing-sess"

    def test_handle_non_init_non_result_does_nothing(self, runner):
        runner._session_id = ""
        event = StreamEvent(event_type="assistant", text="hello")
        runner._handle_event(event)
        assert runner._session_id == ""

    def test_is_running_false_initially(self, runner):
        assert runner.is_running is False


class TestClaudeRunnerBuffering:
    """Test stdout buffering and line splitting."""

    @pytest.fixture
    def runner(self, qapp):
        r = ClaudeRunner()
        r._process = MagicMock()
        return r

    def test_complete_line_parsed(self, runner):
        events = []
        runner.stream_event.connect(lambda e: events.append(e))

        init_json = json.dumps({"type": "system", "subtype": "init", "session_id": "s1"})
        runner._buffer = init_json + "\n"

        # Simulate _on_stdout logic manually
        while "\n" in runner._buffer:
            line, runner._buffer = runner._buffer.split("\n", 1)
            line = line.strip()
            if line:
                from core.output_parser import parse_stream_line
                event = parse_stream_line(line)
                if event:
                    runner.stream_event.emit(event)
                    runner._handle_event(event)

        assert len(events) == 1
        assert events[0].event_type == "init"

    def test_partial_line_buffered(self, runner):
        events = []
        runner.stream_event.connect(lambda e: events.append(e))

        # Only partial data, no newline
        runner._buffer = '{"type": "result"'

        lines_found = 0
        while "\n" in runner._buffer:
            lines_found += 1
            line, runner._buffer = runner._buffer.split("\n", 1)

        assert lines_found == 0
        assert len(events) == 0
        assert runner._buffer == '{"type": "result"'

    def test_multiple_lines_at_once(self, runner):
        events = []
        runner.stream_event.connect(lambda e: events.append(e))

        line1 = json.dumps({"type": "system", "subtype": "init", "session_id": "s1"})
        line2 = json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "hi"}]}})
        runner._buffer = line1 + "\n" + line2 + "\n"

        from core.output_parser import parse_stream_line
        while "\n" in runner._buffer:
            line, runner._buffer = runner._buffer.split("\n", 1)
            line = line.strip()
            if line:
                event = parse_stream_line(line)
                if event:
                    runner.stream_event.emit(event)
                    runner._handle_event(event)

        assert len(events) == 2
        assert events[0].event_type == "init"
        assert events[1].event_type == "assistant"
