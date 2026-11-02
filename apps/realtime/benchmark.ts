import WebSocket from "ws";

const PORT = 8792;
process.env.REALTIME_PORT = String(PORT);
const WS_URL = `ws://localhost:${PORT}`;

const CLIENT_COUNT = 100;
const EVENTS_PER_CLIENT = 50;

async function runBenchmark() {
  await import("./src/server.js");
  await new Promise(r => setTimeout(r, 1000)); // wait for server

  console.log(`Starting benchmark against ${WS_URL}...`);
  console.log(`Clients: ${CLIENT_COUNT}, Events per client: ${EVENTS_PER_CLIENT}`);

  const roomId = "benchmark-room-" + Date.now();
  // Connect host first
  const hostWs = await new Promise<WebSocket>((resolve) => {
    const ws = new WebSocket(WS_URL);
    ws.on("open", () => {
      ws.send(JSON.stringify({
        t: "join_room",
        roomId,
        clientId: "bench-host-client",
        lastSeenSeq: 0,
        displayName: "Bench Host"
      }));
      resolve(ws);
    });
  });

  const clients: WebSocket[] = [hostWs];

  // Connect remaining clients
  const connectPromises = Array.from({ length: CLIENT_COUNT - 1 }).map((_, i) => {
    return new Promise<WebSocket>((resolve) => {
      const ws = new WebSocket(WS_URL);
      ws.on("open", () => {
        ws.send(JSON.stringify({
          t: "join_room",
          roomId,
          clientId: `bench-client-${i}`,
          lastSeenSeq: 0,
          displayName: `Bench ${i}`
        }));
        resolve(ws);
      });
    });
  });

  const restClients = await Promise.all(connectPromises);
  const connectedClients = [hostWs, ...restClients];
  console.log("All clients connected.");

  // Have host and client 1 take seats
  hostWs.send(JSON.stringify({ t: "submit_event", roomId, clientEventId: "setup-1", event: { t: "take_seat", seat: "p1" } }));
  restClients[0].send(JSON.stringify({ t: "submit_event", roomId, clientEventId: "setup-2", event: { t: "take_seat", seat: "p2" } }));
  await new Promise(r => setTimeout(r, 500));
  
  // Host starts game
  hostWs.send(JSON.stringify({ t: "submit_event", roomId, clientEventId: "setup-3", event: { t: "start_game" } }));
  await new Promise(r => setTimeout(r, 500));

  let totalSuccess = 0;
  let totalFailed = 0;
  const latencies: number[] = [];

  const start = Date.now();

  let hostClient = connectedClients[0];
  let hostPendingEventId: string | null = null;
  let hostSendTime = 0;
  let totalEventsSent = 0;
  const targetEvents = 500; // Host sends 500 events
  let receivedAcks = 0; // Host receives ack
  
  // All clients measure how fast they receive the broadcast
  const clientLatencies: number[][] = Array.from({ length: CLIENT_COUNT }, () => []);

  const sendNextEvent = () => {
    if (totalEventsSent >= targetEvents) return;
    totalEventsSent++;
    hostPendingEventId = `bench-evt-${totalEventsSent}`;
    hostSendTime = Date.now();
    hostClient.send(JSON.stringify({
      t: "submit_event",
      roomId,
      clientEventId: hostPendingEventId,
      event: { t: "stack_note", text: `Benchmark ${totalEventsSent}` }
    }));
  };

  const eventPromises = connectedClients.map((ws, i) => {
    return new Promise<void>((resolve) => {
      let clientReceived = 0;
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "event_committed" && msg.event.event.t === "stack_note" && msg.event.event.text.startsWith("Benchmark")) {
          clientLatencies[i].push(Date.now() - hostSendTime);
          clientReceived++;
          if (i === 0) {
            receivedAcks++;
            sendNextEvent();
          }
          if (clientReceived >= targetEvents) {
            resolve();
          }
        }
      });
    });
  });

  sendNextEvent();
  
  // Wait 5 seconds
  await new Promise(r => setTimeout(r, 5000));

  const duration = 5000;
  connectedClients.forEach(ws => ws.close());


  const allLatencies = clientLatencies.flat();
  const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
  const maxLatency = Math.max(...allLatencies);
  const minLatency = Math.min(...allLatencies);
  const p99Latency = allLatencies.sort((a, b) => a - b)[Math.floor(allLatencies.length * 0.99)] || 0;
  
  const totalEvents = CLIENT_COUNT * targetEvents;
  const totalSuccessEvents = allLatencies.length;
  const successRate = (totalSuccessEvents / totalEvents) * 100;

  console.log("\n--- Benchmark Report ---");
  console.log(`Total Broadcasts Processed: ${totalSuccessEvents} / ${totalEvents}`);
  console.log(`Success Rate: ${successRate.toFixed(2)}%`);
  console.log(`Total Duration: ${duration}ms`);
  console.log(`Throughput: ${(totalSuccessEvents / (duration / 1000)).toFixed(2)} broadcasts/sec`);
  console.log(`Average Latency: ${avgLatency.toFixed(2)}ms`);
  console.log(`Min Latency: ${minLatency}ms`);
  console.log(`Max Latency: ${maxLatency}ms`);
  console.log(`P99 Latency: ${p99Latency}ms`);

  if (p99Latency <= 100 && successRate >= 99.9) {
    console.log("\n✅ Criteria met: <100ms latency & >=99.9% success rate");
  } else {
    console.log("\n❌ Criteria failed");
  }
}

runBenchmark().catch(console.error);