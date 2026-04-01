import pytest
from models import project as project_model
from models import task as task_model
from models import agent as agent_model
from models import execution as exec_model


class TestAgentCRUD:
    def _make_task(self):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        return tid

    def test_create_with_auto_name(self):
        tid = self._make_task()
        a1 = agent_model.create_agent(tid)
        a2 = agent_model.create_agent(tid)
        agent1 = agent_model.get_agent(a1)
        agent2 = agent_model.get_agent(a2)
        assert agent1["name"] == "Agent 1"
        assert agent2["name"] == "Agent 2"

    def test_create_with_custom_name(self):
        tid = self._make_task()
        aid = agent_model.create_agent(tid, "My Agent")
        agent = agent_model.get_agent(aid)
        assert agent["name"] == "My Agent"

    def test_get_agents_by_task(self):
        tid = self._make_task()
        agent_model.create_agent(tid, "A1")
        agent_model.create_agent(tid, "A2")
        agents = agent_model.get_agents_by_task(tid)
        assert len(agents) == 2
        assert agents[0]["name"] == "A1"
        assert agents[1]["name"] == "A2"

    def test_get_nonexistent_agent(self):
        assert agent_model.get_agent(9999) is None

    def test_update_agent(self):
        tid = self._make_task()
        aid = agent_model.create_agent(tid, "A")
        agent_model.update_agent(aid, name="B", session_id="sess-1", status="running")
        a = agent_model.get_agent(aid)
        assert a["name"] == "B"
        assert a["session_id"] == "sess-1"
        assert a["status"] == "running"

    def test_delete_agent(self):
        tid = self._make_task()
        aid = agent_model.create_agent(tid, "A")
        agent_model.delete_agent(aid)
        assert agent_model.get_agent(aid) is None

    def test_delete_task_cascades_agents(self):
        tid = self._make_task()
        aid = agent_model.create_agent(tid, "A")
        task_model.delete_task(tid)
        assert agent_model.get_agent(aid) is None

    def test_default_status_is_idle(self):
        tid = self._make_task()
        aid = agent_model.create_agent(tid)
        a = agent_model.get_agent(aid)
        assert a["status"] == "idle"


class TestExecutionWithAgent:
    def test_create_execution_with_agent(self):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        aid = agent_model.create_agent(tid, "A1")

        eid = exec_model.create_execution(tid, "prompt", agent_id=aid)
        e = exec_model.get_execution(eid)
        assert e["agent_id"] == aid

    def test_get_executions_by_agent(self):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        a1 = agent_model.create_agent(tid, "A1")
        a2 = agent_model.create_agent(tid, "A2")

        exec_model.create_execution(tid, "p1", agent_id=a1)
        exec_model.create_execution(tid, "p2", agent_id=a1)
        exec_model.create_execution(tid, "p3", agent_id=a2)

        assert len(exec_model.get_executions_by_agent(a1)) == 2
        assert len(exec_model.get_executions_by_agent(a2)) == 1

    def test_get_last_session_id_by_agent(self):
        pid = project_model.create_project("P", "/tmp")
        tid = task_model.create_task(pid, "T")
        a1 = agent_model.create_agent(tid, "A1")
        a2 = agent_model.create_agent(tid, "A2")

        e1 = exec_model.create_execution(tid, "p1", agent_id=a1)
        exec_model.update_execution(e1, session_id="sess-a1")
        e2 = exec_model.create_execution(tid, "p2", agent_id=a2)
        exec_model.update_execution(e2, session_id="sess-a2")

        assert exec_model.get_last_session_id_by_agent(a1) == "sess-a1"
        assert exec_model.get_last_session_id_by_agent(a2) == "sess-a2"
