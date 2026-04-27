import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const projectName = body.projectName ?? "";
    const outputType = body.outputType ?? "report";

    const candidateData = Array.isArray(body.candidateData)
      ? body.candidateData
      : [];

    const answers = body.answers ?? {};

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
    (d: any, i: number) => `
【${i + 1}】${d.dataFile ?? ""}
主キー：${d.primaryKey ?? ""}
概要：${d.description ?? ""}
主要カラム：${d.majorColumns ?? ""}
`
  )
  .join("\n")}

確認事項への回答：
${Object.entries(answers)
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
・案件名に関係ない業務用語を使わないこと
・他案件の言葉を混ぜないこと

━━━━━━━━━━━━━━━━━━━━━━
■ 案件別の禁止語・優先語
━━━━━━━━━━━━━━━━━━━━━━

【ゴンチャの場合】
以下の言葉は使わないこと：
・組合員
・企画回
・生協
・宅配
・離脱企画回

以下の言葉を使うこと：
・会員
・注文
・購入
・来店
・LINE
・店舗
・商品
・トッピング
・注文日
・注文年月

【コープデリ / 生協系の場合】
以下の言葉を使ってよい：
・組合員
・企画回
・宅配
・注文
・離脱
・継続

━━━━━━━━━━━━━━━━━━━━━━
■ 推奨データ選定ルール
━━━━━━━━━━━━━━━━━━━━━━

・レポート目的と指標定義に必要なデータを選ぶこと
・集計元となる事実データを優先すること
・会員属性が必要な場合は会員マスタを含めること
・LINE施策効果を見る場合はLINE行動ログと会員紐付け可能なデータを含めること
・商品別 / カテゴリ別 / トッピング別を見る場合は明細データを含めること
・不要なデータは選ばないこと
・ただし、あとでピボット集計する前提で顧客識別子を保持できるデータは優先すること

━━━━━━━━━━━━━━━━━━━━━━
■ 確認事項の出し方
━━━━━━━━━━━━━━━━━━━━━━

・情報が不足している場合のみ質問を返すこと
・質問は最大5個
・質問は「提案形」にすること
・質問には案件に合った言葉だけを使うこと
・質問は短く、回答しやすくすること

悪い例：
・比較軸は「企画回のみ」で問題ないですか？
・組合員属性分析は実施しないで問題ないですか？

ゴンチャでの良い例：
・比較軸は「注文日」または「注文年月」で問題ないですか？
・会員属性別の分析は実施しないで問題ないですか？
・購入金額は「total_amount_in_tax」で問題ないですか？
・LINE配信後の来店判定は「配信後7日以内の注文あり」で問題ないですか？

━━━━━━━━━━━━━━━━━━━━━━
■ 返却形式
━━━━━━━━━━━━━━━━━━━━━━

必ずJSONのみを返してください。
JSON以外の文章は一切返さないでください。

{
  "recommendedDataFiles": [
    {
      "dataFile": "データ名",
      "reason": "推奨理由"
    }
  ],
  "questions": [
    "確認事項1",
    "確認事項2"
  ]
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
            "あなたはb→dashのデータ設計に強い設計エンジニアです。返却は必ずJSONのみで行ってください。他案件の用語を混ぜないでください。",
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
        questions: [
          "推奨データの判定に失敗しました。レポート目的と指標定義をもう少し具体化して再実行してください。",
        ],
      };
    }

    const validDataFileNames = new Set(
      candidateData.map((d: any) => String(d.dataFile ?? ""))
    );

    const recommendedDataFiles = Array.isArray(parsed.recommendedDataFiles)
      ? parsed.recommendedDataFiles
          .filter((d: any) => validDataFileNames.has(String(d.dataFile ?? "")))
          .map((d: any) => ({
            dataFile: String(d.dataFile ?? ""),
            reason: String(d.reason ?? ""),
          }))
      : [];

    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.map((q: any) => String(q))
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