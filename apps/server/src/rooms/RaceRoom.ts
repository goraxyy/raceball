import { Room, type Client } from "colyseus";
import { schema, type SchemaType } from "@colyseus/schema";

// Placeholder state until protocol v1 is agreed (M1 builds the real RaceState).
const RaceState = schema({});
type RaceState = SchemaType<typeof RaceState>;

export class RaceRoom extends Room<{ state: RaceState }> {
  maxClients = 20;
  state = new RaceState();

  onJoin(client: Client) {
    console.log(client.sessionId, "joined", this.roomId);
  }

  onLeave(client: Client) {
    console.log(client.sessionId, "left", this.roomId);
  }
}
