import { Buffer } from "node:buffer";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

import puppeteer, { type Browser } from "puppeteer";
import pLimit from "p-limit";
import { PDFDocument } from "pdf-lib";

export async function generatePDF(
	browser: Browser,
	url: string,
	urlPattern: RegExp = new RegExp(`^${url}`),
	concurrentLimit: number = cpus().length,
): Promise<Buffer> {
	const limit = pLimit(concurrentLimit);
	const page = await browser.newPage();

	// Navigate to the main page
	await page.goto(url);

	// Get all sub-links matching the provided pattern
	const subLinks = await page.evaluate((patternString) => {
		const pattern = new RegExp(patternString);
		const links = Array.from(document.querySelectorAll("a"));
		return links.map((link) => link.href).filter((href) => pattern.test(href));
	}, urlPattern.source);

	// Remove anchor links from the sub-links list
	const subLinksWithoutAnchors = subLinks.map((link) => link.split("#")[0]);

	// Remove duplicate pages from the sub-links list
	const uniqueSubLinks = Array.from(new Set(subLinksWithoutAnchors));

	// Add the main URL to the list of sub-links if it's not already included
	if (!uniqueSubLinks.includes(url)) {
		uniqueSubLinks.unshift(url);
	}

	// Create a new PDF document
	const pdfDoc = await PDFDocument.create();

	// Function to generate PDF for a single page
	const generatePDFForPage = async (link: string) => {
		console.log(`Generating PDF for: ${link}`);
		const newPage = await browser.newPage();
		await newPage.goto(link);
		const pdfBytes = await newPage.pdf({ format: "A4" });
		await newPage.close();
		return pdfBytes;
	};

	// Generate PDFs for all sub-links in parallel
	const pdfPromises = uniqueSubLinks.map((link) =>
		limit(() => generatePDFForPage(link)),
	);
	const pdfBytesArray = await Promise.all(pdfPromises);

	// Merge all PDFs into the main PDF document
	for (const pdfBytes of pdfBytesArray) {
		const subPdfDoc = await PDFDocument.load(pdfBytes);
		const copiedPages = await pdfDoc.copyPages(
			subPdfDoc,
			subPdfDoc.getPageIndices(),
		);
		for (const page of copiedPages) {
			pdfDoc.addPage(page);
		}
	}

	// Get the combined PDF as a buffer
	const pdfBytes = await pdfDoc.save();
	const pdfBuffer = Buffer.from(pdfBytes);

	await browser.close();

	return pdfBuffer;
}

// Function to generate a slug from a URL
export function generateSlug(url: string): string {
	return url
		.replace(/https?:\/\//, "") // Remove protocol
		.replace(/[^\w\s-]/g, "-") // Remove non-alphanumeric characters
		.replace(/\s+/g, "-") // Replace spaces with hyphens
		.replace(/\./g, "-") // Replace periods with hyphens
		.replace(/-+/g, "-") // Replace multiple hyphens with a single hyphen
		.replace(/^-|-$/g, "") // Remove leading and trailing hyphens
		.toLowerCase(); // Convert to lowercase
}

async function main() {
	const mainURL = process.argv[2];
	const urlPattern = process.argv[3]
		? new RegExp(process.argv[3])
		: new RegExp(`^${mainURL}`);
	console.log(
		`Generating PDF for ${mainURL} and sub-links matching ${urlPattern}`,
	);
	const browser = await puppeteer.launch();
	try {
		const pdfBuffer = await generatePDF(browser, mainURL, urlPattern);
		const slug = generateSlug(mainURL); // Generate slug from mainURL
		const outputDir = join(process.cwd(), "out");
		const outputPath = join(outputDir, `${slug}.pdf`);

		// Create output directory if it doesn't exist
		if (!existsSync(outputDir)) {
			mkdirSync(outputDir, { recursive: true });
		}

		writeFileSync(outputPath, pdfBuffer); // Save with slugified name
		console.log(`PDF saved to ${outputPath}`);
	} catch (error) {
		console.error("Error generating PDF:", error);
	}
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	main();
}
