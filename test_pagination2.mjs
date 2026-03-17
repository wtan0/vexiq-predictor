/**
 * Test script: verify pagination fix works for team 478M
 * Should find all 7 events (not just 5)
 */
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const puppeteerExtra = _require("puppeteer-extra");
const StealthPlugin = _require("puppeteer-extra-plugin-stealth");
puppeteerExtra.use(StealthPlugin());

const CHROMIUM_PATH = "/usr/bin/chromium-browser";

function sleep(ms) {
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
    const url = "https://www.robotevents.com/teams/VIQRC/478M";
    console.log(`Loading: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    await sleep(2000);

    // Click Match Results tab
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      const tab = links.find((a) => a.textContent?.trim() === "Match Results");
      if (tab) tab.click();
    });
    await sleep(2000);

    const allEventCodes = new Set();

    const collectPage = async () => {
      const codes = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a[href]"));
        const found = [];
        const seen = new Set();
        for (const a of links) {
          const href = a.href || "";
          const m = href.match(/\/(RE-VIQRC-25-\d+)\.html/);
          if (m && !seen.has(m[1])) {
            seen.add(m[1]);
            found.push(m[1]);
          }
        }
        return found;
      });
      codes.forEach((c) => allEventCodes.add(c));
      return codes;
    };

    const page1 = await collectPage();
    console.log(`Page 1: ${page1.length} events → ${page1.join(", ")}`);

    let pageNum = 1;
    while (true) {
      const hasNext = await page.evaluate((currentPage) => {
        const pageLinks = Array.from(document.querySelectorAll(".page-link"));
        const nextBtn = pageLinks.find((el) => {
          const text = el.textContent?.trim();
          return text === "»" || text === "›" || text === "Next";
        });
        if (nextBtn) {
          const parentLi = nextBtn.closest(".page-item");
          if (parentLi && parentLi.classList.contains("disabled")) return false;
          nextBtn.click();
          return true;
        }
        const nextPageLink = pageLinks.find((el) => {
          const text = el.textContent?.trim();
          return text === String(currentPage + 1);
        });
        if (nextPageLink) {
          const parentLi = nextPageLink.closest(".page-item");
          if (parentLi && parentLi.classList.contains("disabled")) return false;
          nextPageLink.click();
          return true;
        }
        return false;
      }, pageNum);

      if (!hasNext) break;
      pageNum++;
      await sleep(2000);
      const newCodes = await collectPage();
      console.log(`Page ${pageNum}: ${newCodes.length} events → ${newCodes.join(", ")}`);
      if (pageNum >= 20) break;
    }

    console.log(`\n✅ Total events found: ${allEventCodes.size} across ${pageNum} pages`);
    console.log("All event codes:", Array.from(allEventCodes).join(", "));
    
    if (allEventCodes.size >= 7) {
      console.log("✅ PASS: Found all 7+ events for team 478M");
    } else {
      console.log(`❌ FAIL: Only found ${allEventCodes.size} events, expected 7+`);
    }

  } finally {
    await browser.close();
  }
}

run().catch(console.error);
