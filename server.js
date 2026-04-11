const express = require("express");
const fetch = require("node-fetch");
const dotenv = require("dotenv");
 
dotenv.config({ path: "env.txt" });
 
const app = express();
const PORT = 3000;
const LIVE_DB_ID = "130d9af8-2e19-8062-85d3-dd0315b51d43";
 
app.use(express.static(__dirname));
 
function normalizeId(id) {
  return String(id || "").replace(/-/g, "");
}
 
function getTitle(prop) {
  if (!prop || prop.type !== "title" || !Array.isArray(prop.title)) return "";
  return prop.title.map((t) => t.plain_text || "").join("").trim();
}
 
function getRichText(prop) {
  if (!prop || prop.type !== "rich_text" || !Array.isArray(prop.rich_text)) return "";
  return prop.rich_text.map((t) => t.plain_text || "").join("").trim();
}
 
function getSelect(prop) {
  if (!prop || prop.type !== "select" || !prop.select) return "";
  return prop.select.name || "";
}
 
function getMultiSelect(prop) {
  if (!prop || prop.type !== "multi_select" || !Array.isArray(prop.multi_select)) return [];
  return prop.multi_select.map((x) => x.name).filter(Boolean);
}
 
function getDate(prop) {
  if (!prop || prop.type !== "date" || !prop.date) return "";
  return prop.date.start || "";
}
 
function getUrl(prop) {
  if (!prop || prop.type !== "url") return "";
  return prop.url || "";
}
 
function getProperty(properties, names) {
  for (const name of names) {
    if (properties[name]) return properties[name];
  }
  return null;
}
 
async function fetchAllSearchResults() {
  let allResults = [];
  let startCursor = undefined;
  let hasMore = true;
 
  while (hasMore) {
    const body = {
      page_size: 100,
      filter: {
        property: "object",
        value: "page"
      },
      sort: {
        direction: "descending",
        timestamp: "last_edited_time"
      }
    };
 
    if (startCursor) {
      body.start_cursor = startCursor;
    }
 
    const response = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
 
    const data = await response.json();
 
    if (!response.ok) {
      throw new Error(JSON.stringify(data));
    }
 
    allResults = allResults.concat(data.results || []);
    hasMore = data.has_more;
    startCursor = data.next_cursor || undefined;
  }
 
  return allResults;
}
 
app.get("/api/live-log", async (req, res) => {
  try {
    const allPages = await fetchAllSearchResults();
 
    const livePages = allPages.filter((item) => {
      return (
        item.object === "page" &&
        item.parent &&
        item.parent.type === "database_id" &&
        normalizeId(item.parent.database_id) === normalizeId(LIVE_DB_ID)
      );
    });
 
    const records = livePages.map((page) => {
      const p = page.properties || {};
 
      const liveName =
        getTitle(getProperty(p, ["ライブ", "ライブ名", "イベント名", "Name", "名前"])) || "";
 
      const artists =
        getMultiSelect(getProperty(p, ["アーティスト", "artists", "Artist"])) || [];
 
      const venue =
        getSelect(getProperty(p, ["会場", "Venue"])) ||
        getRichText(getProperty(p, ["会場", "Venue"])) ||
        "";
 
      const format =
        getSelect(getProperty(p, ["形式", "Format"])) ||
        getRichText(getProperty(p, ["形式", "Format"])) ||
        "";
 
      const date =
        getDate(getProperty(p, ["日付", "Date", "ライブ日"])) || "";
 
      const ratingText =
        getSelect(getProperty(p, ["評価", "Rating"])) ||
        getRichText(getProperty(p, ["評価", "Rating"])) ||
        "";
 
      const setlistUrl =
        getUrl(getProperty(p, ["セットリスト", "セットリストURL", "URL"])) || "";
 
      return {
        id: page.id,
        liveName,
        artists,
        venue,
        format,
        date,
        rating: (ratingText.match(/★/g) || []).length,
        setlistUrl
      };
    });
 
    const validRecords = records
      .filter((r) => r.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
 
    res.json(validRecords);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});
 
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});