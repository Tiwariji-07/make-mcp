import { gzipSync } from "node:zlib";

function writeString(target: Uint8Array, offset: number, length: number, value: string): void {
    const encoded = new TextEncoder().encode(value);
    if (encoded.length > length) throw new Error(`tar field is too long: ${value}`);
    target.set(encoded, offset);
}

function octal(value: number, length: number): string {
    return value.toString(8).padStart(length - 1, "0") + "\0";
}

export function createTarGzip(files: ReadonlyMap<string, string>): Buffer {
    const chunks: Buffer[] = [];
    for (const [name, content] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        const body = Buffer.from(content, "utf8");
        const header = Buffer.alloc(512);
        writeString(header, 0, 100, name);
        writeString(header, 100, 8, octal(0o644, 8));
        writeString(header, 108, 8, octal(0, 8));
        writeString(header, 116, 8, octal(0, 8));
        writeString(header, 124, 12, octal(body.length, 12));
        writeString(header, 136, 12, octal(0, 12));
        header.fill(0x20, 148, 156);
        header[156] = "0".charCodeAt(0);
        writeString(header, 257, 6, "ustar\0");
        writeString(header, 263, 2, "00");
        writeString(header, 265, 32, "mcpmint");
        writeString(header, 297, 32, "mcpmint");
        const checksum = header.reduce((sum, byte) => sum + byte, 0);
        writeString(header, 148, 8, checksum.toString(8).padStart(6, "0") + "\0 ");
        chunks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
    }
    chunks.push(Buffer.alloc(1024));
    return gzipSync(Buffer.concat(chunks), { level: 9 });
}
