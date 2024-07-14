import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import {writeFileSync, existsSync, mkdirSync} from 'fs';
import { Buffer } from 'buffer';
import {join} from "path";

async function generatePDF(url: string, urlPattern: RegExp = new RegExp(`^${url}`)): Promise<Buffer> {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Navigate to the main page
    await page.goto(url);

    // Get all sub-links matching the provided pattern
    const subLinks = await page.evaluate((patternString) => {
        const pattern = new RegExp(patternString);
        const links = Array.from(document.querySelectorAll('a'));
        return links
            .map((link) => link.href)
            .filter((href) => pattern.test(href));
    }, urlPattern.source);

    // Remove anchor links from the sub-links list
    const subLinksWithoutAnchors = subLinks.map((link) => link.split('#')[0]);

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
        const pdfBytes = await newPage.pdf({ format: 'A4' });
        await newPage.close();
        return pdfBytes;
    };

    // Generate PDFs for all sub-links in parallel
    const pdfPromises = uniqueSubLinks.map(link => generatePDFForPage(link));
    const pdfBytesArray = await Promise.all(pdfPromises);

    // Merge all PDFs into the main PDF document
    for (const pdfBytes of pdfBytesArray) {
        const subPdfDoc = await PDFDocument.load(pdfBytes);
        const copiedPages = await pdfDoc.copyPages(subPdfDoc, subPdfDoc.getPageIndices());
        copiedPages.forEach((page) => pdfDoc.addPage(page));
    }

    // Get the combined PDF as a buffer
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    await browser.close();

    return pdfBuffer;
}

// Function to generate a slug from a URL
function generateSlug(url: string): string {
    return url
        .replace(/https?:\/\//, '') // Remove protocol
        .replace(/[^\w\s.-]/g, '')   // Remove non-alphanumeric characters
        .replace(/\s+/g, '-')       // Replace spaces with hyphens
        .replace(/\./g, '-')       // Replace dots with hyphens
        .toLowerCase();             // Convert to lowercase
}

// Example usage
const mainURL = process.argv[2];
const urlPattern = process.argv[3] ? new RegExp(process.argv[3]) : new RegExp(`^${mainURL}`);
generatePDF(mainURL, urlPattern)
    .then((pdfBuffer) => {
        const slug = generateSlug(mainURL); // Generate slug from mainURL
        const outputDir = join(__dirname, 'out');
        const outputPath = join(outputDir, `${slug}.pdf`);

        // Create output directory if it doesn't exist
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        writeFileSync(outputPath, pdfBuffer); // Save with slugified name
        console.log(`PDF saved to ${outputPath}`);
    })
    .catch((error) => console.error('Error generating PDF:', error));