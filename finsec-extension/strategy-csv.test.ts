import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFinsecStrategyCsv } from './strategy-csv.ts';

const headers =
  'symbol,label,timeStart,timeEnd,candle_count,annotatedAt,candles,annotations';

test('parses quoted candle and annotation JSON into one canonical row', () => {
  const candles = '[{"open":0,"high":1,"low":-1,"close":0.5}]';
  const annotations = '[{"id":"one","kind":"marker"}]';
  const row = [
    'NQ=F',
    'head_and_shoulders',
    '1784001600',
    '1784005200',
    '1',
    '2026-07-16T23:59:13.815262Z',
    quoteCsv(candles),
    quoteCsv(annotations),
  ].join(',');

  assert.deepEqual(parseFinsecStrategyCsv(`${headers}\r\n${row}\r\n`), {
    rows: [row],
  });
});

test('accepts the seven-column strategy format without annotations', () => {
  const candles = '[{"open":0,"high":1,"low":-1,"close":0.5}]';
  const row = [
    'NQ=F',
    'head_and_shoulders',
    '1784001600',
    '1784005200',
    '1',
    '2026-07-16T23:59:13.815262Z',
    quoteCsv(candles),
  ].join(',');

  assert.deepEqual(
    parseFinsecStrategyCsv(
      `symbol,label,timeStart,timeEnd,candle_count,annotatedAt,candles\n${row}`,
    ),
    { rows: [row] },
  );
});

test('rejects rows whose candle_count does not match the candle array', () => {
  const candles = '[{"open":0,"high":1,"low":-1,"close":0.5}]';
  const row = [
    'NQ=F',
    'head_and_shoulders',
    '1784001600',
    '1784005200',
    '2',
    '2026-07-16T23:59:13.815262Z',
    quoteCsv(candles),
    '[]',
  ].join(',');

  assert.throws(
    () => parseFinsecStrategyCsv(`${headers}\n${row}`),
    /declares 2 candles but contains 1/,
  );
});

test('rejects a dataset containing more than one strategy label', () => {
  const candles = quoteCsv('[{"open":0,"high":1,"low":-1,"close":0.5}]');
  const first = `NQ=F,head_and_shoulders,1784001600,1784005200,1,2026-07-16T23:59:13.815262Z,${candles},[]`;
  const second = `NQ=F,bullish_fvg,1784001600,1784005200,1,2026-07-16T23:59:13.815262Z,${candles},[]`;

  assert.throws(
    () => parseFinsecStrategyCsv(`${headers}\n${first}\n${second}`),
    /uses label “bullish_fvg”; expected “head_and_shoulders”/,
  );
});

test('rejects unterminated quoted fields', () => {
  assert.throws(
    () => parseFinsecStrategyCsv(`${headers}\n"NQ=F`),
    /ends inside a quoted field/,
  );
});

function quoteCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
