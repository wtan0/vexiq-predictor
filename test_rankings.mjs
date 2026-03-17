/**
 * Test: Check what rankings data is in the DB and what the event page shows.
 * Run: node test_rankings.mjs
 */
import mysql from 'mysql2/promise';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { execSync } from 'child_process';
import * as fs from 'fs';

puppeteer.use(StealthPlugin());

const CHROMIUM_PATH = execSync('which chromium-browser || which chromium || which google-chrome 2>/dev/null').toString().trim().split('\n')[0];

async function main() {
  const output = [];
  const log = (msg) => { console.log(msg); output.push(msg); };

  // 1. Check DB values
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query(
    `SELECT teamNumber, eventCode, eventName, eventRank, teamworkRank, avgTeamworkScore 
     FROM team_events WHERE teamNumber IN ('478M', '81777A') ORDER BY teamNumber, id`
  );
  log('=== DB teamworkRank values ===');
  for (const r of rows) {
    log(`  ${r.teamNumber} | ${r.eventCode} | eventRank=${r.eventRank} | teamworkRank=${r.teamworkRank} | avgTW=${r.avgTeamworkScore}`);
  }
  await conn.end();

  // 2. Scrape one event page to see what the Rankings tab shows
  // Use the first event code for 478M that has a teamworkRank
  const eventWithRank = rows.find(r => r.teamNumber === '478M' && r.eventCode);
  if (!eventWithRank) { log('No event found for 478M'); fs.writeFileSync('/tmp/rankings_test.txt', output.join('\n')); return; }
  
  const eventCode = eventWithRank.eventCode;
  log(`\n=== Scraping event page for ${eventCode} ===`);
  
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const url = `https://www.robotevents.com/robot-competitions/vex-iq-competition/RE-VIQRC-25-0853.html#results-${eventCode}`;
    log(`Navigating to: https://www.robotevents.com/robot-competitions/vex-iq-competition/${eventCode}.html#results`);
    await page.goto(`https://www.robotevents.com/robot-competitions/vex-iq-competition/${eventCode}.html#results`, {
      waitUntil: 'networkidle2', timeout: 30000
    });
    await new Promise(r => setTimeout(r, 2000));

    // Check what tabs are available
    const tabs = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.filter(a => a.closest('.nav-tabs') || a.closest('.tab-content') || a.href?.includes('#'))
        .map(a => ({ text: a.textContent?.trim(), href: a.href }))
        .filter(a => a.text && a.text.length < 30);
    });
    log('\nTabs found: ' + JSON.stringify(tabs.slice(0, 15)));

    // Click Division 1 tab
    const div1Clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const div1 = links.find(a => a.textContent?.trim() === 'Division 1');
      if (div1) { div1.click(); return true; }
      return false;
    });
    log(`Division 1 clicked: ${div1Clicked}`);
    if (div1Clicked) await new Promise(r => setTimeout(r, 2000));

    // Get all table headers and first few rows
    const tableData = await page.evaluate((teamNum) => {
      const tables = Array.from(document.querySelectorAll('table'));
      return tables.map((t, i) => {
        const headers = Array.from(t.querySelectorAll('th')).map(th => th.textContent?.trim());
        const rows = Array.from(t.querySelectorAll('tbody tr')).slice(0, 5).map(tr => 
          Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim())
        );
        // Find the row for our team
        const teamRow = Array.from(t.querySelectorAll('tbody tr')).find(tr => 
          Array.from(tr.querySelectorAll('td')).some(td => td.textContent?.trim() === teamNum)
        );
        const teamCells = teamRow ? Array.from(teamRow.querySelectorAll('td')).map(td => td.textContent?.trim()) : null;
        return { tableIndex: i, headers, firstRows: rows, teamRow: teamCells };
      });
    }, '478M');

    log('\nTables on Division 1 tab:');
    for (const t of tableData) {
      log(`  Table[${t.tableIndex}] headers: ${JSON.stringify(t.headers)}`);
      if (t.teamRow) log(`    -> 478M row: ${JSON.stringify(t.teamRow)}`);
    }

  } finally {
    await browser.close();
  }

  fs.writeFileSync('/tmp/rankings_test.txt', output.join('\n'));
  log('\nDone. Output saved to /tmp/rankings_test.txt');
}

main().catch(e => {
  console.error(e);
  fs.writeFileSync('/tmp/rankings_test.txt', e.toString());
});
