from types import SimpleNamespace

import pytest
from bson import ObjectId
from fastapi.encoders import jsonable_encoder

from backend import server


class Cursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, key, _direction):
        return Cursor(sorted(self.documents, key=lambda document: document.get(key, "")))

    async def to_list(self, _limit):
        return [dict(document) for document in self.documents]


class FakeWorkTypes:
    def __init__(self, documents=None):
        self.documents = documents or []

    @staticmethod
    def matches(document, query):
        for key, value in query.items():
            if isinstance(value, dict) and "$ne" in value:
                if document.get(key) == value["$ne"]:
                    return False
            elif document.get(key) != value:
                return False
        return True

    async def find_one(self, query, _projection=None):
        return next((dict(document) for document in self.documents if self.matches(document, query)), None)

    async def insert_one(self, document):
        # Matches PyMongo's important behavior: it mutates the supplied dict.
        document["_id"] = ObjectId()
        self.documents.append(dict(document))
        return SimpleNamespace(inserted_id=document["_id"])

    def find(self, query, _projection=None):
        return Cursor([document for document in self.documents if self.matches(document, query)])

    async def update_one(self, query, update, upsert=False):
        current = next((document for document in self.documents if self.matches(document, query)), None)
        if current:
            current.update(update.get("$set", {}))
        elif upsert:
            self.documents.append({**query, **update.get("$setOnInsert", {})})
        return SimpleNamespace()


@pytest.fixture
def work_types(monkeypatch):
    collection = FakeWorkTypes()
    monkeypatch.setattr(server, "db", SimpleNamespace(work_types=collection))

    async def no_defaults(_business_id):
        return None

    monkeypatch.setattr(server, "ensure_default_work_types", no_defaults)
    return collection


@pytest.mark.asyncio
async def test_create_work_type_strips_inserted_object_id(work_types):
    result = await server.create_work_type(
        server.WorkTypeCreate(name="Salesman"),
        {"business_id": "business-a"},
    )

    assert result["name"] == "Salesman"
    assert "_id" not in result
    assert "_id" in work_types.documents[0]
    assert jsonable_encoder(result) == result


@pytest.mark.asyncio
async def test_list_and_update_work_types_are_safe_and_business_scoped(work_types):
    work_types.documents.extend([
        {"_id": ObjectId(), "id": "a", "business_id": "business-a", "name": "Barber", "normalized_name": "barber", "is_active": True, "created_at": "now", "updated_at": "now"},
        {"_id": ObjectId(), "id": "b", "business_id": "business-b", "name": "Other", "normalized_name": "other", "is_active": True, "created_at": "now", "updated_at": "now"},
    ])
    admin = {"business_id": "business-a"}

    listed = await server.list_work_types(False, admin)
    renamed = await server.update_work_type("a", server.WorkTypeUpdate(name="Salon"), admin)
    deactivated = await server.update_work_type("a", server.WorkTypeUpdate(is_active=False), admin)

    assert [item["id"] for item in listed] == ["a"]
    assert all("_id" not in item for item in listed)
    assert renamed["name"] == "Salon"
    assert "_id" not in renamed
    assert deactivated["is_active"] is False
    assert "_id" not in deactivated
    assert jsonable_encoder({"list": listed, "updated": renamed})["updated"]["name"] == "Salon"


@pytest.mark.asyncio
async def test_work_type_duplicate_is_case_insensitive(work_types):
    work_types.documents.append({"_id": ObjectId(), "id": "a", "business_id": "business-a", "name": "Salesman", "normalized_name": "salesman", "is_active": True})

    with pytest.raises(server.HTTPException) as error:
        await server.create_work_type(server.WorkTypeCreate(name="salesman"), {"business_id": "business-a"})

    assert error.value.status_code == 409
