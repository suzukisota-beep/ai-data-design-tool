export const dynamic = "force-dynamic";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => String(v).trim() !== "")) {
        rows.push(row);
      }
      row = [];
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((v) => String(v).trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * 🔥 ここが今回の肝
 * 表記ゆれ完全吸収
 */
function normalizeText(value: string) {
  return String(value)
    .trim()
    .replace(/\s+/g, "") // 空白削除
    .replace(/:/g, "：") // コロン統一
    .replace(/\[/g, "【") // 半角→全角
    .replace(/\]/g, "】") // 半角→全角
    .replace(/（/g, "(")
    .replace(/）/g, ")");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectName = searchParams.get("projectName") ?? "";
    const dataFilesParam = searchParams.get("dataFiles") ?? "";

    const targetDataFiles = dataFilesParam
      .split("、")
      .map((v) => v.trim())
      .filter(Boolean);

    const normalizedTargets = targetDataFiles.map(normalizeText);

    const SHEET_ID = "1ylWOPnma4LtJaC8USrnAb_AgdtH-xdVgxC1ZYXiKKtc";
    const SHEET_GID = "1554011226";

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`データサンプルシートの取得に失敗しました: ${res.status}`);
    }

    const csvText = await res.text();
    const rows = parseCsv(csvText);

    if (rows.length <= 1) {
      return Response.json({
        debug: {
          message: "シートが空",
        },
        data: [],
      });
    }

    const data = rows.slice(1).map((cols) => ({
      projectName: cols[0] ?? "",
      dataFile: cols[1] ?? "",
      sampleCsv: cols[2] ?? "",
    }));

    const filtered = data.filter((row) => {
      const projectMatched = row.projectName === projectName;

      const normalizedRowFile = normalizeText(row.dataFile);

      const dataFileMatched =
        normalizedTargets.length === 0 ||
        normalizedTargets.includes(normalizedRowFile);

      return projectMatched && dataFileMatched;
    });

    return Response.json({
      debug: {
        projectName,
        targetDataFiles,
        normalizedTargets,
        matched: filtered.map((f) => f.dataFile),
      },
      data: filtered,
    });
  } catch (error) {
    return Response.json(
      {
        error: "データサンプルの取得に失敗しました",
        detail: String(error),
      },
      { status: 500 }
    );
  }
}