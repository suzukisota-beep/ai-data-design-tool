import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function isBlank(value: unknown) {
  return !value || String(value).trim() === "";
}

function hasKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const projectName = body.projectName ?? "";
    const reportName = body.reportName ?? "";
    const reportPurpose = body.reportPurpose ?? "";
    const whatToSee = body.whatToSee ?? "";
    const metricDefinition = body.metricDefinition ?? "";
    const candidateData = Array.isArray(body.candidateData) ? body.candidateData : [];
    const answers = body.answers ?? {};

    const allText = `
${projectName}
${reportName}
${reportPurpose}
${whatToSee}
${metricDefinition}
${JSON.stringify(answers)}
`;

    const questions: string[] = [];

    // 1. 売上定義
    if (isBlank(metricDefinition)) {
      questions.push("売上は「注文金額」で集計する想定で問題ないですか？（異なる場合は修正してください）");
    }

    // 2. 期間
    if (
      isBlank(answers["分析する期間は「指定なし」で問題ないですか？（特定期間がある場合は記載してください）"]) &&
      isBlank(answers["分析期間は「直近1年」で問題ないですか？（異なる場合は修正してください）"]) &&
      !hasKeyword(allText, ["2024", "2025", "年月", "月次", "週次", "日次", "期間"])
    ) {
      questions.push("分析する期間は「指定なし」で問題ないですか？（特定期間がある場合は記載してください）");
    }

    // 3. 比較軸
    if (
      isBlank(answers["比較軸は「企画回のみ」で問題ないですか？（他に必要な軸があれば記載してください）"]) &&
      !hasKeyword(allText, ["年代別", "会員別", "商品別", "カテゴリ別", "店舗別", "エリア別", "属性別", "企画回別"])
    ) {
      questions.push("比較軸は「企画回のみ」で問題ないですか？（他に必要な軸があれば記載してください）");
    }

    // 4. 企画回の扱い
    if (
      hasKeyword(allText, ["企画回", "企画年月", "企画月別"]) &&
      isBlank(answers["企画回は「受注企画回」カラムを使う想定で問題ないですか？（異なる場合は修正してください）"])
    ) {
      questions.push("企画回は「受注企画回」カラムを使う想定で問題ないですか？（異なる場合は修正してください）");
    }

    // 5. 属性分析の有無
    if (
      isBlank(answers["組合員属性分析は「実施しない」で問題ないですか？（年代などで分析したい場合は記載してください）"]) &&
      !hasKeyword(allText, ["属性別", "年代別", "会員別"])
    ) {
      questions.push("組合員属性分析は「実施しない」で問題ないですか？（年代などで分析したい場合は記載してください）");
    }

    const uniqueQuestions = Array.from(new Set(questions)).slice(0, 5);

    const prompt = `
あなたは、b→dash案件のデータ設計に強い設計支援AIです。
あなたの役割は、レポート要件に対して「どのデータが必要か」を選定することです。

━━━━━━━━━━━━━━━━━━━━━━━
【最重要ルール】
━━━━━━━━━━━━━━━━━━━━━━━

■ 候補データの中からだけ選ぶこと
・必ず「利用可能なデータ候補」の中から選ぶこと
・候補にないデータを勝手に追加しないこと

■ 最低限ではなく、分析として成立する粒度で選ぶこと
・単に集計できるだけでなく、レポート目的・見たいこと・指標定義を満たすために必要なデータを選ぶこと
・比較軸、切り口、分類、時系列集計に必要なデータも含めて選ぶこと

■ 追加回答を必ず考慮すること
・【追加回答】に値が入っている項目は、必ずそれを前提に判断すること
・すでに回答済みの内容について、同じ確認事項を繰り返さないこと

■ 推奨理由は簡潔にすること
・reason は1文で書くこと
・「何のために必要か」が分かるようにすること

━━━━━━━━━━━━━━━━━━━━━━━
【返却形式】
━━━━━━━━━━━━━━━━━━━━━━━

必ずJSONのみで返すこと。
JSON以外の説明文は一切つけないこと。

{
  "recommendedDataFiles": [
    {
      "dataFile": "データファイル名",
      "reason": "推奨理由"
    }
  ],
  "questions": [
    "確認事項1",
    "確認事項2"
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━
【出力判断ルール】
━━━━━━━━━━━━━━━━━━━━━━━

・questions が空でもよい
・recommendedDataFiles は空にしないこと。候補の中から現時点で最も妥当なものを選ぶこと
・ただし、分析を成立させるうえで不足があるなら questions に必ず書くこと
・質問ではなく「提案して確認する形」を優先すること
・たとえば「売上の定義は何ですか？」ではなく、「売上は注文金額で問題ないですか？」とすること
・たとえば「期間はどうしますか？」ではなく、「分析期間は指定なしで問題ないですか？」とすること
・たとえば「属性分析しますか？」ではなく、「組合員属性分析は実施しない想定で問題ないですか？」とすること

━━━━━━━━━━━━━━━━━━━━━━━
【案件名】
━━━━━━━━━━━━━━━━━━━━━━━

${projectName}

━━━━━━━━━━━━━━━━━━━━━━━
【レポート名】
━━━━━━━━━━━━━━━━━━━━━━━

${reportName}

━━━━━━━━━━━━━━━━━━━━━━━
【レポート目的】
━━━━━━━━━━━━━━━━━━━━━━━

${reportPurpose}

━━━━━━━━━━━━━━━━━━━━━━━
【見たいこと】
━━━━━━━━━━━━━━━━━━━━━━━

${whatToSee}

━━━━━━━━━━━━━━━━━━━━━━━
【指標定義】
━━━━━━━━━━━━━━━━━━━━━━━

${metricDefinition}

━━━━━━━━━━━━━━━━━━━━━━━
【追加回答】
━━━━━━━━━━━━━━━━━━━━━━━

${JSON.stringify(answers, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━
【利用可能なデータ候補】
━━━━━━━━━━━━━━━━━━━━━━━

${JSON.stringify(candidateData, null, 2)}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "あなたはb→dash案件のデータ選定に強い設計支援AIです。返却は必ずJSONのみです。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text = response.choices[0].message.content ?? "";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        recommendedDataFiles: [],
        questions: ["推奨内容は以下の想定で問題ないですか？（必要なら修正してください）"],
      };
    }

    return Response.json({
      recommendedDataFiles: Array.isArray(parsed.recommendedDataFiles)
        ? parsed.recommendedDataFiles
        : [],
      questions: uniqueQuestions.length > 0
        ? uniqueQuestions
        : Array.isArray(parsed.questions)
        ? parsed.questions
        : [],
    });
  } catch (error) {
    return Response.json(
      {
        error: "推奨データの取得に失敗しました",
        detail: String(error),
      },
      { status: 500 }
    );
  }
}