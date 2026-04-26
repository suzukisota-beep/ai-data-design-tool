'use client';

import React, { useEffect, useMemo, useState } from 'react';

type MasterRow = {
  projectName: string;
  dataFile: string;
  primaryKey: string;
  description: string;
  majorColumns: string;
  defaultSelected: string;
  displayOrder: string;
  isActive: string;
};

type RecommendedRow = {
  dataFile: string;
  reason: string;
};

type SampleRow = {
  projectName: string;
  dataFile: string;
  sampleCsv: string;
};

async function fetchSampleData(
  projectName: string,
  dataFiles: string[]
): Promise<SampleRow[]> {
  try {
    if (!projectName.trim() || dataFiles.length === 0) {
      return [];
    }

    const dataFilesParam = dataFiles.join('、');

    const res = await fetch(
      `/api/sample-data?projectName=${encodeURIComponent(
        projectName
      )}&dataFiles=${encodeURIComponent(dataFilesParam)}`
    );

    const json = await res.json();
    console.log('sample-data debug:', json);

    return Array.isArray(json.data) ? json.data : [];
  } catch (error) {
    console.error('sample-data error', error);
    return [];
  }
}

function formatDesignResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatDesignResult(item)).join('\n\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries
      .map(([key, val]) => {
        const formattedValue = formatDesignResult(val);
        return `${key}\n${formattedValue}`;
      })
      .join('\n\n');
  }

  return String(value);
}

function isMarkdownTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
}

function isMarkdownSeparatorRow(line: string) {
  const trimmed = line.trim();
  if (!isMarkdownTableRow(trimmed)) return false;

  const cells = trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());

  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTable(lines: string[], startIndex: number) {
  const tableLines: string[] = [];
  let i = startIndex;

  while (i < lines.length && isMarkdownTableRow(lines[i])) {
    tableLines.push(lines[i]);
    i += 1;
  }

  if (tableLines.length < 2) {
    return null;
  }

  const headerLine = tableLines[0];
  const separatorLine = tableLines[1];

  if (!isMarkdownSeparatorRow(separatorLine)) {
    return null;
  }

  const headers = headerLine
    .trim()
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());

  const rows = tableLines.slice(2).map((line) =>
    line
      .trim()
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim())
  );

  return {
    headers,
    rows,
    nextIndex: i,
  };
}

function renderResultContent(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isMarkdownTableRow(line)) {
      const parsedTable = parseMarkdownTable(lines, i);

      if (parsedTable) {
        elements.push(
          <div key={`table-${key++}`} style={{ margin: '12px 0 20px 0', overflowX: 'auto' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                minWidth: '480px',
                background: '#fff',
              }}
            >
              <thead>
                <tr>
                  {parsedTable.headers.map((header, idx) => (
                    <th
                      key={idx}
                      style={{
                        border: '1px solid #ccc',
                        padding: '8px 10px',
                        textAlign: 'left',
                        background: '#f5f5f5',
                        fontWeight: 700,
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedTable.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {parsedTable.headers.map((_, colIndex) => (
                      <td
                        key={colIndex}
                        style={{
                          border: '1px solid #ccc',
                          padding: '8px 10px',
                          verticalAlign: 'top',
                        }}
                      >
                        {row[colIndex] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

        i = parsedTable.nextIndex;
        continue;
      }
    }

    if (line.trim() === '') {
      elements.push(<div key={`space-${key++}`} style={{ height: 10 }} />);
      i += 1;
      continue;
    }

    elements.push(
      <div
        key={`line-${key++}`}
        style={{
          whiteSpace: 'pre-wrap',
          lineHeight: 1.8,
          marginBottom: 2,
        }}
      >
        {line}
      </div>
    );

    i += 1;
  }

  return elements;
}

export default function Home() {
  const [projectName, setProjectName] = useState('');
  const [outputType, setOutputType] = useState<'report' | 'segment'>('report');
  const [reportName, setReportName] = useState('');
  const [reportPurpose, setReportPurpose] = useState('');
  const [whatToSee, setWhatToSee] = useState('');
  const [metricDefinition, setMetricDefinition] = useState('');
  const [period, setPeriod] = useState('');
  const [excludeConditions, setExcludeConditions] = useState('');

  const [masterData, setMasterData] = useState<MasterRow[]>([]);
  const [selectedDataFiles, setSelectedDataFiles] = useState<string[]>([]);
  const [manualDataFiles, setManualDataFiles] = useState('');
  const [recommendedData, setRecommendedData] = useState<RecommendedRow[]>([]);
  const [recommendQuestions, setRecommendQuestions] = useState<string[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>(
    {}
  );
  const [sampleRows, setSampleRows] = useState<SampleRow[]>([]);

  const [generateQuestions, setGenerateQuestions] = useState<string[]>([]);
  const [generateQuestionAnswers, setGenerateQuestionAnswers] = useState<
    Record<string, string>
  >({});

  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [recommendLoading, setRecommendLoading] = useState(false);

  useEffect(() => {
    const fetchMaster = async () => {
      try {
        const res = await fetch('/api/master');
        const data = await res.json();
        setMasterData(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('案件マスタ取得エラー', error);
      }
    };

    fetchMaster();
  }, []);

  const projectOptions = useMemo(() => {
    return Array.from(
      new Set(
        masterData
          .map((row) => row.projectName)
          .filter((name) => String(name).trim() !== '')
      )
    ).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [masterData]);

  const filteredData = useMemo(() => {
    return masterData
      .filter(
        (row) =>
          row.projectName === projectName &&
          String(row.isActive).toUpperCase() !== 'FALSE'
      )
      .sort(
        (a, b) =>
          Number(a.displayOrder || 999) - Number(b.displayOrder || 999)
      );
  }, [masterData, projectName]);

  useEffect(() => {
    if (filteredData.length > 0) {
      const defaults = filteredData
        .filter((row) => String(row.defaultSelected).toUpperCase() === 'TRUE')
        .map((row) => row.dataFile);

      setSelectedDataFiles(defaults);
    } else {
      setSelectedDataFiles([]);
    }

    setRecommendedData([]);
    setRecommendQuestions([]);
    setQuestionAnswers({});
    setGenerateQuestions([]);
    setGenerateQuestionAnswers({});
    setResult('');
  }, [filteredData]);

  const combinedDataFiles = useMemo(() => {
    const manualItems = manualDataFiles
      .split('\n')
      .map((v) => v.trim())
      .filter(Boolean);

    return Array.from(new Set([...selectedDataFiles, ...manualItems]));
  }, [selectedDataFiles, manualDataFiles]);

  const mergedDataFilesText = useMemo(() => {
    return combinedDataFiles.join('、');
  }, [combinedDataFiles]);

  const answeredRecommendQuestionsText = useMemo(() => {
    const entries = Object.entries(questionAnswers)
      .map(([question, answer]) => ({
        question,
        answer: String(answer).trim(),
      }))
      .filter((item) => item.answer !== '');

    if (entries.length === 0) return '';

    return entries
      .map(
        (item, index) =>
          `${index + 1}. 質問：${item.question}\n回答：${item.answer}`
      )
      .join('\n\n');
  }, [questionAnswers]);

  const answeredGenerateQuestionsText = useMemo(() => {
    const entries = Object.entries(generateQuestionAnswers)
      .map(([question, answer]) => ({
        question,
        answer: String(answer).trim(),
      }))
      .filter((item) => item.answer !== '');

    if (entries.length === 0) return '';

    return entries
      .map(
        (item, index) =>
          `${index + 1}. 質問：${item.question}\n回答：${item.answer}`
      )
      .join('\n\n');
  }, [generateQuestionAnswers]);

  const allAnsweredQuestionsText = useMemo(() => {
    return [answeredRecommendQuestionsText, answeredGenerateQuestionsText]
      .filter(Boolean)
      .join('\n\n');
  }, [answeredRecommendQuestionsText, answeredGenerateQuestionsText]);

  const sampleDataText = useMemo(() => {
    if (sampleRows.length === 0) return '';

    return sampleRows
      .map((row, index) => `【${index + 1}】${row.dataFile}\n${row.sampleCsv}`)
      .join('\n\n');
  }, [sampleRows]);

  useEffect(() => {
    const loadSampleData = async () => {
      const rows = await fetchSampleData(projectName, combinedDataFiles);
      setSampleRows(rows);
    };

    loadSampleData();
  }, [projectName, combinedDataFiles]);

  const handleToggleDataFile = (fileName: string) => {
    setSelectedDataFiles((prev) =>
      prev.includes(fileName)
        ? prev.filter((v) => v !== fileName)
        : [...prev, fileName]
    );
  };

  const buildRecommendPayload = () => {
    const candidateData = filteredData.map((row) => ({
      dataFile: row.dataFile,
      primaryKey: row.primaryKey,
      description: row.description,
      majorColumns: row.majorColumns,
    }));

    return {
      outputType,
      projectName,
      reportName,
      reportPurpose,
      whatToSee,
      metricDefinition,
      candidateData,
      answers: questionAnswers,
    };
  };

  const handleRecommendData = async () => {
    try {
      setRecommendLoading(true);
      setRecommendQuestions([]);
      setRecommendedData([]);
      setQuestionAnswers({});
      setGenerateQuestions([]);
      setGenerateQuestionAnswers({});
      setResult('');

      const res = await fetch('/api/recommend-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRecommendPayload()),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`推奨データ取得エラー: ${JSON.stringify(data, null, 2)}`);
        return;
      }

      const recommended = Array.isArray(data.recommendedDataFiles)
        ? data.recommendedDataFiles
        : [];

      const questions = Array.isArray(data.questions) ? data.questions : [];

      setRecommendedData(recommended);
      setRecommendQuestions(questions);

      const recommendedNames = recommended.map(
        (r: RecommendedRow) => r.dataFile
      );
      if (recommendedNames.length > 0) {
        setSelectedDataFiles(recommendedNames);
      }
    } catch (error) {
      alert(`推奨データ取得失敗: ${String(error)}`);
    } finally {
      setRecommendLoading(false);
    }
  };

  const handleReRecommendData = async () => {
    try {
      setRecommendLoading(true);

      const res = await fetch('/api/recommend-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRecommendPayload()),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`再判定エラー: ${JSON.stringify(data, null, 2)}`);
        return;
      }

      const recommended = Array.isArray(data.recommendedDataFiles)
        ? data.recommendedDataFiles
        : [];

      const questions = Array.isArray(data.questions) ? data.questions : [];

      setRecommendedData(recommended);
      setRecommendQuestions(questions);

      const recommendedNames = recommended.map(
        (r: RecommendedRow) => r.dataFile
      );
      if (recommendedNames.length > 0) {
        setSelectedDataFiles(recommendedNames);
      }
    } catch (error) {
      alert(`再判定失敗: ${String(error)}`);
    } finally {
      setRecommendLoading(false);
    }
  };

  const handleAnswerChange = (question: string, value: string) => {
    setQuestionAnswers((prev) => ({
      ...prev,
      [question]: value,
    }));
  };

  const handleGenerateAnswerChange = (question: string, value: string) => {
    setGenerateQuestionAnswers((prev) => ({
      ...prev,
      [question]: value,
    }));
  };

  const handleGenerate = async () => {
    try {
      setLoading(true);
      setResult('生成中...');

      const payload = {
        outputType,
        projectName,
        reportName,
        reportPurpose,
        whatToSee,
        metricDefinition,
        dataFiles: mergedDataFilesText,
        period,
        excludeConditions,
        answeredQuestions: allAnsweredQuestionsText,
        questionAnswers: {
          ...questionAnswers,
          ...generateQuestionAnswers,
        },
        sampleDataFromMaster: sampleDataText,
      };

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult(`エラーが発生しました:\n${JSON.stringify(data, null, 2)}`);
        return;
      }

      if (data.type === 'question') {
        const questions = Array.isArray(data.questions) ? data.questions : [];
        setGenerateQuestions(questions);
        setResult('');
        return;
      }

      setGenerateQuestions([]);
      setGenerateQuestionAnswers({});

      const formatted =
        data.type === 'design'
          ? formatDesignResult(data.result)
          : formatDesignResult(data);

      setResult(formatted || '結果が空です');
    } catch (error) {
      setResult(`通信エラー: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '8px',
    marginTop: '4px',
    marginBottom: '12px',
    boxSizing: 'border-box' as const,
  };

  const textareaStyle = {
    width: '100%',
    minHeight: '80px',
    padding: '8px',
    marginTop: '4px',
    marginBottom: '12px',
    boxSizing: 'border-box' as const,
  };

  const boxStyle = {
    border: '1px solid #ccc',
    padding: '12px',
    marginTop: '4px',
    marginBottom: '12px',
    background: '#fafafa',
  };

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1>AIデータ設計ツール</h1>

      <label>案件名</label>
      <select
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        style={inputStyle}
      >
        <option value="">案件を選択してください</option>
        {projectOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <label>作成したいもの</label>
      <select
        value={outputType}
        onChange={(e) => setOutputType(e.target.value as 'report' | 'segment')}
        style={inputStyle}
      >
        <option value="report">レポート用データ</option>
        <option value="segment">セグメント用データ</option>
      </select>

      <label>{outputType === 'report' ? 'レポート名' : 'セグメント名'}</label>
      <input
        type="text"
        value={reportName}
        onChange={(e) => setReportName(e.target.value)}
        style={inputStyle}
        placeholder={
          outputType === 'report'
            ? '例：初回利用からの経過企画回数別 新規離脱分布'
            : '例：休眠予備軍セグメント'
        }
      />

      <label>{outputType === 'report' ? 'レポート目的' : '作成目的'}</label>
      <textarea
        value={reportPurpose}
        onChange={(e) => setReportPurpose(e.target.value)}
        style={textareaStyle}
        placeholder={
          outputType === 'report'
            ? '例：離脱が集中するタイミングを把握し、施策設計に活用したい'
            : '例：休眠予備軍を抽出し、LINE配信対象に使いたい'
        }
      />

      <label>{outputType === 'report' ? '見たいこと' : '作りたい条件'}</label>
      <textarea
        value={whatToSee}
        onChange={(e) => setWhatToSee(e.target.value)}
        style={textareaStyle}
        placeholder={
          outputType === 'report'
            ? '例：年代別に初回利用から何回目で離脱しやすいかを見たい'
            : '例：最終利用から8企画回未注文の組合員を抽出したい'
        }
      />

      <label>{outputType === 'report' ? '指標定義' : '判定定義'}</label>
      <textarea
        value={metricDefinition}
        onChange={(e) => setMetricDefinition(e.target.value)}
        style={textareaStyle}
        placeholder={
          outputType === 'report'
            ? '例：組合員数＝組合員CDユニーク件数 / 新規離脱数＝最後利用から8企画回未注文に到達した組合員数'
            : '例：休眠予備軍＝最終利用から8企画回未注文の組合員'
        }
      />

      <button
        onClick={handleRecommendData}
        disabled={recommendLoading || filteredData.length === 0}
      >
        {recommendLoading ? '推奨データ選定中...' : '推奨データを提案'}
      </button>

      {recommendQuestions.length > 0 && (
        <div style={{ ...boxStyle, background: '#fff8e1' }}>
          <div style={{ fontWeight: 'bold', marginBottom: 12 }}>
            確認事項（推奨データ選定時）
          </div>

          {recommendQuestions.map((q, i) => (
            <div key={q} style={{ marginBottom: 14 }}>
              <div style={{ marginBottom: 6 }}>{i + 1}. {q}</div>
              <input
                type="text"
                value={questionAnswers[q] ?? ''}
                onChange={(e) => handleAnswerChange(q, e.target.value)}
                style={inputStyle}
                placeholder="ここに回答を入力"
              />
            </div>
          ))}

          <button onClick={handleReRecommendData} disabled={recommendLoading}>
            {recommendLoading ? '再判定中...' : '回答を踏まえて再判定する'}
          </button>
        </div>
      )}

      {recommendedData.length > 0 && (
        <div style={{ ...boxStyle, background: '#eef7ff' }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>AI推奨データ</div>
          {recommendedData.map((row, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div><b>{row.dataFile}</b></div>
              <div>理由：{row.reason}</div>
            </div>
          ))}
        </div>
      )}

      {filteredData.length > 0 ? (
        <div style={boxStyle}>
          <div style={{ fontWeight: 'bold', marginBottom: 12 }}>
            利用可能データ候補（案件マスタより自動表示）
          </div>

          {filteredData.map((row) => (
            <div
              key={`${row.projectName}-${row.dataFile}`}
              style={{
                border: '1px solid #ddd',
                padding: '10px',
                marginBottom: '10px',
                background: '#fff',
              }}
            >
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={selectedDataFiles.includes(row.dataFile)}
                  onChange={() => handleToggleDataFile(row.dataFile)}
                  style={{ marginRight: 8 }}
                />
                {row.dataFile}
              </label>

              <div style={{ marginBottom: 4 }}>
                <b>主キー：</b>{row.primaryKey || '未設定'}
              </div>
              <div style={{ marginBottom: 4 }}>
                <b>概要：</b>{row.description || '未設定'}
              </div>
              <div>
                <b>主要カラム：</b>{row.majorColumns || '未設定'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...boxStyle, background: '#fff8e1' }}>
          案件マスタに未登録の案件名です。必要なデータは手入力で追加してください。
        </div>
      )}

      <label>追加で使うデータ（任意・1行1件）</label>
      <textarea
        value={manualDataFiles}
        onChange={(e) => setManualDataFiles(e.target.value)}
        style={textareaStyle}
        placeholder={'例：\n組合員ランクマスタ\nメール配信実績データ'}
      />

      <label>利用するデータ（確定結果）</label>
      <textarea
        value={mergedDataFilesText}
        readOnly
        style={textareaStyle}
        placeholder="AI推奨または手動選択結果が表示されます"
      />

      <label>利用期間</label>
      <input
        type="text"
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
        style={inputStyle}
        placeholder="例：2024年4月〜2025年3月"
      />

      <label>除外条件</label>
      <textarea
        value={excludeConditions}
        onChange={(e) => setExcludeConditions(e.target.value)}
        style={textareaStyle}
        placeholder="例：初回利用がない組合員、年代不明データを除外"
      />

      <label>自動取得サンプルデータ（選択中データに対応）</label>
      <textarea
        value={sampleDataText}
        readOnly
        style={{ ...textareaStyle, minHeight: '220px' }}
        placeholder="選択したデータに対応するサンプルCSVが自動表示されます"
      />

      <label>質問への回答内容（generateに引き継ぐ内容）</label>
      <textarea
        value={allAnsweredQuestionsText}
        readOnly
        style={{ ...textareaStyle, minHeight: '140px' }}
        placeholder="確認事項に回答すると、ここに自動反映されます"
      />

      <button onClick={handleGenerate} disabled={loading}>
        {loading ? '生成中...' : '生成する'}
      </button>

      {generateQuestions.length > 0 && (
        <div style={{ ...boxStyle, background: '#ffe9e9' }}>
          <div style={{ fontWeight: 'bold', marginBottom: 12 }}>
            確認事項（設計書生成時）
          </div>

          {generateQuestions.map((q, i) => (
            <div key={q} style={{ marginBottom: 14 }}>
              <div style={{ marginBottom: 6 }}>{i + 1}. {q}</div>
              <input
                type="text"
                value={generateQuestionAnswers[q] ?? ''}
                onChange={(e) =>
                  handleGenerateAnswerChange(q, e.target.value)
                }
                style={inputStyle}
                placeholder="ここに回答を入力"
              />
            </div>
          ))}

          <button onClick={handleGenerate} disabled={loading}>
            {loading ? '生成中...' : '回答を踏まえて生成する'}
          </button>
        </div>
      )}

      <br />
      <br />

      <div
        style={{
          border: '1px solid #ccc',
          padding: 12,
          minHeight: 200,
          background: '#fff',
        }}
      >
        {renderResultContent(result)}
      </div>
    </div>
  );
}