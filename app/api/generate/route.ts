import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const outputType = body.outputType ?? "report";

    const input = `
案件名：
${body.projectName ?? ""}

作成したいもの：
${outputType === "segment" ? "セグメント用データ" : "レポート用データ"}

名称：
${body.reportName ?? ""}

目的：
${body.reportPurpose ?? ""}

見たいこと / 作りたい条件：
${body.whatToSee ?? ""}

指標定義 / 判定定義：
${body.metricDefinition ?? ""}

利用期間：
${body.period ?? ""}

除外条件：
${body.excludeConditions ?? ""}

案件別データ一覧：
${body.projectDataText ?? ""}

自動取得サンプルデータ：
${body.sampleDataFromMaster ?? ""}

案件別注意事項：
${body.projectNotes ?? ""}
`;

    const commonRule = `
あなたは、b→dashのデータ設計に詳しい設計支援AIです。
顧客や社内メンバーが「このデータをどう実装するか」を理解できるレベルで設計してください。

■ 案件別注意事項の扱い
・【案件別注意事項】は必ず設計前提として扱う
・結合キー、除外条件、取得できない指標、業務ルールを最優先する
・注意事項とユーザー入力が矛盾する場合は確認事項を返す
・開封・クリックが取れないとある場合、開封率・クリック率前提は禁止
・line_uidで紐づけるとある場合、LINEログと会員データはline_uidで統合する

■ 自動取得サンプルデータの扱い
・カラム名、粒度、サンプル値を必ず参照する
・存在しないカラムを勝手に作らない
・利用データ、統合データ、出力列はサンプルデータを優先して判断する

■ 統合データの基本思想
・最終統合データはExcelのピボット集計で柔軟に集計できる形を優先する
・集計済みレポートそのものではなく、後から切り口を変えられる粒度にする
・顧客識別子は基本的に最終統合データに持たせる
・例：membership_card_no、会員番号、顧客IDなど
・目的上不要、または粒度が崩れる場合のみ例外とする

■ b→dash制約
・IF文の中で演算しない
・四則演算は1回につき2項目まで
・集約には必ずグループキーが必要
・全体集約時は固定値1カラムを作ってグループキーに使う
・加工DF内で統合しない
・統合後は別DFとして加工する
・識別用コードは整数型に変換しない
・件数系は1フラグ合計ではなくユニークカウントで考える

■ 出力方針
・日本語のみ
・論理名のみ
・SQLや物理名での説明は禁止
・抽象表現は禁止
・細かいb→dash設定値までは不要
・実装の全体像が分かる設計にする

■ 返却形式
JSONのみ返すこと。

情報不足：
{
  "type": "question",
  "questions": ["確認事項1", "確認事項2"]
}

設計可能：
{
  "type": "design",
  "result": "設計本文"
}
`;

    const tableRule = `
■ テーブル出力ルール
・レポートサンプル、統合データサンプル、出力データイメージは必ずMarkdownテーブル
・縦並びは禁止
・最低3行のサンプル行を出す

正しい例：
| membership_card_no | 配信日時 | LINEコンテンツ名 | 来店有無 | 購入金額 |
| ------------------ | -------- | ---------------- | -------- | -------- |
| 0100010251581 | 2024/09/17 08:00:00 | Away_2409 | 1 | 570 |
| 0100015355895 | 2024/09/17 08:00:00 | Away_2409 | 0 | 0 |
| 0100003182490 | 2024/09/17 08:00:00 | Away_2409 | 1 | 630 |
`;

    const verifyRule = `
■ 検証方法ルール
・必ず「今回使用した大元データをどう集計し、最終結果のどの列と一致確認するか」を書く
・「整合性を見る」「確認する」だけは禁止

必ず以下の構造で書く。

① 確認粒度
　xxx

② 使用する大元データ
　xxx

③ 元データでの集計方法
　・xxx
　・xxx

④ 突合方法
　・xxx
　・xxx

⑤ 中間検証
　・xxx

⑥ 最終検証
　・xxx

⑦ 異常値確認
　・xxx
`;

    const formatRule = `
■ フォーマットルール
・文章のベタ書きは禁止
・見出し → インデント → 箇条書きで書く
・1行は短くする
・全体的に読みやすく整理する
`;

    const flowSampleRule = `
■ データフロー強化ルール
・4章ではすべての加工 / 統合STEPに「出力データイメージ」を付ける
・出力データイメージはMarkdownテーブル
・加工後 / 統合後のデータ状態を書く
・「取込」は使わず、加工 / 統合のみで書く

書き方：
加工：xxx
　目的：
　　xxx
　概要：
　　xxx
　出力データイメージ：
　| xxx | xxx |
　| --- | --- |
　| xxx | xxx |
`;

    const reportPrompt = `
${commonRule}
${tableRule}
${verifyRule}
${formatRule}
${flowSampleRule}

今回は「レポート用データ」の設計です。

必ず以下の5章で出力してください。

1. アウトプットレポートイメージ
2. レポート作成に必要な統合データイメージ
3. 利用するデータ
4. データフロー図と各加工/統合の目的と概要
5. 検証方法

【1. アウトプットレポートイメージ】
① レポート目的
② 分析定義
③ レポートサンプル

【2. レポート作成に必要な統合データイメージ】
① 統合データ名
② 粒度
③ 持つべきカラム一覧
④ レポート使用列
⑤ 生成用列
⑥ 統合データサンプル

【3. 利用するデータ】
① 使うデータファイル名
② 各データの役割
③ そのデータを何のために使うか

【4. データフロー図と各加工/統合の目的と概要】
・加工 / 統合のみで書く
・各STEPに目的、概要、出力データイメージを入れる

【5. 検証方法】
・verifyRuleの構造で書く

【今回の入力】
${input}
`;

    const segmentPrompt = `
${commonRule}
${tableRule}
${verifyRule}
${formatRule}
${flowSampleRule}

今回は「セグメント用データ」の設計です。

必ず以下の5章で出力してください。

1. セグメント出力イメージ
2. セグメント判定に必要な統合データイメージ
3. 利用するデータ
4. データフロー図と各加工/統合の目的と概要
5. 検証方法

【1. セグメント出力イメージ】
① セグメントの利用目的
② 判定定義
③ 出力サンプル

【2. セグメント判定に必要な統合データイメージ】
① 統合データ名
② 粒度
③ 持つべきカラム一覧
④ 判定使用列
⑤ 生成用列
⑥ 統合データサンプル

【3. 利用するデータ】
① 使うデータファイル名
② 各データの役割
③ そのデータを何のために使うか

【4. データフロー図と各加工/統合の目的と概要】
・加工 / 統合のみで書く
・各STEPに目的、概要、出力データイメージを入れる

【5. 検証方法】
・verifyRuleの構造で書く
・条件に合う / 合わないサンプル確認も含める

【今回の入力】
${input}
`;

    const prompt = outputType === "segment" ? segmentPrompt : reportPrompt;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "あなたはb→dashのデータ設計に強い設計エンジニアです。返却は必ずJSONのみで行ってください。",
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
        type: "design",
        result: text,
      };
    }

    return Response.json(parsed);
  } catch (error) {
    return Response.json(
      {
        type: "error",
        error: "API実行中にエラーが発生しました",
        detail: String(error),
      },
      { status: 500 }
    );
  }
}