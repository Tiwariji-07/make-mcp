import type { CSSProperties } from "react";

const tools = [
  { method: "GET", path: "/pets", tone: "green" },
  { method: "POST", path: "/orders", tone: "blue" },
  { method: "PUT", path: "/pets/{id}", tone: "amber" },
  { method: "DELETE", path: "/orders/{id}", tone: "red" },
] as const;

export function ApiMintScene({ compact = false }: { compact?: boolean }) {
  return (
    <figure
      className={`mint-scene ${compact ? "mint-scene--compact" : ""}`}
      aria-labelledby={compact ? "mint-scene-mobile-title" : "mint-scene-title"}
    >
      <figcaption className="mint-scene__header">
        <span id={compact ? "mint-scene-mobile-title" : "mint-scene-title"}>
          API minting rig
        </span>
        <span className="mint-scene__status">
          <span aria-hidden="true" /> live model
        </span>
      </figcaption>

      <div className="mint-scene__viewport" aria-hidden="true">
        <div className="mint-rig">
          <div className="mint-slab mint-spec">
            <div className="mint-spec__label">OPENAPI 3.1</div>
            <div className="mint-spec__title">petstore.yaml</div>
            <div className="mint-spec__lines">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="mint-spec__count">8 endpoints</div>
          </div>

          <div className="mint-conveyor mint-conveyor--in">
            <span />
          </div>

          <div className="mint-core">
            <span className="mint-core__face">MCP</span>
            <span className="mint-core__top" />
            <span className="mint-core__side" />
          </div>

          <div className="mint-conveyor mint-conveyor--out">
            <span />
          </div>

          <div className="mint-tools">
            {tools.map((tool, index) => (
              <div
                key={`${tool.method}-${tool.path}`}
                className={`mint-tool mint-tool--${tool.tone}`}
                style={{ "--tool-index": index } as CSSProperties}
              >
                <span>{tool.method}</span>
                <code>{tool.path}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mint-scene__readout" aria-label="Generated server summary">
        <span><b>8</b> tools</span>
        <span><b>~678</b> context tokens</span>
        <span><b>✓</b> trust scanned</span>
      </div>
    </figure>
  );
}
