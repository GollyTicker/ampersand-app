import { getFronting } from "./db/tables/frontingEntries";
import { getCustomFields } from "./db/tables/customFields";
import { webSocketConfig } from "./config";
import { watch } from "vue";

watch(webSocketConfig, () => {
	stopPingPong();
	stopFrontersInterval();
	if (ws) {
		ws.close();
		ws = undefined;
	}
	if (reconnectTimeout) clearTimeout(reconnectTimeout);
	if (webSocketConfig.enabled && webSocketConfig.wsUrl)
		createConnection();
});

let ws: WebSocket | undefined = undefined;
let reconnectTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
let pingInterval: ReturnType<typeof setInterval> | undefined = undefined;
let frontersInterval: ReturnType<typeof setInterval> | undefined = undefined;
let isAuthorized = false;
let privacyFieldUuid: string | undefined;

async function resolvePrivacyField() {
	if (privacyFieldUuid !== undefined)
		return;

	for await (const field of getCustomFields()) {
		if (field.name === "pluralsync-privacy") {
			privacyFieldUuid = field.uuid;
			break;
		}
	}
}

function createConnection() {
	if (!webSocketConfig.enabled || !webSocketConfig.wsUrl) {
		console.log("[WebSocket] Disabled or no URL configured");
		return;
	}

	ws = new WebSocket(webSocketConfig.wsUrl);

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

			if (data.type === "ping") {
				console.log("[WebSocket] Server ping received, sending pong");
				ws?.send(JSON.stringify({ type: "pong" }));
				return;
			}

			if (data.type === "login" && data.result === "success") {
				isAuthorized = true;
				console.log("[WebSocket] Authenticated successfully");
				void sendCurrentFronters();
				return;
			}

			if (data.type === "error") {
				console.error("[WebSocket] Login failed:", data.result, data.data);
				ws?.close();
				return;
			}

			if (data.type === "fronters.response" && data.result === "error") {
				console.error("[WebSocket] Fronters send failed:", data.data);
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
		type: "login",
		user: webSocketConfig.wsUserId,
		auth: webSocketConfig.wsAuthToken
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
	if (pingInterval)
		clearInterval(pingInterval);
}

function startFrontersInterval() {
	stopFrontersInterval();
	frontersInterval = setInterval(() => {
		void sendCurrentFronters();
	}, 5 * 60 * 1000); // 5 minutes
}

function stopFrontersInterval() {
	if (frontersInterval)
		clearInterval(frontersInterval);
}

function getPrivacy(_memberUuid: string, customFields: Map<string, string> | undefined): "public" | "private" {
	if (!privacyFieldUuid) return "public";

	const value = customFields?.get(privacyFieldUuid);
	if (value === "private") return "private";

	return "public";
}

async function sendCurrentFronters() {
	if (!isAuthorized || ws?.readyState !== WebSocket.OPEN) return;

	try {
		await resolvePrivacyField();

		const fronters = await getFronting();
		const frontersWithMembers = fronters.map((fe) => ({
			frontingEntry: fe,
			member: fe.member
		}));

		const frontersPayload = frontersWithMembers.map(({ member, frontingEntry }) => ({
			id: member.uuid,
			name: member.name,
			pronouns: member.pronouns,
			start_time: frontingEntry.startTime.toISOString(),
			privacy: getPrivacy(member.uuid, member.customFields)
		}));

		const message = {
			type: "fronters",
			data: {
				fronters: frontersPayload
			}
		};

		ws.send(JSON.stringify(message));
		console.log("[WebSocket] Sent current fronters");
	} catch (e) {
		console.error("[WebSocket] Failed to send fronters:", e);
	}
}

export function initWebSocket() {
	if (!webSocketConfig.enabled || !webSocketConfig.wsUrl) {
		console.log("[WebSocket] Disabled or no URL configured");
		return;
	}

	console.log("[WebSocket] Initializing connection");
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
	if (isAuthorized && ws?.readyState === WebSocket.OPEN)
		await sendCurrentFronters();
}
