const SHEET_ID = "1PMP7lVHbKVEFXI6P8peZdDw77rNTA64N";
const SHEET_NAME = "出力フィードバック";

type FeedbackRow = {
  projectName: string;
  outputType: string;
  feedback: string;
  isActive: string;
  createdAt: string;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (cell || row.length > 0) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      if (char === "\r" && next === "\n") i++;
    } else {
      cell += char;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectName = searchParams.get("projectName") ?? "";
    const outputType = searchParams.get("outputType") ?? "";

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
      SHEET_NAME
    )}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return Response.json({ data: [] });

    const csv = await res.text();
    const rows = parseCsv(csv);
    const [, ...bodyRows] = rows;

    const data: FeedbackRow[] = bodyRows
      .map((r) => ({
        projectName: r[0] ?? "",
        outputType: r[1] ?? "",
        feedback: r[2] ?? "",
        isActive: r[3] ?? "",
        createdAt: r[4] ?? "",
      }))
      .filter(
        (r) =>
          r.projectName === projectName &&
          r.outputType === outputType &&
          String(r.isActive).toUpperCase() !== "FALSE"
      );

    return Response.json({ data });
  } catch (error) {
    return Response.json(
      { error: "フィードバック取得中にエラーが発生しました", detail: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;

    if (!webhookUrl) {
      return Response.json(
        {
          error: "FEEDBACK_WEBHOOK_URL が未設定です",
        },
        { status: 500 }
      );
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text();

    return Response.json({
      ok: res.ok,
      result: text,
    });
  } catch (error) {
    return Response.json(
      { error: "フィードバック保存中にエラーが発生しました", detail: String(error) },
      { status: 500 }
    );
  }
}