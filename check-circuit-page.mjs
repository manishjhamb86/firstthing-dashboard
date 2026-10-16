import { chromium } from "playwright-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://www.firsthing.earth";

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', "yogesh@firsthing.earth");
await page.fill('input[name="password"]', "password123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/admin/, { timeout: 15000 });

await page.goto(`${BASE}/admin/societies/soc-aditya-urban-casa/circuits/cmvb9f8ku0009r6p7cygtlwf6`);
await page.waitForTimeout(1500);
console.log("URL:", page.url());
console.log("Title:", await page.title());
console.log("--- body text ---");
console.log((await page.locator("body").innerText()).slice(0, 3000));
console.log("--- errors ---", errors);

await browser.close();
