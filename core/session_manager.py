from PyQt6.QtCore import QObject, pyqtSignal
from core.claude_runner import ClaudeRunner
from core.output_parser import StreamEvent
from models import execution as exec_model
from models import task as task_model
from models import project as project_model
from datetime import datetime


class SessionManager(QObject):
    execution_started = pyqtSignal(int)  # execution_id
    execution_finished = pyqtSignal(int)  # execution_id
    execution_output = pyqtSignal(int, object)  # execution_id, StreamEvent

    def __init__(self, parent=None):
        super().__init__(parent)
        self._runners: dict[int, ClaudeRunner] = {}  # execution_id -> runner

    def start_execution(
        self,
        task_id: int,
        prompt: str,
        working_dir: str,
        session_id: str | None = None,
        allowed_tools: list[str] | None = None,
        max_turns: int | None = None,
    ) -> int:
        execution_id = exec_model.create_execution(task_id, prompt)
        task_model.update_task(task_id, status="running")

        # Update project status
        task = task_model.get_task(task_id)
        if task:
            project_model.update_project(task["project_id"], status="running")

        runner = ClaudeRunner(self)
        self._runners[execution_id] = runner

        runner.stream_event.connect(
            lambda evt, eid=execution_id: self._on_stream_event(eid, evt)
        )
        runner.started.connect(
            lambda sid, eid=execution_id: self._on_started(eid, sid)
        )
        runner.finished.connect(
            lambda sid, success, result, eid=execution_id: self._on_finished(
                eid, sid, success, result
            )
        )
        runner.error_occurred.connect(
            lambda msg, eid=execution_id: self._on_error(eid, msg)
        )

        runner.run_prompt(
            prompt, working_dir,
            session_id=session_id,
            allowed_tools=allowed_tools,
            max_turns=max_turns,
        )
        self.execution_started.emit(execution_id)
        return execution_id

    def _on_stream_event(self, execution_id: int, event: StreamEvent):
        self.execution_output.emit(execution_id, event)

    def _on_started(self, execution_id: int, session_id: str):
        exec_model.update_execution(execution_id, session_id=session_id)

    def _on_finished(
        self, execution_id: int, session_id: str, success: bool, result_text: str
    ):
        status = "success" if success else "error"
        exec_model.update_execution(
            execution_id,
            session_id=session_id,
            result_text=result_text,
            status=status,
            finished_at=datetime.now().isoformat(),
        )

        # Update task status
        execution = exec_model.get_execution(execution_id)
        if execution:
            task_status = "completed" if success else "failed"
            task_model.update_task(execution["task_id"], status=task_status)

            # Recalculate project status
            task = task_model.get_task(execution["task_id"])
            if task:
                self._update_project_status(task["project_id"])

        # Clean up runner
        if execution_id in self._runners:
            self._runners[execution_id].deleteLater()
            del self._runners[execution_id]

        self.execution_finished.emit(execution_id)

    def _on_error(self, execution_id: int, message: str):
        exec_model.update_execution(
            execution_id,
            result_text=f"錯誤: {message}",
            status="error",
            finished_at=datetime.now().isoformat(),
        )

    def _update_project_status(self, project_id: int):
        tasks = task_model.get_tasks_by_project(project_id)
        if not tasks:
            project_model.update_project(project_id, status="idle")
            return
        statuses = [t["status"] for t in tasks]
        if any(s == "running" for s in statuses):
            project_model.update_project(project_id, status="running")
        elif all(s == "completed" for s in statuses):
            project_model.update_project(project_id, status="completed")
        elif any(s == "failed" for s in statuses):
            project_model.update_project(project_id, status="failed")
        else:
            project_model.update_project(project_id, status="idle")

    def cancel_execution(self, execution_id: int):
        runner = self._runners.get(execution_id)
        if runner:
            runner.cancel()

    def get_active_count(self) -> int:
        return len(self._runners)
