import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type CandidateData = {
  dataFile?: string;
  primaryKey?: string;
  description?: string;
  majorColumns?: string;
};

type RecommendedDataFile = {
  dataFile: string;
  reason: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const projectName = String(body.projectName ?? "");
    const outputType = String(body.outputType ?? "report");

    const candidateData: CandidateData[] = Array.isArray(body.candidateData)
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
    (d, i) => `
【${i + 1}】${d.dataFile ?? ""}
主キー：${d.primaryKey ?? ""}
概要：${d.description ?? ""}
主要カラム：${d.majorColumns ?? ""}
`
  )
  .join("\n")}

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
・案件名に関係ない業務用語を使わないこと
・他案件の言葉を混ぜないこと
・推奨理由にも、他案件の言葉を混ぜないこと
・質問にも、他案件の言葉を混ぜないこと

━━━━━━━━━━━━━━━━━━━━━━
■ 案件別の禁止語・優先語
━━━━━━━━━━━━━━━━━━━━━━

【ゴンチャの場合】
以下の言葉は絶対に使わないこと：
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

・レポート目的と指標定義に必要なデータだけを選ぶこと
・集計元となる事実データを優先すること
・会員属性が必要な場合のみ会員マスタを含めること
・LINE施策効果を見る場合のみLINE行動ログを含めること
・商品別 / カテゴリ別を見る場合は注文明細データを含めること
・トッピング別を見る場合のみトッピング注文明細を含めること
・すでに会員属性と注文明細が統合されたデータがあり、それだけで目的を満たせる場合は、元の会員一覧と注文明細を重複して選ばないこと
・不要なデータは選ばないこと
・「念のため」「将来使うかもしれない」という理由で選ばないこと

━━━━━━━━━━━━━━━━━━━━━━
■ 質問の制御ルール（最重要）
━━━━━━━━━━━━━━━━━━━━━━

・原則として質問は返さないこと
・質問は「その質問がないとデータを選べない場合のみ」返すこと
・質問は最大2個まで
・すでに入力されている内容の再確認は禁止
・名称や商品名の正誤確認は禁止
・利用期間の詳細確認は禁止
・レポート設計フェーズで決めればよい内容は質問しないこと
・不明点があっても、候補データから合理的に判断できる場合は質問せずに推奨すること

禁止例：
・いちご杏仁のitem_nameは正しいですか？
・レポートの日次集計期間はどれくらいですか？
・この商品名で間違いないですか？
・分析期間はいつからいつまでですか？
・組合員属性分析は実施しないで問題ないですか？ ※ゴンチャでは禁止語を含む

許可例：
・日次と月次のどちらを主軸にしますか？
・LINE配信後の来店判定は「配信後7日以内の注文あり」で問題ないですか？

ただし、許可例でもデータ選定に不要なら質問しないこと。

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
            "あなたはb→dashのデータ設計に強い設計エンジニアです。返却は必ずJSONのみ。他案件の用語を混ぜず、原則質問せずに推奨データを選定してください。",
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

    const validDataFileNames = new Set(
      candidateData.map((d) => String(d.dataFile ?? ""))
    );

    const recommendedDataFiles: RecommendedDataFile[] = Array.isArray(
      parsed.recommendedDataFiles
    )
      ? parsed.recommendedDataFiles
          .filter((d: any) => validDataFileNames.has(String(d.dataFile ?? "")))
          .map((d: any) => ({
            dataFile: String(d.dataFile ?? ""),
            reason: String(d.reason ?? ""),
          }))
      : [];

    const questions = Array.isArray(parsed.questions)
      ? parsed.questions
          .map((q: any) => String(q))
          .filter((q: string) => q.trim() !== "")
          .slice(0, 2)
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