import { Buffer } from "node:buffer";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

import puppeteer, { type Browser, type Page } from "puppeteer";
import pLimit from "p-limit";
import { PDFDocument } from "pdf-lib";

function showHelp() {
	console.log(`
Usage: site2pdf-cli <main_url> [url_pattern]

Arguments:
  main_url         The main URL to generate PDF from
  url_pattern      (Optional) Regular expression pattern to match sub-links (default: ^main_url)
`);
}

type BrowserContext = {
	browser: Browser,
	page: Page,
};

async function useBrowserContext() {
	const browser = await puppeteer.launch({
		headless: true,
		...(process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH }),
	});
	const page = (await browser.pages())[0];
	return {
		browser,
		page
	};
}

export async function generatePDF(
	ctx: BrowserContext,
	url: string,
	concurrentLimit: number,
	urlPattern: RegExp = new RegExp(`^${url}`),
): Promise<Buffer> {
	const limit = pLimit(concurrentLimit);
	const page = await ctx.browser.newPage();
	await page.goto(url, { waitUntil: 'domcontentloaded' });

	const subLinks = await page.evaluate((patternString) => {
		const pattern = new RegExp(patternString);
		const links = Array.from(document.querySelectorAll("a"));
		return links.map((link) => link.href).filter((href) => pattern.test(href));
	}, urlPattern.source);

	const subLinksWithoutAnchors = subLinks.map((link) => normalizeURL(link));
	const uniqueSubLinks = Array.from(new Set(subLinksWithoutAnchors));

	if (!uniqueSubLinks.includes(url)) {
		uniqueSubLinks.unshift(url);
	}

	const pdfDoc = await PDFDocument.create();

	const generatePDFForPage = async (link: string) => {
		console.log(`loading ${link}`);
		const newPage = await ctx.browser.newPage();
		let pdfBytes: Uint8Array;
		try {
			await newPage.goto(link, { waitUntil: 'domcontentloaded' });
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

export async function main() {
	const mainURL = process.argv[2];
	const urlPattern = process.argv[3]
		? new RegExp(process.argv[3])
		: new RegExp(`^${mainURL}`);

	if (!mainURL) {
		showHelp();
		throw new Error("<main_url> is required");
	}

	console.log(
		`Generating PDF for ${mainURL} and sub-links matching ${urlPattern}`,
	);
	let ctx: BrowserContext | undefined;
	try {
		ctx = await useBrowserContext();
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
