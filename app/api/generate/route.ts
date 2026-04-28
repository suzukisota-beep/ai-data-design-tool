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

■ 統合データ設計ルール
・2章の統合データサンプルには、1章のレポートサンプルで使う列をすべて含めること
・レポートで使う集計軸、指標、判定フラグは統合データに必ず持たせること
・例：レポートサンプルに「配信状況」がある場合、統合データサンプルにも「配信状況」を必ず含める
・レポートで「購入人数」「購入杯数」「購入金額」を出す場合、統合データには集計元となる顧客識別子、購入数量、購入金額、判定日、集計軸を持たせる
・レポートサンプルだけに存在し、統合データサンプルに存在しない列を作らないこと
・2章の統合データサンプルは、後からBIやExcelピボットで1章のレポートサンプルを再現できる状態にすること

■ 各STEPの出力データイメージルール
・各STEPの出力データイメージには、そのSTEP後に増える列を必ず含める
・施策ログと購買データを統合したSTEPでは、施策接触状況、施策日時、顧客識別子、商品名、購入数量、購入金額を含める
・最終STEPの出力データイメージは、2章の統合データサンプルと同じ粒度・同じ主要列にする

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
| membership_card_no | 配信状況 | 日付 | 購入杯数 | 購入金額 |
| --- | --- | --- | --- | --- |
| 0100010251581 | 配信あり | 2026/02/01 | 10 | 7000 |
| 0100015355895 | 配信なし | 2026/02/02 | 7 | 4900 |
| 0100003182490 | 配信あり | 2026/02/03 | 5 | 3500 |

■ 検証方法ルール
・検証方法は、作業者がそのまま手を動かせる粒度で書く
・「取得する」「抽出する」「確認する」「整合性を見る」だけの抽象表現は禁止
・元データ名、絞り込み条件、結合キー、集計キー、集計方法、突合先列を具体的に書く
・検証用データは大きく加工せず、大元データをExcelやスプレッドシートで最小加工して確認する前提で書く
・③ 元データでの集計方法は、必ず番号付き手順で5手順以上に分解する
・④ 突合方法は、最終レポートのどの列と検証用集計のどの列を比較するかを書く

検証方法の書き方例：
③ 元データでの集計方法
　1. LINE行動ログデータで、行動タイプが配信成功に該当する行だけを残す
　2. LINEユーザID単位で重複を除き、配信ありユーザー一覧を作る
　3. 会員一覧のline_uidとLINEユーザIDを突合し、membership_card_noを付与する
　4. 会員一覧×注文明細で、item_nameが対象商品の行だけを残す
　5. trans_timeを日付単位に変換し、配信日時から7日以内の注文だけを残す
　6. 配信状況、membership_card_no単位で購入有無、購入数量、購入金額を集計する

④ 突合方法
　・検証用に作成した「配信状況別の購入人数」を、最終レポートの「購入人数」と比較する
　・検証用に作成した「配信状況別の購入数量合計」を、最終レポートの「購入杯数」と比較する
　・検証用に作成した「配信状況別の購入金額合計」を、最終レポートの「購入金額」と比較する
　・配信あり、配信なしの各行で数値が一致するか確認する
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
・図は不要、文章で処理手順を整理する
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

4. 加工/統合の目的と概要
・図は不要、文章で処理手順を整理する
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