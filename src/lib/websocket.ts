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
	if (webSocketConfig.enabled && webSocketConfig.wsBaseUrl)
		createConnection();
});

let ws: WebSocket | undefined = undefined;
let reconnectTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
let pingInterval: ReturnType<typeof setInterval> | undefined = undefined;
let frontersInterval: ReturnType<typeof setInterval> | undefined = undefined;
let privacyFieldUuid: string | undefined;
let jwtToken: string | undefined = undefined;

const WS_PATH = "/api/user/platform/pluralsync/events";

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

function getWsUrl(baseUrl: string): string {
	const wsBaseUrl = baseUrl.replace("http://", "ws://").replace("https://", "wss://")
	return `${wsBaseUrl}${WS_PATH}`;
}

async function loginAndGetJwt(): Promise<string> {
	const baseUrl = webSocketConfig.wsBaseUrl;
	if (!baseUrl) {
		console.error("[WebSocket] No base URL configured for login");
		return Promise.reject();
	}

	const loginUrl = `${baseUrl}/api/user/login`;
	const body = JSON.stringify({
		email: { inner: webSocketConfig.wsUsername },
		password: { inner: { inner: webSocketConfig.wsPassword } }
	});

	try {
		const response = await fetch(loginUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body
		});

		if (!response.ok) {
			console.error("[WebSocket] Login failed with status:", response.status);
			return Promise.reject();
		}

		const json = await response.json();
		const token = json?.inner as string | undefined;

		if (!token) {
			console.error("[WebSocket] Login response missing JWT token");
			return Promise.reject();
		}

		console.log("[WebSocket] Login successful");
		return token;
	} catch (e) {
		console.error("[WebSocket] Login request failed:", e);
		return Promise.reject();
	}
}

function createConnection() {
	if (!webSocketConfig.enabled || !webSocketConfig.wsBaseUrl) {
		console.log("[WebSocket] Disabled or no base URL configured");
		return;
	}

	const wsUrl = getWsUrl(webSocketConfig.wsBaseUrl);
	if (!wsUrl) {
		console.error("[WebSocket] Could not construct WebSocket URL from base URL");
		return;
	}

	ws = new WebSocket(wsUrl);

	ws.onopen = async () => {
		console.log("[WebSocket] Connected");
		await performLogin();
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
		jwtToken = undefined;

		if (reconnectTimeout) clearTimeout(reconnectTimeout);
		reconnectTimeout = setTimeout(createConnection, 10000);
	};
}

async function performLogin() {
	if (!webSocketConfig.wsUsername || !webSocketConfig.wsPassword) {
		console.error("[WebSocket] No credentials configured");
		ws?.close();
		return;
	}

	jwtToken = await loginAndGetJwt();

	const authMessage = {
		type: "login",
		user: webSocketConfig.wsUsername,
		auth: jwtToken
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
	if (ws?.readyState !== WebSocket.OPEN) return;

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
	if (!webSocketConfig.enabled || !webSocketConfig.wsBaseUrl) {
		console.log("[WebSocket] Disabled or no base URL configured");
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
	if (ws?.readyState === WebSocket.OPEN)
		await sendCurrentFronters();
}
