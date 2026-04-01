import pytest
from core.session_manager import SessionManager
from models import project as project_model
from models import task as task_model
from models import execution as exec_model
from models import agent as agent_model


class TestSessionManagerStatusLogic:
    """Test _update_project_status logic without running actual processes."""

    @pytest.fixture
    def mgr(self, qapp):
        return SessionManager()

    def _make_project_with_tasks(self, statuses: list[str]) -> int:
        pid = project_model.create_project("P", "/tmp")
        for i, s in enumerate(statuses):
            tid = task_model.create_task(pid, f"T{i}")
            task_model.update_task(tid, status=s)
        return pid

    def test_no_tasks_sets_idle(self, mgr):
        pid = project_model.create_project("P", "/tmp")
        mgr._update_project_status(pid)
        p = project_model.get_project(pid)
        assert p["status"] == "idle"

    def test_all_completed_sets_completed(self, mgr):
        pid = self._make_project_with_tasks(["completed", "completed"])
        mgr._update_project_status(pid)
        p = project_model.get_project(pid)
        assert p["status"] == "completed"

    def test_any_running_sets_running(self, mgr):
        pid = self._make_project_with_tasks(["completed", "running", "pending"])
        mgr._update_project_status(pid)
        p = project_model.get_project(pid)
        assert p["status"] == "running"

    def test_any_failed_no_running_sets_failed(self, mgr):
        pid = self._make_project_with_tasks(["completed", "failed"])
        mgr._update_project_status(pid)
        p = project_model.get_project(pid)
        assert p["status"] == "failed"

    def test_all_pending_sets_idle(self, mgr):
        pid = self._make_project_with_tasks(["pending", "pending"])
        mgr._update_project_status(pid)
        p = project_model.get_project(pid)
        assert p["status"] == "idle"

    def test_running_takes_priority_over_failed(self, mgr):
        pid = self._make_project_with_tasks(["running", "failed", "completed"])
        mgr._update_project_status(pid)
        p = project_model.get_project(pid)
        assert p["status"] == "running"

    def test_get_active_count_initially_zero(self, mgr):
        assert mgr.get_active_count() == 0


class TestSessionManagerOnFinished:
    """Test _on_finished callback updates DB correctly."""

    @pytest.fixture
    def mgr(self, qapp):
        return SessionManager()

    def test_on_finished_success(self, mgr):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        aid = agent_model.create_agent(tid, "Agent 1")
        eid = exec_model.create_execution(tid, "prompt", agent_id=aid)

        finished_signals = []
        mgr.execution_finished.connect(lambda x: finished_signals.append(x))

        mgr._on_finished(eid, "sess-123", True, "All done")

        e = exec_model.get_execution(eid)
        assert e["status"] == "success"
        assert e["result_text"] == "All done"
        assert e["session_id"] == "sess-123"
        assert e["finished_at"] is not None

        a = agent_model.get_agent(aid)
        assert a["status"] == "completed"
        assert a["session_id"] == "sess-123"

        t = task_model.get_task(tid)
        assert t["status"] == "completed"

        p = project_model.get_project(pid)
        assert p["status"] == "completed"

        assert finished_signals == [eid]

    def test_on_finished_error(self, mgr):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        aid = agent_model.create_agent(tid, "Agent 1")
        eid = exec_model.create_execution(tid, "prompt", agent_id=aid)

        mgr._on_finished(eid, "sess-456", False, "Error occurred")

        e = exec_model.get_execution(eid)
        assert e["status"] == "error"

        a = agent_model.get_agent(aid)
        assert a["status"] == "failed"

        t = task_model.get_task(tid)
        assert t["status"] == "failed"

        p = project_model.get_project(pid)
        assert p["status"] == "failed"

    def test_on_error_updates_execution(self, mgr):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        eid = exec_model.create_execution(tid, "prompt")

        mgr._on_error(eid, "Process crashed")

        e = exec_model.get_execution(eid)
        assert e["status"] == "error"
        assert "Process crashed" in e["result_text"]
        assert e["finished_at"] is not None

    def test_on_started_saves_session_id(self, mgr):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        aid = agent_model.create_agent(tid, "Agent 1")
        eid = exec_model.create_execution(tid, "prompt", agent_id=aid)

        mgr._on_started(eid, "sess-new")

        e = exec_model.get_execution(eid)
        assert e["session_id"] == "sess-new"

        # Also saved to agent
        a = agent_model.get_agent(aid)
        assert a["session_id"] == "sess-new"

    def test_multi_agent_task_status(self, mgr):
        """Task with multiple agents: running if any running, completed if all completed."""
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        a1 = agent_model.create_agent(tid, "Agent 1")
        a2 = agent_model.create_agent(tid, "Agent 2")

        # Agent 1 finishes
        e1 = exec_model.create_execution(tid, "p1", agent_id=a1)
        mgr._on_finished(e1, "s1", True, "done")

        # Agent 2 still idle → task should not be fully completed
        t = task_model.get_task(tid)
        # One completed, one idle → pending (not all completed)
        assert t["status"] == "pending"

        # Agent 2 also finishes
        e2 = exec_model.create_execution(tid, "p2", agent_id=a2)
        mgr._on_finished(e2, "s2", True, "done")

        t = task_model.get_task(tid)
        assert t["status"] == "completed"
