const express = require("express");
const fetch = require("node-fetch");
const dotenv = require("dotenv");
 
dotenv.config({ path: "env.txt" });
 
const app = express();
const PORT = 3000;
const LIVE_DB_ID = process.env.NOTION_DB_ID || "";
const NOTE_DB_ID = process.env.NOTION_NOTE_DB_ID || "";
 
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

function getStatus(prop) {
  if (!prop) return "";
  if (prop.type === "status" && prop.status) return prop.status.name || "";
  if (prop.type === "select" && prop.select) return prop.select.name || "";
  if (prop.type === "rich_text" && Array.isArray(prop.rich_text)) {
    return prop.rich_text.map((t) => t.plain_text || "").join("").trim();
  }
  return "";
}

function getRelationIds(prop) {
  if (!prop || prop.type !== "relation" || !Array.isArray(prop.relation)) return [];
  return prop.relation.map((x) => x.id).filter(Boolean);
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

function assertEnvReady() {
  if (!process.env.NOTION_TOKEN) {
    throw new Error("NOTION_TOKEN is not configured");
  }
  if (!LIVE_DB_ID) {
    throw new Error("NOTION_DB_ID is not configured");
  }
}
 
app.get("/api/live-log", async (req, res) => {
  try {
    assertEnvReady();
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

app.get("/api/note-log", async (req, res) => {
  try {
    assertEnvReady();
    if (!NOTE_DB_ID) {
      throw new Error("NOTION_NOTE_DB_ID is not configured");
    }

    const allPages = await fetchAllSearchResults();
    const notePages = allPages.filter((item) => {
      return (
        item.object === "page" &&
        item.parent &&
        item.parent.type === "database_id" &&
        normalizeId(item.parent.database_id) === normalizeId(NOTE_DB_ID)
      );
    });

    const records = notePages.map((page) => {
      const p = page.properties || {};
      const noteStatus = getStatus(getProperty(p, ["ステータス", "Status", "status"])) || "";
      const noteType =
        getSelect(getProperty(p, ["種別", "Type", "type"])) ||
        getRichText(getProperty(p, ["種別", "Type", "type"])) ||
        "";
      const noteUrl =
        getUrl(getProperty(p, ["Note URL", "noteUrl", "URL", "リンク"])) || "";
      const noteTitle =
        getTitle(getProperty(p, ["タイトル", "Title", "Name", "記事タイトル"])) ||
        "";
      const notePublishedDate =
        getDate(getProperty(p, ["公開日", "投稿日", "Published", "Date"])) || "";
      const relatedLivePageIds =
        getRelationIds(getProperty(p, ["LIVE LOG", "Live", "ライブ", "ライブリレーション", "Live Relation"])) || [];

      return {
        id: page.id,
        noteTitle,
        noteUrl,
        notePublishedDate,
        noteType,
        noteStatus,
        relatedLivePageIds
      };
    });

    const hasStatusProperty = records.some((r) => r.noteStatus);
    const filtered = records.filter((r) => {
      if (hasStatusProperty) {
        return r.noteStatus === "公開済み" && r.noteUrl;
      }
      return !!r.noteUrl;
    });

    const validRecords = filtered.sort((a, b) => {
      const ad = new Date(a.notePublishedDate || 0).getTime();
      const bd = new Date(b.notePublishedDate || 0).getTime();
      return bd - ad;
    });

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
