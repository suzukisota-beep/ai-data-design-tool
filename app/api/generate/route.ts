import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function stripCodeFence(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractJsonText(text: string) {
  const cleaned = stripCodeFence(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1);
  }

  return cleaned;
}

function objectToReadableText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";

  if (Array.isArray(value)) {
    return value.map((v) => objectToReadableText(v)).join("\n\n");
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => {
        if (typeof val === "string" || typeof val === "number") {
          return `${key}\n${val}`;
        }
        return `${key}\n${objectToReadableText(val)}`;
      })
      .join("\n\n");
  }

  return String(value);
}

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

指標定義 / 判定定義：
${body.metricDefinition ?? ""}

利用期間：
${body.period ?? ""}

除外条件：
${body.excludeConditions ?? ""}

利用するデータ：
${body.dataFiles ?? ""}

確認事項への回答：
${body.answeredQuestions ?? ""}

案件別データ一覧：
${body.projectDataText ?? ""}

自動取得サンプルデータ：
${body.sampleDataFromMaster ?? ""}

案件別注意事項：
${body.projectNotes ?? ""}

過去の出力フィードバック：
${body.feedbackHistory ?? ""}
`;

    const commonRule = `
あなたは、b→dashのデータ設計に詳しい設計支援AIです。
顧客や社内メンバーが「このデータをどう実装するか」を理解できるレベルで設計してください。

■ 返却形式
・必ずJSONのみ返す
・Markdownのコードブロックは禁止
・\`\`\`json で囲まない
・resultの中身は必ず「文字列」で返す
・resultを配列やオブジェクトにしない

正しい返却例：
{
  "type": "design",
  "result": "1. アウトプットレポートイメージ\\n① レポート目的\\n..."
}

■ 案件別注意事項・過去FBの扱い
・【案件別注意事項】と【過去の出力フィードバック】は必ず設計前提として扱う
・他案件の用語を混ぜない
・禁止語、推奨語、結合キー、取得できない指標を必ず守る
・ユーザーがチェックした【利用するデータ】だけを使う
・利用するデータにないデータを勝手に使わない

■ サンプルデータの扱い
・カラム名、粒度、サンプル値を必ず参照する
・存在しないカラムを勝手に作らない
・論理名またはサンプルに存在するカラム名だけを使う

■ 統合データの基本思想
・最終統合データはExcelのピボット集計で柔軟に集計できる形を優先する
・集計済みレポートそのものではなく、後から切り口を変えられる粒度にする
・顧客識別子は基本的に最終統合データに持たせる
・目的上不要、または粒度が崩れる場合のみ例外とする

■ b→dash制約
・IF文の中で演算しない
・四則演算は1回につき2項目まで
・集約には必ずグループキーが必要
・加工DF内で統合しない
・統合後は別DFとして加工する
・識別用コードは整数型に変換しない
・件数系は1フラグ合計ではなくユニークカウントで考える

■ テーブル出力ルール
・レポートサンプル、統合データサンプル、各STEPの出力データイメージは必ずMarkdownテーブルにする
・縦並びは禁止
・「カラム名 → 値 → カラム名 → 値」の形式は禁止
・最低3行のサンプル行を出す
・Markdownテーブルは必ず以下の形式にする
・2行目の区切り行は必ず「| --- | --- | --- |」形式にする
・区切り行で「|------|」のようにハイフンだけを連結する形式は禁止

正しい例：
| membership_card_no | 日付 | 購入杯数 | 購入金額 |
| --- | --- | --- | --- |
| 0100010251581 | 2026/02/01 | 10 | 7000 |
| 0100015355895 | 2026/02/02 | 7 | 4900 |
| 0100003182490 | 2026/02/03 | 5 | 3500 |

■ 検証方法ルール
・今回使用した大元データをどう集計し、最終結果のどの列と一致確認するかを書く
・「整合性を見る」「確認する」だけは禁止
`;

    const reportPrompt = `
${commonRule}

今回は「レポート用データ」の設計です。

必ず以下の5章で出力してください。

1. アウトプットレポートイメージ
① レポート目的
② 分析定義
③ レポートサンプル

2. レポート作成に必要な統合データイメージ
① 統合データ名
② 粒度
③ 統合データサンプル

3. 利用するデータ
① 使うデータファイル名
② 各データの役割
③ そのデータを何のために使うか

4. 加工/統合の目的と概要
・「取込」は使わない
・加工 / 統合のみで書く
・各STEPに目的、概要、出力データイメージを入れる

5. 検証方法
① 確認粒度
② 使用する大元データ
③ 元データでの集計方法
④ 突合方法
⑤ 中間検証
⑥ 最終検証
⑦ 異常値確認

【今回の入力】
${input}
`;

    const segmentPrompt = `
${commonRule}

今回は「セグメント用データ」の設計です。

必ず以下の5章で出力してください。

1. セグメント出力イメージ
① セグメントの利用目的
② 判定定義
③ 出力サンプル

2. セグメント判定に必要な統合データイメージ
① 統合データ名
② 粒度
③ 統合データサンプル

3. 利用するデータ
① 使うデータファイル名
② 各データの役割
③ そのデータを何のために使うか

4. データフロー図と各加工/統合の目的と概要
・「取込」は使わない
・加工 / 統合のみで書く
・各STEPに目的、概要、出力データイメージを入れる

5. 検証方法
① 確認粒度
② 使用する大元データ
③ 元データでの集計方法
④ 突合方法
⑤ 中間検証
⑥ 最終検証
⑦ 異常値確認

【今回の入力】
${input}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "あなたはb→dashのデータ設計に強い設計エンジニアです。必ずJSONのみを返してください。コードブロックは禁止です。",
        },
        {
          role: "user",
          content: outputType === "segment" ? segmentPrompt : reportPrompt,
        },
      ],
    });

    const text = response.choices[0].message.content ?? "";

    let parsed: any;

    try {
      parsed = JSON.parse(extractJsonText(text));
    } catch {
      parsed = {
        type: "design",
        result: stripCodeFence(text),
      };
    }

    if (parsed?.type === "design") {
      parsed.result = objectToReadableText(parsed.result);
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