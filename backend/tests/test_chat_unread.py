from types import SimpleNamespace

import pytest

from backend import server


class FakeMessages:
    def __init__(self, documents):
        self.documents = documents

    @staticmethod
    def matches(document, query):
        return all(document.get(key) == value for key, value in query.items())

    async def find_one(self, query, projection=None, sort=None):
        matches = [document for document in self.documents if self.matches(document, query)]
        if sort:
            matches.sort(key=lambda document: document.get(sort[0][0], ""))
        if not matches:
            return None
        if projection:
            return {key: matches[0].get(key) for key, enabled in projection.items() if enabled and key != "_id"}
        return dict(matches[0])

    class Cursor:
        def __init__(self, documents):
            self.documents = documents

        async def to_list(self, _limit):
            return self.documents

    def find(self, query, projection=None):
        matches = [document for document in self.documents if self.matches(document, query)]
        if projection:
            matches = [
                {key: document.get(key) for key, enabled in projection.items() if enabled and key != "_id"}
                for document in matches
            ]
        return self.Cursor(matches)

    async def update_many(self, query, update):
        modified = 0
        for document in self.documents:
            if self.matches(document, query):
                document.update(update["$set"])
                modified += 1
        return SimpleNamespace(modified_count=modified)

    async def count_documents(self, query):
        return sum(self.matches(document, query) for document in self.documents)


@pytest.mark.asyncio
async def test_admin_read_marks_only_selected_worker_messages_and_returns_total(monkeypatch):
    messages = FakeMessages([
        {"id": "first", "conversation_id": "a", "business_id": "biz", "worker_id": "w1", "sender_type": "worker", "read_at": None, "created_at": "1"},
        {"id": "second", "conversation_id": "a", "business_id": "biz", "worker_id": "w1", "sender_type": "worker", "read_at": None, "created_at": "2"},
        {"id": "outgoing", "conversation_id": "a", "business_id": "biz", "worker_id": "w1", "sender_type": "owner", "read_at": None, "created_at": "3"},
        {"id": "other-worker", "conversation_id": "b", "business_id": "biz", "worker_id": "w2", "sender_type": "worker", "read_at": None, "created_at": "4"},
    ])
    monkeypatch.setattr(server, "db", SimpleNamespace(messages=messages))

    result = await server.persist_conversation_read("a", True, {"business_id": "biz", "worker_id": "w1"})

    assert result["marked_read"] == 2
    assert result["first_unread_message_id"] == "first"
    assert result["unread_count"] == 0
    assert result["total_unread_count"] == 1
    assert next(item for item in messages.documents if item["id"] == "outgoing")["read_at"] is None


@pytest.mark.asyncio
async def test_worker_read_marks_only_owner_messages(monkeypatch):
    messages = FakeMessages([
        {"id": "owner-message", "conversation_id": "a", "business_id": "biz", "worker_id": "w1", "sender_type": "owner", "read_at": None, "created_at": "1"},
        {"id": "worker-message", "conversation_id": "a", "business_id": "biz", "worker_id": "w1", "sender_type": "worker", "read_at": None, "created_at": "2"},
        {"id": "different-worker", "conversation_id": "b", "business_id": "biz", "worker_id": "w2", "sender_type": "owner", "read_at": None, "created_at": "3"},
    ])
    monkeypatch.setattr(server, "db", SimpleNamespace(messages=messages))

    result = await server.persist_conversation_read("a", False, {"business_id": "biz", "worker_id": "w1"})

    assert result["marked_read"] == 1
    assert result["unread_count"] == 0
    assert result["total_unread_count"] == 0
    assert next(item for item in messages.documents if item["id"] == "worker-message")["read_at"] is None
    assert next(item for item in messages.documents if item["id"] == "different-worker")["read_at"] is None
