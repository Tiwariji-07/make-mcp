export interface ProjectHistoryEntry {
    id: string;
    source: string;
    savedAt: number;
}

export interface ProjectHistoryUpdate<T extends ProjectHistoryEntry> {
    projects: T[];
    evicted: T[];
}

export const SAVED_PROJECT_STORAGE_PREFIX = "makemcp-project-";

export function projectStorageKey(id: string): string {
    return `${SAVED_PROJECT_STORAGE_PREFIX}${id}`;
}

export function upsertProjectHistory<T extends ProjectHistoryEntry>(
    current: T[],
    next: T,
    limit = 10,
): ProjectHistoryUpdate<T> {
    const matching = current.find((project) => project.source === next.source);
    const entry = matching ? { ...next, id: matching.id } : next;
    const projects = [
        entry,
        ...current.filter((project) => project.id !== entry.id && project.source !== entry.source),
    ].slice(0, limit);
    const keptIds = new Set(projects.map((project) => project.id));
    const evicted = current.filter((project) => !keptIds.has(project.id));

    return { projects, evicted };
}
