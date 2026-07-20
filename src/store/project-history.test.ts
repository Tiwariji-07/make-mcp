import assert from "node:assert/strict";
import test from "node:test";
import { projectStorageKey, upsertProjectHistory } from "./project-history.ts";

test("saving the same source updates its history entry instead of duplicating it", () => {
    const current = [{ id: "existing", source: "petstore.json", savedAt: 1, name: "Old" }];
    const update = upsertProjectHistory(current, {
        id: "new-id",
        source: "petstore.json",
        savedAt: 2,
        name: "Updated",
    });

    assert.deepEqual(update.projects, [
        { id: "existing", source: "petstore.json", savedAt: 2, name: "Updated" },
    ]);
    assert.deepEqual(update.evicted, []);
});

test("history returns evicted entries so their storage blobs can be removed", () => {
    const current = Array.from({ length: 10 }, (_, index) => ({
        id: `id-${index}`,
        source: `spec-${index}.json`,
        savedAt: 10 - index,
    }));
    const update = upsertProjectHistory(current, {
        id: "new-id",
        source: "new.json",
        savedAt: 11,
    });

    assert.equal(update.projects.length, 10);
    assert.deepEqual(update.evicted.map((project) => project.id), ["id-9"]);
    assert.equal(projectStorageKey("id-9"), "makemcp-project-id-9");
});
