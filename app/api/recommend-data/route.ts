import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SHEET_ID = "1PMP7lVHbKVEFXI6P8peZdDw77rNTA64N";
const PROJECT_NOTES_SHEET_NAME = "案件別注意事項";

type CandidateData = {
  dataFile?: string;
  primaryKey?: string;
  description?: string;
  majorColumns?: string;
};

type ProjectNote = {
  projectName: string;
  category: string;
  note: string;
  priority: string;
  isActive: string;
};

type RecommendedDataFile = {
  dataFile: string;
  reason: string;
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

async function fetchProjectNotes(projectName: string): Promise<ProjectNote[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    PROJECT_NOTES_SHEET_NAME
  )}`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) return [];

  const csv = await res.text();
  const rows = parseCsv(csv);
  const [, ...bodyRows] = rows;

  return bodyRows
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
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（）()【】\[\]・、,。._\-ー]/g, "");
}

function resolveRecommendedFiles(
  rawRecommended: any[],
  candidateData: CandidateData[]
): RecommendedDataFile[] {
  const results: RecommendedDataFile[] = [];

  for (const item of rawRecommended) {
    const aiName = String(item?.dataFile ?? "");
    const reason = String(item?.reason ?? "");

    const exact = candidateData.find((c) => String(c.dataFile ?? "") === aiName);

    if (exact?.dataFile) {
      results.push({
        dataFile: exact.dataFile,
        reason,
      });
      continue;
    }

    const aiNameNormalized = normalize(aiName);

    const fuzzy = candidateData.find((c) => {
      const candidateName = String(c.dataFile ?? "");
      const candidateNameNormalized = normalize(candidateName);

      return (
        candidateNameNormalized.includes(aiNameNormalized) ||
        aiNameNormalized.includes(candidateNameNormalized)
      );
    });

    if (fuzzy?.dataFile) {
      results.push({
        dataFile: fuzzy.dataFile,
        reason:
          reason ||
          "AIの推奨名と候補データ名を照合し、最も近い候補データとして選定しました",
      });
    }
  }

  return Array.from(
    new Map(results.map((r) => [r.dataFile, r])).values()
  );
}

function fallbackRecommend(
  candidateData: CandidateData[],
  userText: string
): RecommendedDataFile[] {
  const normalizedUserText = normalize(userText);

  const scored = candidateData
    .map((candidate) => {
      const dataFile = String(candidate.dataFile ?? "");
      const text = [
        candidate.dataFile,
        candidate.primaryKey,
        candidate.description,
        candidate.majorColumns,
      ]
        .map((v) => String(v ?? ""))
        .join(" ");

      const terms = text
        .split(/[,\s、，]+/)
        .map((v) => v.trim())
        .filter((v) => v.length >= 2);

      let score = 0;

      for (const term of terms) {
        const normalizedTerm = normalize(term);
        if (normalizedTerm && normalizedUserText.includes(normalizedTerm)) {
          score += 1;
        }
      }

      if (normalizedUserText.includes(normalize(dataFile))) {
        score += 5;
      }

      return {
        dataFile,
        score,
        reason:
          "レポート目的・指標定義と候補データの概要・主要カラムの一致度が高いため",
      };
    })
    .filter((r) => r.dataFile && r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map((r) => ({
    dataFile: r.dataFile,
    reason: r.reason,
  }));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const projectName = String(body.projectName ?? "");
    const outputType = String(body.outputType ?? "report");

    const candidateData: CandidateData[] = Array.isArray(body.candidateData)
      ? body.candidateData
      : [];

    const answers = body.answers ?? {};
    const projectNotes = await fetchProjectNotes(projectName);

    const projectNotesText = projectNotes
      .map((n, i) => `【${i + 1}】${n.category}\n${n.note}`)
      .join("\n\n");

    const userText = `
${projectName}
${outputType}
${body.reportName ?? ""}
${body.reportPurpose ?? ""}
${body.metricDefinition ?? ""}
${Object.values(answers).join("\n")}
${projectNotesText}
`;

    const input = `
案件名：
${projectName}

作成したいもの：
${outputType === "segment" ? "セグメント用データ" : "レポート用データ"}

名称：
${body.reportName ?? ""}

目的：
${body.reportPurpose ?? ""}

指標定義 / 判定定義：
${body.metricDefinition ?? ""}

候補データ一覧：
${candidateData
  .map(
    (d, i) => `
【${i + 1}】${d.dataFile ?? ""}
主キー：${d.primaryKey ?? ""}
概要：${d.description ?? ""}
主要カラム：${d.majorColumns ?? ""}
`
  )
  .join("\n")}

案件別注意事項：
${projectNotesText}

確認事項への回答：
${Object.entries(answers)
  .filter(([, a]) => String(a ?? "").trim() !== "")
  .map(([q, a], i) => `${i + 1}. 質問：${q}\n回答：${a}`)
  .join("\n\n")}
`;

    const prompt = `
あなたは、b→dashのデータ設計に詳しいデータ設計エンジニアです。
ユーザーが作成したいレポート / セグメントに対して、利用すべきデータを候補一覧から選定してください。

━━━━━━━━━━━━━━━━━━━━━━
■ 最重要ルール
━━━━━━━━━━━━━━━━━━━━━━

・候補データ一覧に存在するデータだけを推奨すること
・候補データ一覧に存在しないデータ名を作らないこと
・候補データ一覧に存在しないカラム名を作らないこと
・案件別注意事項を必ず優先すること
・案件別注意事項にある禁止語、推奨語、結合キー、取得できない指標を必ず守ること
・他案件の言葉を混ぜないこと
・推奨理由にも、他案件の言葉を混ぜないこと
・質問にも、他案件の言葉を混ぜないこと

━━━━━━━━━━━━━━━━━━━━━━
■ 推奨データ選定ルール
━━━━━━━━━━━━━━━━━━━━━━

・レポート目的と指標定義に必要なデータだけを選ぶこと
・集計元となる事実データを優先すること
・会員属性や顧客属性が必要な場合のみ、属性マスタを含めること
・施策効果を見る場合は、施策ログと購買・行動データを紐づけられるデータを含めること
・商品別 / カテゴリ別を見る場合は、商品明細に相当するデータを含めること
・すでに統合済みデータがあり、それだけで目的を満たせる場合は、元データを重複して選ばないこと
・不要なデータは選ばないこと
・「念のため」「将来使うかもしれない」という理由で選ばないこと

━━━━━━━━━━━━━━━━━━━━━━
■ 質問の制御ルール
━━━━━━━━━━━━━━━━━━━━━━

・原則として質問は返さないこと
・質問は「その質問がないとデータを選べない場合のみ」返すこと
・質問は最大1個まで
・すでに入力されている内容の再確認は禁止
・名称や商品名の正誤確認は禁止
・利用期間の詳細確認は禁止
・レポート設計フェーズで決めればよい内容は質問しないこと
・候補データから合理的に判断できる場合は質問せずに推奨すること

━━━━━━━━━━━━━━━━━━━━━━
■ 返却形式
━━━━━━━━━━━━━━━━━━━━━━

必ずJSONのみを返してください。
JSON以外の文章は一切返さないでください。

{
  "recommendedDataFiles": [
    {
      "dataFile": "候補データ一覧に存在する完全一致のデータ名",
      "reason": "推奨理由"
    }
  ],
  "questions": []
}

━━━━━━━━━━━━━━━━━━━━━━
■ 今回の入力
━━━━━━━━━━━━━━━━━━━━━━

${input}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "返却は必ずJSONのみ。候補データ名は候補一覧のdataFileを完全一致で返してください。案件別注意事項を最優先してください。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text = response.choices[0].message.content ?? "";

    let parsed: any;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        recommendedDataFiles: [],
        questions: [],
      };
    }

    let recommendedDataFiles = resolveRecommendedFiles(
      Array.isArray(parsed.recommendedDataFiles)
        ? parsed.recommendedDataFiles
        : [],
      candidateData
    );

    if (recommendedDataFiles.length === 0) {
      recommendedDataFiles = fallbackRecommend(candidateData, userText);
    }

    const questions =
      recommendedDataFiles.length > 0
        ? []
        : Array.isArray(parsed.questions)
        ? parsed.questions
            .map((q: any) => String(q))
            .filter((q: string) => q.trim() !== "")
            .slice(0, 1)
        : [];

    return Response.json({
      recommendedDataFiles,
      questions,
    });
  } catch (error) {
    return Response.json(
      {
        error: "推奨データ選定中にエラーが発生しました",
        detail: String(error),
      },
      { status: 500 }
    );
  }
}