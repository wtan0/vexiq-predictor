import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const puppeteerExtra = _require("puppeteer-extra");
const StealthPlugin = _require("puppeteer-extra-plugin-stealth");
puppeteerExtra.use(StealthPlugin());

async function main() {
  const browser = await puppeteerExtra.launch({
    executablePath: "/usr/bin/chromium-browser",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  
  console.log("Loading 478M team page...");
  await page.goto("https://www.robotevents.com/teams/VIQRC/478M", { waitUntil: "networkidle2", timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));
  
  // Click "Match Results" tab
  const clickedMatchResults = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a, li"));
    const tab = links.find(el => el.textContent.trim() === "Match Results");
    if (tab) { tab.click(); return true; }
    return false;
  });
  console.log("Clicked Match Results:", clickedMatchResults);
  await new Promise(r => setTimeout(r, 2000));
  
  // Get the page content after clicking Match Results
  const matchResultsContent = await page.evaluate(() => {
    return {
      bodyText: document.body.innerText.slice(0, 5000),
      tables: Array.from(document.querySelectorAll("table")).map((t, i) => ({
        i,
        headers: Array.from(t.querySelectorAll("th")).map(th => th.textContent.trim()),
        rows: t.querySelectorAll("tbody tr").length,
        firstRow: Array.from(t.querySelectorAll("tbody tr:first-child td")).map(td => td.textContent.trim()),
      })),
      eventLinks: Array.from(document.querySelectorAll("a[href]"))
        .filter(a => {
          const href = a.getAttribute("href") || "";
          return href.match(/RE-VIQRC-\d+-\d+/);
        })
        .map(a => ({ text: a.textContent.trim().slice(0, 80), href: a.getAttribute("href") })),
    };
  });
  
  console.log("Match Results body:", matchResultsContent.bodyText);
  console.log("Tables:", JSON.stringify(matchResultsContent.tables, null, 2));
  console.log("Event links:", JSON.stringify(matchResultsContent.eventLinks, null, 2));
  
  // Now click "Awards" tab
  const clickedAwards = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a, li"));
    const tab = links.find(el => el.textContent.trim() === "Awards");
    if (tab) { tab.click(); return true; }
    return false;
  });
  console.log("Clicked Awards:", clickedAwards);
  await new Promise(r => setTimeout(r, 2000));
  
  const awardsContent = await page.evaluate(() => {
    return document.body.innerText.slice(0, 3000);
  });
  console.log("Awards content:", awardsContent);
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
