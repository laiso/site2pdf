import { exec } from "node:child_process";
import { join } from "node:path";
import { describe, it, expect } from "@jest/globals";

describe("CLI Integration Tests", () => {
	const localMainFile = join(process.cwd(), "tests", "fixtures", "index.html");
	it("should generate a PDF for a valid local file using the CLI", (done) => {
		const mainURL = `file://${localMainFile}`;
		const cliCommand = `node bin/site2pdf.js ${mainURL}`;
		exec(cliCommand, (error, stdout, stderr) => {
			expect(error).toBeNull();
			expect(stderr).toBe("");
			expect(stdout).toContain("Generating PDF for");
			expect(stdout).toContain("PDF saved to");
			expect(stdout).toContain("fixtures-index-html.pdf");
			done();
		});
	}, 30000);
});
