import { defineConfig } from "vite";

export default defineConfig({
	root: "src/mainview",
	build: {
		outDir: "../../dist",
		emptyOutDir: true,
	},
	server: {
		port: 5273,
		strictPort: true,
	},
});
