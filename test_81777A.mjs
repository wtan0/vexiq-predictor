/**
 * Diagnostic test: scrape 81777A team page and log all pagination steps
 * Uses only page.evaluate() - no page.$x()
 */
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { writeFileSync } from "fs";

puppeteer.use(StealthPlugin());

const logs = [];
function log(...args) {
  const msg = args.join(" ");
  console.log(msg);
  logs.push(msg);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium-browser",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    log("Navigating to 81777A team page...");
    await page.goto("https://www.robotevents.com/teams/VIQRC/81777A", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    await sleep(2000);
    log("Page loaded.");

    // Click Match Results tab using evaluate
    const tabClicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a, button, li.nav-item a"));
      const matchLink = links.find((el) => el.textContent?.trim() === "Match Results");
      if (matchLink) {
        matchLink.click();
        return matchLink.textContent?.trim();
      }
      return null;
    });
    log("Clicked tab:", tabClicked);
    await sleep(3000);

    // Check what tables are visible
    const tableInfo = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll("table"));
      return tables.map((t, i) => ({
        i,
        rows: t.querySelectorAll("tbody tr").length,
        headers: Array.from(t.querySelectorAll("thead th")).map((th) => th.textContent?.trim()),
      }));
    });
    log("Tables after clicking Match Results:", JSON.stringify(tableInfo));

    // Iterate pages
    for (let pageNum = 1; pageNum <= 8; pageNum++) {
      log(`\n=== PAGE ${pageNum} ===`);

      // Get event rows from the match results table (look for table with event-related headers)
      const eventRows = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll("table"));
        // Find the table that has match/event data
        for (const t of tables) {
          const headers = Array.from(t.querySelectorAll("thead th")).map((th) => th.textContent?.trim());
          if (headers.some((h) => h?.includes("Event") || h?.includes("Match") || h?.includes("Score"))) {
            return Array.from(t.querySelectorAll("tbody tr")).map((r) =>
              r.textContent?.trim().replace(/\s+/g, " ").substring(0, 120)
            );
          }
        }
        // Fallback: first table with rows
        for (const t of tables) {
          const rows = t.querySelectorAll("tbody tr");
          if (rows.length > 0) {
            return Array.from(rows).map((r) =>
              r.textContent?.trim().replace(/\s+/g, " ").substring(0, 120)
            );
          }
        }
        return [];
      });
      log(`Rows on page ${pageNum}: ${eventRows.length}`);
      eventRows.forEach((r, i) => log(`  [${i}] ${r}`));

      // Check pagination
      const paginationInfo = await page.evaluate(() => {
        const pageItems = Array.from(document.querySelectorAll(".page-item"));
        return pageItems.map((item) => {
          const link = item.querySelector(".page-link");
          return {
            text: link?.textContent?.trim(),
            disabled: item.classList.contains("disabled"),
            active: item.classList.contains("active"),
          };
        });
      });
      log("Pagination:", JSON.stringify(paginationInfo));

      // Find the » button
      const nextInfo = paginationInfo.find((b) => b.text === "»");
      log("Next (») button:", JSON.stringify(nextInfo));

      if (!nextInfo || nextInfo.disabled) {
        log("No more pages.");
        break;
      }

      // Click the » button
      const clicked = await page.evaluate(() => {
        const pageLinks = Array.from(document.querySelectorAll(".page-item .page-link"));
        const nextBtn = pageLinks.find((el) => el.textContent?.trim() === "»");
        if (nextBtn) {
          nextBtn.click();
          return true;
        }
        return false;
      });
      log("Clicked »:", clicked);

      if (!clicked) break;
      await sleep(3000);

      // Verify page changed
      const newActive = await page.evaluate(() => {
        const active = document.querySelector(".page-item.active .page-link");
        return active?.textContent?.trim();
      });
      log("Active page indicator after click:", newActive);
    }

    // Dump pagination HTML for analysis
    const paginationHTML = await page.evaluate(() => {
      const pag = document.querySelector(".pagination");
      return pag?.outerHTML?.substring(0, 3000) ?? "No .pagination found";
    });
    log("\nPagination HTML:", paginationHTML);

  } finally {
    await browser.close();
    writeFileSync("/tmp/81777A_test.txt", logs.join("\n"));
    log("Done.");
  }
}

run().catch((e) => {
  const msg = "FATAL ERROR: " + e.message + "\n" + e.stack;
  console.error(msg);
  logs.push(msg);
  writeFileSync("/tmp/81777A_test.txt", logs.join("\n"));
});
