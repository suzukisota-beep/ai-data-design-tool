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

type SampleRow = {
  projectName: string;
  dataFile: string;
  sampleCsv: string;
};

type ProjectNote = {
  projectName: string;
  category: string;
  note: string;
  priority: string;
  isActive: string;
};

async function fetchSampleData(projectName: string, dataFiles: string[]) {
  if (!projectName || dataFiles.length === 0) return [];

  const res = await fetch(
    `/api/sample-data?projectName=${encodeURIComponent(projectName)}&dataFiles=${encodeURIComponent(dataFiles.join('、'))}`
  );

  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

async function fetchProjectNotes(projectName: string) {
  if (!projectName) return [];

  const res = await fetch(
    `/api/project-notes?projectName=${encodeURIComponent(projectName)}`
  );

  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

function formatDesignResult(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';

  if (Array.isArray(value)) {
    return value.map((v) => formatDesignResult(v)).join('\n\n');
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key}\n${formatDesignResult(val)}`)
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
    i++;
  }

  if (tableLines.length < 2) return null;
  if (!isMarkdownSeparatorRow(tableLines[1])) return null;

  const headers = tableLines[0]
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

  return { headers, rows, nextIndex: i };
}

function renderResultContent(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isMarkdownTableRow(line)) {
      const parsed = parseMarkdownTable(lines, i);

      if (parsed) {
        elements.push(
          <div key={`table-${key++}`} style={{ margin: '12px 0 20px', overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}>
              <thead>
                <tr>
                  {parsed.headers.map((header, idx) => (
                    <th
                      key={idx}
                      style={{
                        border: '1px solid #ccc',
                        padding: '8px',
                        background: '#f5f5f5',
                        textAlign: 'left',
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {parsed.headers.map((_, colIndex) => (
                      <td key={colIndex} style={{ border: '1px solid #ccc', padding: '8px' }}>
                        {row[colIndex] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

        i = parsed.nextIndex;
        continue;
      }
    }

    if (line.trim() === '') {
      elements.push(<div key={`space-${key++}`} style={{ height: 10 }} />);
    } else {
      elements.push(
        <div key={`line-${key++}`} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
          {line}
        </div>
      );
    }

    i++;
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
  const [sampleRows, setSampleRows] = useState<SampleRow[]>([]);
  const [projectNotes, setProjectNotes] = useState<ProjectNote[]>([]);

  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMaster = async () => {
      const res = await fetch('/api/master');
      const data = await res.json();
      setMasterData(Array.isArray(data) ? data : []);
    };

    fetchMaster();
  }, []);

  const projectOptions = useMemo(() => {
    return Array.from(
      new Set(masterData.map((row) => row.projectName).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [masterData]);

  const projectDataFiles = useMemo(() => {
    return masterData
      .filter(
        (row) =>
          row.projectName === projectName &&
          String(row.isActive).toUpperCase() !== 'FALSE'
      )
      .sort((a, b) => Number(a.displayOrder || 999) - Number(b.displayOrder || 999));
  }, [masterData, projectName]);

  const dataFileNames = useMemo(() => {
    return projectDataFiles.map((row) => row.dataFile);
  }, [projectDataFiles]);

  const projectDataText = useMemo(() => {
    return projectDataFiles
      .map(
        (row, index) =>
          `【${index + 1}】${row.dataFile}
主キー：${row.primaryKey}
概要：${row.description}
主要カラム：${row.majorColumns}`
      )
      .join('\n\n');
  }, [projectDataFiles]);

  const sampleDataText = useMemo(() => {
    return sampleRows
      .map((row, index) => `【${index + 1}】${row.dataFile}\n${row.sampleCsv}`)
      .join('\n\n');
  }, [sampleRows]);

  const projectNotesText = useMemo(() => {
    return projectNotes
      .map((row, index) => `【${index + 1}】${row.category}\n${row.note}`)
      .join('\n\n');
  }, [projectNotes]);

  useEffect(() => {
    const loadContext = async () => {
      setResult('');

      if (!projectName) {
        setSampleRows([]);
        setProjectNotes([]);
        return;
      }

      const [samples, notes] = await Promise.all([
        fetchSampleData(projectName, dataFileNames),
        fetchProjectNotes(projectName),
      ]);

      setSampleRows(samples);
      setProjectNotes(notes);
    };

    loadContext();
  }, [projectName, dataFileNames]);

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
        period,
        excludeConditions,
        dataFiles: dataFileNames.join('、'),
        projectDataText,
        sampleDataFromMaster: sampleDataText,
        projectNotes: projectNotesText,
      };

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult(`エラーが発生しました:\n${JSON.stringify(data, null, 2)}`);
        return;
      }

      if (data.type === 'question') {
        setResult(
          `確認事項\n${(data.questions ?? [])
            .map((q: string, i: number) => `${i + 1}. ${q}`)
            .join('\n')}`
        );
        return;
      }

      setResult(data.type === 'design' ? formatDesignResult(data.result) : formatDesignResult(data));
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
    minHeight: '90px',
    padding: '8px',
    marginTop: '4px',
    marginBottom: '12px',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h1>AIデータ設計ツール</h1>

      <label>案件名</label>
      <select value={projectName} onChange={(e) => setProjectName(e.target.value)} style={inputStyle}>
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
        value={reportName}
        onChange={(e) => setReportName(e.target.value)}
        style={inputStyle}
        placeholder={outputType === 'report' ? '例：LINE配信後の来店率分析' : '例：LINE配信後7日以内来店者'}
      />

      <label>{outputType === 'report' ? 'レポート目的' : '作成目的'}</label>
      <textarea
        value={reportPurpose}
        onChange={(e) => setReportPurpose(e.target.value)}
        style={textareaStyle}
        placeholder="例：LINE配信後に来店や購買が増えているかを確認したい"
      />

      <label>{outputType === 'report' ? '見たいこと' : '作りたい条件'}</label>
      <textarea
        value={whatToSee}
        onChange={(e) => setWhatToSee(e.target.value)}
        style={textareaStyle}
        placeholder="例：LINEコンテンツ別に配信後7日以内の来店率と売上を見たい"
      />

      <label>{outputType === 'report' ? '指標定義' : '判定定義'}</label>
      <textarea
        value={metricDefinition}
        onChange={(e) => setMetricDefinition(e.target.value)}
        style={textareaStyle}
        placeholder="例：来店率＝配信後7日以内に注文がある会員数 ÷ 配信成功会員数"
      />

      <label>利用期間</label>
      <input
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
        style={inputStyle}
        placeholder="例：2024年9月〜2025年8月"
      />

      <label>除外条件</label>
      <textarea
        value={excludeConditions}
        onChange={(e) => setExcludeConditions(e.target.value)}
        style={textareaStyle}
        placeholder="例：membership_card_noが空の注文、LINEユーザIDが会員一覧に存在しないログを除外"
      />

      <button onClick={handleGenerate} disabled={loading || !projectName}>
        {loading ? '生成中...' : '生成する'}
      </button>

      <br />
      <br />

      <div style={{ border: '1px solid #ccc', padding: 12, minHeight: 240, background: '#fff' }}>
        {renderResultContent(result)}
      </div>
    </div>
  );
}