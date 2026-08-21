# site2pdf

Generate a single PDF containing all pages of a website. Ideal for AI-based Retrieval-Augmented Generation (RAG) and Question Answering (QA) tasks.

<img height="400" alt="pdf preview" src="https://github.com/user-attachments/assets/942be397-719f-43da-b642-c0e07a5115be">

<img height="400" alt="chatgpt qa" src="https://github.com/user-attachments/assets/665e01b2-237d-4ac3-86c5-d959675cd978">

## Features

- **Portability** - Combine multiple pages into a single shareable PDF
- **AI Integration** - Works with [Google NotebookLM](https://notebooklm.google.com/), [ChatGPT GPTs](https://chatgpt.com/gpts), and other AI tools
- **Visual Preservation** - Maintains images and formatting for multimodal models
- **Concurrent Processing** - Processes multiple pages in parallel for faster generation

## Quick Start

```bash
npx site2pdf-cli https://example.com
```

Output is saved to `./out/<domain>.pdf`.

## Installation (from source)

To install the tool globally on your machine from source, run:

```bash
git clone https://github.com/laiso/site2pdf.git
cd site2pdf
npm install
npm run build
npm link
```

After installation, you can run the tool directly using the `site2pdf` command from anywhere:

```bash
site2pdf <main_url> [url_pattern]
```

## Prerequisites

- [Node.js](https://nodejs.org/) (v22.12 or later)

### Linux Dependencies

Puppeteer requires these system libraries:

```bash
sudo apt-get update
sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2
```

> **Note:** On newer Ubuntu versions (24.04+), use `libasound2t64` instead of `libasound2`.

## Usage

```bash
npx site2pdf-cli <main_url> [url_pattern] [--executablePath <chrome>]
```

| Argument | Description |
|----------|-------------|
| `<main_url>` | The starting URL to crawl and convert |
| `[url_pattern]` | Optional regex to filter which links to include (defaults to same domain) |
| `--executablePath <path>` | Optional path to Chrome/Chromium (same as `CHROME_PATH`) |

### URL Pattern Formats

- **Plain string:** `'https://example.com/docs'` - matches URLs containing this string
- **Regex literal:** `'/https:\/\/example\.com\/docs/i'` - full regex with flags

### Examples

Basic usage (captures all same-domain links):

```bash
npx site2pdf-cli https://docs.example.com
```

Filter to specific section:

```bash
npx site2pdf-cli "https://www.typescriptlang.org/docs/handbook/" "https://www.typescriptlang.org/docs/handbook/2/"
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CHROME_PATH` | Path to a custom Chrome/Chromium executable |

## Troubleshooting

### Chrome failed to launch (`spawn Unknown system error -88`)

The CLI launches headless Chrome via Puppeteer. If the bundled Chrome cannot start, you may see a Node spawn error instead of a Chrome-specific message, for example:

```
Error generating PDF: Error: spawn Unknown system error -88
    at ChildProcess.spawn ...
    at ChromeLauncher.launch ...
  errno: -88,
  code: 'Unknown system error -88',
  syscall: 'spawn'
```

This came from Puppeteer 22's unsigned Chrome for Testing: Node cannot `spawn` it on newer macOS (`errno: -88`). It is not a problem with the target website. Upgrading Puppeteer (this project now uses v25) downloads a signed Chrome and avoids that spawn error.

If launch still fails, use the Chrome (or Chromium / Edge) already installed on the machine:

```bash
npx site2pdf-cli https://example.com \
  --executablePath "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

or:

```bash
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npx site2pdf-cli https://example.com
```

Typical paths:

| OS | Executable |
|----|------------|
| macOS | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Windows | `C:\Program Files\Google\Chrome\Application\chrome.exe` |
| Linux | `/usr/bin/google-chrome` or `/usr/bin/chromium` |

You can also install Puppeteer's Chrome with `npx puppeteer browsers install chrome`.

### Windows: Sandbox Errors

Grant permissions to the Puppeteer cache:

```powershell
icacls %USERPROFILE%/.cache/puppeteer/chrome /grant *S-1-15-2-1:(OI)(CI)(RX)
```

See [Puppeteer Windows troubleshooting](https://pptr.dev/troubleshooting#chrome-reports-sandbox-errors-on-windows).

### ARM64 Linux: Not Supported

Chrome does not provide ARM64 binaries for Linux. You'll see errors like:
- "Failed to launch the browser process!"
- "chrome-linux64/chrome: 1: Syntax error: "(" unexpected"

See [Chrome for Testing ARM64 Support Issue](https://github.com/GoogleChromeLabs/chrome-for-testing/issues/1).

## How It Works

1. Launches headless Chrome via Puppeteer
2. Navigates to the main URL and extracts all matching links
3. Generates a PDF for each page concurrently
4. Merges all PDFs into a single document using pdf-lib
5. Saves to `./out/<slugified-url>.pdf`

## Development

```bash
git clone https://github.com/laiso/site2pdf.git
cd site2pdf
npm install
```

| Command | Description |
|---------|-------------|
| `npm run dev -- <main_url> [url_pattern]` | Run in development mode with watch |
| `npm run build` | Compile TypeScript |
| `npm test` | Run tests |
| `npx biome lint` | Check for lint issues |
| `npx biome format` | Format code |

## Contributing

Issues and pull requests are welcome. Please follow the existing code style and include tests for new features.

## License

MIT
