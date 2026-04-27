type ProjectNote = {
    projectName: string;
    category: string;
    note: string;
    priority: string;
    isActive: string;
  };
  
  const SHEET_ID = "1PMP7lVHbKVEFXI6P8peZdDw77rNTA64N";
  const SHEET_NAME = "案件別注意事項";
  
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
  
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
        SHEET_NAME
      )}`;
  
      const res = await fetch(url, { cache: "no-store" });
  
      if (!res.ok) {
        return Response.json(
          { error: "案件別注意事項の取得に失敗しました", status: res.status },
          { status: 500 }
        );
      }
  
      const csv = await res.text();
      const rows = parseCsv(csv);
  
      const [, ...bodyRows] = rows;
  
      const data: ProjectNote[] = bodyRows
        .map((r) => ({
          projectName: r[0] ?? "",
          category: r[1] ?? "",
          note: r[2] ?? "",
          priority: r[3] ?? "",
          isActive: r[4] ?? "",
        }))
        .filter(
          (r) =>
            r.projectName === projectName &&
            String(r.isActive).toUpperCase() !== "FALSE"
        )
        .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999));
  
      return Response.json({ data });
    } catch (error) {
      return Response.json(
        {
          error: "案件別注意事項の取得中にエラーが発生しました",
          detail: String(error),
        },
        { status: 500 }
      );
    }
  }