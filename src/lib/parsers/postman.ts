import type { ParsedSpec } from "../api-model/parsed-spec.ts";
import { buildPostmanApiModel, type PostmanBuildOptions, type PostmanCollection } from "../api-model/postman.ts";
import { apiModelToParsedSpec } from "../api-model/legacy.ts";

// Check if content is a Postman Collection
export function isPostmanCollection(content: unknown): content is PostmanCollection {
    if (typeof content !== "object" || content === null) return false;
    const obj = content as Record<string, unknown>;

    // Check for Postman schema identifier
    if (obj.info && typeof obj.info === "object") {
        const info = obj.info as Record<string, unknown>;
        if (typeof info.schema === "string" && info.schema.includes("postman")) {
            return true;
        }
    }

    // Check for item array (Postman structure)
    if (Array.isArray(obj.item) && obj.info) {
        return true;
    }

    return false;
}

// Parse Postman Collection to ParsedSpec format
export function parsePostmanCollection(
    collection: PostmanCollection,
    options: PostmanBuildOptions = {}
): ParsedSpec {
    return apiModelToParsedSpec(buildPostmanApiModel(collection, {}, options));
}
