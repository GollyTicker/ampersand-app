/// <reference types="@rsbuild/core/types" />

import { Config, Mode } from "@ionic/core";

export declare global {
	module "*.md" {
		const text: string;
		export default text;
	}


	interface Window {
		isTauri: boolean | undefined,
		Ionic: {
			config: Config,
			mode: Mode
		}
	}
}

declare module "vue" {
	interface ImportMetaEnv {
		VITE_WS_URL?: string;
		VITE_WS_AUTH_TOKEN?: string;
		VITE_USER_ID?: string;
	}
}
