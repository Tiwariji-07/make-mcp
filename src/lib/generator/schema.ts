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

export function schemaToZodType(schema: Record<string, unknown>): string {
    if (!schema) return "z.unknown()";

    const type = schema.type as string;

    if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
        const values = schema.enum.map((value) =>
            typeof value === "string" ? JSON.stringify(value) : String(value)
        );
        return `z.enum([${values.join(", ")}])`;
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
            return items ? `z.array(${schemaToZodType(items)})` : "z.array(z.unknown())";
        }

        case "object":
        default: {
            const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
            const required = new Set((schema.required || []) as string[]);

            if (!properties || Object.keys(properties).length === 0) {
                return "z.record(z.unknown())";
            }

            const fields = Object.entries(properties).map(([key, propertySchema]) => {
                const description = propertySchema.description as string | undefined;
                let value = schemaToZodType(propertySchema);

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
