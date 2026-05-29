import { ParsedSpec } from "@/store/project-store";
import { buildPostmanApiModel, type PostmanBuildOptions, type PostmanCollection } from "@/lib/api-model";
import { apiModelToParsedSpec } from "@/lib/api-model/legacy";

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
