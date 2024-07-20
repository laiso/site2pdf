export default {
	preset: "ts-jest/presets/js-with-ts-esm",
	moduleNameMapper: {
		"^site2pdf/(.*)$": "<rootDir>/src/$1",
	},
};
