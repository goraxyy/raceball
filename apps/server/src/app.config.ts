import { defineRoom, defineServer, playground } from "colyseus";
import { RaceRoom } from "./rooms/RaceRoom";

export default defineServer({
  rooms: {
    race: defineRoom(RaceRoom),
  },
  express: (app) => {
    app.get("/health", (_req, res) => {
      res.send("ok");
    });
    if (process.env.NODE_ENV !== "production") {
      app.use("/", playground());
    }
  },
});
