import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "vanilla-vite",
		identifier: "vanillavite.electrobun.dev",
		version: "0.0.3",
	},
	build: {
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
            "dist/favicon.png": "views/mainview/favicon.png",
		},
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
