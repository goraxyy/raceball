import { listen } from "@colyseus/tools";
import app from "./app.config";

// Listens on process.env.PORT (Railway sets it), or 2567 locally.
listen(app);
