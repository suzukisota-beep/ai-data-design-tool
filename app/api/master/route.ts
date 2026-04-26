export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const SHEET_ID = "1ylWOPnma4LtJaC8USrnAb_AgdtH-xdVgxC1ZYXiKKtc";
    const SHEET_GID = "514412783";

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

    const res = await fetch(url, {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`スプレッドシートの取得に失敗しました: ${res.status}`);
    }

    const csvText = await res.text();

    const lines = csvText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      return Response.json([]);
    }

    const parseCsvLine = (line: string) => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === "," && !inQuotes) {
          result.push(current);
          current = "";
        } else {
          current += char;
        }
      }

      result.push(current);
      return result.map((v) => v.trim());
    };

    const rows = lines.slice(1).map(parseCsvLine);

    const data = rows.map((cols) => {
      return {
        projectName: cols[0] ?? "",
        dataFile: cols[1] ?? "",
        primaryKey: cols[2] ?? "",
        description: cols[3] ?? "",
        majorColumns: cols[4] ?? "",
        defaultSelected: cols[5] ?? "",
        displayOrder: cols[6] ?? "",
        isActive: cols[7] ?? "",
      };
    });

    return Response.json(data);
  } catch (error) {
    return Response.json(
      {
        error: "案件マスタの取得に失敗しました",
        detail: String(error),
      },
      { status: 500 }
    );
  }
}