import { db } from "./db/tables";
import { getFronting } from "./db/tables/frontingEntries";
import { deleteFile } from "./serialization";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8080";
const WS_AUTH_TOKEN = import.meta.env.VITE_WS_AUTH_TOKEN || "";
const USER_ID = import.meta.env.VITE_USER_ID || "unknown";

let ws: WebSocket | undefined = undefined;
let reconnectTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
let pingInterval: ReturnType<typeof setInterval> | undefined = undefined;
let frontersInterval: ReturnType<typeof setInterval> | undefined = undefined;
let isAuthorized = false;

function createConnection() {
	ws = new WebSocket(WS_URL);

	ws.onopen = () => {
		console.log("[WebSocket] Connected");
		attemptAuth();
		startPingPong();
		startFrontersInterval();
	};

	ws.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data);
			console.log("[WebSocket] Received:", data);

			if (data.type === "pong") {
				console.log("[WebSocket] Pong received");
				return;
			}

			if (data.type == "login" && data.result === "success") {
				isAuthorized = true;
				console.log("[WebSocket] Authenticated successfully");
				void sendCurrentFronters();
				return;
			}

			console.warn("[WebSocket] Unexpected response:", data);
		} catch (e) {
			console.error("[WebSocket] Failed to parse message:", e);
		}
	};

	ws.onerror = (error) => {
		console.error("[WebSocket] Error:", error);
	};

	ws.onclose = () => {
		console.log("[WebSocket] Disconnected");
		stopPingPong();
		stopFrontersInterval();
		isAuthorized = false;

		if (reconnectTimeout) clearTimeout(reconnectTimeout);
		reconnectTimeout = setTimeout(createConnection, 10000);
	};
}

function attemptAuth() {
	const authMessage = {
		user: USER_ID,
		auth: WS_AUTH_TOKEN
	};

	ws?.send(JSON.stringify(authMessage));
}

function startPingPong() {
	stopPingPong();
	pingInterval = setInterval(() => {
		if (ws?.readyState === WebSocket.OPEN) {
			console.log("[WebSocket] Sending ping");
			ws.send(JSON.stringify({ type: "ping" }));
		}
	}, 30000);
}

function stopPingPong() {
	if (pingInterval) {
		clearInterval(pingInterval);
	}
}

function startFrontersInterval() {
	stopFrontersInterval();
	frontersInterval = setInterval(() => {
		void sendCurrentFronters();
	}, 5 * 60 * 1000); // 5 minutes
}

function stopFrontersInterval() {
	if (frontersInterval) {
		clearInterval(frontersInterval);
	}
}

async function sendCurrentFronters() {
	if (!isAuthorized || !ws) return;

	try {
		const fronters = await getFronting();
		const frontersWithMembers = await Promise.all(
			fronters.map(async (fe) => {
				const member = await db.members.get(fe.member);
				return {
					frontingEntry: fe,
					member: member
				};
			})
		);

		const serialized = await deleteFile(structuredClone(frontersWithMembers));
		const message = {
			type: "fronters",
			data: serialized
		};

		ws.send(JSON.stringify(message));
		console.log("[WebSocket] Sent current fronters");
	} catch (e) {
		console.error("[WebSocket] Failed to send fronters:", e);
	}
}

export async function initWebSocket() {
	console.log("[WebSocket] Initializing connection to", WS_URL);
	createConnection();
}

export function reconnect() {
	stopPingPong();
	stopFrontersInterval();
	if (ws) {
		ws.close();
		ws = undefined;
	}
	if (reconnectTimeout) clearTimeout(reconnectTimeout);
	createConnection();
}

export async function sendFrontingChanged() {
	if (isAuthorized) {
		await sendCurrentFronters();
	}
}
