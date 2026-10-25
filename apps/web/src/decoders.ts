import { MeshoptCompression } from "@babylonjs/core";

// Babylon loads its Meshopt decoder from cdn.babylonjs.com the first time a model needs it. Our models are
// Meshopt-compressed, so serve our own copy instead: a flaky venue network can't stop the map loading.
// The file is meshoptimizer's decoder (public/decoders/; refresh it with `pnpm --filter @raceball/web decoders`).
// No KTX2 textures yet: if they arrive, self-host Babylon's KTX2 decoder the same way.
MeshoptCompression.Configuration = {
  decoder: { url: "/decoders/meshopt_decoder.js" },
};
