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
  
  // Get all tabs and links
  const info = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll("a, button")).map(el => ({
      tag: el.tagName,
      text: el.textContent?.trim().slice(0, 50),
      href: el.getAttribute("href") || "",
    })).filter(el => el.text && el.text.length > 0);
    
    const eventLinks = Array.from(document.querySelectorAll("a[href]")).filter(a => {
      const href = a.getAttribute("href") || "";
      return href.includes("RE-VIQRC") || href.includes("robot-competitions");
    }).map(a => ({
      text: a.textContent?.trim().slice(0, 80),
      href: a.getAttribute("href"),
    }));
    
    return {
      title: document.title,
      tabs: tabs.slice(0, 30),
      eventLinks,
      bodyText: document.body.innerText.slice(0, 3000),
    };
  });
  
  console.log("Title:", info.title);
  console.log("Event links:", JSON.stringify(info.eventLinks, null, 2));
  console.log("Body text:", info.bodyText);
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
