import pytest
from models import project as project_model
from models import task as task_model
from models import execution as exec_model


class TestProjectCRUD:
    def test_create_and_get(self):
        pid = project_model.create_project("MyProject", "/tmp/proj", "A test project")
        assert pid is not None

        p = project_model.get_project(pid)
        assert p is not None
        assert p["name"] == "MyProject"
        assert p["path"] == "/tmp/proj"
        assert p["description"] == "A test project"
        assert p["status"] == "idle"

    def test_get_all_projects(self):
        project_model.create_project("P1", "/tmp/p1")
        project_model.create_project("P2", "/tmp/p2")
        projects = project_model.get_all_projects()
        assert len(projects) == 2

    def test_get_nonexistent_project(self):
        assert project_model.get_project(9999) is None

    def test_update_project_name(self):
        pid = project_model.create_project("Old", "/tmp")
        project_model.update_project(pid, name="New")
        p = project_model.get_project(pid)
        assert p["name"] == "New"

    def test_update_project_status(self):
        pid = project_model.create_project("P", "/tmp")
        project_model.update_project(pid, status="running")
        p = project_model.get_project(pid)
        assert p["status"] == "running"

    def test_update_ignores_unknown_fields(self):
        pid = project_model.create_project("P", "/tmp")
        project_model.update_project(pid, unknown_field="value")
        p = project_model.get_project(pid)
        assert p["name"] == "P"  # unchanged

    def test_delete_project(self):
        pid = project_model.create_project("ToDelete", "/tmp")
        project_model.delete_project(pid)
        assert project_model.get_project(pid) is None

    def test_delete_cascades_tasks(self):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "Task1")
        project_model.delete_project(pid)
        assert task_model.get_task(tid) is None

    def test_project_stats_empty(self):
        pid = project_model.create_project("P", "/tmp")
        stats = project_model.get_project_stats(pid)
        assert stats["total_tasks"] == 0
        assert stats["completed_tasks"] == 0

    def test_project_stats_with_tasks(self):
        pid = project_model.create_project("P", "/tmp")
        t1 = task_model.create_task(pid, "T1")
        t2 = task_model.create_task(pid, "T2")
        t3 = task_model.create_task(pid, "T3")
        task_model.update_task(t1, status="completed")
        task_model.update_task(t2, status="completed")

        stats = project_model.get_project_stats(pid)
        assert stats["total_tasks"] == 3
        assert stats["completed_tasks"] == 2


class TestTaskCRUD:
    def test_create_and_get(self):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "My Task", "do something")
        assert tid is not None

        t = task_model.get_task(tid)
        assert t["title"] == "My Task"
        assert t["prompt"] == "do something"
        assert t["status"] == "pending"
        assert t["project_id"] == pid

    def test_get_tasks_by_project(self):
        pid = project_model.create_project("P", "/tmp")
        task_model.create_task(pid, "T1")
        task_model.create_task(pid, "T2")
        tasks = task_model.get_tasks_by_project(pid)
        assert len(tasks) == 2
        assert tasks[0]["title"] == "T1"
        assert tasks[1]["title"] == "T2"

    def test_tasks_ordered_by_sort_order(self):
        pid = project_model.create_project("P", "/tmp")
        t1 = task_model.create_task(pid, "Second")
        t2 = task_model.create_task(pid, "First")
        task_model.update_task(t1, sort_order=2)
        task_model.update_task(t2, sort_order=1)

        tasks = task_model.get_tasks_by_project(pid)
        assert tasks[0]["title"] == "First"
        assert tasks[1]["title"] == "Second"

    def test_get_nonexistent_task(self):
        assert task_model.get_task(9999) is None

    def test_update_task(self):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        task_model.update_task(tid, title="Updated", status="running", prompt="new prompt")
        t = task_model.get_task(tid)
        assert t["title"] == "Updated"
        assert t["status"] == "running"
        assert t["prompt"] == "new prompt"

    def test_delete_task(self):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        task_model.delete_task(tid)
        assert task_model.get_task(tid) is None

    def test_empty_project_has_no_tasks(self):
        pid = project_model.create_project("P", "/tmp")
        assert task_model.get_tasks_by_project(pid) == []

    def test_create_task_default_prompt(self):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        t = task_model.get_task(tid)
        assert t["prompt"] == ""


class TestExecutionCRUD:
    def _make_task(self):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        return tid

    def test_create_and_get(self):
        tid = self._make_task()
        eid = exec_model.create_execution(tid, "test prompt")
        assert eid is not None

        e = exec_model.get_execution(eid)
        assert e["task_id"] == tid
        assert e["prompt"] == "test prompt"
        assert e["status"] == "running"
        assert e["cost_usd"] == 0.0

    def test_get_nonexistent_execution(self):
        assert exec_model.get_execution(9999) is None

    def test_update_execution(self):
        tid = self._make_task()
        eid = exec_model.create_execution(tid, "prompt")
        exec_model.update_execution(
            eid,
            session_id="sess-123",
            result_text="Done!",
            status="success",
            cost_usd=0.05,
            duration_ms=1234,
            num_turns=3,
            finished_at="2026-04-01T12:00:00",
        )
        e = exec_model.get_execution(eid)
        assert e["session_id"] == "sess-123"
        assert e["result_text"] == "Done!"
        assert e["status"] == "success"
        assert e["cost_usd"] == pytest.approx(0.05)
        assert e["duration_ms"] == 1234
        assert e["num_turns"] == 3

    def test_get_executions_by_task(self):
        tid = self._make_task()
        exec_model.create_execution(tid, "p1")
        exec_model.create_execution(tid, "p2")
        execs = exec_model.get_executions_by_task(tid)
        assert len(execs) == 2

    def test_update_ignores_unknown_fields(self):
        tid = self._make_task()
        eid = exec_model.create_execution(tid, "prompt")
        exec_model.update_execution(eid, unknown="value")
        e = exec_model.get_execution(eid)
        assert e["status"] == "running"  # unchanged

    def test_delete_task_cascades_executions(self):
        tid = self._make_task()
        eid = exec_model.create_execution(tid, "prompt")
        task_model.delete_task(tid)
        assert exec_model.get_execution(eid) is None

    def test_get_last_session_id_none_when_empty(self):
        tid = self._make_task()
        assert exec_model.get_last_session_id(tid) is None

    def test_get_last_session_id_returns_most_recent(self):
        tid = self._make_task()
        e1 = exec_model.create_execution(tid, "p1")
        exec_model.update_execution(e1, session_id="sess-old")
        e2 = exec_model.create_execution(tid, "p2")
        exec_model.update_execution(e2, session_id="sess-new")
        assert exec_model.get_last_session_id(tid) == "sess-new"

    def test_get_last_session_id_skips_empty(self):
        tid = self._make_task()
        e1 = exec_model.create_execution(tid, "p1")
        exec_model.update_execution(e1, session_id="sess-good")
        e2 = exec_model.create_execution(tid, "p2")
        # e2 has no session_id (e.g. failed before init)
        assert exec_model.get_last_session_id(tid) == "sess-good"
