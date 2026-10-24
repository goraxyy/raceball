import { defineConfig } from "tsup";

// Bundle our workspace packages in; keep npm dependencies external.
export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node24",
  clean: true,
  noExternal: [/^@raceball\//],
});
