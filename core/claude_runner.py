from PyQt6.QtCore import QObject, QProcess, pyqtSignal
from core.output_parser import parse_stream_line, StreamEvent


class ClaudeRunner(QObject):
    output_line = pyqtSignal(str)
    stream_event = pyqtSignal(object)  # StreamEvent
    started = pyqtSignal(str)  # session_id
    finished = pyqtSignal(str, bool, str)  # session_id, success, result_text
    error_occurred = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._process: QProcess | None = None
        self._buffer: str = ""
        self._session_id: str = ""
        self._result_text: str = ""
        self._success: bool = True

    def run_prompt(
        self,
        prompt: str,
        working_dir: str,
        session_id: str | None = None,
        allowed_tools: list[str] | None = None,
        max_turns: int | None = None,
    ):
        args = ["-p", prompt, "--output-format", "stream-json", "--verbose"]
        if session_id:
            args += ["--resume", session_id]
        if allowed_tools:
            args += ["--allowedTools", ",".join(allowed_tools)]
        if max_turns:
            args += ["--max-turns", str(max_turns)]

        self._process = QProcess(self)
        self._process.setWorkingDirectory(working_dir)
        self._process.readyReadStandardOutput.connect(self._on_stdout)
        self._process.readyReadStandardError.connect(self._on_stderr)
        self._process.finished.connect(self._on_finished)
        self._process.errorOccurred.connect(self._on_error)
        self._process.start("claude", args)

    def _on_stdout(self):
        data = self._process.readAllStandardOutput().data().decode("utf-8", errors="replace")
        self._buffer += data

        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            line = line.strip()
            if not line:
                continue

            self.output_line.emit(line)
            event = parse_stream_line(line)
            if event:
                self.stream_event.emit(event)
                self._handle_event(event)

    def _handle_event(self, event: StreamEvent):
        if event.event_type == "init" and event.session_id:
            self._session_id = event.session_id
            self.started.emit(event.session_id)
        elif event.event_type == "result":
            if event.session_id:
                self._session_id = event.session_id
            self._result_text = event.text or ""
            self._success = not event.is_error

    def _on_stderr(self):
        data = self._process.readAllStandardError().data().decode("utf-8", errors="replace")
        if data.strip():
            self.error_occurred.emit(data.strip())

    def _on_finished(self, exit_code: int, exit_status):
        # Process any remaining buffer
        if self._buffer.strip():
            event = parse_stream_line(self._buffer.strip())
            if event:
                self.stream_event.emit(event)
                self._handle_event(event)
            self._buffer = ""

        success = self._success and exit_code == 0
        self.finished.emit(self._session_id, success, self._result_text)

    def _on_error(self, error):
        error_map = {
            QProcess.ProcessError.FailedToStart: "無法啟動 claude 指令，請確認已安裝 Claude Code CLI",
            QProcess.ProcessError.Crashed: "Claude 程序意外終止",
            QProcess.ProcessError.Timedout: "Claude 程序逾時",
        }
        msg = error_map.get(error, f"程序錯誤: {error}")
        self.error_occurred.emit(msg)

    def cancel(self):
        if self._process and self._process.state() != QProcess.ProcessState.NotRunning:
            self._process.kill()

    @property
    def is_running(self) -> bool:
        return (
            self._process is not None
            and self._process.state() != QProcess.ProcessState.NotRunning
        )
