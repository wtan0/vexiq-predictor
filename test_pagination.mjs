/**
 * Test script: inspect pagination DOM on RobotEvents team page
 * Run with: node test_pagination.mjs
 */
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const puppeteerExtra = _require("puppeteer-extra");
const StealthPlugin = _require("puppeteer-extra-plugin-stealth");
puppeteerExtra.use(StealthPlugin());

const CHROMIUM_PATH = "/usr/bin/chromium-browser";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const browser = await puppeteerExtra.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // Use a team that's known to have many events (478M has 7+ events)
    const url = "https://www.robotevents.com/teams/VIQRC/478M";
    console.log(`Loading: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    await sleep(2000);

    // Click Match Results tab
    const clickedTab = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      const tab = links.find((a) => a.textContent?.trim() === "Match Results");
      if (tab) { tab.click(); return true; }
      return false;
    });
    console.log("Clicked Match Results tab:", clickedTab);
    await sleep(2000);

    // Collect event codes from page 1
    const page1Data = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[href]"));
      const eventCodes = [];
      for (const a of links) {
        const href = a.href || "";
        const m = href.match(/\/(RE-VIQRC-25-\d+)\.html/);
        if (m && !eventCodes.includes(m[1])) eventCodes.push(m[1]);
      }
      return eventCodes;
    });
    console.log("Page 1 event codes:", page1Data);

    // Inspect pagination DOM
    const paginationInfo = await page.evaluate(() => {
      // Look for all elements that might be pagination
      const allElements = Array.from(document.querySelectorAll("*"));
      const paginationCandidates = allElements.filter((el) => {
        const text = el.textContent?.trim();
        return text === "»" || text === "›" || text === "Next" || text === "2" || text === "3";
      });
      
      return paginationCandidates.map((el) => ({
        tag: el.tagName,
        text: el.textContent?.trim(),
        className: el.className,
        href: el.href || null,
        disabled: el.hasAttribute("disabled"),
        ariaDisabled: el.getAttribute("aria-disabled"),
        parentClass: el.parentElement?.className || "",
        outerHTML: el.outerHTML.substring(0, 200),
      }));
    });
    
    console.log("\n=== Pagination elements found ===");
    for (const el of paginationInfo) {
      console.log(JSON.stringify(el, null, 2));
    }

    // Also dump the full pagination container HTML if it exists
    const paginationHTML = await page.evaluate(() => {
      // Common pagination class names
      const selectors = [
        ".pagination", "[class*='pagination']", "[class*='pager']",
        "nav[aria-label*='page']", "[role='navigation']",
        ".page-link", "[class*='page-item']"
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return { selector: sel, html: el.outerHTML.substring(0, 1000) };
      }
      return null;
    });
    console.log("\n=== Pagination container ===");
    console.log(JSON.stringify(paginationHTML, null, 2));

    // Check total page count from body text
    const pageCountInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      // Look for "Page X of Y" or similar
      const pageMatch = bodyText.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
      const totalMatch = bodyText.match(/Showing\s+\d+\s*-\s*\d+\s+of\s+(\d+)/i);
      return { pageMatch: pageMatch?.[0], totalMatch: totalMatch?.[0], bodyLength: bodyText.length };
    });
    console.log("\n=== Page count info ===");
    console.log(JSON.stringify(pageCountInfo, null, 2));

  } finally {
    await browser.close();
  }
}

run().catch(console.error);
