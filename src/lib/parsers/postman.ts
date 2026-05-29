import { ParsedSpec } from "@/store/project-store";
import { buildPostmanApiModel } from "@/lib/api-model";
import { apiModelToParsedSpec } from "@/lib/api-model/legacy";

// Postman Collection v2.1 Types
interface PostmanCollection {
    info: {
        name: string;
        description?: string;
        schema: string;
    };
    item: PostmanItem[];
    variable?: PostmanVariable[];
    auth?: PostmanAuth;
}

interface PostmanItem {
    name: string;
    description?: string;
    request?: PostmanRequest;
    item?: PostmanItem[]; // Nested folders
    response?: PostmanResponse[];
}

interface PostmanRequest {
    method: string;
    header?: PostmanHeader[];
    body?: PostmanBody;
    url: PostmanUrl | string;
    description?: string;
    auth?: PostmanAuth;
}

interface PostmanUrl {
    raw?: string;
    protocol?: string;
    host?: string[];
    path?: string[];
    query?: PostmanQuery[];
    variable?: PostmanVariable[];
}

interface PostmanHeader {
    key: string;
    value: string;
    description?: string;
    disabled?: boolean;
}

interface PostmanQuery {
    key: string;
    value?: string;
    description?: string;
    disabled?: boolean;
}

interface PostmanVariable {
    key: string;
    value?: string;
    description?: string;
}

interface PostmanBody {
    mode: "raw" | "formdata" | "urlencoded" | "file" | "graphql";
    raw?: string;
    formdata?: Array<{ key: string; value?: string; type?: string; description?: string; disabled?: boolean }>;
    urlencoded?: Array<{ key: string; value?: string; description?: string; disabled?: boolean }>;
    file?: { src?: string | string[] };
    graphql?: { query?: string; variables?: string };
    options?: {
        raw?: {
            language?: string;
        };
    };
}

interface PostmanAuth {
    type: string;
    apikey?: { key: string; value: string }[];
    bearer?: { key: string; value: string }[];
    basic?: { key: string; value: string }[];
}

interface PostmanResponse {
    name: string;
    status?: string;
    code?: number;
}

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
export function parsePostmanCollection(collection: PostmanCollection): ParsedSpec {
    return apiModelToParsedSpec(buildPostmanApiModel(collection));
}
