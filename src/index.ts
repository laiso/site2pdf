import { Buffer } from "node:buffer";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, platform } from "node:os";
import { execSync } from "node:child_process";

import puppeteer, { type Browser, type Page } from "puppeteer";
import pLimit from "p-limit";
import { PDFDocument } from "pdf-lib";

function showHelp() {
	console.log(`
Usage: site2pdf-cli <main_url> [url_pattern] [options]

Arguments:
  main_url              The main URL to generate PDF from
  url_pattern           (Optional) Regular expression pattern to match sub-links (default: ^main_url)

Options:
  --executablePath <path>  Path to a Chrome/Chromium executable
  --help                   Show this help message

Environment Variables:
  CHROME_PATH              Path to a Chrome/Chromium executable (alternative to --executablePath)
`);
}

type BrowserContext = {
	browser: Browser,
	page: Page,
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createDefaultPattern(url: string): RegExp {
	return new RegExp(`^${escapeRegExp(url)}`);
}

// Accept CLI patterns written as /pattern/flags while keeping backward compatibility with plain strings.
export function buildURLPattern(patternArg: string | undefined, mainURL: string): RegExp {
	if (!patternArg) {
		return createDefaultPattern(mainURL);
	}

	const regexLiteralMatch = patternArg.match(/^\/(.*)\/([a-z]*)$/i);
	if (regexLiteralMatch) {
		const [, patternSource, patternFlags] = regexLiteralMatch;
		return new RegExp(patternSource, patternFlags);
	}

	return new RegExp(patternArg);
}

const COMMON_CHROME_PATHS: Record<string, string[]> = {
	win32: [
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
		"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	],
	darwin: [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
	],
	linux: [
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/usr/bin/microsoft-edge",
		"/snap/bin/chromium",
	],
};

export function detectChromePath(): string | undefined {
	const os = platform();
	const candidates = COMMON_CHROME_PATHS[os] ?? COMMON_CHROME_PATHS.linux;

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	// Try `which`/`where` as a fallback
	try {
		const cmd = os === "win32" ? "where" : "which";
		for (const name of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
			try {
				const result = execSync(`${cmd} ${name}`, { stdio: "pipe" }).toString().trim();
				if (result) {
					return result.split(/\r?\n/)[0];
				}
			} catch {
				// Not found, try next
			}
		}
	} catch {
		// Command not available
	}

	return undefined;
}

export function resolveExecutablePath(cliPath?: string): string | undefined {
	if (cliPath) {
		return cliPath;
	}
	if (process.env.CHROME_PATH) {
		return process.env.CHROME_PATH;
	}
	return undefined;
}

async function launchBrowser(executablePath?: string): Promise<Browser> {
	return puppeteer.launch({
		headless: true,
		// Keep Chrome launch working inside sandboxed environments.
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
		userDataDir: join(process.cwd(), ".site2pdf-chrome"),
		...(executablePath && { executablePath }),
	});
}

function isMissingBrowserError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("Could not find Chrome") || message.includes("Browser was not found");
}

async function useBrowserContext(executablePath?: string) {
	try {
		let browser: Browser;
		if (executablePath) {
			browser = await launchBrowser(executablePath);
		} else {
			try {
				browser = await launchBrowser();
			} catch (error: unknown) {
				const detectedPath = isMissingBrowserError(error) ? detectChromePath() : undefined;
				if (!detectedPath) {
					throw error;
				}
				browser = await launchBrowser(detectedPath);
			}
		}

		const page = (await browser.pages())[0];
		return {
			browser,
			page
		};
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("Could not find") || message.includes("Failed to launch")) {
			console.error("\nError: Chrome/Chromium browser could not be found or launched.");
			console.error("\nTo fix this, try one of the following:\n");
			console.error("  1. Install Chrome for Puppeteer:");
			console.error("     npx puppeteer browsers install chrome\n");
			console.error("  2. Specify the path to an existing Chrome/Chromium installation:");
			console.error("     site2pdf <url> --executablePath /path/to/chrome\n");
			console.error("  3. Set the CHROME_PATH environment variable:");
			console.error("     export CHROME_PATH=/path/to/chrome\n");
		}
		throw error;
	}
}

export async function generatePDF(
	ctx: BrowserContext,
	url: string,
	concurrentLimit: number,
	urlPattern: RegExp = createDefaultPattern(url),
): Promise<Buffer> {
	const limit = pLimit(concurrentLimit);
	const page = await ctx.browser.newPage();
	await page.goto(url, { waitUntil: 'networkidle2' });

	const subLinks = await page.evaluate(({ patternSource, patternFlags }) => {
		const pattern = new RegExp(patternSource, patternFlags);
		const links = Array.from(document.querySelectorAll("a"));
		return links.map((link) => link.href).filter((href) => pattern.test(href));
	}, { patternSource: urlPattern.source, patternFlags: urlPattern.flags });

	const subLinksWithoutAnchors = subLinks.map((link) => normalizeURL(link));
	const uniqueSubLinks = Array.from(new Set(subLinksWithoutAnchors));

	if (!uniqueSubLinks.includes(url)) {
		uniqueSubLinks.unshift(url);
	}

	const pdfDoc = await PDFDocument.create();

		const generatePDFForPage = async (link: string) => {
			console.log(`loading ${link}`);
			const newPage = await ctx.browser.newPage();
			let pdfBytes: Buffer;
			try {
				await newPage.goto(link, { waitUntil: 'networkidle2' });
				pdfBytes = await newPage.pdf({ format: "A4" });
			console.log(`Generated PDF for ${link}`);
			return Buffer.from(pdfBytes);
		} catch (error) {
			console.warn(`Warning: Error occurred while processing ${link}: ${error}`);
			return null;
		} finally {
			await newPage.close();
		}
	};

	const pdfPromises = uniqueSubLinks.map((link) =>
		limit(() => generatePDFForPage(link)),
	);
	const pdfBytesArray = (await Promise.all(pdfPromises)).filter(
		(buffer) => buffer !== null
	);

	for (const pdfBytes of pdfBytesArray) {
		if (pdfBytes) {
			const subPdfDoc = await PDFDocument.load(pdfBytes);
			const copiedPages = await pdfDoc.copyPages(
				subPdfDoc,
				subPdfDoc.getPageIndices(),
			);
			for (const page of copiedPages) {
				pdfDoc.addPage(page);
			}
		}
	}

	const pdfBytes = await pdfDoc.save();
	const pdfBuffer = Buffer.from(pdfBytes);

	return pdfBuffer;
}

export function generateSlug(url: string): string {
	return url
		.replace(/https?:\/\//, "")
		.replace(/[^\w\s-]/g, "-")
		.replace(/\s+/g, "-")
		.replace(/\./g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase();
}

export function normalizeURL(url: string): string {
	const urlWithoutAnchor = url.split("#")[0];
	return urlWithoutAnchor.endsWith("/")
		? urlWithoutAnchor.slice(0, -1)
		: urlWithoutAnchor;
}

export function parseArgs(argv: string[]): { mainURL?: string; urlPattern?: string; executablePath?: string; help: boolean } {
	const args = argv.slice(2);
	let mainURL: string | undefined;
	let urlPattern: string | undefined;
	let executablePath: string | undefined;
	let help = false;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--executablePath" && i + 1 < args.length) {
			executablePath = args[++i];
		} else if (args[i] === "--help" || args[i] === "-h") {
			help = true;
		} else if (args[i].startsWith("--")) {
			// Skip unknown flags
		} else if (!mainURL) {
			mainURL = args[i];
		} else if (!urlPattern) {
			urlPattern = args[i];
		}
	}

	return { mainURL, urlPattern, executablePath, help };
}

export async function main() {
	const { mainURL, urlPattern: patternArg, executablePath, help } = parseArgs(process.argv);

	if (help) {
		showHelp();
		return;
	}

	if (!mainURL) {
		showHelp();
		throw new Error("<main_url> is required");
	}

	const urlPattern = buildURLPattern(patternArg, mainURL);

	console.log(
		`Generating PDF for ${mainURL} and sub-links matching ${urlPattern}`,
	);
	let ctx: BrowserContext | undefined;
	try {
		const resolvedPath = resolveExecutablePath(executablePath);
		ctx = await useBrowserContext(resolvedPath);
		const pdfBuffer = await generatePDF(ctx, mainURL, cpus().length, urlPattern);
		const slug = generateSlug(mainURL);
		const outputDir = join(process.cwd(), "out");
		const outputPath = join(outputDir, `${slug}.pdf`);

		if (!existsSync(outputDir)) {
			mkdirSync(outputDir, { recursive: true });
		}

		writeFileSync(outputPath, new Uint8Array(pdfBuffer));
		console.log(`PDF saved to ${outputPath}`);
	} catch (error) {
		console.error("Error generating PDF:", error);
	} finally {
		ctx?.browser.close();
	}
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	main();
}
