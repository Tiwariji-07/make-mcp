const MAX_SCHEMA_DEPTH = 24;
const MAX_SCHEMA_PROPERTIES = 200;
const MAX_COMPOSITION_MEMBERS = 32;

/**
 * Convert a JSON Schema fragment into a Zod expression string for generated
 * Node servers. Recursion is depth- and size-bounded so hostile client JSON
 * cannot stack-overflow or explode emitted source during generation.
 */
export function toZodType(type: string, schema?: Record<string, unknown>): string {
    if (schema) {
        return schemaToZodType(schema);
    }

    const map: Record<string, string> = {
        string: "z.string()",
        integer: "z.number().int()",
        number: "z.number()",
        boolean: "z.boolean()",
        array: "z.array(z.unknown())",
        object: "z.record(z.unknown())",
    };

    return map[type.toLowerCase()] || "z.string()";
}

export function schemaToZodType(
    schema: Record<string, unknown>,
    depth = 0,
    seen?: WeakSet<object>
): string {
    if (!schema) return "z.unknown()";
    if (depth > MAX_SCHEMA_DEPTH) return "z.unknown()";

    // Cycle detection across object identity (post-dereference graphs).
    const visited = seen ?? new WeakSet<object>();
    if (typeof schema === "object" && schema !== null) {
        if (visited.has(schema)) {
            return "z.unknown()";
        }
        visited.add(schema);
    }

    const type = schema.type as string;
    const allOf = schema.allOf as Record<string, unknown>[] | undefined;
    const oneOf = schema.oneOf as Record<string, unknown>[] | undefined;
    const anyOf = schema.anyOf as Record<string, unknown>[] | undefined;

    if (Array.isArray(allOf) && allOf.length > 0) {
        const members = allOf.slice(0, MAX_COMPOSITION_MEMBERS);
        return members
            .map((member) => schemaToZodType(member, depth + 1, visited))
            .reduce((acc, value) => `${acc}.and(${value})`);
    }

    if (Array.isArray(oneOf) && oneOf.length > 0) {
        const members = oneOf.slice(0, MAX_COMPOSITION_MEMBERS);
        if (members.length === 1) return schemaToZodType(members[0], depth + 1, visited);
        return `z.union([${members.map((member) => schemaToZodType(member, depth + 1, visited)).join(", ")}])`;
    }

    if (Array.isArray(anyOf) && anyOf.length > 0) {
        const members = anyOf.slice(0, MAX_COMPOSITION_MEMBERS);
        if (members.length === 1) return schemaToZodType(members[0], depth + 1, visited);
        return `z.union([${members.map((member) => schemaToZodType(member, depth + 1, visited)).join(", ")}])`;
    }

    if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
        const values = schema.enum;

        if (values.length === 1) {
            return `z.literal(${JSON.stringify(values[0])})`;
        }

        if (values.every((value) => typeof value === "string")) {
            return `z.enum([${values.map((value) => JSON.stringify(value)).join(", ")}])`;
        }

        return `z.union([${values.map((value) => `z.literal(${JSON.stringify(value)})`).join(", ")}])`;
    }

    switch (type) {
        case "string":
            if (schema.format === "email") return "z.string().email()";
            if (schema.format === "uri" || schema.format === "url") return "z.string().url()";
            if (schema.format === "uuid") return "z.string().uuid()";
            return "z.string()";

        case "integer":
            return "z.number().int()";

        case "number":
            return "z.number()";

        case "boolean":
            return "z.boolean()";

        case "array": {
            const items = schema.items as Record<string, unknown> | undefined;
            return items
                ? `z.array(${schemaToZodType(items, depth + 1, visited)})`
                : "z.array(z.unknown())";
        }

        case "object":
        default: {
            const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
            const required = new Set((schema.required || []) as string[]);

            if (!properties || Object.keys(properties).length === 0) {
                return "z.record(z.unknown())";
            }

            const entries = Object.entries(properties).slice(0, MAX_SCHEMA_PROPERTIES);
            const fields = entries.map(([key, propertySchema]) => {
                const description = propertySchema.description as string | undefined;
                let value = schemaToZodType(propertySchema, depth + 1, visited);

                if (!required.has(key)) {
                    value += ".optional()";
                }

                if (description) {
                    value += `.describe(${JSON.stringify(description.replace(/\n/g, " "))})`;
                }

                return `${JSON.stringify(key)}: ${value}`;
            });

            return `z.object({\n    ${fields.join(",\n    ")}\n  })`;
        }
    }
}

export function toPythonType(type: string): string {
    const map: Record<string, string> = {
        string: "str",
        integer: "int",
        number: "float",
        boolean: "bool",
        array: "list",
        object: "dict",
    };

    return map[type.toLowerCase()] || "str";
}
